/**
 * MCP Tools — Graph query, enrichment, and analysis tools.
 *
 * Tools:
 * - graph_query:           Filter and search graph nodes
 * - graph_edges:           Get edges from/to a specific node
 * - graph_enrich:          Write semantic enrichment data to a node
 * - graph_impact_analysis: Analyze impact of changing a code entity
 * - graph_context_bundle:  Get comprehensive context for a code entity
 * - graph_add_edges:       Batch inject edges for agentic edge resolution
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphNode, GraphEdge, SemanticAttributes, TraversalDirection, GodNodeProfile } from '../graph/models.js';
import { EdgeRelation } from '../graph/models.js';

import { GraphStore } from '../graph/store/GraphStore.js';
import { resolveSourceDir, resolveGraphDir } from '../graph/store/pathResolver.js';
import { appendEnrichmentLog } from '../graph/logger.js';
import { CurationWorker } from '../graph/curation-worker.js';

/**
 * Validate SemanticAttributes structure.
 * Returns error message if invalid, null if valid.
 */
function validateSemantic(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return 'semantic must be an object';
  const s = data as Record<string, unknown>;
  if (typeof s.summary !== 'string') return 'semantic.summary must be a string';
  if (!['low', 'medium', 'high'].includes(s.complexity as string)) {
    return 'semantic.complexity must be "low" | "medium" | "high"';
  }
  if (!Array.isArray(s.domainConcepts)) return 'semantic.domainConcepts must be an array';
  if (typeof s.enrichedAt !== 'string') return 'semantic.enrichedAt must be a string';
  if (!['agent', 'manual'].includes(s.enrichedBy as string)) {
    return 'semantic.enrichedBy must be "agent" | "manual"';
  }
  if (s.docAnchors !== undefined) {
    if (!Array.isArray(s.docAnchors) || !s.docAnchors.every(x => typeof x === 'string')) {
      return 'semantic.docAnchors must be an array of strings';
    }
  }
  return null;
}


/**
 * Register graph tools on the MCP server.
 *
 * @param server - MCP server instance
 * @param workspaceRoot - Root directory of the PARA Workspace
 */
export function registerTools(server: McpServer, workspaceRoot: string): void {

  // --- graph_query: Filter and search graph nodes ---
  server.tool(
    'graph_query',
    'Query graph nodes with optional filters by type and name pattern',
    {
      projectName: z.string().describe('Name of the PARA project (e.g., pageel-cms, para-graph)'),
      nodeType: z.string().optional().describe('Filter by node type (file, class, function, interface, variable)'),
      namePattern: z.string().optional().describe('Filter by name substring (case-insensitive)'),
    },
    async ({ projectName, nodeType, namePattern }) => {
      const graph = GraphStore.getGraph(workspaceRoot, projectName);
      let nodes: GraphNode[];

      if (namePattern) {
        const result = graph.search(namePattern, nodeType);
        nodes = result.nodes;
      } else {
        nodes = graph.getAllNodes();
        if (nodeType) {
          nodes = nodes.filter((n) => n.type === nodeType);
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(nodes, null, 2) }],
      };
    },
  );

  // --- graph_edges: Get edges from/to a specific node ---
  server.tool(
    'graph_edges',
    'Get all edges (relationships) connected to a specific node',
    {
      projectName: z.string().describe('Name of the PARA project'),
      nodeId: z.string().describe('ID of the node to query edges for'),
    },
    async ({ projectName, nodeId }) => {
      const graph = GraphStore.getGraph(workspaceRoot, projectName);
      const connected = graph.getConnectedEdges(nodeId);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(connected, null, 2) }],
      };
    },
  );

  // --- graph_enrich: Write semantic enrichment data to a node ---
  server.tool(
    'graph_enrich',
    'Write semantic enrichment data (summary, complexity, domain concepts, docAnchors) to a graph node',
    {
      projectName: z.string().describe('Name of the PARA project'),
      nodeId: z.string().describe('ID of the node to enrich'),
      summary: z.string().describe('Human-readable summary of what this code entity does. MUST NOT use pronouns (Lossless Restatement).'),
      complexity: z.enum(['low', 'medium', 'high']).describe('Estimated complexity level'),
      domainConcepts: z.array(z.string()).describe('Domain concepts this entity relates to'),
      docAnchors: z.array(z.string()).optional().describe('Paths of doc files referencing this node'),
    },
    async ({ projectName, nodeId, summary, complexity, domainConcepts, docAnchors }) => {
      const graph = GraphStore.getGraph(workspaceRoot, projectName);

      // Build semantic attributes
      const semantic: SemanticAttributes = {
        summary,
        complexity,
        domainConcepts,
        docAnchors,
        enrichedAt: new Date().toISOString(),
        enrichedBy: 'agent',
      };

      // Validate before writing (H1-1 guard)
      const validationError = validateSemantic(semantic);
      if (validationError) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: validationError }) }],
          isError: true,
        };
      }

      // Use enrichNode for tracking + deduplication (P-Tracker v0.11.1)
      const success = graph.enrichNode(nodeId, semantic);
      if (!success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: `Node not found: ${nodeId}` }) }],
          isError: true,
        };
      }

      // Persist graph + metadata (prevents data loss — Deep Review fix)
      GraphStore.saveGraph(workspaceRoot, projectName);

      // Audit log (P-Tracker v0.11.1)
      const graphDir = resolveGraphDir(workspaceRoot, projectName);
      const enrichedNode = graph.getNode(nodeId)!;
      appendEnrichmentLog(graphDir, nodeId, enrichedNode.name, complexity, summary);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            updatedNode: enrichedNode,
            enrichmentStats: graph.enrichmentStats,
          }, null, 2),
        }],
      };
    },
  );

  // --- graph_impact_analysis: Analyze impact of changing a code entity ---
  server.tool(
    'graph_impact_analysis',
    'Analyze the impact of changing a code entity — returns all upstream/downstream affected nodes',
    {
      projectName: z.string().describe('Name of the PARA project'),
      nodeId: z.string().describe('ID of the node to analyze impact for'),
      depth: z.number().optional().describe('Traversal depth (default: 2, max: 5)'),
      direction: z.enum(['upstream', 'downstream', 'both']).optional().describe('Traversal direction (default: upstream)'),
    },
    async ({ projectName, nodeId, depth, direction }) => {
      const graph = GraphStore.getGraph(workspaceRoot, projectName);
      const targetNode = graph.getNode(nodeId);

      if (!targetNode) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Node not found: ${nodeId}` }) }],
          isError: true,
        };
      }

      const result = graph.traverseReverse(
        nodeId,
        depth ?? 2,
        (direction ?? 'upstream') as TraversalDirection,
      );

      // Deduplicate affected file paths
      const affectedFiles = [...new Set(result.nodes.map(n => n.filePath))];

      const response = {
        targetNode: { id: targetNode.id, name: targetNode.name, type: targetNode.type, filePath: targetNode.filePath },
        affectedNodes: result.nodes.map(n => ({
          id: n.id, name: n.name, type: n.type, filePath: n.filePath,
        })),
        affectedFiles,
        totalAffected: result.nodes.length,
        depth: depth ?? 2,
        direction: direction ?? 'upstream',
        paths: result.paths,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
      };
    },
  );

  // --- graph_context_bundle: Get comprehensive context for a code entity ---
  server.tool(
    'graph_context_bundle',
    'Get a comprehensive context bundle for a code entity — includes source code, callers, callees, imports, and related tests',
    {
      projectName: z.string().describe('Name of the PARA project'),
      nodeId: z.string().describe('ID of the entity to get context for'),
      previewOnly: z.boolean().optional().describe('If true, skips source code read to save tokens'),
    },
    async ({ projectName, nodeId, previewOnly }) => {
      const graph = GraphStore.getGraph(workspaceRoot, projectName);

      // Resolve rootDir using namespace-aware path resolver
      const rootDir = resolveSourceDir(workspaceRoot, projectName);

      try {
        const bundle = graph.getContextBundle(nodeId, rootDir, previewOnly);

        const response = {
          target: {
            id: bundle.target.id,
            name: bundle.target.name,
            type: bundle.target.type,
            filePath: bundle.target.filePath,
            startLine: bundle.target.startLine,
            endLine: bundle.target.endLine,
            summary: bundle.target.semantic?.summary ?? null,
          },
          sourceCode: bundle.sourceCode,
          truncated: bundle.truncated,
          relatedMemory: bundle.relatedMemory,
          callers: bundle.callers.map(n => ({ id: n.id, name: n.name, type: n.type, filePath: n.filePath })),
          callees: bundle.callees.map(n => ({ id: n.id, name: n.name, type: n.type, filePath: n.filePath })),
          imports: bundle.imports,
          relatedTests: bundle.relatedTests.map(n => ({ id: n.id, name: n.name, filePath: n.filePath })),
          warnings: bundle.warnings,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: (err as Error).message }) }],
          isError: true,
        };
      }
    },
  );

  // --- graph_add_edges: Batch inject edges for agentic edge resolution ---
  server.tool(
    'graph_add_edges',
    'Batch inject edges (CALLS, IMPORTS_FROM) into the graph — for agentic edge resolution of languages with weak AST linking (e.g., Bash)',
    {
      projectName: z.string().describe('Name of the PARA project'),
      edges: z.array(z.object({
        sourceId: z.string().describe('Node ID of the source (caller/importer)'),
        targetId: z.string().describe('Node ID of the target (callee/imported)'),
        relation: z.enum(['CALLS', 'IMPORTS_FROM']).describe('Edge relation type'),
        sourceFile: z.string().optional().describe('File where relation originates — derived from source node if omitted'),
        sourceLine: z.number().optional().describe('Line number — defaults to source node startLine if omitted'),
      })).describe('Array of edges to inject'),
    },
    async ({ projectName, edges }) => {
      const graph = GraphStore.getGraph(workspaceRoot, projectName);

      // Build full GraphEdge objects — derive optional fields from source node
      const fullEdges: GraphEdge[] = edges.map((e) => {
        const sourceNode = graph.getNode(e.sourceId);
        return {
          sourceId: e.sourceId,
          targetId: e.targetId,
          relation: e.relation as EdgeRelation,
          sourceFile: e.sourceFile ?? sourceNode?.filePath ?? e.sourceId.split('::')[0],
          sourceLine: e.sourceLine ?? sourceNode?.startLine ?? 0,
          confidence: 'INFERRED',
        };
      });

      const result = GraphStore.addEdges(workspaceRoot, projectName, fullEdges);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        isError: result.errors.length > 0 && result.added === 0,
      };
    },
  );

  // --- graph_link_docs: Link graph nodes to documentation sections ---
  server.tool(
    'graph_link_docs',
    'Link graph nodes to documentation sections. Call after /docs new or /docs update to establish doc↔code traceability.',
    {
      projectName: z.string().describe('Name of the PARA project'),
      links: z.array(z.object({
        nodeId: z.string().describe('ID of the graph node to link'),
        docPath: z.string().describe('Paths of doc files referencing this node, format: "docs/path.md#section-slug"'),
      })).describe('Array of node-document links to establish'),
    },
    async ({ projectName, links }) => {
      const graph = GraphStore.getGraph(workspaceRoot, projectName);

      const result = graph.linkDocs(links);

      if (result.linked > 0) {
        GraphStore.saveGraph(workspaceRoot, projectName);
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // --- graph_god_nodes: Get top-N most connected nodes ---
  server.tool(
    'graph_god_nodes',
    'Get the most connected (God) nodes in the graph — helps Agent prioritize which nodes to enrich first',
    {
      projectName: z.string().describe('Name of the PARA project'),
      topN: z.number().optional().describe('Number of top nodes to return (default: 10, max: 50)'),
      unenrichedOnly: z.boolean().optional().describe('If true, only return nodes that have NOT been enriched yet'),
    },
    async ({ projectName, topN, unenrichedOnly }) => {
      const graph = GraphStore.getGraph(workspaceRoot, projectName);
      const allNodes = graph.getAllNodes();

      const effectiveTopN = Math.min(topN ?? 10, 50);
      
      // Try to load from cache first
      let cachedProfiles: GodNodeProfile[] | undefined = GraphStore.getCustomMetadata(workspaceRoot, projectName, 'god_nodes_cache');
      
      let profiles: GodNodeProfile[] = [];
      if (cachedProfiles && Array.isArray(cachedProfiles) && cachedProfiles.length > 0) {
        profiles = cachedProfiles;
      } else {
        // Fallback to calculation
        profiles = graph.getTopGodNodes(50, false);
      }

      // Filter unenriched if requested
      if (unenrichedOnly) {
        profiles = profiles.filter(p => !p.enriched);
      }

      // Take topN
      const result = profiles.slice(0, effectiveTopN);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            godNodes: result,
            enrichmentStats: graph.enrichmentStats,
            enrichableNodeCount: allNodes.filter(n => n.type !== 'file').length,
            totalInGraph: allNodes.length,
          }, null, 2),
        }],
      };
    },
  );

  // --- graph_expand_node: Get only the source code for a specific node ---
  server.tool(
    'graph_expand_node',
    'Get only the source code for a specific node',
    {
      projectName: z.string().describe('Name of the PARA project'),
      nodeId: z.string().describe('ID of the entity to expand'),
    },
    async ({ projectName, nodeId }) => {
      const graph = GraphStore.getGraph(workspaceRoot, projectName);
      const rootDir = resolveSourceDir(workspaceRoot, projectName);
      try {
        const bundle = graph.getContextBundle(nodeId, rootDir, false);
        const lines = bundle.sourceCode?.split('\n') || [];
        const incomplete = lines.length <= 1;
        const hint = incomplete ? "AST bounds issue detected. Please use 'view_file' on the source file to read the actual code context manually." : undefined;
        
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ sourceCode: bundle.sourceCode, truncated: bundle.truncated, incomplete, hint }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: (err as Error).message }) }],
          isError: true,
        };
      }
    },
  );

  // --- memory_push: Push a memory event to the project MemoryStore ---
  server.tool(
    'memory_push',
    'Push a memory event to the project MemoryStore',
    {
      projectName: z.string().describe('Name of the PARA project'),
      kind: z.string().describe('Category of event'),
      content: z.string().describe('Summary or content of the event'),
      sessionId: z.string().describe('Session or run ID'),
      metadata: z.record(z.string(), z.any()).optional().describe('Additional structured data'),
    },
    async ({ projectName, kind, content, sessionId, metadata }) => {
      if (content.length > 10240) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'Content exceeds 10KB limit' }) }],
          isError: true,
        };
      }
      
      const safeContent = content.replace(/\0/g, '').replaceAll('\\\\', '/');
      const graph = GraphStore.getGraph(workspaceRoot, projectName);
      const eventId = randomUUID();
      
      const event = {
        id: eventId,
        kind,
        sessionId,
        content: safeContent,
        metadata,
        timestamp: new Date().toISOString(),
      };
      
      graph.pushMemoryEvent(event);
      GraphStore.saveMemoryEvents(workspaceRoot, projectName);
      
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, eventId }, null, 2) }],
      };
    },
  );

  // --- memory_search: Full-text search over events ---
  server.tool(
    'memory_search',
    'Search for memory events by keyword',
    {
      projectName: z.string().describe('Name of the PARA project'),
      query: z.string().describe('Search term'),
      limit: z.number().optional().describe('Maximum number of results (default 50)'),
      since: z.string().optional().describe('Filter events newer than this ISO 8601 timestamp (e.g. 2026-05-01T00:00:00Z)'),
      includeArchived: z.boolean().optional().describe('If true, returns both active and archived events (default false)'),
    },
    async ({ projectName, query, limit, since, includeArchived }) => {
      const graph = GraphStore.getGraph(workspaceRoot, projectName);
      let sinceTimestamp: number | undefined;
      if (since !== undefined) {
        sinceTimestamp = new Date(since).getTime();
        if (isNaN(sinceTimestamp)) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Invalid ISO 8601 timestamp for since parameter' }) }],
            isError: true,
          };
        }
      }
      const results = graph.searchMemory(query, limit ?? 50, sinceTimestamp, includeArchived);
      
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ results, count: results.length }, null, 2) }],
      };
    },
  );

  // --- memory_curate: Curate raw events into slices ---
  server.tool(
    'memory_curate',
    'Curate raw memory events into semantic slices',
    {
      projectName: z.string().describe('Name of the PARA project'),
    },
    async ({ projectName }) => {
      const graph = GraphStore.getGraph(workspaceRoot, projectName);
      const graphStats = graph.getStats();
      const result = CurationWorker.curate(workspaceRoot, graph, {
        nodes: graphStats.nodeCount,
        edges: graphStats.edgeCount,
        unresolved: (graphStats as any).unresolvedCount || 0
      });
      
      if (result.slicesCreated > 0) {
        GraphStore.saveMemorySlices(workspaceRoot, projectName);
      }
      
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}

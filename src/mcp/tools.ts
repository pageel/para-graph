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

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import * as fs from 'node:fs';
import { join, resolve } from 'node:path';
import * as path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import * as os from 'node:os';
import { z } from 'zod';
import { scanDirectory } from '../utils/file-scanner.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphNode, GraphEdge, SemanticAttributes, TraversalDirection, GodNodeProfile, ProjectInsight } from '../graph/models.js';
import { EdgeRelation } from '../graph/models.js';

import { GraphStore } from '../graph/store/GraphStore.js';
import { resolveSourceDir, resolveGraphDir } from '../graph/store/pathResolver.js';
import { appendEnrichmentLog } from '../graph/logger.js';
import { CurationWorker } from '../graph/curation-worker.js';
import { SqliteManager } from '../graph/store/sqlite-manager.js';
import { findRenamedAnchorInGit } from '../utils/git-scanner.js';
import { findFuzzyMatch } from '../utils/fuzzy-match.js';
import { fuseRankedLists } from '../graph/query/index.js';

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
  // @para-doc [artifacts/specs/spec-2026-06-18-rrf-multiseed.md#csa-mcp-integration]
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
        // Substring match on name
        const nameMatches = graph.getAllNodes().filter((n) => 
          n.name.toLowerCase().includes(namePattern.toLowerCase()) &&
          (!nodeType || n.type === nodeType)
        );
        // Substring match on semantic summary
        const semanticMatches = graph.getAllNodes().filter((n) => 
          n.semantic?.summary &&
          n.semantic.summary.toLowerCase().includes(namePattern.toLowerCase()) &&
          (!nodeType || n.type === nodeType)
        );

        // Rank fusion via RRF
        const fused = fuseRankedLists([nameMatches, semanticMatches], (n) => n.id, { k: 60 });
        nodes = fused.map((f) => f.item);
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
  // @para-doc [artifacts/specs/spec-2026-06-18-rrf-multiseed.md#csa-mcp-integration]
  server.tool(
    'graph_context_bundle',
    'Get a comprehensive context bundle for a code entity — includes source code, callers, callees, imports, and related tests',
    {
      projectName: z.string().describe('Name of the PARA project'),
      nodeId: z.union([z.string(), z.array(z.string())]).describe('ID(s) of the entity to get context for'),
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

  // --- insight_push: Push a project insight to SQLite database ---
  // @para-doc [artifacts/specs/spec-2026-06-16-csa-spec-intelligence.md#csa-db-schema]
  server.tool(
    'insight_push',
    'Push a project insight (lesson, risk, decision, pattern, gotcha) to durable SQLite storage',
    {
      projectName: z.string().describe('Name of the PARA project'),
      category: z.enum(['lesson', 'risk', 'decision', 'pattern', 'gotcha']).describe('Insight category'),
      domain: z.string().describe('Knowledge domain, e.g., path-handling, memory, parser, mcp'),
      title: z.string().describe('Short descriptive title of the insight'),
      description: z.string().describe('Detailed explanation of the insight, guidelines, or mitigations'),
      sourceType: z.enum(['brainstorm', 'qa', 'bugfix', 'plan', 'research', 'resource', 'session']).describe('Source document type'),
      sourceSession: z.string().optional().describe('Session identifier, e.g., session-2026-05-28'),
      relatedNodeIds: z.array(z.string()).optional().describe('IDs of graph nodes related to this insight'),
      relatedFiles: z.array(z.string()).optional().describe('Relative file paths from project root related to this insight'),
    },
    async ({
      projectName,
      category,
      domain,
      title,
      description,
      sourceType,
      sourceSession,
      relatedNodeIds,
      relatedFiles,
    }) => {
      const graph = GraphStore.getGraph(workspaceRoot, projectName);
      const insightId = `ins-${randomUUID()}`;

      const insight: ProjectInsight = {
        id: insightId,
        category: category as any,
        domain,
        title,
        description,
        sourceType: sourceType as any,
        sourceSession,
        relatedNodeIds,
        relatedFiles,
        confidence: 'hypothesis',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const actualInsightId = graph.pushInsight(insight);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, insightId: actualInsightId }, null, 2) }],
      };
    },
  );

  // --- insight_search: Search project insights with full-text search ---
  server.tool(
    'insight_search',
    'Search project insights with FTS5 and filter by category or domain',
    {
      projectName: z.string().describe('Name of the PARA project'),
      query: z.string().describe('Search term (FTS5 matched). Use empty string "" to fetch latest insights.'),
      category: z.enum(['lesson', 'risk', 'decision', 'pattern', 'gotcha']).optional().describe('Filter by insight category'),
      domain: z.string().optional().describe('Filter by exact domain'),
      limit: z.number().optional().default(10).describe('Max results to return (default 10)'),
    },
    async ({ projectName, query, category, domain, limit }) => {
      const graph = GraphStore.getGraph(workspaceRoot, projectName);
      
      const results = graph.searchInsights(query, {
        category,
        domain,
        limit,
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ results, count: results.length }, null, 2) }],
      };
    },
  );

  // --- insight_validate: Validate and update insight confidence lifecycle ---
  // @para-doc [artifacts/specs/spec-2026-06-16-csa-spec-intelligence.md#csa-db-schema]
  server.tool(
    'insight_validate',
    'Update the confidence lifecycle of a project insight (hypothesis -> validated -> deprecated)',
    {
      projectName: z.string().describe('Name of the PARA project'),
      insightId: z.string().describe('ID of the insight to update'),
      confidence: z.enum(['hypothesis', 'validated', 'deprecated']).describe('Target confidence status'),
    },
    async ({ projectName, insightId, confidence }) => {
      const graph = GraphStore.getGraph(workspaceRoot, projectName);
      
      const insight = graph.getInsight(insightId);
      if (!insight) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Insight not found: ${insightId}` }) }],
          isError: true,
        };
      }

      insight.confidence = confidence as any;
      insight.updatedAt = Date.now();
      if (confidence === 'validated') {
        insight.validatedAt = new Date().toISOString();
      }

      graph.pushInsight(insight);
      GraphStore.saveGraph(workspaceRoot, projectName);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, insight }, null, 2) }],
      };
    },
  );

  // --- graph_audit_csa: Run CSA compliance audit ---
  // @para-doc [artifacts/specs/spec-2026-06-16-csa-spec-intelligence.md#csa-build-integration]
  server.tool(
    'graph_audit_csa',
    'Run Convergent Specification Architecture (CSA) compliance audit for a project',
    {
      projectName: z.string().describe('Name of the PARA project'),
    },
    async ({ projectName }) => {
      const dbPath = join(workspaceRoot, 'Projects', projectName, '.beads', 'graph', `${projectName}.db`);
      const dbManager = new SqliteManager(projectName, dbPath);
      
      try {
        dbManager.initSchema();
        const auditResult = dbManager.runCsaAudit();
        dbManager.close();

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(auditResult, null, 2) }],
        };
      } catch (err: any) {
        try { dbManager.close(); } catch {}
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // --- graph_fix_csa: Run self-healing fix for csa dangling links ---
  // @para-doc [artifacts/specs/spec-2026-06-16-csa-spec-intelligence.md#csa-build-integration]
  server.tool(
    'graph_fix_csa',
    'Run CSA self-healing fix for dangling spec references (auto-replaces drifted spec anchors in code files)',
    {
      projectName: z.string().describe('Name of the PARA project'),
      dryRun: z.boolean().optional().default(false).describe('If true, only preview proposed fixes without writing to files'),
    },
    async ({ projectName, dryRun }) => {
      const dbPath = join(workspaceRoot, 'Projects', projectName, '.beads', 'graph', `${projectName}.db`);
      const dbManager = new SqliteManager(projectName, dbPath);
      const projectRepoPath = join(workspaceRoot, 'Projects', projectName, 'repo');

      try {
        dbManager.initSchema();
        const auditResult = dbManager.runCsaAudit();

        if (auditResult.danglingEdges.length === 0) {
          dbManager.close();
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message: 'No dangling spec links found. Nothing to fix.', fixedCount: 0 }) }],
          };
        }

        const db = dbManager.getConnection();
        const rows = db.prepare(`SELECT id FROM nodes WHERE type = 'spec_anchor'`).all() as Array<{ id: string }>;
        const existingAnchorIds = rows.map(r => r.id);

        let fixedCount = 0;
        const repairsApplied: Array<{ sourceFile: string; line: number; oldAnchor: string; newAnchor: string; method: string }> = [];

        for (const edge of auditResult.danglingEdges) {
          const targetId = edge.targetId;
          const sourceFile = edge.sourceFile;
          const sourceLine = edge.sourceLine;

          // Git Log Rename
          let proposedTarget = findRenamedAnchorInGit(targetId, projectRepoPath);
          let method = 'Git Log Rename';

          // Levenshtein Fuzzy Match
          if (!proposedTarget) {
            proposedTarget = findFuzzyMatch(targetId, existingAnchorIds);
            method = 'Fuzzy Match (Levenshtein)';
          }

          if (proposedTarget) {
            if (dryRun) {
              repairsApplied.push({
                sourceFile,
                line: sourceLine,
                oldAnchor: targetId,
                newAnchor: proposedTarget,
                method: `${method} (dry-run)`
              });
              continue;
            }

            const fullSourcePath = resolve(projectRepoPath, sourceFile);
            if (existsSync(fullSourcePath)) {
              const content = readFileSync(fullSourcePath, 'utf-8');
              const lines = content.split(/\r?\n/);
              
              if (sourceLine > 0 && sourceLine <= lines.length) {
                const originalLine = lines[sourceLine - 1];
                if (originalLine.includes(targetId)) {
                  lines[sourceLine - 1] = originalLine.replace(targetId, proposedTarget);
                  const hasCRLF = content.includes('\r\n');
                  writeFileSync(fullSourcePath, lines.join(hasCRLF ? '\r\n' : '\n'), 'utf-8');
                  fixedCount++;
                  repairsApplied.push({
                    sourceFile,
                    line: sourceLine,
                    oldAnchor: targetId,
                    newAnchor: proposedTarget,
                    method
                  });
                }
              }
            }
          }
        }

        dbManager.close();

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: dryRun ? `Previewed repairs for project ${projectName}` : `Applied repairs for project ${projectName}`,
              fixedCount,
              repairsApplied
            }, null, 2)
          }],
        };
      } catch (err: any) {
        try { dbManager.close(); } catch {}
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // --- project_snapshot: Take a project file structure snapshot and verify protected files ---
  server.tool(
    'project_snapshot',
    'Take a snapshot of the project directory structure, record metadata to SQLite, and verify protected files',
    {
      projectName: z.string().describe('Name of the PARA project'),
    },
    async ({ projectName }) => {
      const rootDir = resolveSourceDir(workspaceRoot, projectName);
      const dbPath = join(workspaceRoot, 'Projects', projectName, '.beads', 'graph', `${projectName}.db`);
      const dbManager = new SqliteManager(projectName, dbPath);

      try {
        dbManager.initSchema();
        
        const excludePatterns = [
          '**/node_modules/**',
          '**/dist/**',
          '**/build/**',
          '**/.git/**',
          '**/test-output/**',
          '**/.beads/**',
          '**/artifacts/**',
          '**/sessions/**',
          '**/docs/**',
          '**/*.log'
        ];
        
        const filePaths = scanDirectory(rootDir, { excludePatterns, rootDir });
        const snapshotId = `snap-${randomUUID()}`;
        const filesToInsert: Array<{ filePath: string; size: number; hash: string }> = [];

        for (const fullPath of filePaths) {
          try {
            const stats = statSync(fullPath);
            const content = readFileSync(fullPath);
            const hash = createHash('sha256').update(content).digest('hex');
            const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
            filesToInsert.push({
              filePath: relativePath,
              size: stats.size,
              hash
            });
          } catch (e) {
            // Ignore unreadable files
          }
        }

        const db = dbManager.getConnection();
        const rows = db.prepare('SELECT file_path as filePath FROM protected_files').all() as Array<{ filePath: string }>;
        const protectedFilePaths = new Set(rows.map(r => r.filePath));
        
        const presentFiles = new Set(filesToInsert.map(f => f.filePath));
        const warnings: string[] = [];
        for (const protectedPath of protectedFilePaths) {
          if (!presentFiles.has(protectedPath)) {
            warnings.push(`Protected file is missing: ${protectedPath}`);
          }
        }

        dbManager.insertSnapshot(snapshotId, filesToInsert);
        dbManager.close();

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              snapshotId,
              totalFiles: filesToInsert.length,
              totalSize: filesToInsert.reduce((sum, f) => sum + f.size, 0),
              warnings
            }, null, 2)
          }],
        };
      } catch (err: any) {
        try { dbManager.close(); } catch {}
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // --- project_diff: Compare two snapshots ---
  server.tool(
    'project_diff',
    'Compare two project snapshots to identify added, removed, and modified files',
    {
      projectName: z.string().describe('Name of the PARA project'),
      sourceSnapshotId: z.string().describe('Source snapshot ID (older)'),
      targetSnapshotId: z.string().describe('Target snapshot ID (newer)'),
    },
    async ({ projectName, sourceSnapshotId, targetSnapshotId }) => {
      const dbPath = join(workspaceRoot, 'Projects', projectName, '.beads', 'graph', `${projectName}.db`);
      const dbManager = new SqliteManager(projectName, dbPath);

      try {
        dbManager.initSchema();
        const diff = dbManager.compareSnapshots(sourceSnapshotId, targetSnapshotId);
        dbManager.close();

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(diff, null, 2)
          }],
        };
      } catch (err: any) {
        try { dbManager.close(); } catch {}
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // --- project_protected_files: Manage protected files list ---
  server.tool(
    'project_protected_files',
    'List, add, or remove protected files for a project',
    {
      projectName: z.string().describe('Name of the PARA project'),
      action: z.enum(['list', 'add', 'remove']).describe('Action to perform'),
      filePath: z.string().optional().describe('File path relative to project root (required for add/remove)'),
      description: z.string().optional().describe('Description of the protected file (optional for add)'),
    },
    async ({ projectName, action, filePath, description }) => {
      const dbPath = join(workspaceRoot, 'Projects', projectName, '.beads', 'graph', `${projectName}.db`);
      const dbManager = new SqliteManager(projectName, dbPath);

      try {
        dbManager.initSchema();
        const db = dbManager.getConnection();

        if (action === 'list') {
          const rows = db.prepare('SELECT file_path, description, created_at FROM protected_files').all();
          dbManager.close();
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ files: rows }, null, 2)
            }],
          };
        }

        if (!filePath) {
          dbManager.close();
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'filePath parameter is required for add/remove actions' }) }],
            isError: true,
          };
        }

        if (action === 'add') {
          const stmt = db.prepare(`
            INSERT OR REPLACE INTO protected_files (file_path, description, created_at)
            VALUES (?, ?, ?)
          `);
          stmt.run(filePath, description ?? null, Date.now());
          dbManager.close();
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ success: true, message: `Added ${filePath} to protected files` }, null, 2)
            }],
          };
        }

        if (action === 'remove') {
          const stmt = db.prepare('DELETE FROM protected_files WHERE file_path = ?');
          stmt.run(filePath);
          dbManager.close();
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ success: true, message: `Removed ${filePath} from protected files` }, null, 2)
            }],
          };
        }

        dbManager.close();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Invalid action' }) }],
          isError: true,
        };
      } catch (err: any) {
        try { dbManager.close(); } catch {}
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // --- project_session_compact: Compact workspace and project context into Vibecode Session KI ---
  // @para-doc [artifacts/specs/spec-2026-06-19-session-compaction.md#csa-session-compact]
  server.tool(
    'project_session_compact',
    'Compact workspace and project context (rules, skills, contract, guidelines) into Vibecode Session KI',
    {
      projectName: z.string().describe('Name of the PARA project'),
    },
    async ({ projectName }) => {
      const warnings: string[] = [];
      let compactedText = '';

      // Helper to read file safely
      const readFileSafe = (filePath: string, label: string): string | null => {
        if (existsSync(filePath)) {
          try {
            return readFileSync(filePath, 'utf-8');
          } catch (err: any) {
            warnings.push(`Failed to read ${label}: ${err.message}`);
          }
        } else {
          warnings.push(`${label} not found at ${filePath}`);
        }
        return null;
      };

      // 1. Build Markdown structure
      compactedText += `# Session Context Compaction\n\n`;
      compactedText += `> **Generated:** ${new Date().toISOString()}\n`;
      compactedText += `> **Project:** ${projectName}\n\n`;

      // 2. Read project.md (Contract)
      const projectMdPath = join(workspaceRoot, 'Projects', projectName, 'project.md');
      const projectMd = readFileSafe(projectMdPath, 'project.md');
      if (projectMd) {
        compactedText += `## Project Contract\n\n\`\`\`markdown\n${projectMd}\n\`\`\`\n\n`;
      }

      // 3. Read Workspace Rules & Skills indices
      const wsRulesPath = join(workspaceRoot, '.agents', 'rules.md');
      const wsRules = readFileSafe(wsRulesPath, 'Workspace Rules');
      if (wsRules) {
        compactedText += `## Workspace Rules Index\n\n${wsRules}\n\n`;
      }

      const wsSkillsPath = join(workspaceRoot, '.agents', 'skills.md');
      const wsSkills = readFileSafe(wsSkillsPath, 'Workspace Skills');
      if (wsSkills) {
        compactedText += `## Workspace Skills Index\n\n${wsSkills}\n\n`;
      }

      // 4. Read Project Rules & Skills indices
      const projRulesPath = join(workspaceRoot, 'Projects', projectName, '.agents', 'rules.md');
      const projRules = readFileSafe(projRulesPath, 'Project Rules');
      if (projRules) {
        compactedText += `## Project Rules Index\n\n${projRules}\n\n`;
      }

      const projSkillsPath = join(workspaceRoot, 'Projects', projectName, '.agents', 'skills.md');
      const projSkills = readFileSafe(projSkillsPath, 'Project Skills');
      if (projSkills) {
        compactedText += `## Project Skills Index\n\n${projSkills}\n\n`;
      }

      // 5. Read Project Guidelines (AGENTS.md)
      const agentsMdPath = join(workspaceRoot, 'Projects', projectName, '.agents', 'AGENTS.md');
      const agentsMd = readFileSafe(agentsMdPath, 'Agent Guidelines');
      if (agentsMd) {
        compactedText += `## Agent Guidelines\n\n${agentsMd}\n\n`;
      }

      // 6. Write to knowledge directories
      const homeDir = os.homedir();
      const appDataDir = process.env.APP_DATA_DIR || join(homeDir, '.gemini', 'antigravity-ide');
      
      const sessionDirs = [
        join(appDataDir, 'knowledge', 'vibecode_session', 'artifacts'),
        join(appDataDir, 'knowledge', 'para_vibecode_session', 'artifacts')
      ];

      let writeSuccess = true;
      for (const dir of sessionDirs) {
        try {
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          const sessionFilePath = join(dir, 'session.md');
          writeFileSync(sessionFilePath, compactedText, 'utf-8');
        } catch (err: any) {
          writeSuccess = false;
          warnings.push(`Failed to write to ${dir}: ${err.message}`);
        }
      }

      const response = {
        success: writeSuccess && compactedText.length > 0,
        projectName,
        warnings,
        writtenPaths: sessionDirs.map(d => join(d, 'session.md')),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
        isError: !response.success,
      };
    }
  );
}

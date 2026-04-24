/**
 * MCP Tools — Graph query, enrichment, and analysis tools.
 *
 * Tools:
 * - graph_query:           Filter and search graph nodes
 * - graph_edges:           Get edges from/to a specific node
 * - graph_enrich:          Write semantic enrichment data to a node
 * - graph_impact_analysis: Analyze impact of changing a code entity (P6)
 * - graph_context_bundle:  Get comprehensive context for a code entity (P6)
 * - graph_add_edges:       Batch inject edges for agentic edge resolution (P7)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphNode, GraphEdge, SemanticAttributes, TraversalDirection } from '../graph/models.js';
import { EdgeRelation } from '../graph/models.js';

import { GraphStore } from '../graph/store/GraphStore.js';

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
  return null;
}

/**
 * Resolves the graph directory for a given project name.
 */
function getGraphDir(workspaceRoot: string, projectName: string): string {
  return resolve(workspaceRoot, 'Projects', projectName, '.beads', 'graph');
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
    'Write semantic enrichment data (summary, complexity, domain concepts) to a graph node',
    {
      projectName: z.string().describe('Name of the PARA project'),
      nodeId: z.string().describe('ID of the node to enrich'),
      summary: z.string().describe('Human-readable summary of what this code entity does'),
      complexity: z.enum(['low', 'medium', 'high']).describe('Estimated complexity level'),
      domainConcepts: z.array(z.string()).describe('Domain concepts this entity relates to'),
    },
    async ({ projectName, nodeId, summary, complexity, domainConcepts }) => {
      const graph = GraphStore.getGraph(workspaceRoot, projectName);
      const node = graph.getNode(nodeId);

      if (!node) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: `Node not found: ${nodeId}` }) }],
          isError: true,
        };
      }

      // Build semantic attributes
      const semantic: SemanticAttributes = {
        summary,
        complexity,
        domainConcepts,
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

      // Update node
      node.semantic = semantic;
      graph.updateNode(node);
      
      // Save all entities back to file (this also updates cache)
      GraphStore.saveEntities(workspaceRoot, projectName, graph.getAllNodes());

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, updatedNode: node }, null, 2),
        }],
      };
    },
  );

  // --- graph_impact_analysis: Analyze impact of changing a code entity (P6) ---
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

  // --- graph_context_bundle: Get comprehensive context for a code entity (P6) ---
  server.tool(
    'graph_context_bundle',
    'Get a comprehensive context bundle for a code entity — includes source code, callers, callees, imports, and related tests',
    {
      projectName: z.string().describe('Name of the PARA project'),
      nodeId: z.string().describe('ID of the entity to get context for'),
    },
    async ({ projectName, nodeId }) => {
      const graph = GraphStore.getGraph(workspaceRoot, projectName);

      // Resolve rootDir: Projects/<project>/repo/
      const rootDir = resolve(workspaceRoot, 'Projects', projectName, 'repo');

      try {
        const bundle = graph.getContextBundle(nodeId, rootDir);

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

  // --- graph_add_edges: Batch inject edges for agentic edge resolution (P7) ---
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
        };
      });

      const result = GraphStore.addEdges(workspaceRoot, projectName, fullEdges);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        isError: result.errors.length > 0 && result.added === 0,
      };
    },
  );
}

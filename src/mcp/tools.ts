/**
 * MCP Tools — Graph query and enrichment tools.
 *
 * Tools:
 * - graph_query:   Filter and search graph nodes
 * - graph_edges:   Get edges from/to a specific node
 * - graph_enrich:  Write semantic enrichment data to a node
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphNode, GraphEdge, SemanticAttributes } from '../graph/models.js';

/**
 * Load entities from JSONL file.
 */
function loadEntities(graphDir: string): GraphNode[] {
  const filePath = join(graphDir, 'entities.jsonl');
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8').trim();
  if (content.length === 0) return [];
  return content.split('\n').map((line) => JSON.parse(line) as GraphNode);
}

/**
 * Load relations from JSONL file.
 */
function loadRelations(graphDir: string): GraphEdge[] {
  const filePath = join(graphDir, 'relations.jsonl');
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8').trim();
  if (content.length === 0) return [];
  return content.split('\n').map((line) => JSON.parse(line) as GraphEdge);
}

/**
 * Save entities back to JSONL file.
 */
function saveEntities(graphDir: string, entities: GraphNode[]): void {
  const filePath = join(graphDir, 'entities.jsonl');
  const content = entities.map((n) => JSON.stringify(n)).join('\n') + '\n';
  writeFileSync(filePath, content, 'utf-8');
}

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
 * Register graph tools on the MCP server.
 *
 * @param server - MCP server instance
 * @param graphDir - Directory containing graph output files
 */
export function registerTools(server: McpServer, graphDir: string): void {
  const resolved = resolve(graphDir);

  // --- graph_query: Filter and search graph nodes ---
  server.tool(
    'graph_query',
    'Query graph nodes with optional filters by type and name pattern',
    {
      nodeType: z.string().optional().describe('Filter by node type (file, class, function, interface, variable)'),
      namePattern: z.string().optional().describe('Filter by name substring (case-insensitive)'),
    },
    async ({ nodeType, namePattern }) => {
      let entities = loadEntities(resolved);

      if (nodeType) {
        entities = entities.filter((n) => n.type === nodeType);
      }
      if (namePattern) {
        const pattern = namePattern.toLowerCase();
        entities = entities.filter((n) => n.name.toLowerCase().includes(pattern));
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(entities, null, 2) }],
      };
    },
  );

  // --- graph_edges: Get edges from/to a specific node ---
  server.tool(
    'graph_edges',
    'Get all edges (relationships) connected to a specific node',
    {
      nodeId: z.string().describe('ID of the node to query edges for'),
    },
    async ({ nodeId }) => {
      const relations = loadRelations(resolved);
      const connected = relations.filter((e) => e.sourceId === nodeId || e.targetId === nodeId);

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
      nodeId: z.string().describe('ID of the node to enrich'),
      summary: z.string().describe('Human-readable summary of what this code entity does'),
      complexity: z.enum(['low', 'medium', 'high']).describe('Estimated complexity level'),
      domainConcepts: z.array(z.string()).describe('Domain concepts this entity relates to'),
    },
    async ({ nodeId, summary, complexity, domainConcepts }) => {
      const entities = loadEntities(resolved);
      const nodeIndex = entities.findIndex((n) => n.id === nodeId);

      if (nodeIndex === -1) {
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
      entities[nodeIndex] = { ...entities[nodeIndex], semantic };
      saveEntities(resolved, entities);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, updatedNode: entities[nodeIndex] }, null, 2),
        }],
      };
    },
  );
}

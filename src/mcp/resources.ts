/**
 * MCP Resources — Exposes graph JSONL files as MCP resources.
 *
 * Resources:
 * - para-graph://entities  → entities.jsonl content
 * - para-graph://relations → relations.jsonl content
 * - para-graph://metadata  → metadata.json content
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Register graph file resources on the MCP server.
 *
 * @param server - MCP server instance
 * @param graphDir - Directory containing graph output files
 */
export function registerResources(server: McpServer, graphDir: string): void {
  const resolved = resolve(graphDir);

  server.resource('entities', 'para-graph://entities', async () => {
    const filePath = join(resolved, 'entities.jsonl');
    if (!existsSync(filePath)) {
      return { contents: [{ uri: 'para-graph://entities', text: '', mimeType: 'application/jsonl' }] };
    }
    const content = readFileSync(filePath, 'utf-8');
    return { contents: [{ uri: 'para-graph://entities', text: content, mimeType: 'application/jsonl' }] };
  });

  server.resource('relations', 'para-graph://relations', async () => {
    const filePath = join(resolved, 'relations.jsonl');
    if (!existsSync(filePath)) {
      return { contents: [{ uri: 'para-graph://relations', text: '', mimeType: 'application/jsonl' }] };
    }
    const content = readFileSync(filePath, 'utf-8');
    return { contents: [{ uri: 'para-graph://relations', text: content, mimeType: 'application/jsonl' }] };
  });

  server.resource('metadata', 'para-graph://metadata', async () => {
    const filePath = join(resolved, 'metadata.json');
    if (!existsSync(filePath)) {
      return { contents: [{ uri: 'para-graph://metadata', text: '{}', mimeType: 'application/json' }] };
    }
    const content = readFileSync(filePath, 'utf-8');
    return { contents: [{ uri: 'para-graph://metadata', text: content, mimeType: 'application/json' }] };
  });
}

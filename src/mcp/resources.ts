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
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Register graph file resources on the MCP server.
 *
 * @param server - MCP server instance
 * @param workspaceRoot - Root directory of the PARA Workspace
 */
export function registerResources(server: McpServer, workspaceRoot: string): void {
  const resolved = resolve(workspaceRoot);

  server.resource(
    'entities',
    new ResourceTemplate('para-graph://{projectName}/entities', { list: undefined }),
    async (uri, { projectName }) => {
      const filePath = join(resolved, 'Projects', projectName as string, '.beads', 'graph', 'entities.jsonl');
      if (!existsSync(filePath)) {
        return { contents: [{ uri: uri.href, text: '', mimeType: 'application/jsonl' }] };
      }
      const content = readFileSync(filePath, 'utf-8');
      return { contents: [{ uri: uri.href, text: content, mimeType: 'application/jsonl' }] };
    }
  );

  server.resource(
    'relations',
    new ResourceTemplate('para-graph://{projectName}/relations', { list: undefined }),
    async (uri, { projectName }) => {
      const filePath = join(resolved, 'Projects', projectName as string, '.beads', 'graph', 'relations.jsonl');
      if (!existsSync(filePath)) {
        return { contents: [{ uri: uri.href, text: '', mimeType: 'application/jsonl' }] };
      }
      const content = readFileSync(filePath, 'utf-8');
      return { contents: [{ uri: uri.href, text: content, mimeType: 'application/jsonl' }] };
    }
  );

  server.resource(
    'metadata',
    new ResourceTemplate('para-graph://{projectName}/metadata', { list: undefined }),
    async (uri, { projectName }) => {
      const filePath = join(resolved, 'Projects', projectName as string, '.beads', 'graph', 'metadata.json');
      if (!existsSync(filePath)) {
        return { contents: [{ uri: uri.href, text: '{}', mimeType: 'application/json' }] };
      }
      const content = readFileSync(filePath, 'utf-8');
      return { contents: [{ uri: uri.href, text: content, mimeType: 'application/json' }] };
    }
  );
}

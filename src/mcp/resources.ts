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
import { resolveGraphDir } from '../graph/store/pathResolver.js';

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
      const filePath = join(resolveGraphDir(resolved, projectName as string), 'entities.jsonl');
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
      const filePath = join(resolveGraphDir(resolved, projectName as string), 'relations.jsonl');
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
      const filePath = join(resolveGraphDir(resolved, projectName as string), 'metadata.json');
      if (!existsSync(filePath)) {
        return { contents: [{ uri: uri.href, text: '{}', mimeType: 'application/json' }] };
      }
      const content = readFileSync(filePath, 'utf-8');
      return { contents: [{ uri: uri.href, text: content, mimeType: 'application/json' }] };
    }
  );

  server.resource(
    'memory_summary',
    new ResourceTemplate('para-graph://{projectName}/memory_summary', { list: undefined }),
    async (uri, { projectName }) => {
      const filePath = join(resolveGraphDir(resolved, projectName as string), 'memory-slices.jsonl');
      if (!existsSync(filePath)) {
        return { contents: [{ uri: uri.href, text: '[]', mimeType: 'application/json' }] };
      }
      
      const content = readFileSync(filePath, 'utf-8').trim();
      if (content.length === 0) {
        return { contents: [{ uri: uri.href, text: '[]', mimeType: 'application/json' }] };
      }

      try {
        const slices = content.split(/\r?\n/).map(line => JSON.parse(line));
        
        // Top 10 most recent
        slices.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const topN = slices.slice(0, 10);
        
        return { contents: [{ uri: uri.href, text: JSON.stringify(topN, null, 2), mimeType: 'application/json' }] };
      } catch (err) {
        return { contents: [{ uri: uri.href, text: '[]', mimeType: 'application/json' }] };
      }
    }
  );
}

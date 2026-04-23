/**
 * MCP Server for para-graph — Exposes graph data via Model Context Protocol.
 *
 * Provides resources (JSONL files) and tools (query, edges, enrich)
 * so that AI Agents can read, query, and enrich the code graph.
 *
 * This module is a pure library export — no self-execution.
 * Use `commands/serve.ts` to run the server with stdio transport.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerResources } from './resources.js';
import { registerTools } from './tools.js';

/**
 * Create and configure the MCP server with all resources and tools.
 *
 * @param workspaceRoot - Root directory of the PARA Workspace
 */
export function createServer(workspaceRoot: string): McpServer {
  const server = new McpServer({
    name: 'para-graph',
    version: '0.6.0',
  });

  registerResources(server, workspaceRoot);
  registerTools(server, workspaceRoot);

  return server;
}

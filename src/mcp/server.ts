/**
 * MCP Server for para-graph — Exposes graph data via Model Context Protocol.
 *
 * Provides resources (JSONL files) and tools (query, edges, enrich)
 * so that AI Agents can read, query, and enrich the code graph.
 *
 * Transport: stdio (local-only, no network)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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
    version: '0.3.0',
  });

  registerResources(server, workspaceRoot);
  registerTools(server, workspaceRoot);

  return server;
}

/**
 * Start the MCP server with stdio transport.
 * Called when running `npx tsx src/mcp/server.ts <workspace-root>`.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.error('Usage: para-graph-mcp <workspace-root>');
    console.error('');
    console.error('Start MCP server exposing graph data from the PARA workspace.');
    process.exit(1);
  }

  const workspaceRoot = args[0];
  const server = createServer(workspaceRoot);
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

main().catch((err) => {
  console.error('[para-graph-mcp] Fatal error:', err);
  process.exit(1);
});

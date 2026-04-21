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
 * @param graphDir - Directory containing graph output (entities.jsonl, etc.)
 */
export function createServer(graphDir: string): McpServer {
  const server = new McpServer({
    name: 'para-graph',
    version: '0.2.0',
  });

  registerResources(server, graphDir);
  registerTools(server, graphDir);

  return server;
}

/**
 * Start the MCP server with stdio transport.
 * Called when running `npx tsx src/mcp/server.ts <graph-dir>`.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.error('Usage: para-graph-mcp <graph-dir>');
    console.error('');
    console.error('Start MCP server exposing graph data from <graph-dir>.');
    process.exit(1);
  }

  const graphDir = args[0];
  const server = createServer(graphDir);
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

main().catch((err) => {
  console.error('[para-graph-mcp] Fatal error:', err);
  process.exit(1);
});

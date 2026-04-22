/**
 * para-graph serve command — Start MCP server with stdio transport.
 *
 * Wraps the library-mode createServer() from mcp/server.ts,
 * providing the runtime lifecycle (connect transport, handle errors).
 *
 * Usage (via CLI router):
 *   para-graph serve <workspace-root>
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../mcp/server.js';

export interface ServeOptions {
  workspaceRoot: string;
}

/**
 * Execute the serve command — create MCP server and connect via stdio.
 */
export async function runServe(options: ServeOptions): Promise<void> {
  const server = createServer(options.workspaceRoot);
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

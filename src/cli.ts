#!/usr/bin/env node
/**
 * para-graph CLI — Subcommand router.
 *
 * Usage:
 *   para-graph build <target-dir> [output-dir] [--import]
 *   para-graph serve <workspace-root>
 *   para-graph --help
 *
 * Architecture:
 *   cli.ts (this file) → routes to commands/build.ts or commands/serve.ts
 *   Each command module exports a pure function — no self-execution.
 */

import { runBuild } from './commands/build.js';
import { runServe } from './commands/serve.js';

const HELP_TEXT = `para-graph — Structural code analysis tool with MCP server.

Usage:
  para-graph build <target-dir> [output-dir] [--import]   Scan code and export graph
  para-graph serve <workspace-root>                       Start MCP server (stdio)
  para-graph --help                                       Show this help

Commands:
  build    Analyze TypeScript source code and generate a structural graph (JSONL).
  serve    Start the MCP server exposing graph data to AI Agents.

Flags (build):
  --import    Load existing graph, preserve semantic data on re-scan.

Examples:
  para-graph build ./src ./output
  para-graph build ./src ./output --import
  para-graph serve /path/to/workspace
`;

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(HELP_TEXT);
    process.exit(command ? 0 : 1);
  }

  switch (command) {
    case 'build': {
      const subArgs = args.slice(1);
      const positional = subArgs.filter((a) => !a.startsWith('--'));
      const useImport = subArgs.includes('--import');

      if (positional.length === 0) {
        console.error('Error: build requires <target-dir> argument.');
        console.error('Usage: para-graph build <target-dir> [output-dir] [--import]');
        process.exit(1);
      }

      runBuild({
        targetDir: positional[0],
        outputDir: positional[1] ?? './output',
        useImport,
      });
      break;
    }

    case 'serve': {
      const workspaceRoot = args[1];
      if (!workspaceRoot) {
        console.error('Error: serve requires <workspace-root> argument.');
        console.error('Usage: para-graph serve <workspace-root>');
        process.exit(1);
      }

      runServe({ workspaceRoot }).catch((err) => {
        console.error('[para-graph] Fatal error:', err);
        process.exit(1);
      });
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "para-graph --help" for usage.');
      process.exit(1);
  }
}

main();

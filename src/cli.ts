#!/usr/bin/env node
/**
 * para-graph CLI — Subcommand router.
 *
 * Usage:
 *   para-graph build <target-dir> [output-dir] [--import]
 *   para-graph serve <workspace-root>
 *   para-graph hooks [install|uninstall|status]
 *   para-graph --help
 *
 * Architecture:
 *   cli.ts (this file) → routes to commands/build.ts, serve.ts, inject.ts, hooks.ts
 *   Each command module exports a pure function — no self-execution.
 */

import { join } from 'node:path';
import { createRequire } from 'node:module';
import { runBuild } from './commands/build.js';
import { runServe } from './commands/serve.js';
import { runInject } from './commands/inject.js';
import { runHooks } from './commands/hooks.js';
import { runMem } from './commands/mem.js';
import { findWorkspaceRoot, isProjectName } from './utils/workspace.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const HELP_TEXT = `para-graph — Structural code analysis tool with MCP server.

Usage:
  para-graph build <project-name>                         Auto-detect workspace, scan project
  para-graph build <target-dir> [output-dir] [--import]   Scan code and export graph (manual paths)
  para-graph serve [workspace-root]                       Start MCP server (stdio)
  para-graph inject <path> [--project <name>] [--dry-run]  Inject graph context into Markdown
  para-graph hooks [install|uninstall|status]              Manage BeforeTool hooks
  para-graph --help                                       Show this help

Commands:
  build    Analyze source code and generate a structural graph (JSONL).
  serve    Start the MCP server exposing graph data to AI Agents.
  inject   Inject Living Docs / Blast Radius context into Markdown files.
  hooks    Install/uninstall/status BeforeTool hooks for AI Agent nudging.
  mem      Curate session memory events into semantic slices.

Flags (build):
  --import    Load existing graph, preserve semantic data on re-scan.

Examples:
  para-graph build para-graph                    Shorthand: auto-detect workspace
  para-graph build ./src ./output --import       Manual: explicit paths
  para-graph serve /path/to/workspace            Explicit workspace root
  para-graph serve                               Auto-detect workspace root
`;

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === '--version' || command === '-v') {
    console.log(`para-graph v${pkg.version}`);
    process.exit(0);
  }

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
        console.error('Error: build requires <target-dir> or <project-name> argument.');
        console.error('Usage: para-graph build <project-name>');
        console.error('       para-graph build <target-dir> [output-dir] [--import]');
        process.exit(1);
      }

      let targetDir = positional[0];
      let outputDir = positional[1] ?? './output';

      // Project-name shorthand: if input looks like a project name (no path separators)
      // and we can find a workspace root, resolve to standard PARA paths.
      if (isProjectName(targetDir)) {
        const wsRoot = findWorkspaceRoot();
        if (wsRoot) {
          const projectName = targetDir;
          targetDir = join(wsRoot, 'Projects', projectName, 'repo');
          outputDir = positional[1] ?? join(wsRoot, 'Projects', projectName, '.beads', 'graph');
          console.log(`[para-graph] Resolved project "${projectName}" in workspace: ${wsRoot}`);
        }
        // If wsRoot not found, fall through to use targetDir as-is (backward compatible)
      }

      runBuild({
        targetDir,
        outputDir,
        useImport,
      });
      break;
    }

    case 'serve': {
      let workspaceRoot = args[1];

      // Auto-detect workspace root if not provided
      if (!workspaceRoot) {
        const detected = findWorkspaceRoot();
        if (detected) {
          workspaceRoot = detected;
          console.log(`[para-graph] Auto-detected workspace root: ${workspaceRoot}`);
        } else {
          console.error('Error: Could not auto-detect workspace root (.para-workspace.yml not found).');
          console.error('Usage: para-graph serve <workspace-root>');
          process.exit(1);
        }
      }

      runServe({ workspaceRoot }).catch((err) => {
        console.error('[para-graph] Fatal error:', err);
        process.exit(1);
      });
      break;
    }

    case 'inject': {
      const subArgs = args.slice(1);
      const positional = subArgs.filter((a) => !a.startsWith('--'));
      const dryRun = subArgs.includes('--dry-run');
      
      const projectIdx = subArgs.indexOf('--project');
      const projectName = projectIdx !== -1 ? subArgs[projectIdx + 1] : undefined;

      if (positional.length === 0) {
        console.error('Error: inject requires <path> argument.');
        console.error('Usage: para-graph inject <path-to-file-or-dir> [--project <name>] [--dry-run]');
        process.exit(1);
      }

      runInject({
        target: positional[0],
        projectName,
        dryRun,
      }).catch((err) => {
        console.error('[para-graph] Injection error:', err);
        process.exit(1);
      });
      break;
    }

    case 'hooks': {
      const subcommand = args[1] ?? 'status';
      runHooks({ subcommand }).catch((err) => {
        console.error('[para-graph] Hooks error:', err);
        process.exit(1);
      });
      break;
    }

    case 'mem': {
      const projectName = args[1];
      if (!projectName) {
        console.error('Error: mem requires <project-name> argument.');
        console.error('Usage: para-graph mem <project-name>');
        process.exit(1);
      }
      
      const wsRoot = findWorkspaceRoot();
      if (!wsRoot) {
        console.error('Error: Could not auto-detect workspace root.');
        process.exit(1);
      }
      
      runMem(projectName, wsRoot);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "para-graph --help" for usage.');
      process.exit(1);
  }
}

main();

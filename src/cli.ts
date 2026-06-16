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
import { runLink } from './commands/link.js';
import { runAudit } from './commands/audit.js';
import { runFix } from './commands/fix.js';
import { findWorkspaceRoot, isProjectName } from './utils/workspace.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const HELP_TEXT = `para-graph — Structural code analysis tool with MCP server.

Usage:
  para-graph build <project-name>                         Auto-detect workspace, scan project
  para-graph build <target-dir> [output-dir] [--clean]    Scan code and export graph (manual paths)
  para-graph serve [workspace-root]                       Start MCP server (stdio)
  para-graph inject <path> [--project <name>] [--dry-run]  Inject graph context into Markdown
  para-graph link <project-name>                          Scan docs and link anchors to code graph
  para-graph audit csa --project <path>                   Run the CSA compliance audit
  para-graph fix csa --project <path>                     Run the CSA self-healing fix
  para-graph hooks [install|uninstall|status]              Manage BeforeTool hooks
  para-graph --help                                       Show this help

Commands:
  build    Analyze source code and generate a structural graph (JSONL).
  serve    Start the MCP server exposing graph data to AI Agents.
  inject   Inject Living Docs / Blast Radius context into Markdown files.
  link     Scan documentation anchors and link them to structural code nodes.
  audit    Run project compliance audits (e.g., csa).
  fix      Run project self-healing fixes (e.g., csa).
  hooks    Install/uninstall/status BeforeTool hooks for AI Agent nudging.
  mem      Curate session memory events into semantic slices.

Flags (build):
  --clean     Do not load existing graph, overwrite and scan from scratch.

Examples:
  para-graph build para-graph                    Shorthand: auto-detect workspace
  para-graph build ./src ./output --clean        Manual: explicit paths
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
      const useClean = subArgs.includes('--clean');

      if (positional.length === 0) {
        console.error('Error: build requires <target-dir> or <project-name> argument.');
        console.error('Usage: para-graph build <project-name>');
        console.error('       para-graph build <target-dir> [output-dir] [--clean]');
        process.exit(1);
      }

      let targetDir = positional[0];
      let outputDir = positional[1] ?? './output';
      let projectName = 'unknown';

      // Project-name shorthand: if input looks like a project name (no path separators)
      // and we can find a workspace root, resolve to standard PARA paths.
      if (isProjectName(targetDir)) {
        projectName = targetDir;
        const wsRoot = findWorkspaceRoot();
        if (wsRoot) {
          targetDir = join(wsRoot, 'Projects', projectName, 'repo');
          outputDir = positional[1] ?? join(wsRoot, 'Projects', projectName, '.beads', 'graph');
          console.log(`[para-graph] Resolved project "${projectName}" in workspace: ${wsRoot}`);
        }
        // If wsRoot not found, fall through to use targetDir as-is (backward compatible)
      } else {
        const normalizedTarget = targetDir.replace(/\\/g, '/');
        const projectMatch = normalizedTarget.match(/(?:\/|^)Projects\/([^/]+)\/repo/);
        if (projectMatch) {
          projectName = projectMatch[1];
        } else {
          const resourceMatch = normalizedTarget.match(/(?:\/|^)Resources\/references\/(.+?)(?:\/repo)?$/);
          if (resourceMatch) {
            projectName = `@resources/${resourceMatch[1]}`;
          }
        }
      }

      runBuild({
        targetDir,
        outputDir,
        useClean,
        projectName,
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

    case 'link': {
      const projectName = args[1];
      if (!projectName) {
        console.error('Error: link requires <project-name> argument.');
        console.error('Usage: para-graph link <project-name>');
        process.exit(1);
      }
      
      const wsRoot = findWorkspaceRoot();
      if (!wsRoot) {
        console.error('Error: Could not auto-detect workspace root.');
        process.exit(1);
      }
      
      runLink(projectName, wsRoot);
      break;
    }

    case 'audit': {
      const subcommand = args[1];
      if (subcommand !== 'csa') {
        console.error('Error: Unknown audit subcommand. Supported subcommands: csa');
        console.error('Usage: para-graph audit csa --project <path>');
        process.exit(1);
      }

      const subArgs = args.slice(2);
      const projectIdx = subArgs.indexOf('--project');
      const projectPath = projectIdx !== -1 ? subArgs[projectIdx + 1] : undefined;

      if (!projectPath) {
        console.error('Error: audit csa requires --project <path> argument.');
        process.exit(1);
      }

      runAudit({ projectPath });
      break;
    }

    case 'fix': {
      const subcommand = args[1];
      if (subcommand !== 'csa') {
        console.error('Error: Unknown fix subcommand. Supported subcommands: csa');
        console.error('Usage: para-graph fix csa --project <path> [--auto] [--dry-run]');
        process.exit(1);
      }

      const subArgs = args.slice(2);
      const projectIdx = subArgs.indexOf('--project');
      const projectPath = projectIdx !== -1 ? subArgs[projectIdx + 1] : undefined;

      if (!projectPath) {
        console.error('Error: fix csa requires --project <path> argument.');
        process.exit(1);
      }

      const auto = subArgs.includes('--auto');
      const dryRun = subArgs.includes('--dry-run');

      runFix({ projectPath, auto, dryRun }).catch((err) => {
        if (err.message && err.message.startsWith('exit:')) {
          const code = parseInt(err.message.split(':')[1], 10);
          process.exit(code);
        }
        console.error('[CSA Fix] CLI Error:', err);
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

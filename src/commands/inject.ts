/**
 * para-graph inject command — Living Documentation & Auto-Harnessing.
 *
 * Scans Markdown files (Docs, Plans, Brainstorms) for graph bindings
 * and injects/updates graph context or blast radius.
 *
 * Usage (via CLI router):
 *   para-graph inject <path-to-markdown-or-dir> [--project <name>] [--dry-run]
 */

import { resolve, join } from 'node:path';
import { existsSync, readFileSync, lstatSync, readdirSync } from 'node:fs';
import { findWorkspaceRoot, isProjectName } from '../utils/workspace.js';
import { importFromJsonl } from '../graph/jsonl-importer.js';
import { CodeGraph } from '../graph/code-graph.js';

export interface InjectOptions {
  target: string;
  projectName?: string;
  dryRun: boolean;
}

/**
 * Execute the inject command.
 */
export async function runInject(options: InjectOptions): Promise<void> {
  const target = resolve(options.target);
  
  if (!existsSync(target)) {
    console.error(`Error: Target path not found: ${target}`);
    process.exit(1);
  }

  // Step 1: Resolve project context and load Graph
  const wsRoot = findWorkspaceRoot(target);
  let projectName = options.projectName;

  // Auto-detect project name if not provided
  if (!projectName && wsRoot) {
    const parts = target.split(/[\\/]/);
    const projectsIdx = parts.indexOf('Projects');
    if (projectsIdx !== -1 && parts[projectsIdx + 1]) {
      projectName = parts[projectsIdx + 1];
    }
  }

  if (!projectName) {
    console.error('Error: Could not determine project name. Use --project <name>.');
    process.exit(1);
  }

  const graphPath = wsRoot 
    ? join(wsRoot, 'Projects', projectName, '.beads', 'graph')
    : resolve('./.beads/graph'); // Fallback to local

  if (!existsSync(graphPath)) {
    console.error(`Error: Graph data not found at: ${graphPath}`);
    console.error('Run "para-graph build" first.');
    process.exit(1);
  }

  console.log(`[para-graph] Loading graph for project: ${projectName}`);
  const graph = importFromJsonl(graphPath);
  const stats = graph.getStats();
  console.log(`[para-graph] Loaded ${stats.nodeCount} nodes, ${stats.edgeCount} edges.`);

  // Step 2: Identify files to process
  const files: string[] = [];
  const stat = lstatSync(target);
  if (stat.isDirectory()) {
    const items = readdirSync(target, { recursive: true }) as string[];
    for (const item of items) {
      if (item.endsWith('.md')) {
        files.push(join(target, item));
      }
    }
  } else if (target.endsWith('.md')) {
    files.push(target);
  }

  if (files.length === 0) {
    console.log('[para-graph] No Markdown files found to process.');
    return;
  }

  console.log(`[para-graph] Processing ${files.length} file(s)...`);

  // Step 3: Process each file
  for (const file of files) {
    await processFile(file, graph, options);
  }
}

/**
 * Process a single Markdown file.
 */
async function processFile(filePath: string, graph: CodeGraph, options: InjectOptions): Promise<void> {
  const content = readFileSync(filePath, 'utf-8');
  const fm = parseFrontmatter(content);

  if (!fm) return; // No frontmatter, skip

  const graphNodes = fm.graph_nodes || fm.impact_nodes || fm.deprecate_nodes;
  if (!graphNodes || !Array.isArray(graphNodes)) return;

  console.log(`[para-graph] Found ${graphNodes.length} node bindings in: ${filePath}`);

  // TODO: Phase 2 logic (Drift Detection & Injection)
}

/**
 * Basic YAML Frontmatter parser.
 */
function parseFrontmatter(content: string): any {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const yaml = match[1];
  const result: any = {};
  
  const lines = yaml.split(/\r?\n/);
  let currentKey: string | null = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // List item: - value
    if (trimmed.startsWith('-') && currentKey) {
      if (!Array.isArray(result[currentKey])) {
        result[currentKey] = [];
      }
      result[currentKey].push(trimmed.slice(1).trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }
    
    // key: value
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      currentKey = key;
      
      if (value) {
        // Inline array [a, b]
        if (value.startsWith('[') && value.endsWith(']')) {
          result[key] = value.slice(1, -1).split(',').map(v => v.trim().replace(/^['"]|['"]$/g, ''));
        } else {
          result[key] = value.replace(/^['"]|['"]$/g, '');
        }
      } else {
        result[key] = null;
      }
    }
  }
  return result;
}

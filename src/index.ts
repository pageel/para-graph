#!/usr/bin/env node
/**
 * para-graph CLI — Structural code analysis tool.
 *
 * Usage:
 *   npx tsx src/index.ts <target-dir> [output-dir] [--import]
 *
 * Arguments:
 *   target-dir  Directory containing TypeScript source files to analyze
 *   output-dir  Directory to write graph output (default: ./output)
 *
 * Flags:
 *   --import    Load existing graph from output-dir before scanning.
 *               Preserves semantic enrichment data on re-scan (H2-1).
 *
 * Output:
 *   entities.jsonl   — All code entities (nodes)
 *   relations.jsonl  — All relationships (edges)
 *   metadata.json    — Summary statistics
 */

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { walkDirectory } from './parser/file-walker.js';
import { TreeSitterParser } from './parser/tree-sitter-parser.js';
import { CodeGraph } from './graph/code-graph.js';
import { exportToJsonl } from './graph/jsonl-exporter.js';
import { importFromJsonl } from './graph/jsonl-importer.js';
import type { GraphNode } from './graph/models.js';

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log('Usage: para-graph <target-dir> [output-dir] [--import]');
    console.log('');
    console.log('Analyze TypeScript source code and generate a structural graph.');
    console.log('');
    console.log('Arguments:');
    console.log('  target-dir   Directory containing *.ts files to analyze');
    console.log('  output-dir   Output directory (default: ./output)');
    console.log('');
    console.log('Flags:');
    console.log('  --import     Load existing graph, preserve semantic data on re-scan');
    process.exit(args.length === 0 ? 1 : 0);
  }

  // Parse args: filter out flags
  const positional = args.filter((a) => !a.startsWith('--'));
  const useImport = args.includes('--import');

  const targetDir = resolve(positional[0]);
  const outputDir = resolve(positional[1] ?? './output');

  if (!existsSync(targetDir)) {
    console.error(`Error: Target directory not found: ${targetDir}`);
    process.exit(1);
  }

  // Step 1: Load existing graph if --import flag is set (H2-1)
  let existingNodes: Map<string, GraphNode> = new Map();
  if (useImport && existsSync(outputDir)) {
    console.log(`[para-graph] Importing existing graph from: ${outputDir}`);
    const existing = importFromJsonl(outputDir);
    for (const node of existing.getAllNodes()) {
      if (node.semantic) {
        existingNodes.set(node.id, node);
      }
    }
    console.log(`[para-graph] Found ${existingNodes.size} enriched node(s) to preserve`);
  }

  console.log(`[para-graph] Scanning: ${targetDir}`);

  // Step 2: Walk directory for TS files
  const files = walkDirectory(targetDir);
  console.log(`[para-graph] Found ${files.length} TypeScript file(s)`);

  if (files.length === 0) {
    console.warn('[para-graph] No TypeScript files found. Exiting.');
    process.exit(0);
  }

  // Step 3: Initialize graph and parser
  const graph = new CodeGraph();
  const parser = new TreeSitterParser(targetDir);

  // Step 4: Parse each file
  for (const file of files) {
    parser.parseFile(file, graph);
  }

  // Step 5: Merge semantic data from existing graph (H2-1)
  if (existingNodes.size > 0) {
    let preserved = 0;
    for (const node of graph.getAllNodes()) {
      const existing = existingNodes.get(node.id);
      if (existing?.semantic) {
        node.semantic = existing.semantic;
        preserved++;
      }
    }
    console.log(`[para-graph] Preserved semantic data on ${preserved} node(s)`);
  }

  // Step 6: Show stats
  const stats = graph.getStats();
  console.log(`[para-graph] Graph: ${stats.nodeCount} nodes, ${stats.edgeCount} edges, ${stats.fileCount} files`);

  // H3-3: Verify non-empty output
  if (stats.nodeCount === 0) {
    console.warn('[para-graph] Warning: No nodes extracted. Check query patterns.');
  }

  // Step 7: Export
  exportToJsonl(graph, outputDir);
  console.log(`[para-graph] Done. Output at: ${outputDir}`);
}

main();


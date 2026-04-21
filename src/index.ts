#!/usr/bin/env node
/**
 * para-graph CLI — Structural code analysis tool.
 *
 * Usage:
 *   npx tsx src/index.ts <target-dir> [output-dir]
 *
 * Arguments:
 *   target-dir  Directory containing TypeScript source files to analyze
 *   output-dir  Directory to write graph output (default: ./output)
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

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log('Usage: para-graph <target-dir> [output-dir]');
    console.log('');
    console.log('Analyze TypeScript source code and generate a structural graph.');
    console.log('');
    console.log('Arguments:');
    console.log('  target-dir   Directory containing *.ts files to analyze');
    console.log('  output-dir   Output directory (default: ./output)');
    process.exit(args.length === 0 ? 1 : 0);
  }

  const targetDir = resolve(args[0]);
  const outputDir = resolve(args[1] ?? './output');

  if (!existsSync(targetDir)) {
    console.error(`Error: Target directory not found: ${targetDir}`);
    process.exit(1);
  }

  console.log(`[para-graph] Scanning: ${targetDir}`);

  // Step 1: Walk directory for TS files
  const files = walkDirectory(targetDir);
  console.log(`[para-graph] Found ${files.length} TypeScript file(s)`);

  if (files.length === 0) {
    console.warn('[para-graph] No TypeScript files found. Exiting.');
    process.exit(0);
  }

  // Step 2: Initialize graph and parser
  const graph = new CodeGraph();
  const parser = new TreeSitterParser(targetDir);

  // Step 3: Parse each file
  for (const file of files) {
    parser.parseFile(file, graph);
  }

  // Step 4: Show stats
  const stats = graph.getStats();
  console.log(`[para-graph] Graph: ${stats.nodeCount} nodes, ${stats.edgeCount} edges, ${stats.fileCount} files`);

  // H3-3: Verify non-empty output
  if (stats.nodeCount === 0) {
    console.warn('[para-graph] Warning: No nodes extracted. Check query patterns.');
  }

  // Step 5: Export
  exportToJsonl(graph, outputDir);
  console.log(`[para-graph] Done. Output at: ${outputDir}`);
}

main();

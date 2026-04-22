/**
 * para-graph build command — Scan source code and generate structural graph.
 *
 * Supports multiple languages via Language Registry.
 * Each file is auto-detected by extension and parsed with
 * the corresponding tree-sitter grammar + SSEC query.
 *
 * Usage (via CLI router):
 *   para-graph build <target-dir> [output-dir] [--import]
 */

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { walkDirectory } from '../parser/file-walker.js';
import { TreeSitterParser } from '../parser/tree-sitter-parser.js';
import { CodeGraph } from '../graph/code-graph.js';
import { exportToJsonl } from '../graph/jsonl-exporter.js';
import { importFromJsonl } from '../graph/jsonl-importer.js';
import type { GraphNode } from '../graph/models.js';

export interface BuildOptions {
  targetDir: string;
  outputDir: string;
  useImport: boolean;
}

/**
 * Execute the build command — scan, parse, merge, export.
 */
export function runBuild(options: BuildOptions): void {
  const targetDir = resolve(options.targetDir);
  const outputDir = resolve(options.outputDir);

  if (!existsSync(targetDir)) {
    console.error(`Error: Target directory not found: ${targetDir}`);
    process.exit(1);
  }

  // Step 1: Load existing graph if --import flag is set (H2-1)
  let existingNodes: Map<string, GraphNode> = new Map();
  if (options.useImport && existsSync(outputDir)) {
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

  // Step 2: Walk directory for supported source files
  const files = walkDirectory(targetDir);
  console.log(`[para-graph] Found ${files.length} source file(s)`);

  if (files.length === 0) {
    console.warn('[para-graph] No supported files found. Exiting.');
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

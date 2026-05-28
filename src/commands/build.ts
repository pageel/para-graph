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

import { resolve, join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { walkDirectory } from '../parser/file-walker.js';
import { TreeSitterParser } from '../parser/tree-sitter-parser.js';
import { CodeGraph } from '../graph/code-graph.js';
import { exportToJsonl } from '../graph/jsonl-exporter.js';
import { importFromJsonl } from '../graph/jsonl-importer.js';
import { resolveEdges } from '../graph/edge-resolver.js';
import { SqliteManager } from '../graph/store/sqlite-manager.js';
import type { GraphNode, GraphEdge } from '../graph/models.js';

export interface BuildOptions {
  targetDir: string;
  outputDir: string;
  useClean: boolean;
  projectName: string;
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

  // Step 1: Default to loading existing graph unless --clean is set (H2-1)
  let existingNodes: Map<string, GraphNode> = new Map();
  let existingInferredEdges: GraphEdge[] = [];
  let existingStats = undefined;
  if (!options.useClean && existsSync(outputDir)) {
    console.log(`[para-graph] Importing existing graph from: ${outputDir}`);
    const existing = importFromJsonl(outputDir);
    if (existing.enrichmentStats) {
      existingStats = existing.enrichmentStats;
    }
    for (const node of existing.getAllNodes()) {
      if (node.semantic) {
        existingNodes.set(node.id, node);
      }
    }
    if (existingNodes.size > 0) {
      console.log(`[para-graph] Found ${existingNodes.size} enriched node(s) to preserve`);
    }
    // Collect inferred edges to preserve (injected via graph_add_edges)
    existingInferredEdges = existing.getAllEdges().filter(e => e.confidence === 'INFERRED');
    if (existingInferredEdges.length > 0) {
      console.log(`[para-graph] Found ${existingInferredEdges.length} agent-injected edge(s) to preserve`);
    }
  } else if (options.useClean) {
    console.log(`[para-graph] Clean mode enabled. Existing graph will be overwritten.`);
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
    let staleCount = 0;
    for (const node of graph.getAllNodes()) {
      const existing = existingNodes.get(node.id);
      if (existing?.semantic) {
        node.semantic = { ...existing.semantic };
        preserved++;

        // Step 5.1: Staleness Detection — Compare node signature, startLine, and endLine
        const codeChanged = existing.signature !== node.signature
          || existing.startLine !== node.startLine
          || existing.endLine !== node.endLine;

        if (codeChanged) {
          node.semantic.staleSince = new Date().toISOString();
          staleCount++;
        }
      }
    }
    console.log(`[para-graph] Preserved semantic data on ${preserved} node(s)`);
    if (staleCount > 0) {
      console.log(`[para-graph] Staleness: ${staleCount} enriched node(s) changed since last enrichment`);
    }
  }
  
  // Step 5.2: Preserve global enrichment stats
  if (existingStats && existingStats.totalEnriched > 0) {
    graph.setEnrichmentStats(existingStats);
  }

  // Step 5.3: Re-inject preserved inferred edges (P7)
  // TIMING: This MUST run BEFORE EdgeResolver (Step 5.5).
  // Safety: INFERRED edges have fully-qualified targetIds (contain '/'),
  // so EdgeResolver skips them (edge-resolver.ts L146: `if (targetId.includes('/')) continue`).
  // addEdge() dedup guard prevents duplicates if EdgeResolver also resolves the same pair.
  if (existingInferredEdges.length > 0) {
    let addedEdges = 0;
    for (const edge of existingInferredEdges) {
      // Check if both source and target exist to prevent orphaned/dangling references (H2-2)
      if (graph.getNode(edge.sourceId) && graph.getNode(edge.targetId)) {
        graph.addEdge(edge);
        addedEdges++;
      }
    }
    if (addedEdges > 0) {
      console.log(`[para-graph] Re-injected ${addedEdges} valid agent-injected edge(s)`);
    }
  }

  // Step 5.5: Resolve bare targetId in CALLS edges
  const resolverResult = resolveEdges(graph);
  if (resolverResult.total > 0) {
    console.log(`[para-graph] EdgeResolver: ${resolverResult.resolved}/${resolverResult.total} resolved (${resolverResult.rate}%)`);
  }

  // Step 6: Show stats
  const stats = graph.getStats();
  console.log(`[para-graph] Graph: ${stats.nodeCount} nodes, ${stats.edgeCount} edges, ${stats.fileCount} files`);

  // H3-3: Verify non-empty output
  if (stats.nodeCount === 0) {
    console.warn('[para-graph] Warning: No nodes extracted. Check query patterns.');
  }

  // Step 7: Export
  exportToJsonl(graph, outputDir, options.projectName);

  // Step 8: Reset hook reminder lock (so Agent gets re-nudged with fresh graph)
  const lockFile = join(outputDir, '.gemini_reminded');
  if (existsSync(lockFile)) {
    unlinkSync(lockFile);
    console.log('[para-graph] Reset hook reminder (graph updated).');
  }

  // Step 9: Invalidate God Nodes cache (QW-1)
  try {
    const dbPath = join(outputDir, `${options.projectName}.db`);
    if (existsSync(dbPath)) {
      const manager = new SqliteManager(options.projectName, dbPath);
      const db = manager.getConnection();
      db.prepare(`DELETE FROM metadata WHERE key = 'god_nodes_cache'`).run();
      manager.close();
      console.log('[para-graph] Invalidated god_nodes_cache.');
    }
  } catch (err) {
    console.warn(`[para-graph] Failed to invalidate cache:`, err);
  }

  console.log(`[para-graph] Done. Output at: ${outputDir}`);
}

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

import { resolve, join, dirname, relative } from 'node:path';
import { existsSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { walkDirectory } from '../parser/file-walker.js';
import { TreeSitterParser } from '../parser/tree-sitter-parser.js';
import { CodeGraph } from '../graph/code-graph.js';
import { exportToJsonl } from '../graph/jsonl-exporter.js';
import { importFromJsonl } from '../graph/jsonl-importer.js';
import { resolveEdges } from '../graph/edge-resolver.js';
import { SqliteManager } from '../graph/store/sqlite-manager.js';
import { NodeType, ExportType } from '../graph/models.js';
import type { GraphNode, GraphEdge } from '../graph/models.js';
import { extractSpecAnchors, extractSpecMetadata } from '../parser/csa-parser.js';
import { runLink } from './link.js';
import { findWorkspaceRoot } from '../utils/workspace.js';

// @para-doc [artifacts/specs/spec-2026-06-16-csa-spec-intelligence.md#csa-build-integration]
function findMdFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  const list = readdirSync(dir);
  for (const file of list) {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...findMdFiles(fullPath));
    } else if (stat.isFile() && file.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

export interface BuildOptions {
  targetDir: string;
  outputDir: string;
  useClean: boolean;
  projectName: string;
}

/**
 * Execute the build command — scan, parse, merge, export.
 * @para-doc [docs/architecture/para-graph-core.md#csa-core-build-flow]
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

  // Step 4.5: Scan project specs & plans for CSA anchors
  let projectRoot = targetDir;
  while (projectRoot !== dirname(projectRoot)) {
    if (existsSync(join(projectRoot, 'project.md'))) {
      break;
    }
    projectRoot = dirname(projectRoot);
  }
  if (!existsSync(join(projectRoot, 'project.md'))) {
    projectRoot = dirname(targetDir); // Fallback
  }
  const docsPath = join(projectRoot, 'docs');
  const plansPath = join(projectRoot, 'artifacts', 'plans');
  const specsPath = join(projectRoot, 'artifacts', 'specs');
  const mdFiles = [...findMdFiles(docsPath), ...findMdFiles(plansPath), ...findMdFiles(specsPath)];
  
  if (mdFiles.length > 0) {
    let anchorCount = 0;
    const globalSeenAnchors = new Map<string, string>(); // anchor id -> first file path
    for (const mdFile of mdFiles) {
      const relPath = relative(projectRoot, mdFile).replace(/\\/g, '/');
      try {
        const specMeta = extractSpecMetadata(mdFile);
        const hasMeta = Object.keys(specMeta).length > 0;
        const anchors = extractSpecAnchors(mdFile);
        for (const anchor of anchors) {
          const existingFile = globalSeenAnchors.get(anchor.id);
          if (existingFile) {
            console.warn(
              `[para-graph] ⚠️ DUPLICATE anchor "${anchor.id}" — ` +
              `first in "${existingFile}", also in "${relPath}". Skipping duplicate.`
            );
            continue;
          }
          globalSeenAnchors.set(anchor.id, relPath);
          graph.addNode({
            id: anchor.id,
            type: NodeType.SPEC_ANCHOR,
            name: anchor.id,
            filePath: relPath,
            startLine: anchor.line,
            endLine: anchor.line,
            exportType: ExportType.NONE,
            signature: anchor.title,
            semantic: {
              ...(hasMeta ? { specMeta } : {}),
              line: anchor.line,
            },
          });
          anchorCount++;
        }
      } catch (err) {
        console.warn(`[para-graph] Warning: Failed to parse CSA anchors in ${mdFile}: ${(err as Error).message}`);
      }
    }
    if (anchorCount > 0) {
      console.log(`[para-graph] Found and registered ${anchorCount} SPEC_ANCHOR node(s)`);
    }
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

  // Step 9: Persist to SQLite DB & Invalidate God Nodes cache (QW-1)
  try {
    const dbPath = join(outputDir, `${options.projectName}.db`);
    const manager = new SqliteManager(options.projectName, dbPath);
    manager.initSchema();
    manager.persistGraph(graph.getAllNodes(), graph.getAllEdges());
    
    // Invalidate God Nodes cache
    const db = manager.getConnection();
    db.prepare(`DELETE FROM metadata WHERE key = 'god_nodes_cache'`).run();
    
    manager.close();
    console.log('[para-graph] Persisted graph to SQLite and invalidated god_nodes_cache.');
  } catch (err) {
    console.warn(`[para-graph] Failed to persist graph to SQLite DB:`, err);
  }

  // Step 10: Auto-linking has been deprecated and disabled in v0.17.4.
  // We no longer call runLink here.

  console.log(`[para-graph] Done. Output at: ${outputDir}`);
}

/**
 * JSONL Exporter — Serializes CodeGraph data to JSONL files.
 *
 * Output format:
 * - entities.jsonl: One GraphNode per line (sorted by filePath)
 * - relations.jsonl: One GraphEdge per line (sorted by sourceFile)
 * - metadata.json: Summary statistics
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { CodeGraph } from './code-graph.js';

/**
 * Export graph data to JSONL files in the specified output directory.
 *
 * @param graph - The CodeGraph instance to export
 * @param outputDir - Directory to write output files to
 * @throws Error if outputDir contains path traversal (H3-2 guard)
 */
export function exportToJsonl(graph: CodeGraph, outputDir: string): void {
  // H3-2: Validate no path traversal
  const resolved = resolve(outputDir);
  if (outputDir.includes('..')) {
    throw new Error(`Output path contains path traversal: "${outputDir}"`);
  }

  // Ensure output directory exists
  if (!existsSync(resolved)) {
    mkdirSync(resolved, { recursive: true });
  }

  const stats = graph.getStats();

  // Export entities (sorted by filePath)
  const nodes = graph.getAllNodes().sort((a, b) => a.filePath.localeCompare(b.filePath));
  const entitiesPath = join(resolved, 'entities.jsonl');
  const entitiesContent = nodes.map((n) => JSON.stringify(n)).join('\n') + '\n';
  writeFileSync(entitiesPath, entitiesContent, 'utf-8');

  // Export relations (sorted by sourceFile)
  const edges = graph.getAllEdges().sort((a, b) => a.sourceFile.localeCompare(b.sourceFile));
  const relationsPath = join(resolved, 'relations.jsonl');
  const relationsContent = edges.map((e) => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(relationsPath, relationsContent, 'utf-8');

  // Export metadata
  const metadataPath = join(resolved, 'metadata.json');
  const metadata = {
    version: '0.1.0',
    nodeCount: stats.nodeCount,
    edgeCount: stats.edgeCount,
    fileCount: stats.fileCount,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf-8');
}

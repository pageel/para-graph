/**
 * JSONL Exporter — Serializes CodeGraph data to JSONL files.
 *
 * Output format:
 * - entities.jsonl: One GraphNode per line (sorted by filePath)
 * - relations.jsonl: One GraphEdge per line (sorted by sourceFile)
 * - metadata.json: Summary statistics + enrichment tracking (P-Tracker v0.11.1)
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodeGraph } from './code-graph.js';
import type { GraphMetadata } from './models.js';

/**
 * Export graph data to JSONL files in the specified output directory.
 *
 * @param graph - The CodeGraph instance to export
 * @param outputDir - Directory to write output files to
 * @param projectName - Name of the project (for metadata)
 * @throws Error if outputDir contains path traversal (H3-2 guard)
 */
export function exportToJsonl(graph: CodeGraph, outputDir: string, projectName: string = 'unknown'): void {
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

  // Export metadata (typed as GraphMetadata — P-Tracker v0.11.1)
  const metadataPath = join(resolved, 'metadata.json');
  
  let version = 'unknown';
  try {
    // Read version from the tool's package.json dynamically
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pkgPath = resolve(__dirname, '../../package.json');
    
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.version) version = pkg.version;
    }
  } catch (e) {}

  const metadata = graph.getMetadata(projectName, version);
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf-8');
}

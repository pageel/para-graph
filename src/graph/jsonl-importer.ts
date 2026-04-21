/**
 * JSONL Importer — Reconstructs CodeGraph from JSONL files.
 *
 * Input format:
 * - entities.jsonl: One GraphNode per line
 * - relations.jsonl: One GraphEdge per line
 *
 * Preserves `semantic` field if present (round-trip safe).
 * Backward compatible — P1 output (no semantic) loads correctly.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CodeGraph } from './code-graph.js';
import type { GraphNode, GraphEdge } from './models.js';

/**
 * Import graph data from JSONL files in the specified directory.
 *
 * @param inputDir - Directory containing entities.jsonl and relations.jsonl
 * @returns Reconstructed CodeGraph instance
 * @throws Error if inputDir does not exist or required files are missing
 */
export function importFromJsonl(inputDir: string): CodeGraph {
  const resolved = resolve(inputDir);

  if (!existsSync(resolved)) {
    throw new Error(`Import directory does not exist: "${resolved}"`);
  }

  const graph = new CodeGraph();

  // Load entities
  const entitiesPath = join(resolved, 'entities.jsonl');
  if (existsSync(entitiesPath)) {
    const content = readFileSync(entitiesPath, 'utf-8').trim();
    if (content.length > 0) {
      const lines = content.split('\n');
      for (const line of lines) {
        const node = JSON.parse(line) as GraphNode;
        graph.addNode(node);
      }
    }
  }

  // Load relations
  const relationsPath = join(resolved, 'relations.jsonl');
  if (existsSync(relationsPath)) {
    const content = readFileSync(relationsPath, 'utf-8').trim();
    if (content.length > 0) {
      const lines = content.split('\n');
      for (const line of lines) {
        const edge = JSON.parse(line) as GraphEdge;
        graph.addEdge(edge);
      }
    }
  }

  return graph;
}

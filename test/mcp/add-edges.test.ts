/**
 * Integration tests for MCP tool: graph_add_edges
 *
 * P7: Agentic Bash Edge Resolution
 * Tests the full pipeline: MCP input → GraphStore.addEdges() → persist
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { GraphStore } from '../../src/graph/store/GraphStore.js';
import type { GraphNode, GraphEdge } from '../../src/graph/models.js';
import { NodeType, ExportType, EdgeRelation } from '../../src/graph/models.js';

// --- Helpers ---

function makeNode(id: string, name: string): GraphNode {
  return {
    id,
    type: NodeType.FUNCTION,
    name,
    filePath: id.split('::')[0],
    startLine: 5,
    endLine: 15,
    exportType: ExportType.NAMED,
    signature: `function ${name}()`,
  };
}

// --- Setup: create a temporary graph on disk ---

const TMP_ROOT = join(process.cwd(), '.test-tmp-mcp');
const PROJECT = 'bash-test';

function setupGraph() {
  const graphDir = join(TMP_ROOT, 'Projects', PROJECT, '.beads', 'graph');
  mkdirSync(graphDir, { recursive: true });

  // Write entities
  const nodes = [
    makeNode('install.sh::install_deps', 'install_deps'),
    makeNode('install.sh::check_node', 'check_node'),
    makeNode('build.sh::run_build', 'run_build'),
  ];
  const entitiesContent = nodes.map(n => JSON.stringify(n)).join('\n') + '\n';
  writeFileSync(join(graphDir, 'entities.jsonl'), entitiesContent, 'utf-8');

  // Write empty relations
  writeFileSync(join(graphDir, 'relations.jsonl'), '', 'utf-8');
}

function teardown() {
  GraphStore.flushGraph(PROJECT);
  if (existsSync(TMP_ROOT)) {
    rmSync(TMP_ROOT, { recursive: true, force: true });
  }
}

// --- Tests ---

describe('MCP add_edges integration', () => {
  beforeEach(() => {
    teardown();
    setupGraph();
  });

  afterEach(() => {
    teardown();
  });

  it('should add valid edges and persist to relations.jsonl', () => {
    const edges: GraphEdge[] = [
      {
        sourceId: 'install.sh::install_deps',
        targetId: 'install.sh::check_node',
        relation: EdgeRelation.CALLS,
        sourceFile: 'install.sh',
        sourceLine: 10,
      },
    ];

    const result = GraphStore.addEdges(TMP_ROOT, PROJECT, edges);

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Verify persistence
    const relationsPath = join(TMP_ROOT, 'Projects', PROJECT, '.beads', 'graph', 'relations.jsonl');
    const content = readFileSync(relationsPath, 'utf-8').trim();
    const lines = content.split('\n');
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.sourceId).toBe('install.sh::install_deps');
    expect(parsed.targetId).toBe('install.sh::check_node');
    expect(parsed.relation).toBe('CALLS');
  });

  it('should return errors for non-existent nodes and NOT persist', () => {
    const edges: GraphEdge[] = [
      {
        sourceId: 'nonexistent::foo',
        targetId: 'install.sh::check_node',
        relation: EdgeRelation.CALLS,
        sourceFile: 'nonexistent',
        sourceLine: 1,
      },
    ];

    const result = GraphStore.addEdges(TMP_ROOT, PROJECT, edges);

    expect(result.added).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain('not found');

    // Verify no persistence (file should be empty or not updated)
    const relationsPath = join(TMP_ROOT, 'Projects', PROJECT, '.beads', 'graph', 'relations.jsonl');
    const content = readFileSync(relationsPath, 'utf-8').trim();
    expect(content).toBe('');
  });

  it('should deduplicate when called twice with same edges', () => {
    const edges: GraphEdge[] = [
      {
        sourceId: 'install.sh::install_deps',
        targetId: 'build.sh::run_build',
        relation: EdgeRelation.CALLS,
        sourceFile: 'install.sh',
        sourceLine: 20,
      },
    ];

    // First call
    const result1 = GraphStore.addEdges(TMP_ROOT, PROJECT, edges);
    expect(result1.added).toBe(1);

    // Second call — should skip
    const result2 = GraphStore.addEdges(TMP_ROOT, PROJECT, edges);
    expect(result2.added).toBe(0);
    expect(result2.skipped).toBe(1);

    // Verify only 1 edge on disk
    const relationsPath = join(TMP_ROOT, 'Projects', PROJECT, '.beads', 'graph', 'relations.jsonl');
    const lines = readFileSync(relationsPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
  });

  it('should handle mixed valid and invalid edges in one batch', () => {
    const edges: GraphEdge[] = [
      {
        sourceId: 'install.sh::install_deps',
        targetId: 'install.sh::check_node',
        relation: EdgeRelation.CALLS,
        sourceFile: 'install.sh',
        sourceLine: 10,
      },
      {
        sourceId: 'ghost::phantom',
        targetId: 'build.sh::run_build',
        relation: EdgeRelation.CALLS,
        sourceFile: 'ghost',
        sourceLine: 1,
      },
    ];

    const result = GraphStore.addEdges(TMP_ROOT, PROJECT, edges);

    expect(result.added).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].sourceId).toBe('ghost::phantom');

    // Only the valid edge should be persisted
    const relationsPath = join(TMP_ROOT, 'Projects', PROJECT, '.beads', 'graph', 'relations.jsonl');
    const lines = readFileSync(relationsPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
  });
});

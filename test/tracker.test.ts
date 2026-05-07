/**
 * P-Tracker Unit Tests — Enrichment tracking, stats, and audit logger.
 *
 * Tests:
 * 1. enrichNode() — first enrich, re-enrich deduplication, non-existent node
 * 2. enrichmentStats — totalEnriched, lastEnrichedAt, recentNodes ordering
 * 3. setEnrichmentStats — restore from persisted data
 * 4. appendEnrichmentLog — file creation, append, sanitization
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CodeGraph } from '../src/graph/code-graph.js';
import { ProjectGraph } from '../src/graph/store/ProjectGraph.js';
import { appendEnrichmentLog } from '../src/graph/logger.js';
import type { SemanticAttributes, EnrichmentStats } from '../src/graph/models.js';
import { ExportType, NodeType } from '../src/graph/models.js';

const TEST_OUTPUT_DIR = join(import.meta.dirname, '.test-output', 'tracker');

function makeNode(id: string, name: string) {
  return {
    id,
    type: NodeType.FUNCTION,
    name,
    filePath: 'src/test.ts',
    startLine: 1,
    endLine: 10,
    exportType: ExportType.NAMED,
    signature: `function ${name}()`,
  };
}

function makeSemantic(summary: string = 'Test summary'): SemanticAttributes {
  return {
    summary,
    complexity: 'medium',
    domainConcepts: ['test'],
    enrichedAt: new Date().toISOString(),
    enrichedBy: 'agent',
  };
}

// --- Test CodeGraph.enrichNode ---

describe('CodeGraph.enrichNode', () => {
  let graph: CodeGraph;

  beforeEach(() => {
    graph = new CodeGraph();
    graph.addNode(makeNode('a::foo', 'foo'));
    graph.addNode(makeNode('b::bar', 'bar'));
    graph.addNode(makeNode('c::baz', 'baz'));
  });

  it('should enrich a node and update stats', () => {
    const result = graph.enrichNode('a::foo', makeSemantic());
    expect(result).toBe(true);

    const stats = graph.enrichmentStats;
    expect(stats.totalEnriched).toBe(1);
    expect(stats.lastEnrichedAt).toBeTruthy();
    expect(stats.recentNodes).toEqual(['a::foo']);
  });

  it('should NOT increment totalEnriched on re-enrichment', () => {
    graph.enrichNode('a::foo', makeSemantic('first'));
    graph.enrichNode('a::foo', makeSemantic('second'));

    const stats = graph.enrichmentStats;
    expect(stats.totalEnriched).toBe(1); // Still 1, not 2
    expect(stats.recentNodes).toEqual(['a::foo']); // No duplicates
  });

  it('should track multiple enrichments and keep recentNodes max 5', () => {
    // Enrich 6 nodes (only 3 exist, so enrich foo 4 times with bar and baz)
    graph.addNode(makeNode('d::qux', 'qux'));
    graph.addNode(makeNode('e::quux', 'quux'));
    graph.addNode(makeNode('f::corge', 'corge'));

    graph.enrichNode('a::foo', makeSemantic());
    graph.enrichNode('b::bar', makeSemantic());
    graph.enrichNode('c::baz', makeSemantic());
    graph.enrichNode('d::qux', makeSemantic());
    graph.enrichNode('e::quux', makeSemantic());
    graph.enrichNode('f::corge', makeSemantic());

    const stats = graph.enrichmentStats;
    expect(stats.totalEnriched).toBe(6);
    expect(stats.recentNodes).toHaveLength(5);
    expect(stats.recentNodes[0]).toBe('f::corge'); // Most recent first
  });

  it('should return false for non-existent node', () => {
    const result = graph.enrichNode('nonexistent', makeSemantic());
    expect(result).toBe(false);
    expect(graph.enrichmentStats.totalEnriched).toBe(0);
  });

  it('should return a read-only copy of stats', () => {
    graph.enrichNode('a::foo', makeSemantic());
    const stats = graph.enrichmentStats;
    stats.totalEnriched = 999; // Mutate copy
    expect(graph.enrichmentStats.totalEnriched).toBe(1); // Original unchanged
  });
});

// --- Test ProjectGraph.enrichNode ---

describe('ProjectGraph.enrichNode', () => {
  let graph: ProjectGraph;

  beforeEach(() => {
    graph = new ProjectGraph('test-project');
    graph.addNode(makeNode('a::foo', 'foo'));
    graph.addNode(makeNode('b::bar', 'bar'));
  });

  it('should enrich and track stats', () => {
    const result = graph.enrichNode('a::foo', makeSemantic());
    expect(result).toBe(true);
    expect(graph.enrichmentStats.totalEnriched).toBe(1);
  });

  it('should restore stats from setEnrichmentStats', () => {
    const savedStats: EnrichmentStats = {
      totalEnriched: 42,
      lastEnrichedAt: '2026-05-07T00:00:00Z',
      recentNodes: ['x::a', 'x::b'],
    };
    graph.setEnrichmentStats(savedStats);

    const stats = graph.enrichmentStats;
    expect(stats.totalEnriched).toBe(42);
    expect(stats.recentNodes).toEqual(['x::a', 'x::b']);
  });

  it('should dedup on re-enrichment (ProjectGraph)', () => {
    graph.enrichNode('a::foo', makeSemantic('first'));
    graph.enrichNode('a::foo', makeSemantic('updated'));
    expect(graph.enrichmentStats.totalEnriched).toBe(1);

    const node = graph.getNode('a::foo');
    expect(node?.semantic?.summary).toBe('updated');
  });
});

// --- Test appendEnrichmentLog ---

describe('appendEnrichmentLog', () => {
  beforeEach(() => {
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true });
    }
    mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  it('should create log file with header on first call', () => {
    appendEnrichmentLog(TEST_OUTPUT_DIR, 'a::foo', 'foo', 'medium', 'Test summary');

    const logPath = join(TEST_OUTPUT_DIR, 'enrichment-log.md');
    expect(existsSync(logPath)).toBe(true);

    const content = readFileSync(logPath, 'utf-8');
    expect(content).toContain('# Enrichment Log');
    expect(content).toContain('| Date |');
    expect(content).toContain('a::foo');
    expect(content).toContain('foo');
    expect(content).toContain('medium');
  });

  it('should append multiple rows', () => {
    appendEnrichmentLog(TEST_OUTPUT_DIR, 'a::foo', 'foo', 'low', 'First');
    appendEnrichmentLog(TEST_OUTPUT_DIR, 'b::bar', 'bar', 'high', 'Second');

    const content = readFileSync(join(TEST_OUTPUT_DIR, 'enrichment-log.md'), 'utf-8');
    const lines = content.trim().split('\n');
    // Header (3 lines) + separator (1) + 2 data rows
    expect(lines.length).toBeGreaterThanOrEqual(7);
  });

  it('should sanitize pipe and newline characters', () => {
    appendEnrichmentLog(TEST_OUTPUT_DIR, 'a::foo', 'foo', 'medium', 'Has | pipe and\nnewline');

    const content = readFileSync(join(TEST_OUTPUT_DIR, 'enrichment-log.md'), 'utf-8');
    expect(content).toContain('Has \\| pipe and newline');
    expect(content).not.toContain('Has | pipe');
  });
});

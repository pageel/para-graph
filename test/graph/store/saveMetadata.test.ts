import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Mock SqliteManager BEFORE any GraphStore import to prevent load-sqlite.cjs hang
vi.mock('../../../src/graph/store/sqlite-manager.js', () => {
  return {
    SqliteManager: class MockSqliteManager {
      static DatabaseConstructor = null;
      initSchema() {}
      getConnection() {
        return {
          prepare: () => ({ run: () => {} }),
          exec: () => {},
          close: () => {},
          transaction: (fn: Function) => (...args: unknown[]) => fn(...args),
        };
      }
      close() {}
    },
  };
});

// Also mock SqliteGraphRepository to avoid any DB operations
vi.mock('../../../src/graph/store/sqlite-repository.js', () => {
  return {
    SqliteGraphRepository: class MockRepo {
      getCustomMetadata() { return null; }
      insertNode() {}
    },
  };
});

import { GraphStore } from '../../../src/graph/store/GraphStore.js';
import { AstStore } from '../../../src/graph/store/AstStore.js';
import { ProjectGraph } from '../../../src/graph/store/ProjectGraph.js';

const TMP_ROOT = join(process.cwd(), 'test-tmp-metadata');
const PROJECT_NAME = 'test-save-meta';

function graphDir() {
  return join(TMP_ROOT, 'Projects', PROJECT_NAME, '.beads', 'graph');
}

function setupGraphDir(metadata: Record<string, unknown>, entities = '', relations = '') {
  const dir = graphDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  if (entities) writeFileSync(join(dir, 'entities.jsonl'), entities);
  if (relations) writeFileSync(join(dir, 'relations.jsonl'), relations);
}

function evictCache() {
  GraphStore.flushGraph(PROJECT_NAME);
  (GraphStore as any).cache?.delete?.(PROJECT_NAME);
  (GraphStore as any).mtimeCache?.delete?.(PROJECT_NAME);
  (GraphStore as any).lastCheckTime?.delete?.(PROJECT_NAME);
}

describe('GraphStore.saveMetadata — merge-safe write', () => {
  beforeEach(() => {
    evictCache(); // Always start fresh — no cache leakage between tests
    mkdirSync(graphDir(), { recursive: true });
  });

  afterEach(() => {
    evictCache();
    rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  it('🔴 RED: should preserve existing resolution when in-memory edges are empty (no relations.jsonl)', () => {
    // Arrange: existing metadata.json has a full resolution block (100 edges)
    // NO relations.jsonl → graph loads with 0 edges in memory
    const existingMetadata = {
      version: '0.15.5',
      generatedAt: '2026-05-18T09:38:31.179Z',
      nodeCount: 10,
      edgeCount: 100,
      fileCount: 5,
      projectName: PROJECT_NAME,
      enrichableNodeCount: 8,
      enrichment: { totalEnriched: 3, lastEnrichedAt: '2026-05-18T09:38:31.179Z', recentNodes: [] },
      resolution: {
        totalEdges: 100,
        resolvedEdges: 40,
        unresolvedEdges: 60,
        resolutionRate: 0.4,
      },
      healthScore: 20,
    };
    setupGraphDir(existingMetadata); // no relations.jsonl → 0 in-memory edges

    // Act
    GraphStore.saveMetadata(TMP_ROOT, PROJECT_NAME);

    // Assert: resolution MUST be preserved from disk (not zeroed)
    const saved = JSON.parse(readFileSync(join(graphDir(), 'metadata.json'), 'utf-8'));
    expect(saved.resolution).toBeDefined();
    expect(saved.resolution.totalEdges).toBe(100);    // preserved, NOT 0
    expect(saved.resolution.resolvedEdges).toBe(40);
    expect(saved.resolution.resolutionRate).toBe(0.4);
  });

  it('should compute resolution from in-memory edges when edges are loaded (regression guard)', () => {
    // Arrange: existing stale resolution (999), but 1 real edge in relations.jsonl
    const existingMetadata = {
      version: '0.15.5',
      generatedAt: '2026-05-18T00:00:00.000Z',
      nodeCount: 2,
      edgeCount: 999,
      fileCount: 1,
      projectName: PROJECT_NAME,
      enrichableNodeCount: 2,
      resolution: {
        totalEdges: 999,  // stale — MUST be overwritten
        resolvedEdges: 999,
        unresolvedEdges: 0,
        resolutionRate: 1.0,
      },
      healthScore: 30,
    };
    const nodeA = JSON.stringify({ id: 'a', name: 'a', type: 'function', filePath: 'src/a.ts', startLine: 1, endLine: 5 });
    const nodeB = JSON.stringify({ id: 'b', name: 'b', type: 'function', filePath: 'src/b.ts', startLine: 1, endLine: 5 });
    const edgeAB = JSON.stringify({ id: 'e1', sourceId: 'a', targetId: 'b', relation: 'CALLS', confidence: 'HIGH' });
    setupGraphDir(existingMetadata, `${nodeA}\n${nodeB}`, edgeAB);

    // Act
    GraphStore.saveMetadata(TMP_ROOT, PROJECT_NAME);

    // Assert: uses computed value (1 edge), not stale (999)
    const saved = JSON.parse(readFileSync(join(graphDir(), 'metadata.json'), 'utf-8'));
    expect(saved.resolution).toBeDefined();
    expect(saved.resolution.totalEdges).toBe(1);       // computed
    expect(saved.resolution.totalEdges).not.toBe(999); // not stale
  });

  it('should preserve docAnchors when calling AstStore.enrichNode() (semantic merge)', () => {
    const store = new AstStore(PROJECT_NAME);
    store.addNode({
      id: 'src/a.ts::A',
      name: 'A',
      type: 'function' as any,
      filePath: 'src/a.ts',
      startLine: 1,
      endLine: 5,
      exportType: 'none' as any,
      signature: '',
      semantic: {
        docAnchors: ['docs/a.md'],
      },
    });

    // Enrich node with new semantic details
    store.enrichNode('src/a.ts::A', {
      summary: 'New function summary',
      complexity: 'low',
      domainConcepts: [],
      enrichedAt: '2026-05-28T00:00:00Z',
      enrichedBy: 'agent',
    });

    const node = store.getNode('src/a.ts::A');
    expect(node?.semantic?.docAnchors).toEqual(['docs/a.md']);
    expect(node?.semantic?.summary).toBe('New function summary');
  });

  it('should calculate core/extra enriched nodes in ProjectGraph.getMetadata() matching CodeGraph logic', () => {
    const graph = new ProjectGraph(PROJECT_NAME);
    
    // Core nodes
    graph.addNode({ id: 'src/a.ts::A', name: 'A', type: 'function' as any, filePath: 'src/a.ts', startLine: 1, endLine: 5, exportType: 'none' as any, signature: '' });
    graph.addNode({ id: 'src/b.ts::B', name: 'B', type: 'function' as any, filePath: 'src/b.ts', startLine: 1, endLine: 5, exportType: 'none' as any, signature: '' });
    
    // Test node
    graph.addNode({ id: 'test/a.test.ts::Test', name: 'Test', type: 'function' as any, filePath: 'test/a.test.ts', startLine: 1, endLine: 5, exportType: 'none' as any, signature: '' });

    // Enrich all 3 nodes
    graph.enrichNode('src/a.ts::A', { summary: 'A', complexity: 'low', domainConcepts: [], enrichedAt: '', enrichedBy: 'agent' });
    graph.enrichNode('src/b.ts::B', { summary: 'B', complexity: 'low', domainConcepts: [], enrichedAt: '', enrichedBy: 'agent' });
    graph.enrichNode('test/a.test.ts::Test', { summary: 'Test', complexity: 'low', domainConcepts: [], enrichedAt: '', enrichedBy: 'agent' });

    const meta = graph.getMetadata(PROJECT_NAME, '1.0.0');
    expect(meta.enrichableNodeCount).toBe(2);
    expect(meta.enrichment?.coreEnriched).toBe(2);
    expect(meta.enrichment?.extraEnriched).toBe(1);
    expect(meta.enrichment?.totalEnriched).toBe(3);
    expect(meta.healthScore).toBe(100);
  });
});

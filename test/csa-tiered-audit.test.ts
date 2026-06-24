import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { SqliteManager } from '../src/graph/store/sqlite-manager.js';
import { NodeType, EdgeRelation } from '../src/graph/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DIR = resolve(__dirname, '.test-output', 'csa-tiered-audit');
const DB_PATH = join(TEST_DIR, 'test.db');

describe('Tiered CSA Audit Integration Tests', () => {
  let manager: SqliteManager;

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    manager = new SqliteManager('test-project', DB_PATH);
    manager.initSchema();
  });

  afterEach(() => {
    try {
      manager.close();
    } catch {}
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should apply default values when config is empty or missing', () => {
    // Write 1 spec anchor, 1 doc anchor, 1 undocumented spec
    const mockNodes = [
      // Function node to satisfy foreign key constraint
      { id: 'src/main.ts::run', name: 'run', type: NodeType.FUNCTION, filePath: 'src/main.ts', signature: 'function run() {}' },
      // Spec anchors (in artifacts/specs)
      { id: 'csa-spec-1', name: 'csa-spec-1', type: NodeType.SPEC_ANCHOR, filePath: 'artifacts/specs/spec.md', signature: '## Spec 1' },
      { id: 'csa-spec-2', name: 'csa-spec-2', type: NodeType.SPEC_ANCHOR, filePath: 'artifacts/specs/spec.md', signature: '## Spec 2' },
      // Doc anchors (in docs/)
      { id: 'csa-doc-1', name: 'csa-doc-1', type: NodeType.SPEC_ANCHOR, filePath: 'docs/guide.md', signature: '## Doc 1' },
    ];

    // Edges
    const mockEdges = [
      // csa-spec-1 is documented
      { sourceId: 'src/main.ts::run', targetId: 'csa-spec-1', relation: EdgeRelation.DOCUMENTED_BY, sourceFile: 'src/main.ts', sourceLine: 5 },
      // csa-doc-1 is documented
      { sourceId: 'src/main.ts::run', targetId: 'csa-doc-1', relation: EdgeRelation.DOCUMENTED_BY, sourceFile: 'src/main.ts', sourceLine: 10 },
    ];

    manager.persistGraph(mockNodes, mockEdges);

    // Call audit without custom config (should fall back to defaults: spec=90, doc=50, docGate=soft)
    const result = manager.runCsaAudit();

    // Verify config output
    expect(result.config.specThreshold).toBe(90);
    expect(result.config.docThreshold).toBe(50);
    expect(result.config.docGate).toBe('soft');

    // Verify Spec Coverage: 1 out of 2 covered = 50% < 90% threshold -> pass = false
    expect(result.specCoverage.totalAnchors).toBe(2);
    expect(result.specCoverage.coveredAnchors).toBe(1);
    expect(result.specCoverage.coverageRate).toBe(50);
    expect(result.specCoverage.pass).toBe(false);

    // Verify Doc Coverage: 1 out of 1 covered = 100% >= 50% threshold -> pass = true
    expect(result.docCoverage.totalAnchors).toBe(1);
    expect(result.docCoverage.coveredAnchors).toBe(1);
    expect(result.docCoverage.coverageRate).toBe(100);
    expect(result.docCoverage.pass).toBe(true);

    // Health Score calculation (simple average of spec and doc coverage rate)
    expect(result.combinedHealth).toBe(75); // (50 + 100) / 2
  });

  it('should fail spec pass status when below threshold and pass when met', () => {
    const mockNodes = [
      // Function node to satisfy foreign key constraint
      { id: 'src/main.ts::run', name: 'run', type: NodeType.FUNCTION, filePath: 'src/main.ts', signature: 'function run() {}' },
      { id: 'csa-spec-1', name: 'csa-spec-1', type: NodeType.SPEC_ANCHOR, filePath: 'artifacts/specs/spec.md', signature: '## Spec 1' },
      { id: 'csa-spec-2', name: 'csa-spec-2', type: NodeType.SPEC_ANCHOR, filePath: 'artifacts/specs/spec.md', signature: '## Spec 2' },
      { id: 'csa-spec-3', name: 'csa-spec-3', type: NodeType.SPEC_ANCHOR, filePath: 'artifacts/specs/spec.md', signature: '## Spec 3' },
      { id: 'csa-spec-4', name: 'csa-spec-4', type: NodeType.SPEC_ANCHOR, filePath: 'artifacts/specs/spec.md', signature: '## Spec 4' },
      { id: 'csa-spec-5', name: 'csa-spec-5', type: NodeType.SPEC_ANCHOR, filePath: 'artifacts/specs/spec.md', signature: '## Spec 5' },
      { id: 'csa-spec-6', name: 'csa-spec-6', type: NodeType.SPEC_ANCHOR, filePath: 'artifacts/specs/spec.md', signature: '## Spec 6' },
      { id: 'csa-spec-7', name: 'csa-spec-7', type: NodeType.SPEC_ANCHOR, filePath: 'artifacts/specs/spec.md', signature: '## Spec 7' },
      { id: 'csa-spec-8', name: 'csa-spec-8', type: NodeType.SPEC_ANCHOR, filePath: 'artifacts/specs/spec.md', signature: '## Spec 8' },
      { id: 'csa-spec-9', name: 'csa-spec-9', type: NodeType.SPEC_ANCHOR, filePath: 'artifacts/specs/spec.md', signature: '## Spec 9' },
      { id: 'csa-spec-10', name: 'csa-spec-10', type: NodeType.SPEC_ANCHOR, filePath: 'artifacts/specs/spec.md', signature: '## Spec 10' },
    ];

    // Case A: 8 out of 10 covered = 80% < 90% threshold -> fail
    let mockEdges = mockNodes.slice(1, 9).map(n => ({
      sourceId: 'src/main.ts::run', targetId: n.id, relation: EdgeRelation.DOCUMENTED_BY, sourceFile: 'src/main.ts', sourceLine: 5
    }));
    manager.persistGraph(mockNodes, mockEdges);
    
    let result = manager.runCsaAudit({ specThreshold: 90, docThreshold: 50, docGate: 'soft' });
    expect(result.specCoverage.coverageRate).toBe(80);
    expect(result.specCoverage.pass).toBe(false);

    // Case B: 9 out of 10 covered = 90% >= 90% threshold -> pass
    mockEdges = mockNodes.slice(1, 10).map(n => ({
      sourceId: 'src/main.ts::run', targetId: n.id, relation: EdgeRelation.DOCUMENTED_BY, sourceFile: 'src/main.ts', sourceLine: 5
    }));
    manager.persistGraph(mockNodes, mockEdges);
    
    result = manager.runCsaAudit({ specThreshold: 90, docThreshold: 50, docGate: 'soft' });
    expect(result.specCoverage.coverageRate).toBe(90);
    expect(result.specCoverage.pass).toBe(true);
  });

  it('should ignore docs check when doc_gate is set to off', () => {
    const mockNodes = [
      { id: 'csa-spec-1', name: 'csa-spec-1', type: NodeType.SPEC_ANCHOR, filePath: 'artifacts/specs/spec.md', signature: '## Spec 1' },
      { id: 'csa-doc-1', name: 'csa-doc-1', type: NodeType.SPEC_ANCHOR, filePath: 'docs/guide.md', signature: '## Doc 1' },
    ];
    // None documented
    manager.persistGraph(mockNodes, []);

    const result = manager.runCsaAudit({ specThreshold: 90, docThreshold: 50, docGate: 'off' });

    // Spec Coverage: 0% covered -> fail
    expect(result.specCoverage.totalAnchors).toBe(1);
    expect(result.specCoverage.coverageRate).toBe(0);
    expect(result.specCoverage.pass).toBe(false);

    // Doc Coverage: total should be 0 because doc check is off, and pass status should be true
    expect(result.docCoverage.totalAnchors).toBe(0);
    expect(result.docCoverage.coverageRate).toBe(100); // 100% for no checks
    expect(result.docCoverage.pass).toBe(true);
  });

  it('should process doc gate as hard or soft correctly', () => {
    const mockNodes = [
      // Function node to satisfy foreign key constraint
      { id: 'src/main.ts::run', name: 'run', type: NodeType.FUNCTION, filePath: 'src/main.ts', signature: 'function run() {}' },
      { id: 'csa-spec-1', name: 'csa-spec-1', type: NodeType.SPEC_ANCHOR, filePath: 'artifacts/specs/spec.md', signature: '## Spec 1' },
      { id: 'csa-doc-1', name: 'csa-doc-1', type: NodeType.SPEC_ANCHOR, filePath: 'docs/guide.md', signature: '## Doc 1' },
    ];
    // Document spec, but leave doc undocumented
    const mockEdges = [
      { sourceId: 'src/main.ts::run', targetId: 'csa-spec-1', relation: EdgeRelation.DOCUMENTED_BY, sourceFile: 'src/main.ts', sourceLine: 5 },
    ];
    manager.persistGraph(mockNodes, mockEdges);

    // Case A: Soft gate. Doc coverage is 0% < 50% threshold -> doc pass = false.
    let result = manager.runCsaAudit({ specThreshold: 90, docThreshold: 50, docGate: 'soft' });
    expect(result.specCoverage.pass).toBe(true); // 100% spec coverage
    expect(result.docCoverage.pass).toBe(false); // 0% doc coverage
    expect(result.config.docGate).toBe('soft');

    // Case B: Hard gate. Doc coverage is 0% < 50% threshold -> doc pass = false.
    result = manager.runCsaAudit({ specThreshold: 90, docThreshold: 50, docGate: 'hard' });
    expect(result.specCoverage.pass).toBe(true);
    expect(result.docCoverage.pass).toBe(false);
    expect(result.config.docGate).toBe('hard');
  });

  it('should fail spec compliance when threshold > 0 but there are 0 spec anchors (loophole guard)', () => {
    const mockNodes = [
      { id: 'src/main.ts::run', name: 'run', type: NodeType.FUNCTION, filePath: 'src/main.ts', signature: 'function run() {}' },
    ];
    manager.persistGraph(mockNodes, []);

    const result = manager.runCsaAudit({ specThreshold: 90, docThreshold: 50, docGate: 'soft' });

    expect(result.specCoverage.totalAnchors).toBe(0);
    expect(result.specCoverage.coverageRate).toBe(0.0);
    expect(result.specCoverage.pass).toBe(false);
  });

  it('should pass spec compliance when threshold is 0 and there are 0 spec anchors (opt-out)', () => {
    const mockNodes = [
      { id: 'src/main.ts::run', name: 'run', type: NodeType.FUNCTION, filePath: 'src/main.ts', signature: 'function run() {}' },
    ];
    manager.persistGraph(mockNodes, []);

    const result = manager.runCsaAudit({ specThreshold: 0, docThreshold: 50, docGate: 'soft' });

    expect(result.specCoverage.totalAnchors).toBe(0);
    expect(result.specCoverage.coverageRate).toBe(100.0);
    expect(result.specCoverage.pass).toBe(true);
  });

  it('should resolve dynamic CSA ID resolution with both short and long targetId in edges', () => {
    const mockNodes = [
      { id: 'src/main.ts::run', name: 'run', type: NodeType.FUNCTION, filePath: 'src/main.ts', signature: 'function run() {}' },
      // Node has ID as short syntax
      { id: 'csa-test-anchor', name: 'csa-test-anchor', type: NodeType.SPEC_ANCHOR, filePath: 'artifacts/specs/spec.md', signature: '## Spec 1' },
    ];

    const mockEdges = [
      // Short syntax edge
      { sourceId: 'src/main.ts::run', targetId: 'csa-test-anchor', relation: EdgeRelation.DOCUMENTED_BY, sourceFile: 'src/main.ts', sourceLine: 5 },
      // Long syntax edge
      { sourceId: 'src/main.ts::run', targetId: 'artifacts/specs/spec.md#csa-test-anchor', relation: EdgeRelation.DOCUMENTED_BY, sourceFile: 'src/main.ts', sourceLine: 10 },
    ];

    manager.persistGraph(mockNodes, mockEdges);

    const result = manager.runCsaAudit({ specThreshold: 90, docThreshold: 50, docGate: 'soft' });

    // Both edges should resolve to the node 'csa-test-anchor', so there should be NO dangling edges
    expect(result.danglingEdges).toHaveLength(0);
    expect(result.specCoverage.coveredAnchors).toBe(1);
    expect(result.specCoverage.coverageRate).toBe(100);
  });
});

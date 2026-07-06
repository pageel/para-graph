import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteManager } from '../src/graph/store/sqlite-manager.js';
import { NodeType, EdgeRelation } from '../src/graph/models.js';

describe('CSA Audit Scoped & Registry Filter', () => {
  let manager: SqliteManager;

  beforeEach(() => {
    // Instantiate with ':memory:' for real database behavior
    manager = new SqliteManager('test-project', ':memory:');
    manager.initSchema();

    // Populate mock nodes and edges
    const db = manager.getConnection();
    
    // Insert mock spec anchors
    const insertNode = db.prepare(`
      INSERT INTO nodes (id, name, type, semantic, file_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // S1 Spec (Approved - Global Active)
    insertNode.run(
      'csa-feat-approved-1',
      'Approved Feature 1',
      NodeType.SPEC_ANCHOR,
      JSON.stringify({ line: 10, specMeta: {} }),
      'artifacts/specs/spec-approved.md',
      123, 123
    );

    insertNode.run(
      'csa-feat-approved-2',
      'Approved Feature 2',
      NodeType.SPEC_ANCHOR,
      JSON.stringify({ line: 20, specMeta: {} }),
      'artifacts/specs/spec-approved.md',
      123, 123
    );

    // S2 Spec (Planned - Excluded in Global)
    insertNode.run(
      'csa-feat-planned-1',
      'Planned Feature 1',
      NodeType.SPEC_ANCHOR,
      JSON.stringify({ line: 10, specMeta: { planned: true } }),
      'artifacts/specs/spec-planned.md',
      123, 123
    );

    // Code Nodes
    insertNode.run(
      'src/main.ts::func1',
      'func1',
      NodeType.FUNCTION,
      null,
      'src/main.ts',
      123, 123
    );

    insertNode.run(
      'src/main.ts::func2',
      'func2',
      NodeType.FUNCTION,
      null,
      'src/main.ts',
      123, 123
    );

    // Insert edges
    const insertEdge = db.prepare(`
      INSERT INTO edges (source_id, target_id, relation, source_file, source_line)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Link func1 -> csa-feat-approved-1 (Covered)
    insertEdge.run(
      'src/main.ts::func1',
      'csa-feat-approved-1',
      EdgeRelation.DOCUMENTED_BY,
      'src/main.ts',
      5
    );
  });

  afterEach(() => {
    if (manager) {
      manager.close();
    }
  });

  it('should run global audit and exclude planned anchors', () => {
    // In global mode, total anchors = S1 anchors (2). S2 is planned, so excluded.
    // Covered = csa-feat-approved-1 (1). csa-feat-approved-2 is not covered.
    const result = manager.runCsaAudit({
      specThreshold: 50,
      docGate: 'off'
    });

    expect(result.specCoverage.totalAnchors).toBe(2);
    expect(result.specCoverage.coveredAnchors).toBe(1);
    expect(result.specCoverage.coverageRate).toBe(50); // 1 out of 2 weight units (if weights are default)
    expect(result.specCoverage.pass).toBe(true);
    expect(result.mode).toBe('global');
  });

  it('should run plan-scoped audit and only check planSpecIds', () => {
    // In plan-scoped mode, total anchors = only the ones in planSpecIds (e.g. csa-feat-approved-1 and csa-feat-planned-1)
    // Covered = csa-feat-approved-1 (1). csa-feat-planned-1 is not covered.
    // Planned exclusion is disabled under plan-scoped mode!
    const result = manager.runCsaAudit({
      specThreshold: 50,
      docGate: 'off',
      planSpecIds: ['csa-feat-approved-1', 'csa-feat-planned-1']
    });

    expect(result.specCoverage.totalAnchors).toBe(2);
    expect(result.specCoverage.coveredAnchors).toBe(1);
    expect(result.planSpecIds).toEqual(['csa-feat-approved-1', 'csa-feat-planned-1']);
    expect(result.mode).toBe('plan-scoped');
  });

  it('should return 100% coverage when planSpecIds has only covered anchors', () => {
    const result = manager.runCsaAudit({
      specThreshold: 100,
      docGate: 'off',
      planSpecIds: ['csa-feat-approved-1']
    });

    expect(result.specCoverage.totalAnchors).toBe(1);
    expect(result.specCoverage.coveredAnchors).toBe(1);
    expect(result.specCoverage.coverageRate).toBe(100);
    expect(result.specCoverage.pass).toBe(true);
  });
});

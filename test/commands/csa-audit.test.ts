import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { SqliteManager } from '../../src/graph/store/sqlite-manager.js';
import { NodeType, EdgeRelation } from '../../src/graph/models.js';
import { runAudit } from '../../src/commands/audit.js';
import { GraphStore } from '../../src/graph/store/GraphStore.js';
import * as workspaceUtils from '../../src/utils/workspace.js';
import Database from 'better-sqlite3';

SqliteManager.DatabaseConstructor = Database;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DIR = resolve(__dirname, '..', '.test-output', 'csa-audit');

describe('CSA SQL Audit Query', () => {
  const dbPath = join(TEST_DIR, 'audit-test.db');
  let manager: SqliteManager;

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    manager = new SqliteManager('audit-test', dbPath);
    manager.initSchema();
  });

  afterEach(() => {
    manager.close();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should calculate coverage rate and detect dangling edges correctly via SQLite', () => {
    // 1. Prepare nodes and edges
    const nodes = [
      { id: 'index.ts', name: 'index.ts', type: NodeType.FILE },
      { id: 'index.ts::main', name: 'main', type: NodeType.FUNCTION },
      { id: 'csa-anchor-1', name: 'csa-anchor-1', type: NodeType.SPEC_ANCHOR },
      { id: 'csa-anchor-2', name: 'csa-anchor-2', type: NodeType.SPEC_ANCHOR }
    ];

    const edges = [
      {
        sourceId: 'index.ts::main',
        targetId: 'csa-anchor-1',
        relation: EdgeRelation.DOCUMENTED_BY,
        sourceFile: 'index.ts',
        sourceLine: 5
      },
      {
        sourceId: 'index.ts::main',
        targetId: 'csa-anchor-missing', // Dangling link
        relation: EdgeRelation.DOCUMENTED_BY,
        sourceFile: 'index.ts',
        sourceLine: 10
      }
    ];

    // 2. Persist graph using the transaction manager
    manager.persistGraph(nodes, edges);

    // 3. Run audit
    const result = manager.runCsaAudit();

    // 4. Assert correctness
    expect(result.totalAnchors).toBe(2);
    expect(result.coveredAnchors).toBe(1);
    expect(result.coverageRate).toBe(50.0);
    expect(result.danglingEdges).toHaveLength(1);
    expect(result.danglingEdges[0]).toEqual({
      sourceId: 'index.ts::main',
      targetId: 'csa-anchor-missing',
      sourceFile: 'index.ts',
      sourceLine: 10
    });
  });

  it('should detect dangling inherits references correctly via SQLite', () => {
    // 1. Prepare nodes and edges
    const nodes = [
      { id: 'docs/doc.md', name: 'doc.md', type: NodeType.FILE },
      { id: 'csa-anchor-1', name: 'csa-anchor-1', type: NodeType.SPEC_ANCHOR }
    ];

    const edges = [
      {
        sourceId: 'docs/doc.md',
        targetId: 'csa-anchor-missing', // Dangling inherits link
        relation: EdgeRelation.DOCUMENTS,
        sourceFile: 'docs/doc.md',
        sourceLine: 10
      }
    ];

    // 2. Persist graph
    manager.persistGraph(nodes, edges);

    // 3. Run audit
    const result = manager.runCsaAudit();

    // 4. Assert correctness
    expect(result.danglingInherits).toHaveLength(1);
    expect(result.danglingInherits[0]).toEqual({
      sourceId: 'docs/doc.md',
      targetId: 'csa-anchor-missing',
      sourceFile: 'docs/doc.md',
      sourceLine: 10
    });
  });
});

describe('CLI runAudit command', () => {
  let originalExit: typeof process.exit;
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let exitCode: number | null = null;
  let logs: string[] = [];
  let errors: string[] = [];

  beforeEach(() => {
    // Preemptive cleanup
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });

    originalExit = process.exit;
    originalLog = console.log;
    originalError = console.error;
    exitCode = null;
    logs = [];
    errors = [];

    // Mock process.exit
    (process as any).exit = (code: number) => {
      exitCode = code;
      throw new Error(`exit:${code}`);
    };

    // Mock console.log and console.error
    console.log = (...args: any[]) => {
      logs.push(args.join(' '));
    };
    console.error = (...args: any[]) => {
      errors.push(args.join(' '));
    };
  });

  afterEach(() => {
    process.exit = originalExit;
    console.log = originalLog;
    console.error = originalError;
    vi.restoreAllMocks();

    // Close all graph connections immediately to unlock db files before deleting TEST_DIR
    const cache = (GraphStore as any).cache;
    if (cache) {
      for (const graph of cache.values()) {
        try {
          graph.close();
        } catch (e) {}
      }
      cache.clear();
    }

    // Teardown cleanup
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should pass with exit code 0 when coverage is 100%', () => {
    const projectPath = join(TEST_DIR, 'Projects', 'test-proj');
    const dbDir = join(projectPath, '.beads', 'graph');
    mkdirSync(dbDir, { recursive: true });
    
    const fs = require('fs');
    fs.writeFileSync(join(TEST_DIR, '.para-workspace.yml'), '');

    vi.spyOn(workspaceUtils, 'findWorkspaceRoot').mockReturnValue(TEST_DIR);

    const dbPath = join(dbDir, 'test-proj.db');
    const manager = new SqliteManager('test-proj', dbPath);
    manager.initSchema();
    
    const nodes = [
      { id: 'file1.ts', name: 'file1.ts', type: NodeType.FILE },
      { id: 'anchor1', name: 'anchor1', type: NodeType.SPEC_ANCHOR }
    ];
    const edges = [
      { sourceId: 'file1.ts', targetId: 'anchor1', relation: EdgeRelation.DOCUMENTED_BY, sourceFile: 'file1.ts', sourceLine: 1 }
    ];
    manager.persistGraph(nodes, edges);
    manager.close();

    expect(() => {
      runAudit({ projectPath });
    }).toThrow('exit:0');

    expect(exitCode).toBe(0);
  });

  it('should fail with exit code 1 when coverage is < 90%', () => {
    const projectPath = join(TEST_DIR, 'Projects', 'test-proj-fail');
    const dbDir = join(projectPath, '.beads', 'graph');
    mkdirSync(dbDir, { recursive: true });

    vi.spyOn(workspaceUtils, 'findWorkspaceRoot').mockReturnValue(TEST_DIR);

    const dbPath = join(dbDir, 'test-proj-fail.db');
    const manager = new SqliteManager('test-proj-fail', dbPath);
    manager.initSchema();
    
    const nodes = [
      { id: 'file1.ts', name: 'file1.ts', type: NodeType.FILE },
      { id: 'anchor1', name: 'anchor1', type: NodeType.SPEC_ANCHOR },
      { id: 'anchor2', name: 'anchor2', type: NodeType.SPEC_ANCHOR }
    ];
    const edges = [
      { sourceId: 'file1.ts', targetId: 'anchor1', relation: EdgeRelation.DOCUMENTED_BY, sourceFile: 'file1.ts', sourceLine: 1 }
    ];
    manager.persistGraph(nodes, edges);
    manager.close();

    expect(() => {
      runAudit({ projectPath });
    }).toThrow('exit:1');

    expect(exitCode).toBe(1);
    expect(errors.some(e => e.includes('Fail: Tier 1 Spec Coverage 50.00% < 90%'))).toBe(true);
  });

  it('should exit code 0 when there are no anchors (Opt-In)', () => {
    const projectPath = join(TEST_DIR, 'Projects', 'test-proj-empty');
    const dbDir = join(projectPath, '.beads', 'graph');
    mkdirSync(dbDir, { recursive: true });

    vi.spyOn(workspaceUtils, 'findWorkspaceRoot').mockReturnValue(TEST_DIR);

    const dbPath = join(dbDir, 'test-proj-empty.db');
    const manager = new SqliteManager('test-proj-empty', dbPath);
    manager.initSchema();
    
    manager.persistGraph([], []);
    manager.close();

    expect(() => {
      runAudit({ projectPath });
    }).toThrow('exit:0');

    expect(exitCode).toBe(0);
    expect(logs.some(l => l.includes('No CSA anchors or undocumented elements found. CSA is strictly Opt-In'))).toBe(true);
  });

  it('should print warnings for dangling inherits references in CLI output', () => {
    const projectPath = join(TEST_DIR, 'Projects', 'test-proj-dangling-inherits');
    const dbDir = join(projectPath, '.beads', 'graph');
    mkdirSync(dbDir, { recursive: true });

    vi.spyOn(workspaceUtils, 'findWorkspaceRoot').mockReturnValue(TEST_DIR);

    const dbPath = join(dbDir, 'test-proj-dangling-inherits.db');
    const manager = new SqliteManager('test-proj-dangling-inherits', dbPath);
    manager.initSchema();

    const nodes = [
      { id: 'docs/doc.md', name: 'doc.md', type: NodeType.FILE }
    ];
    const edges = [
      {
        sourceId: 'docs/doc.md',
        targetId: 'csa-anchor-missing',
        relation: EdgeRelation.DOCUMENTS,
        sourceFile: 'docs/doc.md',
        sourceLine: 12
      }
    ];
    manager.persistGraph(nodes, edges);
    manager.close();

    expect(() => {
      runAudit({ projectPath });
    }).toThrow('exit:0');

    expect(exitCode).toBe(0);
    expect(errors.some(e => e.includes('Dangling Inherits Detected:'))).toBe(true);
    expect(errors.some(e => e.includes('File "docs/doc.md" inherits from missing anchor "csa-anchor-missing"'))).toBe(true);
  });

  it('should run plan-scoped audit if planScope file with mapping exists', () => {
    const projectPath = join(TEST_DIR, 'Projects', 'test-proj-plan');
    const dbDir = join(projectPath, '.beads', 'graph');
    mkdirSync(dbDir, { recursive: true });

    vi.spyOn(workspaceUtils, 'findWorkspaceRoot').mockReturnValue(TEST_DIR);

    const dbPath = join(dbDir, 'test-proj-plan.db');
    const manager = new SqliteManager('test-proj-plan', dbPath);
    manager.initSchema();
    
    // csa-anchor-1 is covered, csa-anchor-2 is not.
    // planned anchor is not covered.
    const nodes = [
      { id: 'file1.ts', name: 'file1.ts', type: NodeType.FILE },
      { id: 'csa-anchor-1', name: 'anchor1', type: NodeType.SPEC_ANCHOR },
      { id: 'csa-anchor-2', name: 'anchor2', type: NodeType.SPEC_ANCHOR },
      { id: 'csa-planned-1', name: 'planned1', type: NodeType.SPEC_ANCHOR, semantic: { specMeta: { planned: true } } }
    ];
    const edges = [
      { sourceId: 'file1.ts', targetId: 'csa-anchor-1', relation: EdgeRelation.DOCUMENTED_BY, sourceFile: 'file1.ts', sourceLine: 1 }
    ];
    manager.persistGraph(nodes, edges);
    manager.close();

    // Write a mock plan file with mapping table containing csa-anchor-1 and csa-planned-1
    const planPath = join(projectPath, 'plan.md');
    const fs = require('fs');
    fs.writeFileSync(
      planPath,
      `# Plan\n\n## CSA Spec Mapping Table\n| Symbol | Spec File |\n| \`csa-anchor-1\` | spec.md |\n| \`csa-planned-1\` | planned.md |\n`,
      'utf-8'
    );

    // Run audit with planScope.
    // In plan-scoped mode, total anchors = 2 (csa-anchor-1 and csa-planned-1). Covered = 1. Coverage = 50%.
    // Since specThreshold defaults to 90, it should fail with exit code 1.
    expect(() => {
      runAudit({ projectPath, planScope: planPath });
    }).toThrow('exit:1');

    expect(exitCode).toBe(1);
    expect(logs.some(l => l.includes('Plan-Scoped'))).toBe(true);
    expect(errors.some(e => e.includes('Fail: Tier 1 Spec Coverage 50.00% < 90%'))).toBe(true);
  });

  it('should fallback to global audit with warning if planScope file does not exist', () => {
    const projectPath = join(TEST_DIR, 'Projects', 'test-proj-fallback');
    const dbDir = join(projectPath, '.beads', 'graph');
    mkdirSync(dbDir, { recursive: true });

    vi.spyOn(workspaceUtils, 'findWorkspaceRoot').mockReturnValue(TEST_DIR);

    const dbPath = join(dbDir, 'test-proj-fallback.db');
    const manager = new SqliteManager('test-proj-fallback', dbPath);
    manager.initSchema();
    
    // csa-planned-1 is excluded in global, so total anchors = 1 (csa-anchor-1). Covered = 1. Coverage = 100%.
    const nodes = [
      { id: 'file1.ts', name: 'file1.ts', type: NodeType.FILE },
      { id: 'csa-anchor-1', name: 'anchor1', type: NodeType.SPEC_ANCHOR },
      { id: 'csa-planned-1', name: 'planned1', type: NodeType.SPEC_ANCHOR, semantic: { specMeta: { planned: true } } }
    ];
    const edges = [
      { sourceId: 'file1.ts', targetId: 'csa-anchor-1', relation: EdgeRelation.DOCUMENTED_BY, sourceFile: 'file1.ts', sourceLine: 1 }
    ];
    manager.persistGraph(nodes, edges);
    manager.close();

    // Run audit with non-existent planScope path. It should warn and run global audit (which passes).
    expect(() => {
      runAudit({ projectPath, planScope: 'non-existent-plan.md' });
    }).toThrow('exit:0');

    expect(exitCode).toBe(0);
    expect(errors.some(e => e.includes('Warning: Plan file not found'))).toBe(true);
    expect(logs.some(l => l.includes('Global'))).toBe(true);
  });
});

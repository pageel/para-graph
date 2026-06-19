import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { SqliteManager } from '../../src/graph/store/sqlite-manager.js';
import { NodeType, EdgeRelation } from '../../src/graph/models.js';
import { runAudit } from '../../src/commands/audit.js';
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
});

describe('CLI runAudit command', () => {
  let originalExit: typeof process.exit;
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let exitCode: number | null = null;
  let logs: string[] = [];
  let errors: string[] = [];

  beforeEach(() => {
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
});

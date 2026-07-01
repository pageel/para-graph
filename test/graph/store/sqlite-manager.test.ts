import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteManager } from '../../../src/graph/store/sqlite-manager.js';
import Database from 'better-sqlite3';

SqliteManager.DatabaseConstructor = Database;

describe('SqliteManager', () => {
  let dbManager: SqliteManager;

  beforeEach(() => {
    dbManager = new SqliteManager('test', ':memory:');
    dbManager.initSchema();
  });

  // @para-doc [#csa-s5-temp-db-cleanup]
  afterEach(() => {
    dbManager.close();
  });

  describe('Schema initialization', () => {
    it('creates project_snapshots table', () => {
      const db = dbManager.getConnection();
      const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project_snapshots'");
      const result = stmt.get();
      expect(result).toBeDefined();
      expect(result?.name).toBe('project_snapshots');
    });

    it('migrates memory_events to include weight and archived columns safely', () => {
      const db = dbManager.getConnection();
      
      // Get table info to verify columns exist
      const columnsInfo = db.prepare("PRAGMA table_info(memory_events)").all() as any[];
      const weightCol = columnsInfo.find(c => c.name === 'weight');
      const archivedCol = columnsInfo.find(c => c.name === 'archived');
      
      expect(weightCol).toBeDefined();
      expect(weightCol.type).toBe('REAL');
      expect(weightCol.dflt_value).toBe('1.0');
      
      expect(archivedCol).toBeDefined();
      expect(archivedCol.type).toBe('INTEGER');
      expect(archivedCol.dflt_value).toBe('0');
      
      // Verify index exists
      const indexStmt = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_events_archived'");
      const indexResult = indexStmt.get();
      expect(indexResult).toBeDefined();
      expect(indexResult?.name).toBe('idx_events_archived');
    });
  });

  // @para-doc [#csa-s5-sqlite-migration-test]
  describe('Schema Migration / Drift', () => {
    it('handles legacy edges table foreign key constraint on target_id', () => {
      const manager = new SqliteManager('test-migration', ':memory:');
      const db = manager.getConnection();
      db.exec('PRAGMA foreign_keys = ON;');
      db.exec(`
        CREATE TABLE nodes (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          semantic TEXT,
          created_at INTEGER,
          updated_at INTEGER
        );
      `);
      db.exec(`
        CREATE TABLE edges (
          source_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          relation TEXT NOT NULL,
          source_file TEXT,
          source_line INTEGER,
          PRIMARY KEY (source_id, target_id, relation),
          FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
          FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE
        );
      `);

      db.prepare(`
        INSERT INTO nodes (id, name, type, created_at, updated_at)
        VALUES ('node1', 'Node 1', 'file', 123, 123)
      `).run();

      expect(() => {
        db.prepare(`
          INSERT INTO edges (source_id, target_id, relation)
          VALUES ('node1', 'non_existent', 'DEPENDS_ON')
        `).run();
      }).toThrow(/FOREIGN KEY constraint failed/);

      manager.initSchema();

      db.prepare(`
        INSERT INTO edges (source_id, target_id, relation)
        VALUES ('node1', 'non_existent', 'DEPENDS_ON')
      `).run();

      manager.close();
    });

    it('migrates legacy project_snapshots table to include metrics column safely', () => {
      const manager = new SqliteManager('test-migration-snapshots', ':memory:');
      const db = manager.getConnection();

      // Pre-create legacy project_snapshots table without metrics column
      db.exec(`
        CREATE TABLE project_snapshots (
          id TEXT PRIMARY KEY,
          project_name TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          nodes_count INTEGER NOT NULL,
          edges_count INTEGER NOT NULL,
          unresolved_count INTEGER NOT NULL
        );
      `);

      // Verify that metrics column does not exist yet
      let columns = db.prepare("PRAGMA table_info(project_snapshots)").all() as any[];
      expect(columns.find(c => c.name === 'metrics')).toBeUndefined();

      // Run initSchema() which should migrate the table
      manager.initSchema();

      // Verify that metrics column was added
      columns = db.prepare("PRAGMA table_info(project_snapshots)").all() as any[];
      const metricsCol = columns.find(c => c.name === 'metrics');
      expect(metricsCol).toBeDefined();
      expect(metricsCol.type).toBe('TEXT');
      expect(metricsCol.dflt_value).toBe('NULL');

      manager.close();
    });
  });

  describe('Session Telemetry API', () => {
    const mockTelemetry = {
      id: 'telemetry-1',
      projectName: 'test',
      conversationId: 'conv-123',
      modelUsed: 'gemini-pro',
      workflow: '/end',
      toolCallsTotal: 15,
      toolCallsBreakdown: { view_file: 10, replace_file_content: 5 },
      filesReadCount: 2,
      filesReadList: ['src/graph/models.ts', 'src/graph/store/sqlite-manager.ts'],
      filesChangedCount: 1,
      filesChangedList: ['src/graph/models.ts'],
      tokenEstimateInput: 5000,
      tokenEstimateOutput: 2000,
      frictionCount: 1,
      frictionDetails: [{ type: 'build_error', message: 'Compilation failed', timestamp: 1234567890 }],
      durationSeconds: 120,
      capturedAt: 1719323400000 // Stable timestamp
    };

    // @para-doc [#csa-test-schema]
    it('verifies session_telemetry table and indexes are created', () => {
      const db = dbManager.getConnection();
      const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_telemetry'");
      const result = stmt.get();
      expect(result).toBeDefined();
      expect(result?.name).toBe('session_telemetry');
    });

    // @para-doc [#csa-test-push]
    it('allows pushing telemetry data successfully', () => {
      // Proactively cast to any before implementation is completed (stub state)
      (dbManager as any).pushTelemetry(mockTelemetry);

      const db = dbManager.getConnection();
      const row = db.prepare("SELECT * FROM session_telemetry WHERE id = ?").get(mockTelemetry.id) as any;
      expect(row).toBeDefined();
      expect(row.project_name).toBe(mockTelemetry.projectName);
      expect(row.conversation_id).toBe(mockTelemetry.conversationId);
      expect(JSON.parse(row.tool_calls_breakdown)).toEqual(mockTelemetry.toolCallsBreakdown);
      expect(JSON.parse(row.files_read_list)).toEqual(mockTelemetry.filesReadList);
      expect(JSON.parse(row.files_changed_list)).toEqual(mockTelemetry.filesChangedList);
      expect(JSON.parse(row.friction_details)).toEqual(mockTelemetry.frictionDetails);
    });

    // @para-doc [#csa-test-query-trends]
    it('queries telemetry data correctly', () => {
      (dbManager as any).pushTelemetry(mockTelemetry);
      
      const results = (dbManager as any).queryTelemetry('test', 10);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe(mockTelemetry.id);
      expect(results[0].projectName).toBe(mockTelemetry.projectName);
      expect(results[0].toolCallsBreakdown).toEqual(mockTelemetry.toolCallsBreakdown);
    });
  });

  describe('runCsaAudit transitive resolution', () => {
    it('resolves transitive coverage correctly: Code -> DOCUMENTS -> Doc File -> DOCUMENTS -> Spec Anchor', () => {
      const db = dbManager.getConnection();
      
      // 1. Insert nodes
      // Spec Anchor node
      db.prepare(`
        INSERT INTO nodes (id, name, type, file_path, created_at, updated_at)
        VALUES ('csa-anchor-1', 'Anchor 1', 'spec_anchor', 'artifacts/specs/spec.md', 123, 123)
      `).run();

      // Doc File node
      db.prepare(`
        INSERT INTO nodes (id, name, type, file_path, created_at, updated_at)
        VALUES ('docs/doc.md', 'doc.md', 'file', 'docs/doc.md', 123, 123)
      `).run();

      // Code Node
      db.prepare(`
        INSERT INTO nodes (id, name, type, file_path, created_at, updated_at)
        VALUES ('src/index.ts::foo', 'foo', 'function', 'src/index.ts', 123, 123)
      `).run();

      // 2. Insert edges
      // Code -> Doc File (DOCUMENTED_BY)
      db.prepare(`
        INSERT INTO edges (source_id, target_id, relation)
        VALUES ('src/index.ts::foo', 'docs/doc.md', 'DOCUMENTED_BY')
      `).run();

      // Doc File -> Spec Anchor (DOCUMENTS)
      db.prepare(`
        INSERT INTO edges (source_id, target_id, relation)
        VALUES ('docs/doc.md', 'csa-anchor-1', 'DOCUMENTS')
      `).run();

      // 3. Run audit
      const result = dbManager.runCsaAudit({
        doubleBinding: true,
        specThreshold: 100
      });

      // 4. Verify results
      expect(result.specCoverage.pass).toBe(true);
      expect(result.specCoverage.totalAnchors).toBe(1);
      expect(result.specCoverage.coveredAnchors).toBe(1);
      expect(result.specCoverage.coverageRate).toBe(100);
    });
  });
});


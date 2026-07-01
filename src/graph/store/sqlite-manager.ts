import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { CsaConfig, SessionTelemetryData, SessionTelemetryRow, CsaEvent } from '../models.js';

const require = createRequire(import.meta.url);

export interface PrefixMismatch {
  anchorId: string;
  expectedPrefix: string;
  filePath: string;
  line: number;
}

export interface CsaAuditResult {
  totalAnchors: number;
  coveredAnchors: number;
  coverageRate: number;
  config: {
    specThreshold: number;
    docThreshold: number;
    docGate: 'soft' | 'hard' | 'off';
    calibration?: any;
    doubleBinding?: boolean;
  };
  specCoverage: {
    totalAnchors: number;
    coveredAnchors: number;
    coverageRate: number;
    threshold: number;
    gate: 'hard' | 'soft' | 'off';
    pass: boolean;
  };
  docCoverage: {
    totalAnchors: number;
    coveredAnchors: number;
    coverageRate: number;
    threshold: number;
    gate: 'hard' | 'soft' | 'off';
    pass: boolean;
  };
  combinedHealth: number;
  danglingEdges: Array<{
    sourceId: string;
    targetId: string;
    sourceFile: string;
    sourceLine: number;
  }>;
  danglingInherits: Array<{
    sourceId: string;
    targetId: string;
    sourceFile: string;
    sourceLine: number;
  }>;
  prefixMismatches?: PrefixMismatch[];
}

// @para-doc [#csa-sqlite-database]
// @para-doc [#csa-s5-benchmark-runner]
// @para-doc [#csa-s5-benchmark-metrics]
export class SqliteManager {
  private dbPath: string;
  private db: any | null = null;

  constructor(projectName: string, customPath?: string) {
    if (customPath) {
      this.dbPath = customPath;
    } else {
      this.dbPath = path.join(process.cwd(), '.beads', 'graph', `${projectName}.db`);
    }
  }

  public getDbPath(): string {
    return this.dbPath;
  }

  // @para-doc [#csa-sqlite-schema]
  // @para-doc [#csa-test-schema]
  // @para-doc [#csa-s5-sqlite-migration-test]
  // @para-doc [#csa-s5-temp-db-cleanup]
  public initSchema(): void {
    const db = this.getConnection();

    // 1. Create standard tables
    // Nodes table with JSON serialized semantic field
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        semantic TEXT DEFAULT NULL,
        file_path TEXT DEFAULT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Fix legacy schema drift: Drop edges table if it has an obsolete foreign key constraint on target_id (L1 target_id can be external/unresolved)
    try {
      const fks = db.prepare("PRAGMA foreign_key_list(edges)").all() as Array<{ from: string }>;
      if (fks.some(fk => fk.from === 'target_id')) {
        db.exec(`DROP TABLE IF EXISTS edges;`);
      }
    } catch (e) {}

    // Edges table
    db.exec(`
      CREATE TABLE IF NOT EXISTS edges (
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        source_file TEXT,
        source_line INTEGER,
        PRIMARY KEY (source_id, target_id, relation),
        FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE
      )
    `);

    // Metadata table
    db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Memory events table
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT DEFAULT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    // Memory slices table
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_slices (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        summary TEXT NOT NULL,
        node_ids TEXT NOT NULL,
        event_ids TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    // Project snapshots table
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_snapshots (
        id TEXT PRIMARY KEY,
        project_name TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        nodes_count INTEGER NOT NULL,
        edges_count INTEGER NOT NULL,
        unresolved_count INTEGER NOT NULL,
        metrics TEXT DEFAULT NULL
      )
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_project ON project_snapshots(project_name)
    `);

    // 2. Create FTS5 virtual table
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS fts_memory_events USING fts5(
        id UNINDEXED,
        session_id UNINDEXED,
        kind UNINDEXED,
        content,
        content='memory_events',
        content_rowid='rowid'
      )
    `);

    // 3. Create Triggers for auto-syncing memory_events to fts_memory_events
    // AFTER INSERT
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS memory_events_ai AFTER INSERT ON memory_events BEGIN
        INSERT INTO fts_memory_events(rowid, id, session_id, kind, content)
        VALUES (new.rowid, new.id, new.session_id, new.kind, new.content);
      END;
    `);

    // AFTER DELETE
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS memory_events_ad AFTER DELETE ON memory_events BEGIN
        INSERT INTO fts_memory_events(fts_memory_events, rowid, id, session_id, kind, content)
        VALUES ('delete', old.rowid, old.id, old.session_id, old.kind, old.content);
      END;
    `);

    // AFTER UPDATE
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS memory_events_au AFTER UPDATE ON memory_events BEGIN
        INSERT INTO fts_memory_events(fts_memory_events, rowid, id, session_id, kind, content)
        VALUES ('delete', old.rowid, old.id, old.session_id, old.kind, old.content);
        INSERT INTO fts_memory_events(rowid, id, session_id, kind, content)
        VALUES (new.rowid, new.id, new.session_id, new.kind, new.content);
      END;
    `);

    // Project insights table (P5)
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_insights (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        domain TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_session TEXT,
        related_node_ids TEXT DEFAULT '[]',
        related_files TEXT DEFAULT '[]',
        confidence TEXT DEFAULT 'hypothesis',
        validated_at TEXT DEFAULT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // FTS table for project insights
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS fts_insights USING fts5(
        id UNINDEXED,
        category UNINDEXED,
        domain,
        title,
        description,
        content='project_insights',
        content_rowid='rowid'
      )
    `);

    // Triggers for fts_insights
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS project_insights_ai AFTER INSERT ON project_insights BEGIN
        INSERT INTO fts_insights(rowid, id, category, domain, title, description)
        VALUES (new.rowid, new.id, new.category, new.domain, new.title, new.description);
      END;
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS project_insights_ad AFTER DELETE ON project_insights BEGIN
        INSERT INTO fts_insights(fts_insights, rowid, id, category, domain, title, description)
        VALUES ('delete', old.rowid, old.id, old.category, old.domain, old.title, old.description);
      END;
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS project_insights_au AFTER UPDATE ON project_insights BEGIN
        INSERT INTO fts_insights(fts_insights, rowid, id, category, domain, title, description)
        VALUES ('delete', old.rowid, old.id, old.category, old.domain, old.title, old.description);
        INSERT INTO fts_insights(rowid, id, category, domain, title, description)
        VALUES (new.rowid, new.id, new.category, new.domain, new.title, new.description);
      END;
    `);

    // 4. Schema Migrations
    try {
      db.exec(`ALTER TABLE project_snapshots ADD COLUMN metrics TEXT DEFAULT NULL;`);
    } catch (e: any) {
      if (!e.message.includes('duplicate column name')) {
        throw e;
      }
    }

    // v0.17.2: Add file_path to nodes table
    try {
      db.exec(`ALTER TABLE nodes ADD COLUMN file_path TEXT DEFAULT NULL;`);
    } catch (e: any) {
      if (!e.message.includes('duplicate column name')) {
        throw e;
      }
    }

    // v0.16.0: Add weight and archived to memory_events
    try {
      db.exec(`ALTER TABLE memory_events ADD COLUMN weight REAL DEFAULT 1.0;`);
    } catch (e: any) {
      if (!e.message.includes('duplicate column name')) {
        throw e;
      }
    }
    
    try {
      db.exec(`ALTER TABLE memory_events ADD COLUMN archived INTEGER DEFAULT 0;`);
    } catch (e: any) {
      if (!e.message.includes('duplicate column name')) {
        throw e;
      }
    }
    
    db.exec(`CREATE INDEX IF NOT EXISTS idx_events_archived ON memory_events(archived)`);

    // Snapshot tables (v0.17.0)
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_tree_snapshots (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        total_files INTEGER NOT NULL,
        total_size INTEGER NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS file_tree_entries (
        snapshot_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        size INTEGER NOT NULL,
        hash TEXT NOT NULL,
        PRIMARY KEY (snapshot_id, file_path),
        FOREIGN KEY (snapshot_id) REFERENCES file_tree_snapshots(id) ON DELETE CASCADE
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS protected_files (
        file_path TEXT PRIMARY KEY,
        description TEXT,
        created_at INTEGER NOT NULL
      )
    `);

    // Seed default data for protected_files
    const seedProtected = db.prepare(`
      INSERT OR IGNORE INTO protected_files (file_path, description, created_at)
      VALUES (?, ?, ?)
    `);
    const seedTime = Date.now();
    seedProtected.run('.para-workspace.yml', 'Workspace configuration root', seedTime);
    seedProtected.run('.agents/rules.md', 'Workspace rules trigger index', seedTime);
    seedProtected.run('project.md', 'Project contract definition', seedTime);
    seedProtected.run('.gitignore', 'Git exclude patterns', seedTime);

    // Project state cache table
    // @para-doc [#csa-db-project-state]
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_state (
        project_name TEXT PRIMARY KEY,
        active_plan TEXT DEFAULT NULL,
        version TEXT DEFAULT NULL,
        status TEXT DEFAULT NULL,
        backlog_active_count INTEGER DEFAULT 0,
        backlog_completed_count INTEGER DEFAULT 0,
        sprint_pending_count INTEGER DEFAULT 0,
        sprint_completed_count INTEGER DEFAULT 0,
        project_hash TEXT DEFAULT NULL,
        backlog_hash TEXT DEFAULT NULL,
        sprint_hash TEXT DEFAULT NULL,
        synced_at INTEGER NOT NULL
      )
    `);

    // Session telemetry table (v0.17.6)
    // @para-doc [#csa-db-session-telemetry]
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_telemetry (
        id TEXT PRIMARY KEY,
        project_name TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        model_used TEXT,
        workflow TEXT,
        tool_calls_total INTEGER DEFAULT 0,
        tool_calls_breakdown TEXT,
        files_read_count INTEGER DEFAULT 0,
        files_read_list TEXT,
        files_changed_count INTEGER DEFAULT 0,
        files_changed_list TEXT,
        token_estimate_input INTEGER DEFAULT 0,
        token_estimate_output INTEGER DEFAULT 0,
        friction_count INTEGER DEFAULT 0,
        friction_details TEXT,
        duration_seconds INTEGER,
        captured_at INTEGER NOT NULL
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_st_project ON session_telemetry(project_name)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_st_workflow ON session_telemetry(workflow)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_st_captured ON session_telemetry(captured_at)`);

    // Migration for older database instances
    try {
      db.exec(`ALTER TABLE project_state ADD COLUMN project_hash TEXT DEFAULT NULL;`);
    } catch (e) {}
    try {
      db.exec(`ALTER TABLE project_state ADD COLUMN backlog_hash TEXT DEFAULT NULL;`);
    } catch (e) {}
    try {
      db.exec(`ALTER TABLE project_state ADD COLUMN sprint_hash TEXT DEFAULT NULL;`);
    } catch (e) {}

    // csa_events table (v0.17.6.3)
    db.exec(`
      CREATE TABLE IF NOT EXISTS csa_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        event_type TEXT NOT NULL,
        target_id TEXT,
        details TEXT,
        session_id TEXT
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_csa_events_type ON csa_events(event_type)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_csa_events_target ON csa_events(target_id)`);
  }

  public static DatabaseConstructor: any = null;

  public getConnection(): any {
    if (!this.db) {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      try {
        const loadSqlite = require('./load-sqlite.cjs');
        const Database = SqliteManager.DatabaseConstructor || loadSqlite();
        this.db = new Database(this.dbPath);
      } catch (e: any) {
        throw new Error('better-sqlite3 is not available. Error: ' + e.message);
      }
    }
    return this.db;
  }

  // @para-doc [#csa-persistGraph]
  public persistGraph(nodes: any[], edges: any[]): void {
    const db = this.getConnection();
    
    const insertNode = db.prepare(`
      INSERT OR REPLACE INTO nodes (id, name, type, semantic, file_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const insertEdge = db.prepare(`
      INSERT OR REPLACE INTO edges (source_id, target_id, relation, source_file, source_line)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const now = Date.now();
    
    const transaction = db.transaction(() => {
      db.prepare(`DELETE FROM nodes`).run();
      db.prepare(`DELETE FROM edges`).run();
      
      for (const node of nodes) {
        insertNode.run(
          node.id,
          node.name,
          node.type,
          node.semantic ? JSON.stringify(node.semantic) : null,
          node.filePath || node.file_path || null,
          node.createdAt || node.created_at || now,
          node.updatedAt || node.updated_at || now
        );
      }
      
      for (const edge of edges) {
        insertEdge.run(
          edge.sourceId,
          edge.targetId,
          edge.relation,
          edge.sourceFile || null,
          edge.sourceLine || null
        );
      }
    });
    
    transaction();
  }

  // @para-doc [#csa-loophole-guard]
  public runCsaAudit(config?: Partial<CsaConfig>): CsaAuditResult {
    const db = this.getConnection();
    
    // Resolve config defaults
    const specThreshold = config?.specThreshold ?? 90;
    const docThreshold = config?.docThreshold ?? 50;
    const docGate = config?.docGate ?? 'soft';
    const doubleBinding = config?.doubleBinding ?? true;
    
    // Calibration config defaults
    const calibration = config?.calibration || {};
    const excludeFolders = calibration.exclude_folders || [];
    const weights = calibration.weights || {
      critical: 5.0,
      medium: 2.0,
      low: 0.5,
      god_node_degree_threshold: 20
    };
    const criticalW = weights.critical ?? 5.0;
    const mediumW = weights.medium ?? 2.0;
    const lowW = weights.low ?? 0.5;
    const godThreshold = weights.god_node_degree_threshold ?? 20;

    const isExcluded = (filePath: string | null) => {
      if (!filePath) return false;
      return excludeFolders.some(folder => filePath.startsWith(folder));
    };

    // 1. Fetch spec anchors (defined as anchors in artifacts/specs/ or having no filePath/null)
    // Exclude deprecated anchors (v0.17.6.3) using json_valid() safe guard
    // @para-doc [#csa-audit-skip-deprecated]
    // @para-doc [#csa-sc-deprecated-skip]
    const rawSpecAnchors = db.prepare(`
      SELECT id, file_path, semantic FROM nodes 
      WHERE type = 'spec_anchor' 
        AND (file_path LIKE 'artifacts/specs/%' OR file_path IS NULL OR file_path = '')
        AND (semantic IS NULL OR json_valid(semantic) = 0 OR json_extract(semantic, '$.specMeta.deprecated') IS NOT 1)
    `).all() as Array<{ id: string; file_path: string | null; semantic: string | null }>;
    
    const specAnchorsRows = rawSpecAnchors.filter(row => !isExcluded(row.file_path));
    const totalSpecAnchorsCount = specAnchorsRows.length;
    
    // 2. Fetch doc anchors (defined as anchors NOT in artifacts/specs/ and having a valid filePath)
    // Exclude deprecated anchors (v0.17.6.3) using json_valid() safe guard
    const rawDocAnchors = db.prepare(`
      SELECT id, file_path, semantic FROM nodes 
      WHERE type = 'spec_anchor' 
        AND file_path NOT LIKE 'artifacts/specs/%' 
        AND file_path IS NOT NULL 
        AND file_path != ''
        AND (semantic IS NULL OR json_valid(semantic) = 0 OR json_extract(semantic, '$.specMeta.deprecated') IS NOT 1)
    `).all() as Array<{ id: string; file_path: string | null; semantic: string | null }>;
    
    const docAnchorsRows = rawDocAnchors.filter(row => !isExcluded(row.file_path));
    const totalDocAnchorsCount = docGate === 'off' ? 0 : docAnchorsRows.length;

    // Check which anchors have DOCUMENTED_BY edge (resolving both short and long syntax)
    // Supports both direct (Code -> Anchor) and transitive (Code -> Doc File -> Anchor) links
    // @para-doc [#csa-transitive-resolution]
    // @para-doc [#csa-transitive-audit]
    const checkCovered = db.prepare(`
      SELECT COUNT(*) as count 
      FROM edges e1
      WHERE 
        (e1.relation = 'DOCUMENTED_BY' AND (e1.target_id = ? OR e1.target_id LIKE '%#' || ?))
        OR
        (
          e1.relation = 'DOCUMENTS' 
          AND (e1.target_id = ? OR e1.target_id LIKE '%#' || ?)
          AND EXISTS (
            SELECT 1 FROM edges e2 
            WHERE e2.relation = 'DOCUMENTED_BY' 
              AND e2.target_id = e1.source_id
          )
        )
    `);

    // Helper to calculate weight of an anchor based on related code nodes (direct and transitive)
    const findRelatedCodeNodes = db.prepare(`
      SELECT id, type, semantic FROM nodes 
      WHERE id IN (
        -- Direct code nodes
        SELECT source_id FROM edges 
        WHERE (target_id = ? OR target_id LIKE '%#' || ?) AND relation = 'DOCUMENTED_BY'
        
        UNION
        
        -- Transitive code nodes (Code -> Doc File -> Spec Anchor)
        SELECT e2.source_id FROM edges e1
        JOIN edges e2 ON e2.target_id = e1.source_id AND e2.relation = 'DOCUMENTED_BY'
        WHERE (e1.target_id = ? OR e1.target_id LIKE '%#' || ?) AND e1.relation = 'DOCUMENTS'
      )
    `);

    const getDegree = db.prepare(`
      SELECT COUNT(*) as count FROM edges WHERE source_id = ? OR target_id = ?
    `);

    const getAnchorWeight = (anchorId: string): number => {
      const relatedNodes = findRelatedCodeNodes.all(anchorId, anchorId, anchorId, anchorId) as Array<{ id: string; type: string; semantic: string | null }>;
      if (relatedNodes.length === 0) {
        return lowW; // Default weight for uncovered anchors
      }

      let maxWeight = lowW;
      for (const node of relatedNodes) {
        // Check degree
        const degRes = getDegree.get(node.id, node.id) as { count: number } | undefined;
        const degree = degRes ? degRes.count : 0;
        if (degree >= godThreshold) {
          return criticalW; // Maximum possible weight
        }

        // Check complexity
        let complexity = 'low';
        try {
          if (node.semantic) {
            const sem = JSON.parse(node.semantic);
            complexity = sem.complexity || 'low';
          }
        } catch {}

        if (complexity === 'high' || complexity === 'medium' || node.type === 'class' || node.type === 'interface') {
          maxWeight = Math.max(maxWeight, mediumW);
        }
      }
      return maxWeight;
    };

    let coveredSpecCount = 0;
    let totalSpecWeight = 0;
    let coveredSpecWeight = 0;

    for (const row of specAnchorsRows) {
      const weight = getAnchorWeight(row.id);
      totalSpecWeight += weight;

      if (!doubleBinding) {
        coveredSpecCount++;
        coveredSpecWeight += weight;
      } else {
        const res = checkCovered.get(row.id, row.id, row.id, row.id) as { count: number } | undefined;
        if (res && res.count > 0) {
          coveredSpecCount++;
          coveredSpecWeight += weight;
        }
      }
    }

    let coveredDocCount = 0;
    let totalDocWeight = 0;
    let coveredDocWeight = 0;

    if (docGate !== 'off') {
      for (const row of docAnchorsRows) {
        const weight = getAnchorWeight(row.id);
        totalDocWeight += weight;

        if (!doubleBinding) {
          coveredDocCount++;
          coveredDocWeight += weight;
        } else {
          const res = checkCovered.get(row.id, row.id, row.id, row.id) as { count: number } | undefined;
          if (res && res.count > 0) {
            coveredDocCount++;
            coveredDocWeight += weight;
          }
        }
      }
    }

    const hasExplicitSpecThreshold = config?.specThreshold !== undefined;
    const specRate = totalSpecWeight > 0
      ? (coveredSpecWeight / totalSpecWeight) * 100
      : (hasExplicitSpecThreshold && specThreshold > 0 ? 0.0 : 100.0);
    const docRate = totalDocWeight > 0 ? (coveredDocWeight / totalDocWeight) * 100 : 100.0;

    const specPass = totalSpecAnchorsCount > 0
      ? specRate >= specThreshold
      : !(hasExplicitSpecThreshold && specThreshold > 0);
    const docPass = docGate === 'off' ? true : (docRate >= docThreshold);

    const combinedHealth = docGate === 'off' ? specRate : (specRate + docRate) / 2;

    // Dangling edges (resolving both short and long syntax dynamically via SQLite substring)
    const danglingRows = db.prepare(`
      SELECT e.source_id, e.target_id, e.source_file, e.source_line 
      FROM edges e 
      LEFT JOIN nodes n ON 
        (CASE 
          WHEN instr(e.target_id, '#') > 0 THEN substr(e.target_id, instr(e.target_id, '#') + 1)
          ELSE e.target_id
        END) = n.id AND n.type = 'spec_anchor'
      WHERE e.relation = 'DOCUMENTED_BY' AND n.id IS NULL
    `).all() as Array<{
      source_id: string;
      target_id: string;
      source_file: string;
      source_line: number;
    }>;
    
    const danglingEdges = danglingRows.map(row => ({
      sourceId: row.source_id,
      targetId: row.target_id,
      sourceFile: row.source_file || '',
      sourceLine: row.source_line || 0,
    }));

    // Dangling inherits references (docs inheriting from missing spec anchors)
    // @para-doc [#csa-dangling-inherits-detection]
    const danglingInheritsRows = db.prepare(`
      SELECT e.source_id, e.target_id, e.source_file, e.source_line 
      FROM edges e 
      LEFT JOIN nodes n ON 
        (CASE 
          WHEN instr(e.target_id, '#') > 0 THEN substr(e.target_id, instr(e.target_id, '#') + 1)
          ELSE e.target_id
        END) = n.id AND n.type = 'spec_anchor'
      WHERE e.relation = 'DOCUMENTS' AND n.id IS NULL
    `).all() as Array<{
      source_id: string;
      target_id: string;
      source_file: string;
      source_line: number;
    }>;
    
    const danglingInherits = danglingInheritsRows.map(row => ({
      sourceId: row.source_id,
      targetId: row.target_id,
      sourceFile: row.source_file || '',
      sourceLine: row.source_line || 0,
    }));

    // @para-doc [#csa-anchor-prefix-warn]
    // @para-doc [#csa-sc-prefix-warn]
    // Prefix Mismatches Validation (v0.17.6.3)
    const prefixMismatches: PrefixMismatch[] = [];
    for (const anchor of specAnchorsRows) {
      if (anchor.semantic) {
        try {
          const semanticObj = JSON.parse(anchor.semantic);
          const meta = semanticObj.specMeta;
          if (meta?.anchorPrefix && !anchor.id.startsWith(meta.anchorPrefix)) {
            prefixMismatches.push({
              anchorId: anchor.id,
              expectedPrefix: meta.anchorPrefix,
              filePath: anchor.file_path || '',
              line: semanticObj.line || 0,
            });
          }
        } catch {}
      }
    }

    return {
      // Legacy compatibility fields
      totalAnchors: totalSpecAnchorsCount + totalDocAnchorsCount,
      coveredAnchors: coveredSpecCount + coveredDocCount,
      coverageRate: totalSpecWeight + totalDocWeight > 0 
        ? ((coveredSpecWeight + coveredDocWeight) / (totalSpecWeight + totalDocWeight)) * 100 
        : 100.0,
      
      // Tiered fields
      config: {
        specThreshold,
        docThreshold,
        docGate,
        calibration,
        doubleBinding
      },
      specCoverage: {
        totalAnchors: totalSpecAnchorsCount,
        coveredAnchors: coveredSpecCount,
        coverageRate: specRate,
        threshold: specThreshold,
        gate: 'hard',
        pass: specPass
      },
      docCoverage: {
        totalAnchors: totalDocAnchorsCount,
        coveredAnchors: coveredDocCount,
        coverageRate: docRate,
        threshold: docThreshold,
        gate: docGate,
        pass: docPass
      },
      combinedHealth: Math.round(combinedHealth),
      danglingEdges,
      danglingInherits,
      prefixMismatches
    };
  }

  public insertSnapshot(snapshotId: string, files: Array<{ filePath: string; size: number; hash: string }>): void {
    const db = this.getConnection();
    const totalFiles = files.length;
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const now = Date.now();

    const insertSnap = db.prepare(`
      INSERT OR REPLACE INTO file_tree_snapshots (id, timestamp, total_files, total_size)
      VALUES (?, ?, ?, ?)
    `);

    const insertEntry = db.prepare(`
      INSERT OR REPLACE INTO file_tree_entries (snapshot_id, file_path, size, hash)
      VALUES (?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      insertSnap.run(snapshotId, now, totalFiles, totalSize);
      db.prepare(`DELETE FROM file_tree_entries WHERE snapshot_id = ?`).run(snapshotId);
      for (const file of files) {
        insertEntry.run(snapshotId, file.filePath, file.size, file.hash);
      }
    });

    transaction();
  }

  public getSnapshot(snapshotId: string): Array<{ filePath: string; size: number; hash: string }> | null {
    const db = this.getConnection();
    
    const snap = db.prepare(`SELECT id FROM file_tree_snapshots WHERE id = ?`).get(snapshotId);
    if (!snap) {
      return null;
    }

    const rows = db.prepare(`
      SELECT file_path as filePath, size, hash FROM file_tree_entries WHERE snapshot_id = ?
    `).all(snapshotId) as Array<{ filePath: string; size: number; hash: string }>;

    return rows;
  }

  public compareSnapshots(sourceSnapshotId: string, targetSnapshotId: string): {
    added: Array<{ filePath: string; size: number; hash: string }>;
    removed: Array<{ filePath: string; size: number; hash: string }>;
    modified: Array<{ filePath: string; size: number; hash: string }>;
  } {
    const sourceFiles = this.getSnapshot(sourceSnapshotId) ?? [];
    const targetFiles = this.getSnapshot(targetSnapshotId) ?? [];

    const sourceMap = new Map(sourceFiles.map(f => [f.filePath, f]));
    const targetMap = new Map(targetFiles.map(f => [f.filePath, f]));

    const added: Array<{ filePath: string; size: number; hash: string }> = [];
    const removed: Array<{ filePath: string; size: number; hash: string }> = [];
    const modified: Array<{ filePath: string; size: number; hash: string }> = [];

    for (const targetFile of targetFiles) {
      const sourceFile = sourceMap.get(targetFile.filePath);
      if (!sourceFile) {
        added.push(targetFile);
      } else if (sourceFile.hash !== targetFile.hash || sourceFile.size !== targetFile.size) {
        modified.push(targetFile);
      }
    }

    for (const sourceFile of sourceFiles) {
      if (!targetMap.has(sourceFile.filePath)) {
        removed.push(sourceFile);
      }
    }

    return { added, removed, modified };
  }

  public saveProjectState(projectName: string, state: {
    active_plan: string | null;
    version: string | null;
    status: string | null;
    backlog_active_count: number;
    backlog_completed_count: number;
    sprint_pending_count: number;
    sprint_completed_count: number;
    project_hash?: string | null;
    backlog_hash?: string | null;
    sprint_hash?: string | null;
    synced_at: number;
  }): void {
    const db = this.getConnection();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO project_state (
        project_name, active_plan, version, status,
        backlog_active_count, backlog_completed_count,
        sprint_pending_count, sprint_completed_count,
        project_hash, backlog_hash, sprint_hash, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      projectName,
      state.active_plan,
      state.version,
      state.status,
      state.backlog_active_count,
      state.backlog_completed_count,
      state.sprint_pending_count,
      state.sprint_completed_count,
      state.project_hash || null,
      state.backlog_hash || null,
      state.sprint_hash || null,
      state.synced_at
    );
  }

  public getProjectState(projectName: string): {
    active_plan: string | null;
    version: string | null;
    status: string | null;
    backlog_active_count: number;
    backlog_completed_count: number;
    sprint_pending_count: number;
    sprint_completed_count: number;
    project_hash: string | null;
    backlog_hash: string | null;
    sprint_hash: string | null;
    synced_at: number;
  } | null {
    const db = this.getConnection();
    const row = db.prepare(`
      SELECT active_plan, version, status,
             backlog_active_count, backlog_completed_count,
             sprint_pending_count, sprint_completed_count,
             project_hash, backlog_hash, sprint_hash, synced_at
      FROM project_state WHERE project_name = ?
    `).get(projectName);
    
    if (!row) return null;
    
    return {
      active_plan: row.active_plan,
      version: row.version,
      status: row.status,
      backlog_active_count: row.backlog_active_count,
      backlog_completed_count: row.backlog_completed_count,
      sprint_pending_count: row.sprint_pending_count,
      sprint_completed_count: row.sprint_completed_count,
      project_hash: row.project_hash,
      backlog_hash: row.backlog_hash,
      sprint_hash: row.sprint_hash,
      synced_at: row.synced_at
    };
  }

  // @para-doc [#csa-db-session-telemetry]
  // @para-doc [#csa-test-push]
  public pushTelemetry(data: SessionTelemetryData): void {
    const db = this.getConnection();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO session_telemetry (
        id, project_name, conversation_id, model_used, workflow,
        tool_calls_total, tool_calls_breakdown,
        files_read_count, files_read_list,
        files_changed_count, files_changed_list,
        token_estimate_input, token_estimate_output,
        friction_count, friction_details,
        duration_seconds, captured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      data.id,
      data.projectName,
      data.conversationId,
      data.modelUsed || null,
      data.workflow || null,
      data.toolCallsTotal || 0,
      data.toolCallsBreakdown ? JSON.stringify(data.toolCallsBreakdown) : '{}',
      data.filesReadCount || 0,
      data.filesReadList ? JSON.stringify(data.filesReadList) : '[]',
      data.filesChangedCount || 0,
      data.filesChangedList ? JSON.stringify(data.filesChangedList) : '[]',
      data.tokenEstimateInput || 0,
      data.tokenEstimateOutput || 0,
      data.frictionCount || 0,
      data.frictionDetails ? JSON.stringify(data.frictionDetails) : '[]',
      data.durationSeconds !== undefined ? data.durationSeconds : null,
      data.capturedAt
    );
  }

  // @para-doc [#csa-db-session-telemetry]
  // @para-doc [#csa-test-query-trends]
  public queryTelemetry(projectName: string, limit: number = 10): SessionTelemetryData[] {
    const db = this.getConnection();
    const rows = db.prepare(`
      SELECT * FROM session_telemetry
      WHERE project_name = ?
      ORDER BY captured_at DESC
      LIMIT ?
    `).all(projectName, limit) as SessionTelemetryRow[];

    return rows.map(row => ({
      id: row.id,
      projectName: row.project_name,
      conversationId: row.conversation_id,
      modelUsed: row.model_used || undefined,
      workflow: row.workflow || undefined,
      toolCallsTotal: row.tool_calls_total,
      toolCallsBreakdown: row.tool_calls_breakdown ? JSON.parse(row.tool_calls_breakdown) : {},
      filesReadCount: row.files_read_count,
      filesReadList: row.files_read_list ? JSON.parse(row.files_read_list) : [],
      filesChangedCount: row.files_changed_count,
      filesChangedList: row.files_changed_list ? JSON.parse(row.files_changed_list) : [],
      tokenEstimateInput: row.token_estimate_input,
      tokenEstimateOutput: row.token_estimate_output,
      frictionCount: row.friction_count,
      frictionDetails: row.friction_details ? JSON.parse(row.friction_details) : [],
      durationSeconds: row.duration_seconds !== null ? row.duration_seconds : undefined,
      capturedAt: row.captured_at
    }));
  }

  // @para-doc [#csa-sc-events-logging]
  public logCsaEvent(event: CsaEvent): void {
    const db = this.getConnection();
    const stmt = db.prepare(`
      INSERT INTO csa_events (
        event_type, target_id, details, session_id
      ) VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      event.eventType,
      event.targetId,
      JSON.stringify(event.details),
      event.sessionId || null
    );
  }

  public queryCsaEvents(limit: number = 100): any[] {
    const db = this.getConnection();
    const rows = db.prepare(`
      SELECT * FROM csa_events
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as any[];
    return rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      eventType: r.event_type,
      targetId: r.target_id,
      details: r.details ? JSON.parse(r.details) : {},
      sessionId: r.session_id,
    }));
  }

  // @para-doc [#csa-junk-gov-test-teardown]
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

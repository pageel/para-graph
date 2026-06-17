import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);

export interface CsaAuditResult {
  totalAnchors: number;
  coveredAnchors: number;
  coverageRate: number;
  danglingEdges: Array<{
    sourceId: string;
    targetId: string;
    sourceFile: string;
    sourceLine: number;
  }>;
}

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

    // Gieo dữ liệu mặc định cho protected_files
    const seedProtected = db.prepare(`
      INSERT OR IGNORE INTO protected_files (file_path, description, created_at)
      VALUES (?, ?, ?)
    `);
    const seedTime = Date.now();
    seedProtected.run('.para-workspace.yml', 'Workspace configuration root', seedTime);
    seedProtected.run('.agents/rules.md', 'Workspace rules trigger index', seedTime);
    seedProtected.run('project.md', 'Project contract definition', seedTime);
    seedProtected.run('.gitignore', 'Git exclude patterns', seedTime);
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

  public persistGraph(nodes: any[], edges: any[]): void {
    const db = this.getConnection();
    
    const insertNode = db.prepare(`
      INSERT OR REPLACE INTO nodes (id, name, type, semantic, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
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

  public runCsaAudit(): CsaAuditResult {
    const db = this.getConnection();
    
    const totalAnchorsRow = db.prepare(`
      SELECT COUNT(*) as count FROM nodes WHERE type = 'spec_anchor'
    `).get() as { count: number } | undefined;
    const totalAnchors = totalAnchorsRow ? totalAnchorsRow.count : 0;
    
    const coveredAnchorsRow = db.prepare(`
      SELECT COUNT(DISTINCT e.target_id) as count 
      FROM edges e 
      JOIN nodes n ON e.target_id = n.id AND n.type = 'spec_anchor'
      WHERE e.relation = 'DOCUMENTED_BY'
    `).get() as { count: number } | undefined;
    const coveredAnchors = coveredAnchorsRow ? coveredAnchorsRow.count : 0;
    
    const coverageRate = totalAnchors > 0 ? (coveredAnchors / totalAnchors) * 100 : 100.0;
    
    const danglingRows = db.prepare(`
      SELECT e.source_id, e.target_id, e.source_file, e.source_line 
      FROM edges e 
      LEFT JOIN nodes n ON e.target_id = n.id AND n.type = 'spec_anchor'
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
    
    return {
      totalAnchors,
      coveredAnchors,
      coverageRate,
      danglingEdges,
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

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

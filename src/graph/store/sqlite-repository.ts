import { SqliteManager } from './sqlite-manager.js';
import type { ProjectInsight } from '../models.js';

export class SqliteGraphRepository {
  constructor(private manager: SqliteManager) {}

  public insertNode(node: any): void {
    const db = this.manager.getConnection();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO nodes (id, name, type, semantic, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const now = Date.now();
    stmt.run(
      node.id,
      node.name,
      node.type,
      node.semantic ? JSON.stringify(node.semantic) : null,
      node.createdAt || node.created_at || now,
      node.updatedAt || node.updated_at || now
    );
  }

  public *getAllNodes(): IterableIterator<any> {
    const db = this.manager.getConnection();
    const stmt = db.prepare(`SELECT * FROM nodes`);
    for (const row of stmt.iterate()) {
      const node = row as any;
      yield {
        id: node.id,
        name: node.name,
        type: node.type,
        semantic: node.semantic ? JSON.parse(node.semantic) : undefined,
        createdAt: node.created_at,
        updatedAt: node.updated_at
      };
    }
  }

  public *getRelatedSlices(nodeIds: string[]): IterableIterator<any> {
    if (!nodeIds || nodeIds.length === 0) return;
    
    const db = this.manager.getConnection();
    const placeholders = nodeIds.map(() => '?').join(',');
    
    const stmt = db.prepare(`
      SELECT DISTINCT s.*
      FROM memory_slices s, json_each(s.node_ids) AS n
      WHERE n.value IN (${placeholders})
    `);
    
    for (const row of stmt.iterate(...nodeIds)) {
      const slice = row as any;
      yield {
        id: slice.id,
        topic: slice.topic,
        summary: slice.summary,
        nodeIds: JSON.parse(slice.node_ids),
        eventIds: JSON.parse(slice.event_ids),
        createdAt: slice.created_at
      };
    }
  }

  public setCustomMetadata(key: string, value: any): void {
    const db = this.manager.getConnection();
    const strValue = JSON.stringify(value);
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO metadata (key, value)
      VALUES (?, ?)
    `);
    stmt.run(key, strValue);
  }

  public getCustomMetadata(key: string): any {
    const db = this.manager.getConnection();
    const stmt = db.prepare(`SELECT value FROM metadata WHERE key = ?`);
    const row = stmt.get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : undefined;
  }

  public clearCustomMetadata(key: string): void {
    const db = this.manager.getConnection();
    const stmt = db.prepare(`DELETE FROM metadata WHERE key = ?`);
    stmt.run(key);
  }

  public insertInsight(insight: ProjectInsight): void {
    const db = this.manager.getConnection();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO project_insights (
        id, category, domain, title, description, source_type, source_session,
        related_node_ids, related_files, confidence, validated_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      insight.id,
      insight.category,
      insight.domain,
      insight.title,
      insight.description,
      insight.sourceType,
      insight.sourceSession || null,
      insight.relatedNodeIds ? JSON.stringify(insight.relatedNodeIds) : '[]',
      insight.relatedFiles ? JSON.stringify(insight.relatedFiles) : '[]',
      insight.confidence || 'hypothesis',
      insight.validatedAt || null,
      insight.createdAt,
      insight.updatedAt
    );
  }

  public searchInsights(query: string, opts?: { category?: string; domain?: string; limit?: number }): ProjectInsight[] {
    const db = this.manager.getConnection();
    const limit = opts?.limit ?? 10;

    if (!query || query.trim() === '') {
      const clauses: string[] = [];
      const params: any[] = [];
      
      if (opts?.category) {
        clauses.push('category = ?');
        params.push(opts.category);
      }
      if (opts?.domain) {
        clauses.push('domain = ?');
        params.push(opts.domain);
      }
      
      const whereClause = clauses.length > 0 ? 'WHERE ' + clauses.join(' AND ') : '';
      params.push(limit);
      
      const sql = `
        SELECT *
        FROM project_insights
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ?
      `;
      const stmt = db.prepare(sql);
      const rows = stmt.all(...params);
      return rows.map((row: any) => ({
        id: row.id,
        category: row.category as any,
        domain: row.domain,
        title: row.title,
        description: row.description,
        sourceType: row.source_type as any,
        sourceSession: row.source_session || undefined,
        relatedNodeIds: JSON.parse(row.related_node_ids || '[]'),
        relatedFiles: JSON.parse(row.related_files || '[]'),
        confidence: row.confidence as any,
        validatedAt: row.validated_at || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    }

    const sanitized = `"${query.replace(/"/g, '""')}"*`;
    const clauses: string[] = ['f.fts_insights MATCH ?'];
    const params: any[] = [sanitized];

    if (opts?.category) {
      clauses.push('m.category = ?');
      params.push(opts.category);
    }

    if (opts?.domain) {
      clauses.push('m.domain = ?');
      params.push(opts.domain);
    }

    const whereClause = clauses.join(' AND ');
    params.push(limit);

    const sql = `
      SELECT m.*
      FROM project_insights m
      JOIN fts_insights f ON m.rowid = f.rowid
      WHERE ${whereClause}
      ORDER BY f.rank
      LIMIT ?
    `;

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);

    return rows.map((row: any) => ({
      id: row.id,
      category: row.category as any,
      domain: row.domain,
      title: row.title,
      description: row.description,
      sourceType: row.source_type as any,
      sourceSession: row.source_session || undefined,
      relatedNodeIds: JSON.parse(row.related_node_ids || '[]'),
      relatedFiles: JSON.parse(row.related_files || '[]'),
      confidence: row.confidence as any,
      validatedAt: row.validated_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
}

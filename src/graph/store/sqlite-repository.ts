import { SqliteManager } from './sqlite-manager.js';
import type { ProjectInsight } from '../models.js';
import { fuseRankedLists } from '../query/index.js';

function calculateJaccardSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().match(/\w+/g) || []);
  const words2 = new Set(text2.toLowerCase().match(/\w+/g) || []);
  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

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

  // @para-doc [artifacts/specs/spec-2026-06-16-csa-spec-intelligence.md#csa-db-schema]
  public getInsight(insightId: string): ProjectInsight | null {
    const db = this.manager.getConnection();
    const stmt = db.prepare(`SELECT * FROM project_insights WHERE id = ?`);
    const row = stmt.get(insightId) as any;
    if (!row) return null;
    return {
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
    };
  }

  // @para-doc [artifacts/specs/spec-2026-06-16-csa-spec-intelligence.md#csa-db-schema]
  public findSimilarInsight(insight: ProjectInsight): ProjectInsight | null {
    const db = this.manager.getConnection();
    const words = (insight.title.toLowerCase().match(/\w+/g) || [])
      .filter(w => w.length > 2);
    
    if (words.length === 0) return null;
    
    const ftsQuery = words.map(w => `"${w}"`).join(' OR ');
    
    try {
      const stmt = db.prepare(`
        SELECT m.*
        FROM project_insights m
        JOIN fts_insights f ON m.rowid = f.rowid
        WHERE f.fts_insights MATCH ? AND m.category = ?
      `);
      const rows = stmt.all(ftsQuery, insight.category);
      
      const newText = `${insight.title} ${insight.description}`;
      
      for (const row of rows) {
        if (row.id === insight.id) continue;
        
        const dbText = `${row.title} ${row.description}`;
        const sim = calculateJaccardSimilarity(newText, dbText);
        if (sim > 0.8) {
          return {
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
          };
        }
      }
    } catch (err) {
      // Graceful fallback
    }
    return null;
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

    const extraClauses: string[] = ['(title LIKE ? OR description LIKE ? OR domain LIKE ?)'];
    const extraParams: any[] = [`%${query}%`, `%${query}%`, `%${query}%`];

    if (opts?.category) {
      clauses.push('m.category = ?');
      params.push(opts.category);
      extraClauses.push('category = ?');
      extraParams.push(opts.category);
    }

    if (opts?.domain) {
      clauses.push('m.domain = ?');
      params.push(opts.domain);
      extraClauses.push('domain = ?');
      extraParams.push(opts.domain);
    }

    const whereClause = clauses.join(' AND ');
    const extraWhereClause = extraClauses.length > 0 ? 'WHERE ' + extraClauses.join(' AND ') : '';

    // 1. FTS5 Search Channel
    const ftsSql = `
      SELECT m.*
      FROM project_insights m
      JOIN fts_insights f ON m.rowid = f.rowid
      WHERE ${whereClause}
      ORDER BY f.rank
    `;
    const ftsStmt = db.prepare(ftsSql);
    const ftsRows = ftsStmt.all(...params);

    // 2. Category-Weighted Search Channel
    const weightSql = `
      SELECT *
      FROM project_insights
      ${extraWhereClause}
      ORDER BY 
        CASE category 
          WHEN 'risk' THEN 4
          WHEN 'gotcha' THEN 3
          WHEN 'decision' THEN 2
          WHEN 'lesson' THEN 1
          WHEN 'pattern' THEN 1
          ELSE 0
        END DESC, 
        created_at DESC
    `;
    const weightStmt = db.prepare(weightSql);
    const weightRows = weightStmt.all(...extraParams);

    const toInsight = (row: any): ProjectInsight => ({
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
    });

    const ftsResults = ftsRows.map(toInsight);
    const weightResults = weightRows.map(toInsight);

    // Rank fusion via RRF
    const fused = fuseRankedLists<ProjectInsight>([ftsResults, weightResults], (i) => i.id, { k: 60 });
    return fused.map((f) => f.item).slice(0, limit);
  }
}

import type { MemoryEvent, SemanticSlice } from '../models.js';

export class MemoryStore {
  public readonly projectName: string;
  private readonly events = new Map<string, MemoryEvent>();
  private readonly slices = new Map<string, SemanticSlice>();

  // Indexes
  private eventsList: MemoryEvent[] = [];
  private slicesList: SemanticSlice[] = [];

  private sqliteManager: any = null;

  constructor(projectName: string) {
    this.projectName = projectName;
  }

  public setSqliteManager(manager: any): void {
    this.sqliteManager = manager;
  }

  /** Add an event to the memory store */
  public pushEvent(event: MemoryEvent): void {
    if (!this.events.has(event.id)) {
      this.events.set(event.id, event);
      this.eventsList.push(event);
      // Sort by timestamp (newest first)
      this.eventsList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
  }

  /** Sanitize query string for FTS5 syntax */
  public static sanitizeFtsQuery(query: string): string {
    const escaped = query.replace(/"/g, '""');
    return `"${escaped}"*`;
  }

  public searchEvents(query: string, limit: number = 50, since?: number): MemoryEvent[] {
    if (this.sqliteManager) {
      try {
        const db = this.sqliteManager.getConnection();
        const sanitized = MemoryStore.sanitizeFtsQuery(query);
        let stmt;
        let rows;
        if (since !== undefined) {
          stmt = db.prepare(`
            SELECT m.* 
            FROM memory_events m
            JOIN fts_memory_events f ON m.rowid = f.rowid
            WHERE f.fts_memory_events MATCH ?
              AND m.timestamp >= ?
              AND m.archived = 0
            ORDER BY m.weight DESC, f.rank
            LIMIT ?
          `);
          rows = stmt.all(sanitized, since, limit);
        } else {
          stmt = db.prepare(`
            SELECT m.* 
            FROM memory_events m
            JOIN fts_memory_events f ON m.rowid = f.rowid
            WHERE f.fts_memory_events MATCH ?
              AND m.archived = 0
            ORDER BY m.weight DESC, f.rank
            LIMIT ?
          `);
          rows = stmt.all(sanitized, limit);
        }
        return rows.map((row: any) => ({
          id: row.id,
          sessionId: row.session_id,
          kind: row.kind,
          content: row.content,
          metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
          timestamp: new Date(row.timestamp).toISOString(),
          weight: row.weight,
          archived: row.archived === 1
        }));
      } catch (e) {
        // Fallback on SQLite error
      }
    }

    // Fallback to array loop
    const q = query.toLowerCase();
    const results: MemoryEvent[] = [];
    
    for (const event of this.eventsList) {
      if (results.length >= limit) break;
      if (event.archived) continue;
      
      if (since !== undefined) {
        const eventTime = new Date(event.timestamp).getTime();
        if (eventTime < since) continue;
      }
      
      if (
        event.content.toLowerCase().includes(q) ||
        event.kind.toLowerCase().includes(q) ||
        event.sessionId.toLowerCase().includes(q)
      ) {
        results.push(event);
      }
    }
    
    return results;
  }

  /** Add a curated semantic slice */
  public addSlice(slice: SemanticSlice): void {
    if (!this.slices.has(slice.id)) {
      this.slices.set(slice.id, slice);
      this.slicesList.push(slice);
      // Sort by createdAt (newest first)
      this.slicesList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }

  /** Retrieve all semantic slices */
  public getSlices(): SemanticSlice[] {
    return this.slicesList;
  }

  /** Retrieve all raw events (for serialization) */
  public getAllEvents(): MemoryEvent[] {
    return this.eventsList;
  }

  /**
   * Run cold archive policy on events:
   * - ephemeral (weight < 2.0): > 90 days
   * - durable (2.0 <= weight < 3.0): > 180 days
   * - permanent (weight >= 3.0): never
   */
  public archiveOldEvents(): { archivedCount: number } {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    let archivedCount = 0;

    const ephemeralCutoff = now - 90 * dayMs;
    const durableCutoff = now - 180 * dayMs;

    // 1. Update in-memory list
    for (const event of this.eventsList) {
      if (event.archived) continue;
      
      const ts = new Date(event.timestamp).getTime();
      const weight = event.weight ?? 1.0;

      if (weight < 2.0 && ts < ephemeralCutoff) {
        event.archived = true;
        archivedCount++;
      } else if (weight >= 2.0 && weight < 3.0 && ts < durableCutoff) {
        event.archived = true;
        archivedCount++;
      }
    }

    // 2. Update SQLite if available
    if (this.sqliteManager && archivedCount > 0) {
      try {
        const db = this.sqliteManager.getConnection();
        const updateEphemeral = db.prepare(`
          UPDATE memory_events 
          SET archived = 1 
          WHERE weight < 2.0 AND timestamp < ? AND archived = 0
        `);
        const updateDurable = db.prepare(`
          UPDATE memory_events 
          SET archived = 1 
          WHERE weight >= 2.0 AND weight < 3.0 AND timestamp < ? AND archived = 0
        `);
        
        updateEphemeral.run(ephemeralCutoff);
        updateDurable.run(durableCutoff);
      } catch (err) {
        console.warn(`[MemoryStore] Failed to update SQLite for cold archive:`, err);
      }
    }

    return { archivedCount };
  }
}

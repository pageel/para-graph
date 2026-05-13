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

  /** Full-text search over events */
  public searchEvents(query: string, limit: number = 50): MemoryEvent[] {
    if (this.sqliteManager) {
      try {
        const db = this.sqliteManager.getConnection();
        const sanitized = MemoryStore.sanitizeFtsQuery(query);
        const stmt = db.prepare(`
          SELECT * FROM fts_memory_events
          WHERE fts_memory_events MATCH ?
          ORDER BY rank
          LIMIT ?
        `);
        const rows = stmt.all(sanitized, limit);
        return rows.map((row: any) => ({
          id: row.id,
          sessionId: row.session_id,
          kind: row.kind,
          content: row.content,
          metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
          timestamp: new Date(row.timestamp).toISOString() // Or keep it if we store ISO string
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
}

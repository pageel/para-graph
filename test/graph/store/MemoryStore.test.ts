import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryStore } from '../../../src/graph/store/MemoryStore.js';
import type { MemoryEvent } from '../../../src/graph/models.js';

describe('MemoryStore FTS5 Integration', () => {
  let memoryStore: MemoryStore;
  
  beforeEach(() => {
    memoryStore = new MemoryStore('test-project');
  });

  it('should sanitize FTS5 query to prevent syntax crashes', () => {
    // This tests the static sanitize method
    const input = 'invalid ( query " with * special ^ chars';
    const sanitized = MemoryStore.sanitizeFtsQuery(input);
    
    // It should escape quotes and wrap appropriately for FTS5
    // Example expectation: '"invalid ( query "" with * special ^ chars"*'
    expect(sanitized).toBe('"' + input.replace(/"/g, '""') + '"*');
  });

  it('should fallback to in-memory search if sqliteManager is missing', () => {
    const event: MemoryEvent = {
      id: 'e1',
      kind: 'observation',
      sessionId: 's1',
      content: 'test content fallback',
      timestamp: new Date().toISOString()
    };
    memoryStore.pushEvent(event);
    
    const results = memoryStore.searchEvents('fallback');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('e1');
  });

  it('should delegate to sqliteManager if available and use sanitized query', () => {
    const ftsAllMock = vi.fn().mockReturnValue([
      {
        id: 'e2',
        kind: 'observation',
        session_id: 's2',
        content: 'test content sqlite',
        metadata: null,
        timestamp: 1000,
        archived: 0
      }
    ]);
    const likeAllMock = vi.fn().mockReturnValue([]);

    const mockDb = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('MATCH')) {
          return { all: ftsAllMock };
        }
        return { all: likeAllMock };
      })
    };

    const mockManager = {
      getConnection: vi.fn().mockReturnValue(mockDb)
    };
    
    // Use any to bypass private/typing if necessary, or add a public method
    (memoryStore as any).setSqliteManager(mockManager);
    
    const results = memoryStore.searchEvents('sqlite "query"');
    
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('e2');
    
    // Verify it called sqlite
    expect(mockManager.getConnection).toHaveBeenCalled();
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('MATCH ?'));
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('LIKE ?'));
    expect(ftsAllMock).toHaveBeenCalledWith(expect.stringContaining('sqlite ""query""'));
  });

  it('should use since filter if provided in fallback array loop', () => {
    const now = Date.now();
    memoryStore.pushEvent({
      id: 'e1', kind: 'observation', sessionId: 's1', content: 'test old',
      timestamp: new Date(now - 10000).toISOString()
    });
    memoryStore.pushEvent({
      id: 'e2', kind: 'observation', sessionId: 's1', content: 'test new',
      timestamp: new Date(now).toISOString()
    });
    
    const results = memoryStore.searchEvents('test', 50, now - 5000);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('e2');
  });

  it('should delegate to sqlite with since filter and sort by timestamp, weight', () => {
    const ftsAllMock = vi.fn().mockReturnValue([
      { id: 'e1', kind: 'obs', session_id: 's1', content: 'hit', timestamp: 2000, weight: 1.5, archived: 0 }
    ]);
    const likeAllMock = vi.fn().mockReturnValue([]);

    const mockDb = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('MATCH')) {
          return { all: ftsAllMock };
        }
        return { all: likeAllMock };
      })
    };

    const mockManager = {
      getConnection: vi.fn().mockReturnValue(mockDb)
    };
    (memoryStore as any).setSqliteManager(mockManager);
    
    const since = 1000;
    const results = memoryStore.searchEvents('hit', 50, since);
    
    expect(results.length).toBe(1);
    expect(results[0].weight).toBe(1.5);
    
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('timestamp >= ?'));
    expect(ftsAllMock).toHaveBeenCalledWith(expect.stringContaining('"hit"*'), since);
  });

  it('should archive old ephemeral and durable events, but keep permanent ones', () => {
    const store = new MemoryStore('test-project');
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    
    // Ephemeral event > 90 days old (should archive)
    const e1 = { id: 'e1', sessionId: 's1', kind: 'observation', content: 'e1', timestamp: new Date(now - 91 * dayMs).toISOString(), weight: 1.0, archived: false };
    // Ephemeral event < 90 days old (should keep)
    const e2 = { id: 'e2', sessionId: 's1', kind: 'observation', content: 'e2', timestamp: new Date(now - 80 * dayMs).toISOString(), weight: 1.0, archived: false };
    // Durable event > 180 days old (should archive)
    const e3 = { id: 'e3', sessionId: 's1', kind: 'decision', content: 'e3', timestamp: new Date(now - 181 * dayMs).toISOString(), weight: 2.0, archived: false };
    // Durable event < 180 days old (should keep)
    const e4 = { id: 'e4', sessionId: 's1', kind: 'decision', content: 'e4', timestamp: new Date(now - 170 * dayMs).toISOString(), weight: 2.5, archived: false };
    // Permanent event > 1000 days old (should keep)
    const e5 = { id: 'e5', sessionId: 's1', kind: 'decision', content: 'e5', timestamp: new Date(now - 1000 * dayMs).toISOString(), weight: 3.0, archived: false };
    
    store.pushEvent(e1);
    store.pushEvent(e2);
    store.pushEvent(e3);
    store.pushEvent(e4);
    store.pushEvent(e5);

    // Mock SQLite
    let sqlQueries: {query: string, params: any[]}[] = [];
    const mockDb = {
      prepare: (sql: string) => ({
        run: (...params: any[]) => {
          sqlQueries.push({ query: sql, params });
        }
      })
    };
    store.setSqliteManager({ getConnection: () => mockDb });

    const result = store.archiveOldEvents();

    expect(result.archivedCount).toBe(2);
    expect(e1.archived).toBe(true);
    expect(e2.archived).toBe(false);
    expect(e3.archived).toBe(true);
    expect(e4.archived).toBe(false);
    expect(e5.archived).toBe(false);

    // Check SQLite calls
    expect(sqlQueries[0].query).toContain('WHERE weight < 2.0 AND timestamp < ? AND archived = 0');
    expect(sqlQueries[1].query).toContain('WHERE weight >= 2.0 AND weight < 3.0 AND timestamp < ? AND archived = 0');
  });
});

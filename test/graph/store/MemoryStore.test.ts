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
    const mockManager = {
      getConnection: vi.fn().mockReturnValue({
        prepare: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue([
            {
              id: 'e2',
              kind: 'observation',
              session_id: 's2',
              content: 'test content sqlite',
              metadata: null,
              timestamp: 1000
            }
          ])
        })
      })
    };
    
    // Use any to bypass private/typing if necessary, or add a public method
    (memoryStore as any).setSqliteManager(mockManager);
    
    const results = memoryStore.searchEvents('sqlite "query"');
    
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('e2');
    
    // Verify it called sqlite
    expect(mockManager.getConnection).toHaveBeenCalled();
    const prepareMock = mockManager.getConnection().prepare as any;
    expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('MATCH ?'));
    // By default without since, we expect only query and limit
    expect(prepareMock().all).toHaveBeenCalledWith(expect.stringContaining('sqlite ""query""'), 50);
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
    const mockManager = {
      getConnection: vi.fn().mockReturnValue({
        prepare: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue([
            { id: 'e1', kind: 'obs', session_id: 's1', content: 'hit', timestamp: 2000, weight: 1.5, archived: 0 }
          ])
        })
      })
    };
    (memoryStore as any).setSqliteManager(mockManager);
    
    const since = 1000;
    const results = memoryStore.searchEvents('hit', 50, since);
    
    expect(results.length).toBe(1);
    expect(results[0].weight).toBe(1.5);
    
    const prepareMock = mockManager.getConnection().prepare as any;
    expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('timestamp >= ?'));
    expect(prepareMock().all).toHaveBeenCalledWith(expect.stringContaining('"hit"*'), since, 50);
  });
});

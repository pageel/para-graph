import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../../../src/graph/store/MemoryStore.js';
import type { MemoryEvent, CotMetadata } from '../../../src/graph/models.js';

describe('Deep Reasoning (CoT) Memory Engine Integration', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore('test-cot-project');

    const cotEvent1: MemoryEvent = {
      id: 'cot-1',
      sessionId: 'session-101',
      kind: 'cot-decision',
      content: 'Chose Option A for zero schema migration DB safety',
      timestamp: new Date().toISOString(),
      metadata: {
        cotMetadata: {
          doorType: 'two-way',
          weightedScore: 4.45,
          selectedOption: 'Option A'
        } as CotMetadata
      }
    };

    const cotEvent2: MemoryEvent = {
      id: 'cot-2',
      sessionId: 'session-101',
      kind: 'cot-decision',
      content: 'Chose Option B relational table architecture',
      timestamp: new Date().toISOString(),
      metadata: {
        cotMetadata: {
          doorType: 'one-way',
          weightedScore: 3.12,
          selectedOption: 'Option B'
        } as CotMetadata
      }
    };

    store.pushEvent(cotEvent1);
    store.pushEvent(cotEvent2);
  });

  it('should filter memory events by kind and doorType', () => {
    // Calling searchEvents with extended parameters: kind and doorType
    const twoWayEvents = (store as any).searchEvents('Option', 10, undefined, false, 'cot-decision', 'two-way');
    expect(twoWayEvents.length).toBe(1);
    expect(twoWayEvents[0].id).toBe('cot-1');
    expect(twoWayEvents[0].metadata?.cotMetadata?.doorType).toBe('two-way');

    const oneWayEvents = (store as any).searchEvents('Option', 10, undefined, false, 'cot-decision', 'one-way');
    expect(oneWayEvents.length).toBe(1);
    expect(oneWayEvents[0].id).toBe('cot-2');
    expect(oneWayEvents[0].metadata?.cotMetadata?.doorType).toBe('one-way');
  });
});

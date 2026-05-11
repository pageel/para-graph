import { randomUUID } from 'node:crypto';
import type { MemoryEvent, SemanticSlice } from './models.js';
import type { ProjectGraph } from './store/ProjectGraph.js';

export interface CurationResult {
  slicesCreated: number;
  eventsProcessed: number;
}

export class CurationWorker {
  /**
   * Curate un-grouped memory events into Semantic Slices using heuristics.
   * v1 uses a simple session-based clustering approach.
   */
  public static curate(graph: ProjectGraph): CurationResult {
    const allEvents = graph.getAllMemoryEvents();
    const existingSlices = graph.getMemorySlices();

    // 1. Find curated event IDs
    const curatedEventIds = new Set<string>();
    for (const slice of existingSlices) {
      for (const id of slice.eventIds) {
        curatedEventIds.add(id);
      }
    }

    // 2. Get uncurated events, apply hard limit of 1000
    const uncuratedEvents = allEvents.filter(e => !curatedEventIds.has(e.id));
    const eventsToProcess = uncuratedEvents.slice(0, 1000);

    if (eventsToProcess.length === 0) {
      return { slicesCreated: 0, eventsProcessed: 0 };
    }

    // 3. Simple Heuristic Clustering (v1)
    // Group by session ID for simple clustering
    const groups = new Map<string, MemoryEvent[]>();
    for (const event of eventsToProcess) {
      const key = event.sessionId || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(event);
    }

    let slicesCreated = 0;

    for (const [sessionId, events] of groups.entries()) {
      if (events.length === 0) continue;

      // Extract nodeIds from metadata if available
      const nodeIds = new Set<string>();
      const topic = `Session ${sessionId.substring(0, 8)} Operations`;
      
      for (const e of events) {
        if (e.metadata?.nodeId) {
          nodeIds.add(e.metadata.nodeId as string);
        } else if (e.metadata?.nodeIds && Array.isArray(e.metadata.nodeIds)) {
          for (const id of e.metadata.nodeIds) {
            nodeIds.add(String(id));
          }
        }
      }

      // Generate a simple summary based on event kinds
      const kinds = new Set(events.map(e => e.kind));
      const summary = `Session curation containing ${events.length} events of types: ${Array.from(kinds).join(', ')}`;

      const slice: SemanticSlice = {
        id: randomUUID(),
        topic,
        summary,
        nodeIds: Array.from(nodeIds),
        eventIds: events.map(e => e.id),
        createdAt: new Date().toISOString(),
      };

      graph.addMemorySlice(slice);
      slicesCreated++;
    }

    return {
      slicesCreated,
      eventsProcessed: eventsToProcess.length,
    };
  }
}

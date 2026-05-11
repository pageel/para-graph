import type { MemoryEvent, SemanticSlice } from '../models.js';

export class MemoryStore {
  public readonly projectName: string;
  private readonly events = new Map<string, MemoryEvent>();
  private readonly slices = new Map<string, SemanticSlice>();

  // Indexes
  private eventsList: MemoryEvent[] = [];
  private slicesList: SemanticSlice[] = [];

  constructor(projectName: string) {
    this.projectName = projectName;
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

  /** Full-text search over events */
  public searchEvents(query: string, limit: number = 50): MemoryEvent[] {
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

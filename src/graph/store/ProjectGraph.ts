import type {
  GraphNode,
  GraphEdge,
  SearchResult,
  TraversalResult,
  TraversalDirection,
  ContextBundle,
  AddEdgesResult,
  SemanticAttributes,
  EnrichmentStats,
  MemoryEvent,
  SemanticSlice,
} from '../models.js';
import { AstStore } from './AstStore.js';
import { MemoryStore } from './MemoryStore.js';

export class ProjectGraph {
  public readonly projectName: string;
  private readonly astStore: AstStore;
  private readonly memoryStore: MemoryStore;

  constructor(projectName: string) {
    this.projectName = projectName;
    this.astStore = new AstStore(projectName);
    this.memoryStore = new MemoryStore(projectName);
  }

  // --- AstStore Delegation ---

  get enrichmentStats(): EnrichmentStats {
    return this.astStore.enrichmentStats;
  }

  setEnrichmentStats(stats: EnrichmentStats): void {
    this.astStore.setEnrichmentStats(stats);
  }

  enrichNode(nodeId: string, semantic: SemanticAttributes): boolean {
    return this.astStore.enrichNode(nodeId, semantic);
  }

  public addNode(node: GraphNode): void {
    this.astStore.addNode(node);
  }

  public addEdge(edge: GraphEdge): void {
    this.astStore.addEdge(edge);
  }

  public getNode(id: string): GraphNode | undefined {
    return this.astStore.getNode(id);
  }
  
  public getAllNodes(): GraphNode[] {
    return this.astStore.getAllNodes();
  }

  public getAllEdges(): GraphEdge[] {
    return this.astStore.getAllEdges();
  }

  public getStats(): { nodeCount: number; edgeCount: number; fileCount: number } {
    return this.astStore.getStats();
  }
  
  public updateNode(node: GraphNode): void {
    this.astStore.updateNode(node);
  }

  public search(query: string, nodeType?: string): SearchResult {
    return this.astStore.search(query, nodeType);
  }

  public getConnectedEdges(nodeId: string): GraphEdge[] {
    return this.astStore.getConnectedEdges(nodeId);
  }

  public addEdges(edges: GraphEdge[]): AddEdgesResult {
    return this.astStore.addEdges(edges);
  }

  public traverseReverse(
    nodeId: string,
    depth: number = 2,
    direction: TraversalDirection = 'upstream',
  ): TraversalResult {
    return this.astStore.traverseReverse(nodeId, depth, direction);
  }

  // --- MemoryStore Delegation ---

  public pushMemoryEvent(event: MemoryEvent): void {
    this.memoryStore.pushEvent(event);
  }

  public searchMemory(query: string, limit?: number): MemoryEvent[] {
    return this.memoryStore.searchEvents(query, limit);
  }

  public getMemorySlices(): SemanticSlice[] {
    return this.memoryStore.getSlices();
  }

  public addMemorySlice(slice: SemanticSlice): void {
    this.memoryStore.addSlice(slice);
  }

  public getAllMemoryEvents(): MemoryEvent[] {
    return this.memoryStore.getAllEvents();
  }

  // --- Facade Orchestration ---

  public getContextBundle(nodeId: string, rootDir: string, previewOnly: boolean = false): ContextBundle {
    const bundle = this.astStore.getContextBundle(nodeId, rootDir, previewOnly);
    
    // Find related memory slices
    const relatedMemory: SemanticSlice[] = [];
    const callers = new Set(bundle.callers.map(c => c.id));
    const callees = new Set(bundle.callees.map(c => c.id));
    
    for (const slice of this.memoryStore.getSlices()) {
      const isRelated = slice.nodeIds.some(id => 
        id === nodeId || callers.has(id) || callees.has(id)
      );
      if (isRelated) {
        relatedMemory.push(slice);
      }
    }
    
    if (relatedMemory.length > 0) {
      bundle.relatedMemory = relatedMemory;
    }
    
    return bundle;
  }
}

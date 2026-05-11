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
} from '../models.js';
import { AstStore } from './AstStore.js';

export class ProjectGraph {
  public readonly projectName: string;
  private readonly astStore: AstStore;
  private readonly memoryStore: any = null; // Placeholder for Phase 2

  constructor(projectName: string) {
    this.projectName = projectName;
    this.astStore = new AstStore(projectName);
  }

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

  public getContextBundle(nodeId: string, rootDir: string): ContextBundle {
    return this.astStore.getContextBundle(nodeId, rootDir);
  }
}

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
  GodNodeProfile,
  GraphMetadata,
} from '../models.js';
import { EdgeRelation } from '../models.js';
import { AstStore } from './AstStore.js';
import { MemoryStore } from './MemoryStore.js';
import type { SqliteGraphRepository } from './sqlite-repository.js';

export class ProjectGraph {
  public readonly projectName: string;
  private readonly astStore: AstStore;
  private readonly memoryStore: MemoryStore;
  public repository?: SqliteGraphRepository;

  constructor(projectName: string) {
    this.projectName = projectName;
    this.astStore = new AstStore(projectName);
    this.memoryStore = new MemoryStore(projectName);
  }

  /** Close SQLite connection to release file handles and unblock event loop */
  public close(): void {
    if (this.repository) {
      (this.repository as any).manager.close();
    }
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
  
  public getMetadata(projectName: string, version: string): GraphMetadata {
    const stats = this.getStats();
    const allNodes = this.getAllNodes();
    const enrichableNodeCount = allNodes.filter(n => n.type !== 'file').length;
    
    // 70% enrichment weight
    const enrichmentRate = enrichableNodeCount > 0 ? this.enrichmentStats.totalEnriched / enrichableNodeCount : 0;
    const enrichmentScore = enrichmentRate * 70;
    
    // 30% resolution weight
    const allEdges = this.getAllEdges();
    const totalEdges = allEdges.length;
    let unresolvedEdges = 0;
    for (const e of allEdges) {
      if (e.sourceId.startsWith('?unresolved') || e.targetId.startsWith('?unresolved') || e.confidence === 'AMBIGUOUS') {
        unresolvedEdges++;
      }
    }
    const resolutionRate = totalEdges > 0 ? (totalEdges - unresolvedEdges) / totalEdges : 1;
    const resolutionScore = resolutionRate * 30;
    
    const healthScore = Math.round(enrichmentScore + resolutionScore);
    
    return {
      version,
      generatedAt: new Date().toISOString(),
      nodeCount: stats.nodeCount,
      edgeCount: stats.edgeCount,
      fileCount: stats.fileCount,
      projectName,
      enrichableNodeCount,
      ...(this.enrichmentStats.totalEnriched > 0 ? { enrichment: this.enrichmentStats } : {}),
      resolution: {
        totalEdges,
        resolvedEdges: totalEdges - unresolvedEdges,
        unresolvedEdges,
        resolutionRate: Number(resolutionRate.toFixed(4)),
      },
      healthScore,
    };
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

  public searchMemory(query: string, limit?: number, since?: number, includeArchived?: boolean): MemoryEvent[] {
    return this.memoryStore.searchEvents(query, limit, since, includeArchived);
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

  public getContextBundle(nodeId: string, rootDir: string, previewOnly: boolean = false, includeTestFixtures: boolean = false): ContextBundle {
    const bundle = this.astStore.getContextBundle(nodeId, rootDir, previewOnly, includeTestFixtures);
    
    // Find related memory slices
    const relatedMemory: SemanticSlice[] = [];
    const callers = new Set(bundle.callers.map(c => c.id));
    const callees = new Set(bundle.callees.map(c => c.id));
    
    const nodeIds = [nodeId, ...Array.from(callers), ...Array.from(callees)];
    
    if (this.repository) {
      for (const slice of this.repository.getRelatedSlices(nodeIds)) {
        relatedMemory.push(slice);
      }
    }
    
    if (relatedMemory.length > 0) {
      bundle.relatedMemory = relatedMemory;
    }
    
    return bundle;
  }

  // --- Graph Analytics ---

  public getTopGodNodes(topN: number = 50, unenrichedOnly: boolean = false): GodNodeProfile[] {
    const allNodes = this.getAllNodes();
    const allEdges = this.getAllEdges();

    const degreeMap = new Map<string, { fanIn: number; fanOut: number }>();
    for (const node of allNodes) {
      if (node.type === 'file') continue;
      degreeMap.set(node.id, { fanIn: 0, fanOut: 0 });
    }
    
    for (const edge of allEdges) {
      if (edge.relation !== EdgeRelation.CALLS) continue;
      if (edge.sourceId.startsWith('?unresolved') || edge.targetId.startsWith('?unresolved') || edge.confidence === 'AMBIGUOUS') continue;
      const src = degreeMap.get(edge.sourceId);
      if (src) src.fanOut++;
      const tgt = degreeMap.get(edge.targetId);
      if (tgt) tgt.fanIn++;
    }

    let profiles: GodNodeProfile[] = Array.from(degreeMap.entries()).map(([id, { fanIn, fanOut }]) => {
      const node = this.getNode(id)!;
      return {
        id,
        name: node.name,
        type: node.type,
        filePath: node.filePath,
        degree: fanIn + fanOut,
        fanIn,
        fanOut,
        enriched: !!node.semantic,
      };
    });

    if (unenrichedOnly) {
      profiles = profiles.filter(p => !p.enriched);
    }

    const effectiveTopN = Math.min(topN, 50);
    return profiles
      .filter(p => p.degree > 0)
      .sort((a, b) => b.degree - a.degree)
      .slice(0, effectiveTopN);
  }
}

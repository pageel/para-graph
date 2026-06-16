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
  ProjectInsight,
} from '../models.js';
import { EdgeRelation, isTestNode } from '../models.js';
import { AstStore } from './AstStore.js';
import { MemoryStore } from './MemoryStore.js';
import type { SqliteGraphRepository } from './sqlite-repository.js';

function calculateJaccardSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().match(/\w+/g) || []);
  const words2 = new Set(text2.toLowerCase().match(/\w+/g) || []);
  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

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

  linkDocs(links: Array<{ nodeId: string; docPath: string }>): {
    linked: number;
    skipped: number;
    errors: string[];
  } {
    return this.astStore.linkDocs(links);
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
    const enrichableNodeCount = allNodes.filter(n => n.type !== 'file' && !isTestNode(n.filePath)).length;
    
    // Calculate core vs extra enriched nodes dynamically to prevent metrics discrepancy and auto-heal old data
    const coreEnriched = allNodes.filter(n => n.semantic && n.type !== 'file' && !isTestNode(n.filePath)).length;
    const extraEnriched = allNodes.filter(n => n.semantic && (n.type === 'file' || isTestNode(n.filePath))).length;

    // Sync totalEnriched to RAM counts (Auto-heals metadata loaded from old schemas)
    const totalEnriched = coreEnriched + extraEnriched;
    const currentStats = this.astStore.enrichmentStats;
    this.astStore.setEnrichmentStats({
      ...currentStats,
      totalEnriched,
    });
    
    // 70% enrichment weight (capped at 1.0, handles zero denominator)
    const enrichmentRate = enrichableNodeCount > 0 ? Math.min(1.0, coreEnriched / enrichableNodeCount) : 1.0;
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
    const externalEdges = allEdges.filter(e => e.confidence === 'EXTERNAL').length;
    const internalTotalEdges = totalEdges - externalEdges;
    const resolutionRate = internalTotalEdges > 0 ? (internalTotalEdges - unresolvedEdges) / internalTotalEdges : 1;
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
      ...(totalEnriched > 0 ? {
        enrichment: {
          ...this.enrichmentStats,
          coreEnriched,
          extraEnriched,
        }
      } : {}),
      resolution: {
        totalEdges,
        resolvedEdges: internalTotalEdges - unresolvedEdges,
        unresolvedEdges,
        externalEdges,
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

  // --- Project Insights Facade (P5) ---

  private readonly insightsList: ProjectInsight[] = [];

  // @para-doc [artifacts/specs/spec-2026-06-16-csa-spec-intelligence.md#csa-db-schema]
  public pushInsight(insight: ProjectInsight): string {
    const exists = this.insightsList.findIndex(i => i.id === insight.id);
    
    // Dedup only when inserting a new insight
    if (exists === -1) {
      if (this.repository) {
        const repo = this.repository as any;
        if (typeof repo.findSimilarInsight === 'function') {
          const similar = repo.findSimilarInsight(insight);
          if (similar) {
            return similar.id;
          }
        }
      } else {
        const newText = `${insight.title} ${insight.description}`;
        for (const existing of this.insightsList) {
          if (existing.category === insight.category) {
            const existingText = `${existing.title} ${existing.description}`;
            const sim = calculateJaccardSimilarity(newText, existingText);
            if (sim > 0.8) {
              return existing.id;
            }
          }
        }
      }
    }

    if (exists !== -1) {
      this.insightsList[exists] = insight;
    } else {
      this.insightsList.push(insight);
    }

    if (this.repository) {
      this.repository.insertInsight(insight);
    }
    return insight.id;
  }

  // @para-doc [artifacts/specs/spec-2026-06-16-csa-spec-intelligence.md#csa-db-schema]
  public getInsight(insightId: string): ProjectInsight | null {
    if (this.repository) {
      try {
        const repo = this.repository as any;
        if (typeof repo.getInsight === 'function') {
          return repo.getInsight(insightId);
        }
      } catch (err) {
        // Fallback to memory
      }
    }
    return this.insightsList.find(i => i.id === insightId) || null;
  }

  public searchInsights(query: string, opts?: { category?: string; domain?: string; limit?: number }): ProjectInsight[] {
    if (this.repository) {
      try {
        return this.repository.searchInsights(query, opts);
      } catch (err) {
        // Graceful fallback to memory on SQLite failures
      }
    }

    const q = query.toLowerCase();
    const limit = opts?.limit ?? 10;
    const results: ProjectInsight[] = [];

    // Sort in-memory insights by createdDate (newest first)
    const sortedInsights = [...this.insightsList].sort((a, b) => b.createdAt - a.createdAt);

    for (const insight of sortedInsights) {
      if (results.length >= limit) break;

      if (opts?.category && insight.category !== opts.category) continue;
      if (opts?.domain && insight.domain !== opts.domain) continue;

      if (!query || query.trim() === '') {
        results.push(insight);
        continue;
      }

      const matchText = `${insight.title} ${insight.description} ${insight.domain}`.toLowerCase();
      if (matchText.includes(q)) {
        results.push(insight);
      }
    }

    return results;
  }
}

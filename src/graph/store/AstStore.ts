import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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
import { EdgeRelation } from '../models.js';
import { BeamSearchTraverser } from '../query/traverser.js';
import type { PruningConfig } from '../query/traverser.js';

export class AstStore {
  public readonly projectName: string;
  private readonly nodesById = new Map<string, GraphNode>();
  private readonly edges = new Array<GraphEdge>();
  
  // Indexes
  private readonly nodesByName = new Map<string, GraphNode[]>();
  private readonly nodesByConcept = new Map<string, GraphNode[]>();
  private readonly edgesBySource = new Map<string, GraphEdge[]>();
  private readonly edgesByTarget = new Map<string, GraphEdge[]>();

  // Enrichment tracking (P-Tracker v0.11.1)
  private _enrichmentStats: EnrichmentStats = {
    totalEnriched: 0,
    lastEnrichedAt: null,
    recentNodes: [],
  };

  constructor(projectName: string) {
    this.projectName = projectName;
  }

  /** Get current enrichment stats (read-only copy) */
  get enrichmentStats(): EnrichmentStats {
    return { ...this._enrichmentStats, recentNodes: [...this._enrichmentStats.recentNodes] };
  }

  /** Restore enrichment stats from persisted metadata (used by GraphStore on load) */
  setEnrichmentStats(stats: EnrichmentStats): void {
    this._enrichmentStats = { ...stats, recentNodes: [...stats.recentNodes] };
  }

  /**
   * Enrich a node with semantic attributes and update tracking stats.
   * Deduplication: If node already has `semantic`, this is a re-enrichment —
   * do NOT increment totalEnriched. Always update lastEnrichedAt and recentNodes.
   *
   * @param nodeId - ID of the node to enrich
   * @param semantic - Semantic attributes to set
   * @returns true if node was found and enriched, false if node not found
   */
  enrichNode(nodeId: string, semantic: SemanticAttributes): boolean {
    const node = this.nodesById.get(nodeId);
    if (!node) return false;

    const isFirstEnrich = !node.semantic;
    const docAnchors = node.semantic?.docAnchors;

    node.semantic = {
      ...semantic,
      docAnchors: docAnchors ?? semantic.docAnchors,
      staleSince: undefined,
    };

    // Update stats
    if (isFirstEnrich) {
      this._enrichmentStats.totalEnriched++;
    }
    this._enrichmentStats.lastEnrichedAt = semantic.enrichedAt ?? null;

    // Update recentNodes — move to front, keep max 5
    const recent = this._enrichmentStats.recentNodes.filter(id => id !== nodeId);
    recent.unshift(nodeId);
    this._enrichmentStats.recentNodes = recent.slice(0, 5);

    return true;
  }

  /**
   * Link code nodes to documentation paths.
   * normalizes paths to prevent cross-platform directory slash issues (A1 Windows safety).
   *
   * @param links - Array of nodeId and docPath links to establish
   * @returns statistics on the linking operation
   */
  public linkDocs(links: Array<{ nodeId: string; docPath: string }>): {
    linked: number;
    skipped: number;
    errors: string[];
  } {
    let linked = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const link of links) {
      const node = this.nodesById.get(link.nodeId);
      if (!node) {
        errors.push(`Node not found: ${link.nodeId}`);
        continue;
      }

      if (!node.semantic) {
        node.semantic = {};
      }

      // Reset staleness on linking
      node.semantic.staleSince = undefined;

      // A1 Cross-platform: Normalize backslashes to forward slashes
      const normalizedPath = link.docPath.replace(/\\/g, '/');

      if (!node.semantic.docAnchors) {
        node.semantic.docAnchors = [];
      }

      if (!node.semantic.docAnchors.includes(normalizedPath)) {
        node.semantic.docAnchors.push(normalizedPath);
      }
      linked++;
    }

    return { linked, skipped, errors };
  }

  public addNode(node: GraphNode): void {
    this.nodesById.set(node.id, node);
    
    // Index by name (case insensitive)
    const nameKey = node.name.toLowerCase();
    if (!this.nodesByName.has(nameKey)) {
      this.nodesByName.set(nameKey, []);
    }
    this.nodesByName.get(nameKey)!.push(node);

    // Index by concepts
    if (node.semantic?.domainConcepts) {
      for (const concept of node.semantic.domainConcepts) {
        const conceptKey = concept.toLowerCase();
        if (!this.nodesByConcept.has(conceptKey)) {
          this.nodesByConcept.set(conceptKey, []);
        }
        this.nodesByConcept.get(conceptKey)!.push(node);
      }
    }
  }

  public addEdge(edge: GraphEdge): void {
    this.edges.push(edge);

    if (!this.edgesBySource.has(edge.sourceId)) {
      this.edgesBySource.set(edge.sourceId, []);
    }
    this.edgesBySource.get(edge.sourceId)!.push(edge);

    if (!this.edgesByTarget.has(edge.targetId)) {
      this.edgesByTarget.set(edge.targetId, []);
    }
    this.edgesByTarget.get(edge.targetId)!.push(edge);
  }

  public getNode(id: string): GraphNode | undefined {
    return this.nodesById.get(id);
  }
  
  public getAllNodes(): GraphNode[] {
    return Array.from(this.nodesById.values());
  }

  public getAllEdges(): GraphEdge[] {
    return this.edges;
  }

  public getStats(): { nodeCount: number; edgeCount: number; fileCount: number } {
    const files = new Set(this.getAllNodes().map(n => n.filePath));
    return {
      nodeCount: this.nodesById.size,
      edgeCount: this.edges.length,
      fileCount: files.size,
    };
  }
  
  public updateNode(node: GraphNode): void {
    this.nodesById.set(node.id, node);
    
    if (node.semantic?.domainConcepts) {
      for (const concept of node.semantic.domainConcepts) {
        const conceptKey = concept.toLowerCase();
        if (!this.nodesByConcept.has(conceptKey)) {
          this.nodesByConcept.set(conceptKey, []);
        }
        const list = this.nodesByConcept.get(conceptKey)!;
        if (!list.find(n => n.id === node.id)) {
           list.push(node);
        }
      }
    }
  }

  public search(query: string, nodeType?: string): SearchResult {
    const q = query.toLowerCase();
    const resultNodes = new Map<string, GraphNode>();
    
    // 1. Search by exact or partial name
    for (const [name, nodes] of this.nodesByName.entries()) {
      if (name.includes(q)) {
        nodes.forEach(n => resultNodes.set(n.id, n));
      }
    }

    // 2. Search by concept
    for (const [concept, nodes] of this.nodesByConcept.entries()) {
      if (concept.includes(q)) {
        nodes.forEach(n => resultNodes.set(n.id, n));
      }
    }

    // Filter by type if provided
    let nodesArray = Array.from(resultNodes.values());
    if (nodeType) {
      nodesArray = nodesArray.filter(n => n.type === nodeType);
    }

    // Find edges between these nodes
    const resultEdges: GraphEdge[] = [];
    const nodeIds = new Set(nodesArray.map(n => n.id));
    for (const edge of this.edges) {
      if (nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)) {
        resultEdges.push(edge);
      }
    }

    return { nodes: nodesArray, edges: resultEdges };
  }

  public getConnectedEdges(nodeId: string): GraphEdge[] {
    const outgoing = this.edgesBySource.get(nodeId) || [];
    const incoming = this.edgesByTarget.get(nodeId) || [];
    return [...outgoing, ...incoming];
  }

  // --- P7: Agentic Edge Resolution ---

  /**
   * Batch add edges with validation and deduplication.
   *
   * Guarantees:
   * 1. Both sourceId and targetId must exist in the graph (rejects otherwise).
   * 2. Duplicate edges (same sourceId + targetId + relation) are skipped.
   * 3. Returns structured result so the Agent can self-correct invalid IDs.
   *
   * @param edges - Array of edges to inject
   * @returns AddEdgesResult with added/skipped counts and error details
   */
  public addEdges(edges: GraphEdge[]): AddEdgesResult {
    let added = 0;
    let skipped = 0;
    const errors: AddEdgesResult['errors'] = [];

    for (const edge of edges) {
      // Validate: both nodes must exist
      const sourceExists = this.nodesById.has(edge.sourceId);
      const targetExists = this.nodesById.has(edge.targetId);

      if (!sourceExists || !targetExists) {
        const missing = [];
        if (!sourceExists) missing.push(`sourceId "${edge.sourceId}"`);
        if (!targetExists) missing.push(`targetId "${edge.targetId}"`);
        errors.push({
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          reason: `Node not found: ${missing.join(', ')}`,
        });
        continue;
      }

      // Deduplication: check if [sourceId, targetId, relation] already exists
      const existingEdges = this.edgesBySource.get(edge.sourceId) || [];
      const isDuplicate = existingEdges.some(
        (e) => e.targetId === edge.targetId && e.relation === edge.relation,
      );

      if (isDuplicate) {
        skipped++;
        continue;
      }

      // Add edge (reuses existing addEdge to maintain indexes)
      this.addEdge(edge);
      added++;
    }

    return { added, skipped, errors };
  }

  // --- P6: Impact & Context Queries ---

  /** Max nodes returned by traversal to prevent explosion on large graphs */
  private static readonly TRAVERSAL_MAX_NODES = 100;
  /** Max depth allowed for traversal */
  private static readonly TRAVERSAL_MAX_DEPTH = 5;
  /** Max source code lines returned in context bundle */
  private static readonly CONTEXT_MAX_LINES = 200;

  /**
   * BFS traversal from a node in upstream, downstream, or both directions.
   *
   * - upstream:   follows edges TO the node (who calls/imports this?)
   * - downstream: follows edges FROM the node (what does this call/import?)
   * - both:       follows edges in both directions
   *
   * @returns TraversalResult with affected nodes, traversed edges, and paths
   */
  public traverseReverse(
    nodeId: string,
    depth: number = 2,
    direction: TraversalDirection = 'upstream',
    pruningConfig?: PruningConfig,
  ): TraversalResult {
    if (pruningConfig) {
      const traverser = new BeamSearchTraverser(this);
      const config = {} as PruningConfig;
      config.maxDepth = pruningConfig.maxDepth ?? depth;
      config.topologyBarrierThreshold = pruningConfig.topologyBarrierThreshold ?? 1000;
      config.semanticBarrierConcept = pruningConfig.semanticBarrierConcept;
      config.hop2Limit = pruningConfig.hop2Limit;
      config.beamWidth = pruningConfig.beamWidth;
      config.utilityPatterns = pruningConfig.utilityPatterns;
      return traverser.traverseBeam(nodeId, config, direction);
    }

    const effectiveDepth = Math.min(depth, AstStore.TRAVERSAL_MAX_DEPTH);
    const startNode = this.nodesById.get(nodeId);
    if (!startNode) {
      return { nodes: [], edges: [], paths: [] };
    }

    const visited = new Set<string>([nodeId]);
    const resultNodes: GraphNode[] = [];
    const resultEdges: GraphEdge[] = [];
    const resultPaths: string[][] = [];

    // BFS queue: [currentNodeId, currentPath, currentDepth]
    const queue: Array<[string, string[], number]> = [[nodeId, [nodeId], 0]];

    while (queue.length > 0 && resultNodes.length < AstStore.TRAVERSAL_MAX_NODES) {
      const [currentId, currentPath, currentDepth] = queue.shift()!;

      if (currentDepth >= effectiveDepth) continue;

      // Collect neighbor edges based on direction
      const neighborEdges: GraphEdge[] = [];
      if (direction === 'upstream' || direction === 'both') {
        const incoming = this.edgesByTarget.get(currentId) || [];
        neighborEdges.push(...incoming);
      }
      if (direction === 'downstream' || direction === 'both') {
        const outgoing = this.edgesBySource.get(currentId) || [];
        neighborEdges.push(...outgoing);
      }

      for (const edge of neighborEdges) {
        if (resultNodes.length >= AstStore.TRAVERSAL_MAX_NODES) break;

        // Determine the neighbor node ID
        const neighborId = edge.sourceId === currentId ? edge.targetId : edge.sourceId;
        if (visited.has(neighborId)) continue;

        const neighborNode = this.nodesById.get(neighborId);
        if (!neighborNode) continue;

        visited.add(neighborId);
        resultNodes.push(neighborNode);
        resultEdges.push(edge);

        const newPath = [...currentPath, neighborId];
        resultPaths.push(newPath);

        queue.push([neighborId, newPath, currentDepth + 1]);
      }
    }

    return { nodes: resultNodes, edges: resultEdges, paths: resultPaths };
  }

  /**
   * Gather comprehensive context for a code entity in one call.
   *
   * Reads the graph for relationships and the actual source file
   * for code content. Designed to replace 10-15 individual tool calls
   * with a single bundled response.
   *
   * @param nodeId - ID of the entity to analyze
   * @param rootDir - Absolute path to the project repo root (for source file reading)
   * @returns ContextBundle with source, callers, callees, imports, tests
   * @throws Error if nodeId is not found in the graph
   */
  // @para-doc [artifacts/specs/spec-2026-06-18-rrf-multiseed.md#csa-multiseed-context]
  public getContextBundle(
    nodeId: string | string[],
    rootDir: string,
    previewOnly: boolean = false,
    includeTestFixtures: boolean = false
  ): ContextBundle {
    const seeds = Array.isArray(nodeId) ? nodeId : [nodeId];
    if (seeds.length === 0) {
      throw new Error(`At least one nodeId must be provided`);
    }

    const firstSeedId = seeds[0];
    const target = this.nodesById.get(firstSeedId);
    if (!target) {
      throw new Error(`Node not found: ${firstSeedId}`);
    }

    const warnings: string[] = [];

    // 1. Read source code from actual file (only for the first target seed)
    let sourceCode: string | null = null;
    let truncated = false;
    
    if (!previewOnly) {
      const filePath = join(rootDir, target.filePath);
      if (existsSync(filePath)) {
        try {
          const fileContent = readFileSync(filePath, 'utf-8');
          const lines = fileContent.split('\n');
          const start = Math.max(0, target.startLine - 1); // 1-indexed to 0-indexed
          const end = Math.min(lines.length, target.endLine);
          const entityLines = lines.slice(start, end);

          if (entityLines.length > AstStore.CONTEXT_MAX_LINES) {
            sourceCode = entityLines.slice(0, AstStore.CONTEXT_MAX_LINES).join('\n');
            truncated = true;
            warnings.push(`Source code truncated: ${entityLines.length} lines → ${AstStore.CONTEXT_MAX_LINES} lines`);
          } else {
            sourceCode = entityLines.join('\n');
          }
        } catch (err) {
          warnings.push(`Failed to read source file: ${(err as Error).message}`);
        }
      } else {
        warnings.push(`Source file not found: ${target.filePath} (graph may be stale)`);
      }
    }

    const callersMap = new Map<string, GraphNode>();
    const calleesMap = new Map<string, GraphNode>();
    const importsMap = new Map<string, GraphEdge>();
    const relatedTestsMap = new Map<string, GraphNode>();

    for (const seedId of seeds) {
      const seedNode = this.nodesById.get(seedId);
      if (!seedNode) {
        warnings.push(`Seed node not found in graph: ${seedId}`);
        continue;
      }

      // Collect callers for this seed (capped at 20)
      const incomingEdges = this.edgesByTarget.get(seedId) || [];
      let seedCallersCount = 0;
      for (const edge of incomingEdges) {
        if (seedCallersCount >= 20) break;
        if (edge.relation === EdgeRelation.CALLS) {
          const caller = this.nodesById.get(edge.sourceId);
          if (caller) {
            callersMap.set(caller.id, caller);
            seedCallersCount++;
          }
        }
      }

      // Collect callees for this seed (capped at 20)
      const outgoingEdges = this.edgesBySource.get(seedId) || [];
      let seedCalleesCount = 0;
      for (const edge of outgoingEdges) {
        if (seedCalleesCount >= 20) break;
        if (edge.relation === EdgeRelation.CALLS) {
          const callee = this.nodesById.get(edge.targetId);
          if (callee) {
            if (!includeTestFixtures && callee.filePath.startsWith('test/fixtures/')) {
              continue;
            }
            calleesMap.set(callee.id, callee);
            seedCalleesCount++;
          }
        }
      }

      // Collect imports for this seed (capped at 20)
      const fileEdges = this.edgesBySource.get(seedNode.filePath) || [];
      let seedImportsCount = 0;
      for (const edge of fileEdges) {
        if (seedImportsCount >= 20) break;
        if (edge.relation === EdgeRelation.IMPORTS_FROM) {
          const edgeKey = `${edge.sourceId}->${edge.targetId}::${edge.relation}`;
          importsMap.set(edgeKey, edge);
          seedImportsCount++;
        }
      }

      // Collect related tests for this seed (capped at 20)
      const seedNameLower = seedNode.name.toLowerCase();
      let seedTestsCount = 0;
      for (const node of this.nodesById.values()) {
        if (seedTestsCount >= 20) break;
        const fp = node.filePath.toLowerCase();
        if (
          (fp.includes('test/') || fp.includes('.test.') || fp.includes('.spec.')) &&
          node.name.toLowerCase().includes(seedNameLower) &&
          node.id !== seedId
        ) {
          relatedTestsMap.set(node.id, node);
          seedTestsCount++;
        }
      }
    }

    // Apply global cap (50) to the deduplicated collections
    const callers = Array.from(callersMap.values()).slice(0, 50);
    const callees = Array.from(calleesMap.values()).slice(0, 50);
    const imports = Array.from(importsMap.values()).slice(0, 50);
    const relatedTests = Array.from(relatedTestsMap.values()).slice(0, 50);

    return {
      target,
      sourceCode,
      truncated,
      callers,
      callees,
      imports,
      relatedTests,
      warnings,
    };
  }
}

/**
 * CodeGraph — In-memory graph storage for code structure.
 *
 * Stores nodes (code entities) and edges (relationships) with
 * dual indexing for fast lookup by ID and by file path.
 */

import type { GraphNode, GraphEdge, SemanticAttributes, EnrichmentStats, GraphMetadata } from './models.js';
import { EdgeRelation, NodeType } from './models.js';

export class CodeGraph {
  /** Primary index: node ID → GraphNode */
  private nodeMap: Map<string, GraphNode> = new Map();

  /** Flat list of all edges */
  private edgeList: GraphEdge[] = [];

  /** Secondary index: file path → list of nodes in that file */
  private nodesByFile: Map<string, GraphNode[]> = new Map();

  /** Enrichment progress tracking (P-Tracker v0.11.1) */
  private _enrichmentStats: EnrichmentStats = {
    totalEnriched: 0,
    lastEnrichedAt: null,
    recentNodes: [],
  };

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
    const node = this.nodeMap.get(nodeId);
    if (!node) return false;

    const isFirstEnrich = !node.semantic;
    node.semantic = semantic;

    // Update stats
    if (isFirstEnrich) {
      this._enrichmentStats.totalEnriched++;
    }
    this._enrichmentStats.lastEnrichedAt = semantic.enrichedAt;

    // Update recentNodes — move to front, keep max 5
    const recent = this._enrichmentStats.recentNodes.filter(id => id !== nodeId);
    recent.unshift(nodeId);
    this._enrichmentStats.recentNodes = recent.slice(0, 5);

    return true;
  }

  /**
   * Add a node to the graph.
   * Logs a warning if a node with the same ID already exists (H1-2 guard).
   */
  addNode(node: GraphNode): void {
    if (this.nodeMap.has(node.id)) {
      console.warn(`[CodeGraph] Warning: Duplicate node ID "${node.id}" — skipping.`);
      return;
    }

    this.nodeMap.set(node.id, node);

    // Update file index
    const fileNodes = this.nodesByFile.get(node.filePath) ?? [];
    fileNodes.push(node);
    this.nodesByFile.set(node.filePath, fileNodes);
  }

  /** Add an edge to the graph. */
  addEdge(edge: GraphEdge): void {
    this.edgeList.push(edge);
  }

  /** Get a node by its unique ID. */
  getNode(id: string): GraphNode | undefined {
    return this.nodeMap.get(id);
  }

  /** Get all nodes in a specific file. */
  getNodesByFile(filePath: string): GraphNode[] {
    return this.nodesByFile.get(filePath) ?? [];
  }

  /** Get all edges originating from a specific node. */
  getEdgesFrom(nodeId: string): GraphEdge[] {
    return this.edgeList.filter((e) => e.sourceId === nodeId);
  }

  /** Get all edges targeting a specific node. */
  getEdgesTo(nodeId: string): GraphEdge[] {
    return this.edgeList.filter((e) => e.targetId === nodeId);
  }

  /** Get all nodes (for iteration/export). */
  getAllNodes(): GraphNode[] {
    return Array.from(this.nodeMap.values());
  }

  /** Get all edges (for iteration/export). */
  getAllEdges(): GraphEdge[] {
    return [...this.edgeList];
  }

  // --- Accessor aliases (for backward compat with test/external code) ---

  /** @deprecated Use getAllNodes() instead. Kept for backward compat. */
  get nodes(): Map<string, GraphNode> {
    return this.nodeMap;
  }

  /** @deprecated Use getAllEdges() instead. Kept for backward compat. */
  get edges(): GraphEdge[] {
    return this.edgeList;
  }

  /** Get summary statistics. */
  getStats(): { nodeCount: number; edgeCount: number; fileCount: number } {
    return {
      nodeCount: this.nodeMap.size,
      edgeCount: this.edgeList.length,
      fileCount: this.nodesByFile.size,
    };
  }

  /** Calculate project metadata including the weighted healthScore */
  getMetadata(projectName: string, version: string): GraphMetadata {
    const stats = this.getStats();
    const allNodes = this.getAllNodes();
    const enrichableNodeCount = allNodes.filter(n => n.type !== NodeType.FILE).length;
    
    // 70% enrichment weight
    const enrichmentRate = enrichableNodeCount > 0 ? this._enrichmentStats.totalEnriched / enrichableNodeCount : 0;
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
      ...(this._enrichmentStats.totalEnriched > 0 ? { enrichment: this.enrichmentStats } : {}),
      resolution: {
        totalEdges,
        resolvedEdges: totalEdges - unresolvedEdges,
        unresolvedEdges,
        resolutionRate: Number(resolutionRate.toFixed(4)),
      },
      healthScore,
    };
  }

  // --- Topology Calculator (P8: Deep CALLS & Analytics) ---

  /**
   * Calculate Fan-in (number of incoming CALLS edges) for a node.
   * Excludes ?unresolved edges from the count.
   */
  fanIn(nodeId: string): number {
    return this.edgeList.filter(e =>
      e.targetId === nodeId &&
      e.relation === EdgeRelation.CALLS &&
      !e.sourceId.startsWith('?unresolved') &&
      e.confidence !== 'AMBIGUOUS'
    ).length;
  }

  /**
   * Calculate Fan-out (number of outgoing CALLS edges) from a node.
   * Excludes ?unresolved edges from the count.
   */
  fanOut(nodeId: string): number {
    return this.edgeList.filter(e =>
      e.sourceId === nodeId &&
      e.relation === EdgeRelation.CALLS &&
      !e.targetId.startsWith('?unresolved') &&
      e.confidence !== 'AMBIGUOUS'
    ).length;
  }

  /**
   * Get topology profile for a node — fan-in, fan-out, and inferred role.
   * Role is based on heuristics:
   * - High fan-in + low fan-out → 'utility' (heavily reused)
   * - Low fan-in + high fan-out → 'controller' (orchestrator)
   * - Balanced → 'service' (middleware)
   * - Very low both → 'leaf' (isolated or entry point)
   */
  getTopologyProfile(nodeId: string): {
    fanIn: number;
    fanOut: number;
    role: 'controller' | 'service' | 'utility' | 'leaf';
  } {
    const fi = this.fanIn(nodeId);
    const fo = this.fanOut(nodeId);

    let role: 'controller' | 'service' | 'utility' | 'leaf';

    if (fi <= 1 && fo <= 1) {
      role = 'leaf';
    } else if (fi > fo * 2) {
      role = 'utility';
    } else if (fo > fi * 2) {
      role = 'controller';
    } else {
      role = 'service';
    }

    return { fanIn: fi, fanOut: fo, role };
  }

  /**
   * Detect God Nodes — most-connected real entities in the graph.
   * Filters out file-level nodes and ?unresolved synthetic edges.
   * Inspired by Graphify analyze.py::god_nodes (Clean Room).
   *
   * @param topN - Number of top nodes to return (default: 10)
   * @returns Array of node profiles sorted by degree (descending)
   */
  detectGodNodes(topN: number = 10): Array<{
    id: string;
    name: string;
    degree: number;
    fanIn: number;
    fanOut: number;
  }> {
    // Get all non-file nodes (filter synthetic)
    const realNodes = this.getAllNodes().filter(n => n.type !== NodeType.FILE);

    const profiles = realNodes.map(node => {
      const fi = this.fanIn(node.id);
      const fo = this.fanOut(node.id);
      return {
        id: node.id,
        name: node.name,
        degree: fi + fo,
        fanIn: fi,
        fanOut: fo,
      };
    });

    // Sort by degree descending, take top N
    return profiles
      .filter(p => p.degree > 0)
      .sort((a, b) => b.degree - a.degree)
      .slice(0, topN);
  }
}

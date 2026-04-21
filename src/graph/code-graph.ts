/**
 * CodeGraph — In-memory graph storage for code structure.
 *
 * Stores nodes (code entities) and edges (relationships) with
 * dual indexing for fast lookup by ID and by file path.
 */

import type { GraphNode, GraphEdge } from './models.js';

export class CodeGraph {
  /** Primary index: node ID → GraphNode */
  private nodes: Map<string, GraphNode> = new Map();

  /** Flat list of all edges */
  private edges: GraphEdge[] = [];

  /** Secondary index: file path → list of nodes in that file */
  private nodesByFile: Map<string, GraphNode[]> = new Map();

  /**
   * Add a node to the graph.
   * Logs a warning if a node with the same ID already exists (H1-2 guard).
   */
  addNode(node: GraphNode): void {
    if (this.nodes.has(node.id)) {
      console.warn(`[CodeGraph] Warning: Duplicate node ID "${node.id}" — skipping.`);
      return;
    }

    this.nodes.set(node.id, node);

    // Update file index
    const fileNodes = this.nodesByFile.get(node.filePath) ?? [];
    fileNodes.push(node);
    this.nodesByFile.set(node.filePath, fileNodes);
  }

  /** Add an edge to the graph. */
  addEdge(edge: GraphEdge): void {
    this.edges.push(edge);
  }

  /** Get a node by its unique ID. */
  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  /** Get all nodes in a specific file. */
  getNodesByFile(filePath: string): GraphNode[] {
    return this.nodesByFile.get(filePath) ?? [];
  }

  /** Get all edges originating from a specific node. */
  getEdgesFrom(nodeId: string): GraphEdge[] {
    return this.edges.filter((e) => e.sourceId === nodeId);
  }

  /** Get all edges targeting a specific node. */
  getEdgesTo(nodeId: string): GraphEdge[] {
    return this.edges.filter((e) => e.targetId === nodeId);
  }

  /** Get all nodes (for iteration/export). */
  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  /** Get all edges (for iteration/export). */
  getAllEdges(): GraphEdge[] {
    return [...this.edges];
  }

  /** Get summary statistics. */
  getStats(): { nodeCount: number; edgeCount: number; fileCount: number } {
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.length,
      fileCount: this.nodesByFile.size,
    };
  }
}

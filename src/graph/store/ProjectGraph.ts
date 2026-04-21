import type { GraphNode, GraphEdge, SearchResult } from '../models.js';

export class ProjectGraph {
  public readonly projectName: string;
  private readonly nodesById = new Map<string, GraphNode>();
  private readonly edges = new Array<GraphEdge>();
  
  // Indexes
  private readonly nodesByName = new Map<string, GraphNode[]>();
  private readonly nodesByConcept = new Map<string, GraphNode[]>();
  private readonly edgesBySource = new Map<string, GraphEdge[]>();
  private readonly edgesByTarget = new Map<string, GraphEdge[]>();

  constructor(projectName: string) {
    this.projectName = projectName;
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
}

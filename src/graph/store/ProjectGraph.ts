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
} from '../models.js';
import { EdgeRelation } from '../models.js';

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
  ): TraversalResult {
    const effectiveDepth = Math.min(depth, ProjectGraph.TRAVERSAL_MAX_DEPTH);
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

    while (queue.length > 0 && resultNodes.length < ProjectGraph.TRAVERSAL_MAX_NODES) {
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
        if (resultNodes.length >= ProjectGraph.TRAVERSAL_MAX_NODES) break;

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
  public getContextBundle(nodeId: string, rootDir: string): ContextBundle {
    const target = this.nodesById.get(nodeId);
    if (!target) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    const warnings: string[] = [];

    // 1. Read source code from actual file
    let sourceCode: string | null = null;
    let truncated = false;
    const filePath = join(rootDir, target.filePath);
    if (existsSync(filePath)) {
      try {
        const fileContent = readFileSync(filePath, 'utf-8');
        const lines = fileContent.split('\n');
        const start = Math.max(0, target.startLine - 1); // 1-indexed to 0-indexed
        const end = Math.min(lines.length, target.endLine);
        const entityLines = lines.slice(start, end);

        if (entityLines.length > ProjectGraph.CONTEXT_MAX_LINES) {
          sourceCode = entityLines.slice(0, ProjectGraph.CONTEXT_MAX_LINES).join('\n');
          truncated = true;
          warnings.push(`Source code truncated: ${entityLines.length} lines → ${ProjectGraph.CONTEXT_MAX_LINES} lines`);
        } else {
          sourceCode = entityLines.join('\n');
        }
      } catch (err) {
        warnings.push(`Failed to read source file: ${(err as Error).message}`);
      }
    } else {
      warnings.push(`Source file not found: ${target.filePath} (graph may be stale)`);
    }

    // 2. Callers: nodes that CALL this entity (incoming CALLS edges)
    const incomingEdges = this.edgesByTarget.get(nodeId) || [];
    const callers: GraphNode[] = [];
    for (const edge of incomingEdges) {
      if (edge.relation === EdgeRelation.CALLS) {
        const caller = this.nodesById.get(edge.sourceId);
        if (caller) callers.push(caller);
      }
    }

    // 3. Callees: nodes that this entity CALLS (outgoing CALLS edges)
    const outgoingEdges = this.edgesBySource.get(nodeId) || [];
    const callees: GraphNode[] = [];
    for (const edge of outgoingEdges) {
      if (edge.relation === EdgeRelation.CALLS) {
        const callee = this.nodesById.get(edge.targetId);
        if (callee) callees.push(callee);
      }
    }

    // 4. Imports: IMPORTS_FROM edges originating from the file containing this entity
    const imports: GraphEdge[] = [];
    const fileEdges = this.edgesBySource.get(target.filePath) || [];
    for (const edge of fileEdges) {
      if (edge.relation === EdgeRelation.IMPORTS_FROM) {
        imports.push(edge);
      }
    }

    // 5. Related tests: nodes in test files whose name matches the target
    const relatedTests: GraphNode[] = [];
    const targetNameLower = target.name.toLowerCase();
    for (const node of this.nodesById.values()) {
      const fp = node.filePath.toLowerCase();
      if (
        (fp.includes('test/') || fp.includes('.test.') || fp.includes('.spec.')) &&
        node.name.toLowerCase().includes(targetNameLower) &&
        node.id !== nodeId
      ) {
        relatedTests.push(node);
      }
    }

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

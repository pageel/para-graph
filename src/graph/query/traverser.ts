import { AstStore } from '../store/AstStore.js';
import { NodeType, EdgeRelation } from '../models.js';
import type { GraphNode, GraphEdge, TraversalResult } from '../models.js';

// @para-doc [artifacts/specs/spec-2026-06-23-beam-search-traverser.md#csa-PruningConfig]
export interface PruningConfig {
  maxDepth: number;
  topologyBarrierThreshold: number;  // Stop deep traversal if node.fan_in > threshold
  semanticBarrierConcept?: string;   // Drop node if domainConcepts mismatch
  hop2Limit?: number;                // ACORN 2-hop max jump nodes
  beamWidth?: number;                // Max candidates to track per step (ef)
  utilityPatterns?: string[];        // Glob patterns to detect utility files
}

// @para-doc [artifacts/specs/spec-2026-06-23-beam-search-traverser.md#csa-ScoredNode]
export interface ScoredNode {
  node: GraphNode;
  score: number;
  hop: number;
  parentPath: string[];
  edge?: GraphEdge;
}

// @para-doc [artifacts/specs/spec-2026-06-23-beam-search-traverser.md#csa-SearchContext]
export interface SearchContext {
  nearest: ScoredNode[];    // min-heap tracking top-N best hits
  candidates: ScoredNode[]; // max-heap tracking active frontier
  visited: Set<string>;
}

/**
 * Simple glob matching using regex.
 * Supports standard wildcards: ** (recursive) and * (single level).
 */
// @para-doc [artifacts/specs/spec-2026-06-23-beam-search-traverser.md#csa-matchGlob]
function matchGlob(path: string, pattern: string): boolean {
  let regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex special chars
    .replace(/\?/g, '.');                 // glob ? to regex . FIRST!

  regexPattern = regexPattern
    .replace(/^\*\*\//g, '(?:.*\\/)?')  // **/ at start
    .replace(/\/\*\*$/g, '(?:\\/.*)?')  // /** at end
    .replace(/\/\*\*\//g, '(?:\\/.*)?\\/') // /**/ in middle
    .replace(/\*\*/g, '.*')
    .replace(/(?<!\.)\*/g, '[^/]*');

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(path);
}

/**
 * Calculate fan_in, fan_out, and degree of a node based on CALLS edges in AstStore.
 */
function getTopologyMetrics(store: AstStore, nodeId: string): { fanIn: number; fanOut: number; degree: number } {
  const incoming = (store as any).edgesByTarget.get(nodeId) || [];
  const outgoing = (store as any).edgesBySource.get(nodeId) || [];

  const fanIn = incoming.filter((e: any) => e.relation === EdgeRelation.CALLS).length;
  const fanOut = outgoing.filter((e: any) => e.relation === EdgeRelation.CALLS).length;
  const degree = fanIn + fanOut;

  return { fanIn, fanOut, degree };
}

/**
 * Heuristic Scorer for a candidate node.
 */
// @para-doc [artifacts/specs/spec-2026-06-23-beam-search-traverser.md#csa-scoreNode]
function scoreNode(
  node: GraphNode,
  edge: GraphEdge | undefined,
  seedNode: GraphNode,
  hop: number,
  weights = { w1: 0.5, w2: 0.3, w3: 0.2 }
): number {
  const hopScore = 1 / (hop + 1);

  let semanticCloseness = 0.5;
  if (node.semantic?.domainConcepts && seedNode.semantic?.domainConcepts && seedNode.semantic.domainConcepts.length > 0) {
    const common = node.semantic.domainConcepts.filter(c => seedNode.semantic?.domainConcepts?.includes(c));
    semanticCloseness = common.length / seedNode.semantic.domainConcepts.length;
  }

  let edgeConfidence = 1.0;
  if (edge) {
    if (edge.confidence === 'EXTRACTED') edgeConfidence = 1.0;
    else if (edge.confidence === 'INFERRED') edgeConfidence = 0.7;
    else if (edge.confidence === 'AMBIGUOUS') edgeConfidence = 0.3;
  }

  return weights.w1 * hopScore + weights.w2 * semanticCloseness + weights.w3 * edgeConfidence;
}

/**
 * Classify if a node is a Utility Node.
 */
// @para-doc [artifacts/specs/spec-2026-06-23-beam-search-traverser.md#csa-isUtilityNode]
function isUtilityNode(store: AstStore, node: GraphNode, config: PruningConfig): boolean {
  const patterns = config.utilityPatterns || ['**/utils/**', '**/helpers/**', '**/constants/**', '**/types.ts', '**/*.d.ts'];
  const matchesPattern = patterns.some(pattern => matchGlob(node.filePath, pattern));
  if (matchesPattern) return true;

  const metrics = getTopologyMetrics(store, node.id);
  if (metrics.fanIn > 15 && metrics.fanOut <= 2 && metrics.degree > 15) {
    return true;
  }

  return false;
}

// @para-doc [artifacts/specs/spec-2026-06-23-beam-search-traverser.md#csa-beam-search-traverser]
export class BeamSearchTraverser {
  private readonly store: AstStore;

  constructor(store: AstStore) {
    this.store = store;
  }

  /**
   * Traverse the graph using Heuristic Beam Search with ACORN 2-hop expansion.
   */
  public traverseBeam(
    nodeId: string,
    config: PruningConfig,
    direction: 'upstream' | 'downstream' | 'both' = 'downstream'
  ): TraversalResult {
    const seedNode = this.store.getNode(nodeId);
    if (!seedNode) {
      return { nodes: [], edges: [], paths: [] };
    }

    const maxDepth = Math.min(config.maxDepth, 5); // Hard cap max depth to 5
    const beamWidth = config.beamWidth || 10;
    const topologyBarrierThreshold = config.topologyBarrierThreshold;

    const visited = new Set<string>([nodeId]);
    const nearest: ScoredNode[] = [];
    const resultEdges = new Set<GraphEdge>();
    const resultPaths: string[][] = [];

    // Active frontier
    let candidates: ScoredNode[] = [
      { node: seedNode, score: 1.0, hop: 0, parentPath: [nodeId] }
    ];

    while (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      const activeCandidates = candidates.slice(0, beamWidth);
      candidates = [];

      for (const current of activeCandidates) {
        const currentHop = current.hop;
        if (currentHop >= maxDepth) continue;

        const currentId = current.node.id;

        // Topology Barrier: Stop deep traversal if God Node
        const metrics = getTopologyMetrics(this.store, currentId);
        if (currentHop > 0 && metrics.fanIn > topologyBarrierThreshold) {
          continue;
        }

        // Get neighbors based on direction
        const neighborEdges: GraphEdge[] = [];
        if (direction === 'upstream' || direction === 'both') {
          const incoming = (this.store as any).edgesByTarget.get(currentId) || [];
          neighborEdges.push(...incoming);
        }
        if (direction === 'downstream' || direction === 'both') {
          const outgoing = (this.store as any).edgesBySource.get(currentId) || [];
          neighborEdges.push(...outgoing);
        }

        for (const edge of neighborEdges) {
          const neighborId = edge.sourceId === currentId ? edge.targetId : edge.sourceId;
          if (visited.has(neighborId)) continue;

          const neighborNode = this.store.getNode(neighborId);
          if (!neighborNode) continue;

          const isUtil = isUtilityNode(this.store, neighborNode, config);

          if (isUtil) {
            // ACORN 2-hop Leap: bypass utility node
            visited.add(neighborId);

            const nextEdges: GraphEdge[] = [];
            if (direction === 'upstream' || direction === 'both') {
              const incoming = (this.store as any).edgesByTarget.get(neighborId) || [];
              nextEdges.push(...incoming);
            }
            if (direction === 'downstream' || direction === 'both') {
              const outgoing = (this.store as any).edgesBySource.get(neighborId) || [];
              nextEdges.push(...outgoing);
            }

            for (const nextEdge of nextEdges) {
              const nextNeighborId = nextEdge.sourceId === neighborId ? nextEdge.targetId : nextEdge.sourceId;
              if (visited.has(nextNeighborId)) continue;

              const nextNeighborNode = this.store.getNode(nextNeighborId);
              if (!nextNeighborNode) continue;

              const score = scoreNode(nextNeighborNode, nextEdge, seedNode, currentHop + 1);
              visited.add(nextNeighborId);

              const newPath = [...current.parentPath, nextNeighborId];
              const scoredNodeObj = {
                node: nextNeighborNode,
                score,
                hop: currentHop + 1,
                parentPath: newPath,
                edge: nextEdge
              };

              candidates.push(scoredNodeObj);
              nearest.push(scoredNodeObj);
              resultEdges.add(edge);
              resultEdges.add(nextEdge);
              resultPaths.push(newPath);
            }
          } else {
            // Normal Node
            const score = scoreNode(neighborNode, edge, seedNode, currentHop + 1);
            visited.add(neighborId);

            const newPath = [...current.parentPath, neighborId];
            const scoredNodeObj = {
              node: neighborNode,
              score,
              hop: currentHop + 1,
              parentPath: newPath,
              edge
            };

            candidates.push(scoredNodeObj);
            nearest.push(scoredNodeObj);
            resultEdges.add(edge);
            resultPaths.push(newPath);
          }
        }
      }

      // Maintain nearest sorted and apply beamWidth cap with tie-breaking
      if (nearest.length > 0) {
        nearest.sort((a, b) => b.score - a.score);
        if (nearest.length > beamWidth) {
          const thresholdScore = nearest[beamWidth - 1].score;
          while (nearest.length > beamWidth && nearest[nearest.length - 1].score < thresholdScore) {
            nearest.pop();
          }
        }
      }
    }

    // Sort final result
    nearest.sort((a, b) => b.score - a.score);

    return {
      nodes: nearest.map(sn => sn.node),
      edges: Array.from(resultEdges),
      paths: resultPaths
    };
  }
}

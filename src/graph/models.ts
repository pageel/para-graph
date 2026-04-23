/**
 * Graph Data Models for para-graph
 *
 * Defines the core types for representing code structure
 * as a directed graph of nodes and edges.
 */

// --- Enums ---

/** Type of code entity represented by a graph node */
export enum NodeType {
  FILE = 'file',
  CLASS = 'class',
  FUNCTION = 'function',
  INTERFACE = 'interface',
  VARIABLE = 'variable',
}

/** Type of relationship between two graph nodes */
export enum EdgeRelation {
  CALLS = 'CALLS',
  IMPORTS_FROM = 'IMPORTS_FROM',
  INHERITS = 'INHERITS',
  IMPLEMENTS = 'IMPLEMENTS',
}

/** Export visibility of a code entity */
export enum ExportType {
  NAMED = 'named',
  DEFAULT = 'default',
  NONE = 'none',
}

// --- Semantic Types (P2: Enrichment Schema) ---

/** Complexity classification for a code entity */
export type ComplexityLevel = 'low' | 'medium' | 'high';

/**
 * Semantic attributes added by Agent enrichment (via MCP tools).
 * These fields are OPTIONAL — a node without enrichment has `semantic: undefined`.
 */
export interface SemanticAttributes {
  /** Human-readable summary of what this code entity does */
  summary: string;
  /** Estimated complexity level */
  complexity: ComplexityLevel;
  /** Domain concepts this entity relates to (e.g., ["graph", "indexing"]) */
  domainConcepts: string[];
  /** ISO 8601 timestamp of when enrichment was performed */
  enrichedAt: string;
  /** Who performed the enrichment */
  enrichedBy: 'agent' | 'manual';
}

// --- Interfaces ---

/**
 * Represents a code entity (class, function, interface, etc.)
 * extracted from source code via Tree-sitter AST parsing.
 */
export interface GraphNode {
  /** Unique identifier — format: `{filePath}::{name}` */
  id: string;
  /** Type of code entity */
  type: NodeType;
  /** Name of the entity (class name, function name, etc.) */
  name: string;
  /** Relative file path from project root */
  filePath: string;
  /** Start line number (1-indexed) */
  startLine: number;
  /** End line number (1-indexed) */
  endLine: number;
  /** Export visibility */
  exportType: ExportType;
  /** Original declaration signature (first line) */
  signature: string;
  /** Semantic enrichment data — added by Agent via MCP, undefined if not enriched */
  semantic?: SemanticAttributes;
}

/**
 * Represents a directed relationship between two graph nodes.
 * For example: function A CALLS function B, or file X IMPORTS_FROM file Y.
 */
export interface GraphEdge {
  /** ID of the source node */
  sourceId: string;
  /** ID of the target node */
  targetId: string;
  /** Type of relationship */
  relation: EdgeRelation;
  /** File where the relationship originates */
  sourceFile: string;
  /** Line number where the relationship originates (1-indexed) */
  sourceLine: number;
}

// --- Query Types (P3: Query Engine) ---

/** Result of a graph search operation */
export interface SearchResult {
  /** Nodes that matched the query directly or were included in the result */
  nodes: GraphNode[];
  /** Edges connecting the nodes in the result */
  edges: GraphEdge[];
}

/** A local subgraph extracted around a specific node */
export interface Subgraph {
  /** The ID of the node from which the traversal started */
  centerNodeId: string;
  /** Maximum traversal depth used to extract this subgraph */
  depth: number;
  /** All nodes within the specified depth */
  nodes: GraphNode[];
  /** All edges connecting the nodes within the subgraph */
  edges: GraphEdge[];
}

// --- Traversal Types (P6: Impact & Context Queries) ---

/** Direction for graph traversal */
export type TraversalDirection = 'upstream' | 'downstream' | 'both';

/** Result of a reverse/forward BFS traversal from a target node */
export interface TraversalResult {
  /** All nodes discovered during traversal (excluding the start node) */
  nodes: GraphNode[];
  /** All edges traversed during the search */
  edges: GraphEdge[];
  /** Paths from start node to each discovered node (array of node ID chains) */
  paths: string[][];
}

/**
 * Comprehensive context bundle for a single code entity.
 * Gathered by reading the graph + source files to give an agent
 * full understanding of a component in one call.
 */
export interface ContextBundle {
  /** The target node being analyzed */
  target: GraphNode;
  /** Source code of the entity (read from file using startLine/endLine). Null if file not found (stale graph). */
  sourceCode: string | null;
  /** True if source code was truncated (entity exceeds 200 lines) */
  truncated: boolean;
  /** Nodes that call this entity (reverse CALLS edges) */
  callers: GraphNode[];
  /** Nodes that this entity calls (forward CALLS edges) */
  callees: GraphNode[];
  /** Import edges from the file containing this entity */
  imports: GraphEdge[];
  /** Test files/functions whose name matches this entity */
  relatedTests: GraphNode[];
  /** Warnings encountered during bundle assembly (e.g., file not found) */
  warnings: string[];
}

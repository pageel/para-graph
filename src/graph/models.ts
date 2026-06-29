/**
 * Graph Data Models for para-graph
 *
 * Defines the core types for representing code structure
 * as a directed graph of nodes and edges.
 */

// --- Enums ---

/** Type of code entity represented by a graph node */
// @para-doc [docs/references/schema.md#csa-data-schema]
export enum NodeType {
  FILE = 'file',
  CLASS = 'class',
  FUNCTION = 'function',
  INTERFACE = 'interface',
  VARIABLE = 'variable',
  SPEC_ANCHOR = 'spec_anchor',
}

/** Type of relationship between two graph nodes */
export enum EdgeRelation {
  CALLS = 'CALLS',
  IMPORTS_FROM = 'IMPORTS_FROM',
  INHERITS = 'INHERITS',
  IMPLEMENTS = 'IMPLEMENTS',
  DOCUMENTED_BY = 'DOCUMENTED_BY',
  DOCUMENTS = 'DOCUMENTS',
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
  summary?: string;
  /** Estimated complexity level */
  complexity?: ComplexityLevel;
  /** Domain concepts this entity relates to (e.g., ["graph", "indexing"]) */
  domainConcepts?: string[];
  /** ISO 8601 timestamp of when enrichment was performed */
  enrichedAt?: string;
  /** Who performed the enrichment */
  enrichedBy?: 'agent' | 'manual';
  /** 
   * Paths of doc files referencing this node, format: "docs/path.md#section-slug" 
   * @deprecated since v0.17.2. Use CSA <span> + DOCUMENTED_BY edges instead.
   */
  docAnchors?: string[];
  /** ISO 8601 timestamp — when node code changed since last enrichment */
  staleSince?: string | null;
  /** Spec metadata for anchoring lifecycle (v0.17.6.3) */
  specMeta?: SpecMetadata;
  /** Line number of the anchor in the spec file (v0.17.6.3) */
  line?: number;
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

// --- Edge Confidence (P8: Deep CALLS & Analytics) ---

/**
 * Confidence level of a graph edge, indicating how it was resolved.
 * - EXTRACTED: Deterministic, from Tree-sitter AST parsing
 * - INFERRED: Agent-injected via MCP graph_add_edges
 * - AMBIGUOUS: Partially resolved (e.g., ?unresolved prefix)
 */
export type EdgeConfidence = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS' | 'EXTERNAL';

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
  /** Confidence level — how this edge was resolved. Optional for backward compat. */
  confidence?: EdgeConfidence;
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
  /** Related memory slices (P11) */
  relatedMemory?: SemanticSlice[];
}

// --- Edge Injection Types (P7: Agentic Edge Resolution) ---

/**
 * Result of a batch edge injection operation.
 * Provides structured feedback so the Agent can self-correct invalid node IDs.
 */
export interface AddEdgesResult {
  /** Number of edges successfully added to the graph */
  added: number;
  /** Number of edges skipped due to deduplication */
  skipped: number;
  /** Errors for edges that could not be added (invalid node IDs) */
  errors: Array<{ sourceId: string; targetId: string; reason: string }>;
}

// --- Enrichment Tracking Types (P-Tracker: v0.11.1) ---

/**
 * Tracks enrichment progress across the graph.
 * Persisted to metadata.json so the Agent can resume enrichment
 * across sessions without re-scanning the full graph.
 */
export interface EnrichmentStats {
  /** Total number of unique nodes that have been enriched */
  totalEnriched: number;
  /** ISO 8601 timestamp of the last enrichment operation */
  lastEnrichedAt: string | null;
  /** IDs of the 5 most recently enriched nodes (newest first) */
  recentNodes: string[];
  /** Number of core nodes (non-file, non-test) that have been enriched */
  coreEnriched?: number;
  /** Number of extra nodes (file, test) that have been enriched */
  extraEnriched?: number;
}

/**
 * Helper to identify test files or fixtures.
 * Windows path safety included.
 */
export function isTestNode(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    normalized.startsWith('test/') ||
    normalized.includes('/fixtures/') ||
    normalized.startsWith('fixtures/') ||
    normalized.includes('.test.') ||
    normalized.endsWith('.test.ts') ||
    normalized.endsWith('.test.sh')
  );
}

/**
 * Typed schema for `.beads/graph/metadata.json`.
 * Previously untyped — now formalized to ensure Exporter/Importer consistency.
 */
export interface GraphMetadata {
  /** Version of para-graph that generated this graph */
  version: string;
  /** ISO 8601 timestamp of when the graph was built/last updated */
  generatedAt: string;
  /** Total number of nodes in the graph */
  nodeCount: number;
  /** Total number of edges in the graph */
  edgeCount: number;
  /** Number of unique source files parsed */
  fileCount: number;
  /** Name of the project this graph belongs to */
  projectName: string;
  /** Number of nodes that can be enriched (excluding file nodes) */
  enrichableNodeCount?: number;
  /** Enrichment progress tracking — undefined if no enrichment has occurred */
  enrichment?: EnrichmentStats;
  /** Overall health score based on resolution and enrichment weights */
  healthScore?: number;
  /** Edge resolution statistics */
  resolution?: {
    totalEdges: number;
    resolvedEdges: number;
    unresolvedEdges: number;
    externalEdges?: number;
    resolutionRate: number;
  };
}

// --- Memory Engine Types (P11: Compact Memory) ---

/** Type of memory event */
export type MemoryEventKind = 'conversation' | 'tool_use' | 'decision' | 'observation' | 'error';

/** Raw event pushed from the agent session */
export interface MemoryEvent {
  /** Unique event ID */
  id: string;
  /** Category of event */
  kind: string;
  /** Session or run ID where this event occurred */
  sessionId: string;
  /** Summary or content of the event */
  content: string;
  /** Additional structured data */
  metadata?: Record<string, any>;
  /** ISO timestamp */
  timestamp: string;
  /** Importance weight (1.0 default) */
  weight?: number;
  /** Soft delete flag */
  archived?: boolean;
}

/** A semantically clustered slice of memory */
export interface SemanticSlice {
  /** Unique slice ID */
  id: string;
  /** High-level topic (e.g., "Auth refactor") */
  topic: string;
  /** Detailed summary of the events in this slice */
  summary: string;
  /** IDs of graph nodes related to this slice */
  nodeIds: string[];
  /** IDs of raw events that form this slice */
  eventIds: string[];
  /** ISO timestamp */
  createdAt: string;
}

/** A snapshot of project metrics at a point in time (D4) */
export interface ProjectSnapshot {
  /** Unique snapshot ID (crypto.randomUUID) */
  id: string;
  /** Project name */
  projectName: string;
  /** Unix timestamp ms */
  timestamp: number;
  /** Number of nodes */
  nodesCount: number;
  /** Number of edges */
  edgesCount: number;
  /** Number of unresolved nodes */
  unresolvedCount: number;
}

/** Profile of a highly connected node (God Node) */
export interface GodNodeProfile {
  id: string;
  name: string;
  type: string;
  filePath: string;
  degree: number;
  fanIn: number;
  fanOut: number;
  enriched: boolean;
}

// --- Project Intelligence Types (P5: Project Insights) ---

export interface ProjectInsight {
  id: string;
  category: 'lesson' | 'risk' | 'decision' | 'pattern' | 'gotcha';
  domain: string;          // e.g., 'path-handling', 'memory', 'parser', 'mcp'
  title: string;
  description: string;
  sourceType: 'brainstorm' | 'qa' | 'bugfix' | 'plan' | 'research' | 'resource' | 'session';
  sourceSession?: string;
  relatedNodeIds?: string[];
  relatedFiles?: string[];
  confidence: 'hypothesis' | 'validated' | 'deprecated';
  validatedAt?: string;
  createdAt: number;
  updatedAt: number;
}

// --- RRF Score Fusion Types (P2: RRF Search) ---

// @para-doc [artifacts/specs/spec-2026-06-18-rrf-multiseed.md#csa-RrfConfig]
/** Configuration options for Reciprocal Rank Fusion (RRF) */
export interface RrfConfig {
  /** Smoothing constant to prevent rank inflation (default: 60) */
  k: number;
}

/** Result structure for an item fused via RRF */
// @para-doc [artifacts/specs/spec-2026-06-18-rrf-multiseed.md#csa-FusedResult]
export interface FusedResult<T> {
  /** The original item being ranked */
  item: T;
  /** The final fused RRF score */
  score: number;
  /** The original 0-indexed ranks of this item across input lists (-1 if not present) */
  ranks: number[];
}
// --- CSA Compliance & Tiered Audit Types (v0.17.2) ---

export interface CsaCalibration {
  exclude_folders?: string[];
  weights?: {
    critical?: number;
    medium?: number;
    low?: number;
    god_node_degree_threshold?: number;
  };
}

/** Configuration options for Tiered CSA audit */
export interface CsaConfig {
  specThreshold: number;     // e.g. 90 (Hard Gate)
  docThreshold: number;      // e.g. 50 (Soft Gate)
  docGate: 'soft' | 'hard' | 'off'; // default: 'soft'
  doubleBinding?: boolean;   // default: true. If false, skips double-binding check.
  calibration?: CsaCalibration;
}

// --- Session Telemetry Types (v0.17.6) ---

// @para-doc [#csa-db-session-telemetry]
export interface SessionTelemetryData {
  id: string;
  projectName: string;
  conversationId: string;
  modelUsed?: string;
  workflow?: string;
  toolCallsTotal: number;
  toolCallsBreakdown: Record<string, number>;
  filesReadCount: number;
  filesReadList: string[];
  filesChangedCount: number;
  filesChangedList: string[];
  tokenEstimateInput: number;
  tokenEstimateOutput: number;
  frictionCount: number;
  frictionDetails: Array<{
    type: string;
    message: string;
    timestamp: number;
  }>;
  durationSeconds?: number;
  capturedAt: number;
}

// @para-doc [#csa-db-session-telemetry]
export interface SessionTelemetryRow {
  id: string;
  project_name: string;
  conversation_id: string;
  model_used?: string;
  workflow?: string;
  tool_calls_total: number;
  tool_calls_breakdown: string; // JSON string of Record<string, number>
  files_read_count: number;
  files_read_list: string; // JSON string of string[]
  files_changed_count: number;
  files_changed_list: string; // JSON string of string[]
  token_estimate_input: number;
  token_estimate_output: number;
  friction_count: number;
  friction_details: string; // JSON string of friction detail objects
  duration_seconds?: number;
  captured_at: number;
}

/** Details about coverage within a single tier (Spec or Doc) */
export interface CsaCoverageDetails {
  totalAnchors: number;
  coveredAnchors: number;
  coverageRate: number;
  threshold: number;
  gate: 'hard' | 'soft' | 'off';
  pass: boolean;
}

/** Complete result of a tiered CSA audit */
export interface CsaTieredResult {
  projectName: string;
  config: CsaConfig;
  specCoverage: CsaCoverageDetails;
  docCoverage: CsaCoverageDetails;
  combinedHealth: number;    // Weighted health score (spec/doc average)
}

// --- Spec Lifecycle Metadata & CSA Events Types (v0.17.6.3) ---

// @para-doc [#csa-spec-lifecycle-metadata]
export interface SpecMetadata {
  deprecated?: boolean;
  deprecatedBy?: string;
  renamedFrom?: string;
  anchorPrefix?: string;
}

export type CsaEventKind = 'coverage_snapshot' | 'binding_added' | 'binding_removed' | 'spec_lifecycle';

export interface CsaCoverageSnapshotEventDetails {
  coverageRate: number;
  specCoverage: {
    totalAnchors: number;
    coveredAnchors: number;
    coverageRate: number;
  };
  docCoverage: {
    totalAnchors: number;
    coveredAnchors: number;
    coverageRate: number;
  };
  combinedHealth: number;
}

export interface CsaBindingAddedEventDetails {
  entityId: string;
  anchorId: string;
  filePath: string;
}

export interface CsaBindingRemovedEventDetails {
  entityId: string;
  anchorId: string;
  filePath: string;
}

export interface CsaSpecLifecycleEventDetails {
  action: 'deprecated' | 'renamed' | 'created';
  metadata: SpecMetadata;
}

export type CsaEventDetails = 
  | CsaCoverageSnapshotEventDetails
  | CsaBindingAddedEventDetails
  | CsaBindingRemovedEventDetails
  | CsaSpecLifecycleEventDetails;

// @para-doc [#csa-logging-history]
export interface CsaEvent {
  id?: number;
  timestamp?: string; // ISO 8601
  eventType: CsaEventKind;
  targetId: string | null;
  details: CsaEventDetails;
  sessionId?: string | null;
}

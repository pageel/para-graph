# PARA Graph Core Architecture

The `para-graph` tool generates a hybrid structure containing both structural code AST nodes (generated via Tree-sitter) and semantic data nodes (linked via LLM enrichment).

## Database & Graph Layout

The graph database is stored in a PARA project directory under `.beads/graph/`:

- `entities.jsonl`: Line-delimited JSON of all graph nodes (for simple JSON parsing).
- `relations.jsonl`: Line-delimited JSON of all graph edges.
- `<project-name>.db`: SQLite database optimized for relational queries, FTS5 searching, MCP tools performance, memory storage, project insights, CSA audit tracking, and file tree snapshots.
- `metadata.json`: Graph statistics, enrichment progress, health score, and edge resolution metrics.

## Node Schema (`GraphNode`)

Nodes represent code entities and files. Key fields:
- `id`: Unique identifier — format: `{filePath}::{name}` (e.g., `src/graph/CodeGraph.ts::CodeGraph`)
- `name`: Human-readable entity name.
- `type`: One of `file`, `class`, `function`, `interface`, `variable`, `spec_anchor`.
- `filePath`: Relative file path from project root.
- `startLine` / `endLine`: Source location (1-indexed).
- `exportType`: `named`, `default`, or `none`.
- `signature`: Original declaration signature (first line).
- `semantic?`: Optional `SemanticAttributes` — populated by Agent enrichment via MCP `graph_enrich`.

## SemanticAttributes

Added by Agent via `graph_enrich` MCP tool. Fields:
- `summary`: Human-readable description of what the entity does.
- `complexity`: `low` | `medium` | `high`.
- `domainConcepts`: Array of domain tags (e.g., `["graph", "indexing"]`).
- `enrichedAt`: ISO 8601 timestamp.
- `enrichedBy`: `agent` | `manual`.
- `docAnchors?`: Array of doc file paths referencing this node (populated by `graph_link_docs`), format: `docs/path.md#section-slug`.
- `staleSince?`: ISO timestamp when node code changed since last enrichment.

## Edge Schema (`GraphEdge`)

Edges represent directed relationships between two nodes:
- `sourceId` / `targetId`: Node IDs.
- `relation`: One of `CALLS`, `IMPORTS_FROM`, `INHERITS`, `IMPLEMENTS`, `DOCUMENTED_BY`.
- `sourceFile` / `sourceLine`: Where the relationship originates.
- `confidence?`: `EXTRACTED` (from AST), `INFERRED` (Agent-injected), `AMBIGUOUS`, or `EXTERNAL`.

## Two Traceability Mechanisms

### 1. CSA Double-Binding (Spec↔Code)
- **Direction**: Bidirectional.
- **Code side**: `// @para-doc [specs/spec.md#anchor]` comments in source.
- **Spec side**: `<span id="csa-...">` HTML anchors in spec files.
- **Audited by**: `graph_audit_csa` MCP tool.
- **Self-healed by**: `graph_fix_csa` MCP tool (uses Git rename + fuzzy matching).

### 2. Graph Doc-Anchoring (Docs→Code)
- **Direction**: Unidirectional (Docs reference Code, Code does not need to know about Docs).
- **Doc side**: `<!-- @graph-node: nodeId -->` HTML comments in doc files.
- **Code side**: `docAnchors[]` field in `SemanticAttributes`.
- **Established by**: `graph_link_docs` MCP tool.
- **Tracked in**: `## Graph Traceability` section in `docs/README.md`.

## Memory & Insights (SQLite-backed)

- **Memory Events**: Raw session events stored via `memory_push`, searchable via FTS5 (`memory_search`), clustered into `SemanticSlice` via `memory_curate`.
- **Project Insights**: Durable lessons/risks/decisions/patterns/gotchas stored via `insight_push`, lifecycle-managed via `insight_validate` (hypothesis → validated → deprecated).

## L2 File Structure (Project Safety)

- **Snapshots**: `project_snapshot` records the full directory tree and metadata to SQLite.
- **Diff**: `project_diff` compares two snapshots to detect physical drift (added/removed/modified files).
- **Protected Files**: `project_protected_files` manages a watchlist of critical files (`project.md`, `.agents/rules.md`, etc.) and alerts on deletion or unauthorized modification.
- **Compaction**: `project_session_compact` scans active session files (rules, skills, and project contract) and writes a compacted markdown summary to `vibecode_session/artifacts/session.md` for context recovery.

## Search & Context Retrieval Engines

- **RRF Score Fusion**: Combines search results from FTS5 keyword query matching and substring LIKE similarity matching (e.g. for `graph_query`, `memory_search`, `insight_search`) using Reciprocal Rank Fusion (RRF) (default $k=60$).
- **Multi-seed Context Retrieval**: Upgrades `getContextBundle` to accept multiple seed nodes (arrays of node IDs). Gathers callers, callees, imports, tests from all seeds, deduplicates them, and trims to a hard cap of 20 nodes per seed and 50 nodes globally using topological distance pruning.

# PARA Graph Core Architecture

The `para-graph` tool generates a hybrid structure containing both structural code AST nodes (generated via Tree-sitter) and semantic data nodes (linked via LLM enrichment).

## Database & Graph Layout

The graph database is stored in a PARA project directory under `.beads/graph/`:

- `entities.jsonl`: Line-delimited JSON of all graph nodes (for simple JSON parsing).
- `relations.jsonl`: Line-delimited JSON of all graph edges.
- `<project-name>.db`: SQLite database optimized for relational queries, FTS5 searching, MCP tools performance, memory storage, project insights, CSA audit tracking, and file tree snapshots.
- `metadata.json`: Graph statistics, enrichment progress, health score, and edge resolution metrics.

### SQLite Round-trip Integrity Guard

To prevent field drift between the JSONL flat files and the SQLite relational database, the graph engine enforces a strict round-trip field integrity guard:
- **Field Manifest Parity**: Validates that all fields declared in the active codebase schema match the SQLite table columns (using `PRAGMA table_info`).
- **Null Safety**: Ensures that missing or optional fields in nodes/edges are gracefully written as database `NULL` values and read back correctly.
- **Case Conversion**: Automatically maps property cases between JSONL (which may contain mixed casing e.g. `file_path` or `filePath`) and the SQLite store to ensure field consistency.
- **Round-trip Integration Tests**: Verified via `:memory:` SQLite tests (`sqlite-roundtrip.test.ts`) validating `insertNode` / `persistGraph` -> `getAllNodes` behavior.

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
- `docAnchors?`: Array of doc file paths referencing this node (Deprecated since v0.17.2 — use CSA double-binding instead), format: `docs/path.md#section-slug`.
- `staleSince?`: ISO timestamp when node code changed since last enrichment.

## Edge Schema (`GraphEdge`)

Edges represent directed relationships between two nodes:
- `sourceId` / `targetId`: Node IDs.
- `relation`: One of `CALLS`, `IMPORTS_FROM`, `INHERITS`, `IMPLEMENTS`, `DOCUMENTED_BY`, `DOCUMENTS`.
- `sourceFile` / `sourceLine`: Where the relationship originates.
- `confidence?`: `EXTRACTED` (from AST), `INFERRED` (Agent-injected), `AMBIGUOUS`, or `EXTERNAL`.

## Unified CSA Traceability (v0.17.2+ & v0.17.6.4+)

Since v0.17.2 and expanded in v0.17.6.4, the documentation and specification systems are unified under the **Transitive CSA Double-Binding** mechanism:

- **Transitive Model (Hub-and-Spoke)**: 
  - `Spec Anchor` acts as the single source of truth/hub.
  - `Code Node` points to `Spec Anchor` via `DOCUMENTED_BY` relationship (marked by `// @para-doc [#csa-anchor-id]` in code).
  - `Doc File` points to `Spec Anchor` via `DOCUMENTS` relationship (declared by `<span data-csa-inherits="csa-anchor-id"></span>` in documentation markdown).
  - Code and Docs are resolved transitively; there is no direct link between Code and Docs.
- **Unified Anchor Syntax**: `<span id="csa-xxx">` defines the Spec Anchor. Docs inherit/document it using `data-csa-inherits="csa-xxx"`.
- **Tiered Compliance Gating**:
  - **Tier 1: Specs (Hard Gate)**: Targets `artifacts/specs/`. Blocks release if below threshold (default 100%).
  - **Tier 2: Docs (Configurable Gate)**: Targets `docs/`. Configurable threshold (default 50%) and gate (`soft` warning, `hard` block, `off` bypass).
- **Audit & Self-Healing**:
  - **Audit**: `graph_audit_csa` MCP tool and `para-graph audit csa` CLI command check coverage for both specs and docs based on the configured gating.
  - **Fix**: `graph_fix_csa` MCP tool applies automated rename resolution to correct drifted comments.
- **Deprecated components**: `<!-- @graph-node -->` comments, `docAnchors[]` attribute, `graph_link_docs` tool, and `para-graph link` CLI command.

## Memory & Insights (SQLite-backed)

- **Memory Events**: Raw session events stored via `memory_push`, searchable via FTS5 (`memory_search`), clustered into `SemanticSlice` via `memory_curate`.
- **Project Insights**: Durable lessons/risks/decisions/patterns/gotchas stored via `insight_push`, lifecycle-managed via `insight_validate` (hypothesis → validated → deprecated).

## L2 File Structure (Project Safety)

- **Snapshots**: `project_snapshot` records the full directory tree and metadata to SQLite.
- **Diff**: `project_diff` compares two snapshots to detect physical drift (added/removed/modified files).
- **Protected Files**: `project_protected_files` manages a watchlist of critical files (`project.md`, `.agents/rules.md`, etc.) and alerts on deletion or unauthorized modification.
- **Compaction**: `project_session_compact` scans active session files (rules, skills, and project contract) and writes a compacted markdown summary to `para_vibecode_session/artifacts/session.md` for context recovery.

## Junk Governance

The Junk Governance subsystem manages physical repository drift by scanning, auditing, and cleaning untracked or ignored physical junk files:
- **Profile-Driven Scanning**: `junk-profile-loader.ts` resolves language/environment junk profiles (e.g., `typescript-node`) containing glob match patterns.
- **Prefix Path Resolution**: `junk-auditor.ts` compiles these patterns using Picomatch. It includes specific enhancements for directory-level prefix matching (e.g., matching trailing slashes like `output/` against nested subpaths) to prevent sub-item leaks.
- **Three-Tier Classification**: Junk files are classified into three tiers for controlled teardown safety:
  - **Tier 1 (Safe)**: Temporary build artifacts or generated files that are completely safe to auto-delete.
  - **Tier 2 (Prompt)**: Untracked configuration edits or logs that might contain local state, prompting the user before removal.
  - **Tier 3 (Report)**: Critical files or sensitive items that are never auto-deleted but reported as configuration anomalies.

## Session Telemetry

The Session Telemetry subsystem logs runtime agent metrics and performs trend analysis for workspace optimization:
- **SQLite Storage**: The `session_telemetry` table in `<project-name>.db` stores telemetry events tracking total token consumption (input/output), session duration, execution step counts, error counts, and modified files.
- **Data Model**: Managed via the type-safe `SessionTelemetryData` interface.
- **Trend Analyzer**: `TelemetryAnalyzer` parses historical logs to generate usage trends, pinpointing high-cost operations, recurring errors, or high-churn file directories.

## Search & Context Retrieval Engines

- **RRF Score Fusion**: Combines search results from FTS5 keyword query matching and substring LIKE similarity matching (e.g. for `graph_query`, `memory_search`, `insight_search`) using Reciprocal Rank Fusion (RRF) (default $k=60$).
- **Multi-seed Context Retrieval**: Upgrades `getContextBundle` to accept multiple seed nodes (arrays of node IDs). Gathers callers, callees, imports, tests from all seeds, deduplicates them, and trims to a hard cap of 20 nodes per seed and 50 nodes globally using topological distance pruning.
- **Beam Search Traverser**: Implements heuristic-guided Beam Search traversal in `BeamSearchTraverser` with dynamic candidate pruning (`beamWidth` support) and early termination barriers (such as `topologyBarrierThreshold` and `semanticBarrierConcept`).
- **ACORN 2-hop Leap**: Bypasses utility helper nodes (detected via path glob patterns or topology metrics) while preserving path linkages during traversal.

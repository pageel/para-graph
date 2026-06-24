# PARA Graph MCP Tools Guide

The `para-graph` MCP server registers **23 tools** across 6 functional domains. AI Agents use these tools to query, enrich, analyze, and govern codebase structures.

## Domain 1: Graph Core (9 tools)

### 1. `graph_query`
- **Purpose**: Search and filter graph nodes by type and name pattern.
- **Key Params**: `projectName`, `nodeType?`, `namePattern?`

### 2. `graph_edges`
- **Purpose**: Get all edges (incoming/outgoing) connected to a specific node.
- **Key Params**: `projectName`, `nodeId`

### 3. `graph_enrich`
- **Purpose**: Write semantic enrichment data (summary, complexity, domain concepts, docAnchors) to a graph node.
- **Key Params**: `projectName`, `nodeId`, `semantic` (object)

### 4. `graph_impact_analysis`
- **Purpose**: Analyze the impact of changing a code entity — returns all upstream/downstream affected nodes via BFS traversal.
- **Key Params**: `projectName`, `nodeId`, `direction?` (upstream/downstream/both)

### 5. `graph_context_bundle`
- **Purpose**: Get a comprehensive context bundle for a code entity — includes source code, callers, callees, imports, related tests, and memory slices.
- **Key Params**: `projectName`, `nodeId` (supports multi-seed via array)

### 6. `graph_add_edges`
- **Purpose**: Batch inject edges (CALLS, IMPORTS_FROM) into the graph — for agentic edge resolution of languages with weak AST linking (e.g., Bash).
- **Key Params**: `projectName`, `edges[]` (sourceId, targetId, relation)

### 7. `graph_link_docs` (Deprecated)
- **Purpose**: [DEPRECATED] Link graph nodes to documentation sections. Establishes doc↔code traceability via `docAnchors` in `SemanticAttributes`. Call after `/docs new` or `/docs update`.
- **Key Params**: `projectName`, `links[]` (nodeId, docPath as `docs/path.md#section-slug`)
- **Note**: This tool is deprecated since v0.17.2 and will be removed in v0.19.0. Use Unified CSA (Specs & Docs) instead.
- **Legacy Note**: Uses unidirectional anchoring (Docs→Code). Different from CSA Double-Binding which is bidirectional (Code↔Spec).

### 8. `graph_god_nodes`
- **Purpose**: Get the most connected (God) nodes in the graph — helps Agent prioritize which nodes to enrich first.
- **Key Params**: `projectName`, `topN?`

### 9. `graph_expand_node`
- **Purpose**: Get only the source code for a specific node (lightweight alternative to `graph_context_bundle`).
- **Key Params**: `projectName`, `nodeId`

## Domain 2: Memory Engine (3 tools)

### 10. `memory_push`
- **Purpose**: Push a memory event (conversation, tool_use, decision, observation, error) to the project MemoryStore (SQLite).
- **Key Params**: `projectName`, `kind`, `content`, `sessionId`, `metadata?`

### 11. `memory_search`
- **Purpose**: Search for memory events by keyword using FTS5 full-text search.
- **Key Params**: `projectName`, `query`, `limit?`

### 12. `memory_curate`
- **Purpose**: Curate raw memory events into semantic slices — clusters related events into topic-based summaries linked to graph nodes.
- **Key Params**: `projectName`, `topic`, `summary`, `eventIds[]`, `nodeIds[]`

## Domain 3: Project Insights (3 tools)

### 13. `insight_push`
- **Purpose**: Push a project insight (lesson, risk, decision, pattern, gotcha) to durable SQLite storage.
- **Key Params**: `projectName`, `category`, `domain`, `title`, `description`, `sourceType`

### 14. `insight_search`
- **Purpose**: Search project insights with FTS5 and filter by category or domain.
- **Key Params**: `projectName`, `query?`, `category?`, `domain?`

### 15. `insight_validate`
- **Purpose**: Update the confidence lifecycle of a project insight (hypothesis → validated → deprecated).
- **Key Params**: `projectName`, `insightId`, `confidence`

## Domain 4: CSA Governance (2 tools)

### 16. `graph_audit_csa`
- **Purpose**: Run Convergent Specification Architecture (CSA) compliance audit. Checks bidirectional traceability between anchors (`<span id="csa-...">`) and code comments (`// @para-doc`).
- **Key Params**: `projectName`
- **Note**: Reports tiered coverage metrics (Tier 1 Specs: hard gate, Tier 2 Docs: soft/hard/off gate) based on `csa:` configuration in `project.md`.

### 17. `graph_fix_csa`
- **Purpose**: Run CSA self-healing fix for dangling spec references. Uses Git rename history and fuzzy matching to auto-replace drifted `// @para-doc` comments in code files.
- **Key Params**: `projectName`

## Domain 5: Project Safety — L2 File Structure (4 tools)

### 18. `project_snapshot`
- **Purpose**: Take a snapshot of the project directory structure, record file tree metadata to SQLite, and verify protected files. Also detects untracked/ignored physical junk files if requested.
- **Key Params**: `projectName`, `auditJunk?` (boolean, triggers Junk Audit scan via git CLI allowlist)

### 19. `project_diff`
- **Purpose**: Compare two project snapshots to identify added, removed, and modified files (physical drift detection).
- **Key Params**: `projectName`, `sourceSnapshotId`, `targetSnapshotId`

### 20. `project_protected_files`
- **Purpose**: List, add, or remove protected files for a project (core file integrity watchlist).
- **Key Params**: `projectName`, `action` (list/add/remove), `filePath?`

### 21. `project_session_compact`
- **Purpose**: Scan rules, skills, and project contract, then write a compacted markdown context summary to `para_vibecode_session/artifacts/session.md` for context recovery.
- **Key Params**: `projectName`

## Domain 6: Project State Cache (2 tools)

### 22. `project_state_get`
- **Purpose**: Get cached project metadata and task counts from SQLite. Checks freshness against configuration files via MD5 hashes.
- **Key Params**: `projectName`

### 23. `project_state_sync`
- **Purpose**: Sync and cache project metadata and task counts from config files (`project.md`, `backlog.md`, `sprint-current.md`) into SQLite database.
- **Key Params**: `projectName`

## Unified CSA Traceability (v0.17.2+)

Since v0.17.2, the two legacy doc-code systems have been merged into a single **Unified CSA** mechanism:

- **Unified Anchor Syntax**: `<span id="csa-xxx">` in Specs (`artifacts/specs/`) or Docs (`docs/`) bound to `// @para-doc [#xxx]` in code.
- **Tiered Compliance Gating**:
  - **Tier 1: Specs (Hard Gate)**: Targets `artifacts/specs/`. Blocks release if below threshold (default 90%).
  - **Tier 2: Docs (Configurable Gate)**: Targets `docs/`. Configurable threshold (default 50%) and gate (`soft` warning, `hard` block, `off` bypass).
- **Deprecated components**: `<!-- @graph-node -->` comments, `docAnchors[]` attribute, `graph_link_docs` tool, and `para-graph link` CLI command.

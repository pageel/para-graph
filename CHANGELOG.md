# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.17.6.4] - 2026-06-29

### Added
- **Transitive CSA Resolution** — Upgraded the graph database and audit engine to support transitive resolution (`Code Node` --[DOCUMENTED_BY]--> `Doc File` --[DOCUMENTS]--> `Spec Anchor`).
- **Dangling Inherits Detection** — Implemented CLI audit logic to scan and report inherits references in markdown documentation pointing to non-existent Spec IDs.
- **Ellipses Filter for Examples** — Configured `csa-parser` to ignore example/mock inherits IDs containing ellipses (`...`) to prevent false-positive dangling warnings.
- **Double-Binding Compliance** — Documented and bound all 95 Spec anchors, successfully passing the 100% hard gate coverage.

## [0.17.6.3] - 2026-06-26

### Added
- **Reverse Spec Generation** — Implemented code-to-spec reverse adoption flow allowing AI Agent to analyze modules, present entity triage blueprints, and output standard specification files containing CSA anchors.
- **Spec Lifecycle Metadata** — Added blockquote metadata parser extracting `deprecated`, `deprecated-by`, `renamed-from`, and `anchor-prefix` fields to control active spec lifecycle.
- **Spec Candidates MCP Tool** — Created `graph_spec_candidates` MCP tool providing read-only intelligence briefs, weight-tier classification, and unique candidate anchor suggestions (`suggestedAnchorId`) preventing collision.
- **Self-Healing Extension** — Extended `graph_fix_csa` tool with `suggest-missing` mode inserting code comment backlinks and `dangling` mode auto-redirecting broken links using `Deprecated-By` rules.
- **Double-Binding CSA Mapping** — Mapped and bound all 29 spec anchor IDs to logical source code declarations, successfully passing the 100% Spec Coverage audit gate.

## [0.17.6.2] - 2026-06-26

### Added
- **Installed Structure Documentation** — Documented the installed app directory structure and integration across the workspace (Core Engine, CLI wrapper, Agent Intelligence, and Knowledge Items) in public `README.md` and `vi-VN.md` translations.

### Fixed
- **Prefix Path Matching** — Fixed directory-level prefix matching in `compilePatterns` (handling trailing slashes like `output/` against subpaths) to prevent sub-item leaks in Junk Governance.
- **Teardown Deadlocks** — Resolved Vitest afterEach hangs by closing SQLite connections immediately instead of waiting for 5s deferred close timer, and tracked all instantiated ProjectGraph objects for guaranteed cleanup.
- **KI Templates Drift** — Updated, synchronized, and verified KI Templates (`para_graph_architecture`, `para_graph_mcp_tools`, `para_graph_workflows`) to include required schema fields (version and para_version) and match the actual v0.17.6 codebase.

## [0.17.6.1] - 2026-06-25

### Added
- **Profile-Driven Junk Governance** — Built profile loading, configuration merging, and pattern classification logic supporting auto-detected markers (Astro, TypeScript, CF Workers, Python, PHP) or explicit project override.
- **Junk Classification Report** — Enhanced `project_snapshot` MCP tool to return a detailed `junkReport` dividing files into 3 safety tiers: Tier 1 (Safe to delete), Tier 2 (Prompt for confirmation), and Tier 3 (Report only), while maintaining backward compatibility with `junkFiles`.

### Fixed
- **QA Checklist & Guidelines** — Updated workspace-level QA Review Templates to enforce KI template synchronization and GitHub Release evaluation gates, avoiding knowledge and artifact distribution drift.

## [0.17.6] - 2026-06-25

### Added
- **Session Telemetry DDL & Models (L4)** — Added SQLite table `session_telemetry` and indexes to store AI Agent workspace usage telemetry (model used, workflow, tool calls, files read/changed, token estimates, duration, and friction/ma sát).
- **Session Telemetry MCP Tools** — Implemented two new MCP tools: `session_telemetry_push` (stores active session statistics) and `session_telemetry_query` (retrieves historical logs and outputs agent trend reports).
- **Agent Trend Analyzer Algorithm** — Implemented mathematical trend calculation for tool calls and friction counts, using split-half average comparison with percentage delta thresholds (+/-10%) across historical telemetry.
- **Double Binding Configuration Gate** — Added support for `double_binding` configuration flag (mapped from `project.md:double_binding`) to run CSA audits. If set to `false`, the compliance gate skips requiring code comment links and calculates scores based on document anchor existence alone.
- **Dynamic HTML Renderer Resolution** — Refactored the dashboard and graph HTML renderer scripts (`render.js`) to build document-to-code traceability maps dynamically from `entities.jsonl` and `relations.jsonl` files instead of reading the deprecated `docAnchors` semantic property.
- **Interactive Double-Binding UI Toggle** — Added a dynamic UI toggle checkbox on the Docs Quality Dashboard to turn on/off code comment verification, recalculating scores on the client side and completely hiding/showing the `Code ➔ Docs (Cmt)` column dynamically.

## [0.17.5] - 2026-06-24

### Added
- **Project State Cache (L3)** — Implemented cache storage for project configuration status (project.md, backlog.md, sprint-current.md, roadmap.md) in SQLite table `project_state` to optimize I/O and token costs.
- **State Cache Freshness Protocol** — Integrated file hash comparison (MD5-based) to detect stale configurations instead of relying only on mtime, preventing false cache invalidations.
- **Junk Audit Tool Integration** — Built a new utility module `junk-auditor.ts` executing safe Git CLI commands (`execFileSync`) with defensive path sanitization, cross-platform path compatibility, and robust fallback error handling.
- **Automatic Snapshot Junk Auditing** — Added flag `auditJunk: true` to MCP tool `project_snapshot` to automatically alert users about untracked junk files in the workspace.
- **SQLite Windows Lock Safeguard** — Configured Database busy connection timeout of 10s (`{ timeout: 10000 }`) in `sqlite-manager.ts` to automatically queue and retry transactions, resolving SQLITE_BUSY locking conflicts.

## [0.17.4] - 2026-06-24

### Added
- **Unified CSA Codebase-to-SQLite ID Resolution** — Upgraded `tree-sitter-parser.ts` to support both short-form `@para-doc [csa-anchor]` comments and long-form `@para-doc [file.md#csa-anchor]` comment links. Resolved them dynamically via spec_anchor nodes in SQLite.
- **Unified CSA Calibration Settings** — Integrated `csa.calibration` configuration in `project.md` (defining directory exclusions and custom node weights) to sync CLI audit gates and Web Dashboard calculation logic.
- **Dangling CSA Links Highlighting & Filtering** — Added visual warning cues (red color, alert icons, detailed tooltips) for dangling comments in the Dashboard. Added interactive filtering (click to filter dangling links) and a dedicated filter bar button.
- **AI Task Prompts for Dangling Links** — Integrated warning context into single-entity AI review prompts and created a new batch action "🚨 Sửa lỗi neo mồ côi (Fix Dangling CSA)" in the Dashboard.

### Deprecated
- **Manual Doc-Linking CLI & Tool** — Completely disabled the deprecated `link` CLI command and `graph_link_docs` MCP tool, raising warning/deprecation errors to prevent obsolete usage.

## [0.17.3] - 2026-06-23

### Added
- **Beam Search Traverser** — Implemented heuristic-guided Beam Search in `BeamSearchTraverser` with dynamic candidate pruning (`beamWidth` support) and early termination barriers.
- **ACORN 2-hop Leap** — Integrated automatic utility node detection (via path patterns or topology metrics) to bypass helper nodes while preserving path linkages.
- **Backward Compatibility** — Maintained legacy BFS traversal in `AstStore.traverseReverse` by default, executing Beam Search only when explicit pruning configurations are provided.

### Fixed
- **CSA Multiple Anchors Per Line** — Resolved a Regex parsing limitation in `csa-parser.ts` by replacing `if` logic with a `while` loop, ensuring multiple anchors on a single line are successfully extracted.

## [0.17.2.3] - 2026-06-23

### Added
- **Platform Harness Gates** — Injected Section 7 "Platform Harness Guards" (Checkpoint Gate, Roadmap Sync Gate) directly into the MCP `project_session_compact` tool output, preventing agent execution from bypassing crucial decision checkpoints.

### Fixed
- **BUG-11 Snapshot Exclusions** — Resolved overly broad snapshot behavior by restricting folder exclusions (`.beads`, `artifacts`, `sessions`, `docs`) to the project level only, allowing temporary beads directories within the `repo/` subdirectory to be properly tracked.
- **BUG-12 CSA Regex Case-Sensitivity** — Upgraded Regex patterns in both `csa-parser.ts` and `render.js` to support uppercase letters, colons, dots, and slashes in path-scoped anchors.
- **CSA Anchor Ellipsis Bug** — Upgraded the parser logic to ignore placeholder anchors (e.g. `csa-...`) used in specification examples, preventing duplicate ID errors.
- **Vitest CLI Routing Test** — Wrapped the `audit csa` routing test in a try-catch block to handle non-zero exit codes gracefully when project spec coverage is below the threshold.

## [0.17.2] - 2026-06-19

### Added
- **Tiered CSA Compliance Auditing** — Refactored `runCsaAudit()` in `sqlite-manager.ts` and the `graph_audit_csa` MCP tool to separate spec-anchors (hard gate, default 90% threshold) from doc-anchors (soft/hard/off gate, default 50% threshold), configurable via `csa` block in `project.md`.
- **Expanded CSA Spec Scanner** — Updated `build.ts` to scan `artifacts/specs/` directories for spec anchors, resolving the gap where actual specs were ignored by the audit tool.
- **Auto-Sync Knowledge Items** — Integrated automatic `ki sync` execution into the `post_install()` hook of `install-hooks.sh` to seamlessly distribute updated domain templates to the IDE agent context during tool upgrades.

### Deprecated
- **Manual Doc-Anchoring Tool** — Deprecated `graph_link_docs` MCP tool, `docAnchors` property in `SemanticAttributes`, and `@graph-node` comment markers in favor of the unified CSA `<span>` + `@para-doc` syntax. Added console warnings to `graph_link_docs` and `link.ts` CLI.
- **Migration Script** — Added `scripts/migrate-graph-node-to-csa.sh` to automate the transition from `@graph-node` comment tags to CSA anchor spans.

## [0.17.1] - 2026-06-19

### Added
- **Session Context Compaction** — Implemented the `project_session_compact` MCP tool to scan, compact, and write active session rules, skills, and project guidelines into `vibecode_session/artifacts/session.md` for context recovery.
- **Multi-seed Context Retrieval** — Upgraded `getContextBundle` to support multi-seed arrays of node IDs. Performs independent AST resolution, merges results, deduplicates nodes, and applies topological distance pruning (capping at 20 nodes per seed and 50 nodes globally).
- **RRF Score Fusion & Hybrid Search** — Integrated Reciprocal Rank Fusion (RRF) algorithm to merge results from FTS5 keyword matches and substring LIKE similarity matching for `graph_query`, `memory_search`, and `insight_search` tools.

### Fixed
- **SQLite Search Filtering** — Resolved search filtering mismatch in `insight_search` and `memory_search` by applying query-keyword filtering (LIKE clause) to the secondary category-weighted search channel before RRF ranking.
- **SQLite Delegation Mock Tests** — Updated vitest suite to handle dual-channel SQLite calls in `MemoryStore.test.ts`.

## [0.17.0] - 2026-06-17

### Added
- **Atomic File Structure Snapshots** — Integrated directory-level snapshotting and version comparison in SQLite. Added `project_snapshot`, `project_diff`, and `project_protected_files` MCP tools.
- **File Structure CLI Commands** — Added `project-snapshot` and `project-diff` CLI commands for manual structural tracking and verification.

## [0.16.3] - 2026-06-17

### Added
- **Performance Benchmark Suite** — Created a modular benchmark runner (`npm run benchmark`) using `tsx` to measure L1 AST parsing throughput (files/sec), SQLite database write speed (nodes/sec, edges/sec), and MCP tool search latencies (`graph_query`, `graph_context_bundle`).
- **Native KI CLI Distribution** — Implemented the `para-graph ki sync` CLI command and registered it in the CLI router, which automatically syncs the 3 new domain-driven knowledge templates (`para_graph_architecture`, `para_graph_mcp_tools`, `para_graph_workflows`) to user local AI agent stores.

### Fixed
- **SQLite Schema Robustness** — Extended Vitest suite with regression tests simulating legacy database structures to verify that `initSchema()` auto-repairs obsolete schema drifts (such as target_id foreign key constraints) on disk without data loss.

## [0.16.2] - 2026-06-16

### Added
- **CSA Spec-Intelligence Native Integration** — Native parser for HTML spec anchors (`<span id="csa-..."></span>`) in Markdown specs/plans and `@para-doc` comments in source code, generating `SPEC_ANCHOR` nodes and `DOCUMENTED_BY` edges.
- **SQLite-backed CSA Compliance Auditing** — Introduced `para-graph audit csa` CLI command and `graph_audit_csa` MCP tool to calculate coverage and detect dangling spec links with direct SQLite queries. Auto-logs failures as `risk` insights in SQLite DB.
- **Self-Healing Engine** — Added `para-graph fix csa` CLI command (with `--auto` and `--dry-run`) and `graph_fix_csa` MCP tool to repair broken spec references using Git Rename history (`git log -S`) and Levenshtein distance fuzzy matching (threshold <= 3).
- **Project Insights Core & FTS5 Dedup** — Added `insight_validate` MCP tool to manage confidence lifecycle, and integrated FTS5 virtual table search during `insight_push` to prevent redundant insights (>0.8 score similarity).

### Changed
- **Skill Direction Semantics** — Updated `para-graph` skill template to v2.5.0, adding explicit Direction Semantics documentation and a case study to prevent "Blast Radius" vs "Transitive Impact" confusion during LLM-driven graph enrichment.
- **Global CSA Skill Deprecation** — Updated global workspace CSA skill to deprecate the old shell `audit.js` in favor of native `para-graph audit csa`.

## [0.16.1] - 2026-05-28

### Added
- **Core & Extra Metrics Separation** — Split enrichment tracking into `coreEnriched` (non-file, non-test nodes) and `extraEnriched` (file/test nodes) to prevent `healthScore` from exceeding 100%.
- **Zero Denominator Boundary Handling** — Handled empty/test-only project states gracefully by defaulting `enrichmentRate` to 1.0 when no core enrichable nodes exist.

### Fixed
- **Cross-Platform Test Path Matching** — Normalized backslashes to forward slashes in `isTestNode` helper to ensure accurate path matching on Windows.
- **AstStore Semantic Merging** — Replaced direct overwrite with a merge strategy in `AstStore.enrichNode()` to prevent losing `docAnchors` attributes.
- **ProjectGraph Metadata Alignment** — Synced `ProjectGraph.getMetadata()` with `CodeGraph` logic for consistent metrics calculation.

## [0.16.0] - 2026-05-28

### Added
- **Markdown Anchor Linking** — Added `graph_link_docs` MCP tool to link markdown documentation anchors (`<!-- @graph-node: nodeId -->`) to code graph nodes.
- **Project Insights Storage** — Introduced durable `project_insights` SQLite table, FTS5 virtual table, and triggers for managing lessons, risks, decisions, and patterns. Exposed via `insight_push` and `insight_search` MCP tools.
- **Unified Semantic Layer** — Extended `SemanticAttributes` interface in `models.ts` with `docAnchors` (array of linked markdown paths) and `staleSince` (timestamp when node/docs became out-of-sync).

### Changed
- **Staleness Detection Pipeline** — Upgraded the build pipeline to calculate code signature hashes (3-field comparison: signature, startLine, endLine) and automatically flag stale nodes/anchors when code drifts.
- **Re-Enrichment Reset** — Configured `enrichNode()` to clear `staleSince` and preserve docAnchors when updating semantic details.
- **linkDocs Auto-Init Semantic** — `linkDocs()` now auto-initializes `semantic: {}` for non-enriched nodes instead of skipping them. Guarantees 100% doc-anchor linking success regardless of enrichment status.
- **SemanticAttributes Optional Fields** — All enrichment fields (`summary`, `complexity`, `domainConcepts`, `enrichedAt`, `enrichedBy`) are now optional. Nodes can have minimal semantic data (e.g., only `docAnchors`) without requiring full enrichment.

## [0.15.8] - 2026-05-26

### Added
- **EXTERNAL Edge Confidence** — Introduced `EXTERNAL` confidence level to `EdgeConfidence` type union (models.ts) to clearly distinguish between external npm package dependencies and unresolved internal workspace references.
- **SQLite Compiler Diagnostics** — Added step-by-step instructions to `install-hooks.sh` to guide the setup of OS build tools when Node < 22 falls back to compiled `better-sqlite3` and fails.

### Changed
- **Workflow path simplification** — Removed dynamic dev mode check, defaulting to the installed production CLI path for consistency (BUG-10 brainstorm).
- **Metrics Refinement** — Filtered out test and fixture files/directories from `enrichableNodeCount` and excluded `EXTERNAL` edges from `unresolvedEdges` to improve the accuracy of the overall `healthScore`.

### Fixed
- **Node Path Resolution** — Source node-resolver script in hook execution logic for NVM/fnm path detection (BUG-10).
- **Security Vulnerability (Path Traversal)** — Sanitized project name input in `pathResolver.ts` by validating with `isProjectName` and checking resource sub-paths, blocking traversal attempts (e.g. `..`).
- **Windows Path Separation** — Normalized AST file paths to use forward slashes (`/`) consistently, resolving path mismatches when calculating metrics on Windows.

## [0.15.7] - 2026-05-19

### Added
- **Lang-Profiles Sidecar Architecture** — Framework-aware edge resolution via `references/lang-profiles/` in the para-graph skill. Agent loads matching lang-profile (e.g., `react-typescript.md`) based on project framework signals before injecting missing edges.
- **React/TypeScript Profile** — Prototype covering 5 binding patterns: Custom Hook Destructuring, useState SKIP, useContext Consumer, JSX Component Rendering, HOC wrappers. Based on real-world analysis of app-tinycrm.
- **SKILL.md §2 Step 5b** — Routing table for framework detection → lang-profile loading with fallback to generic edge injection.

### Fixed
- **Edge Deduplication** — `CodeGraph.addEdge()` now checks `sourceId + targetId + relation` before insert, preventing duplicate edges that inflate fan-in/fan-out metrics.
- **INFERRED Edge Preservation** — Build pipeline preserves agent-injected edges (`confidence: 'INFERRED'`) across rebuilds with node existence guard. `--clean` flag correctly bypasses preservation.

### Tests
- Add `test/build-reinject.test.ts` — 5 test cases: T1-T3 INFERRED edge preservation (BUG-08), T4-T5 addEdge deduplication.

## [0.15.6] - 2026-05-18

### Fixed
- `ProjectGraph.getMetadata()`: Add missing `resolution` block — was never included in this class, causing `metadata.json` to always omit resolution data after `graph_enrich` calls (root cause)
- `GraphStore.saveMetadata()`: Implement merge-safe write — preserve existing `resolution` from disk when in-memory edges are empty (LRU cache eviction cold-start scenario)
- `GraphStore.saveMetadata()`: Fix stale version fallback from hardcoded `'0.15.4'` to `'unknown'`

### Tests
- Add `test/graph/store/saveMetadata.test.ts` — TDD-verified: RED→GREEN cycle, 2 test cases

## [0.15.5] - 2026-05-18

### Fixed
- **Edge Resolution Metrics** — Fixed `unresolvedEdges` count in metadata. Now correctly includes edges marked with `AMBIGUOUS` confidence alongside explicit `?unresolved` prefixes, ensuring accurate graph health reporting.

## [0.15.4] - 2026-05-18
- feat: implement weighted healthScore based on resolutionRate and enrichmentRate
- fix: wrap sqlite migrations in try-catch to prevent crashes on fresh schema init
- refactor: formalize GraphMetadata schema and standardize memory events

## [0.15.3] - 2026-05-18

### Fixed
- **Memory Store Reorganization** — Moved memory logs to `.beads/graph/memory-log.md` instead of project root, and updated `open.md` workflow fallback logic.
- **God Nodes Integration** — Implemented God Nodes cache via SQLite `GraphStore` and build-time invalidation.

## [0.15.2] - 2026-05-14

### Changed
- **Freshness-Aware Memory** — Memory extraction migration and caching.

## [0.15.1] - 2026-05-13

### Fixed
- **Dynamic SQLite Installation** — Moved `better-sqlite3` to `devDependencies` to prevent unnecessary native compilation (node-gyp) during standard package installation on modern Node versions.
- **Install Hook Fallback** — Added dynamic install hook for Node < 22 to automatically fetch the native SQLite fallback dependency.

## [0.15.0] - 2026-05-13

### Added
- **SQLite Dual-Backend Adapter** — Implemented an Adapter Pattern in `load-sqlite.cjs` to dynamically resolve between native `node:sqlite` (Node 22.5+) and `better-sqlite3` (Node 18/20), completely eliminating native compilation friction (`node-gyp`) during installation for modern Node environments.
- **Transaction Polyfill** — Provided an API-compatible `db.transaction()` polyfill for the native `node:sqlite` backend to ensure downstream repositories (like `GraphStore`) function seamlessly without modification.

## [0.14.0] - 2026-05-13

### Changed
- **Storage Engine Migration** — Migrated the graph persistence backend from JSONL to SQLite (`better-sqlite3`), introducing `SqliteManager` and `SqliteGraphRepository`.
- **FTS5 Search** — Replaced regex-based memory search with SQLite FTS5 for significantly faster, scalable semantic retrieval. 
- **Atomic Operations** — Upgraded JSONL legacy writes to use atomic `.tmp` renames and transaction-based imports to ensure data integrity during system faults.
- **Auto-Conversion** — `GraphStore` now seamlessly auto-converts legacy `entities.jsonl` data to SQLite in the background using `setImmediate`.
- **Dual-Write Threshold** — Added a 5,000-node limit to JSONL dual-writes; large graphs will now strictly rely on SQLite to reduce disk I/O.
- **Refactoring** — Removed redundant in-memory array scanning and logic in `ProjectGraph.getContextBundle()` in favor of direct repository calls.

## [0.13.3] - 2026-05-12

### Fixed
- **Deployment Tarball Dependencies** — Fixed `ERR_MODULE_NOT_FOUND` bug on production servers. `install-hooks.sh` `post_install()` now automatically runs `npm install --omit=dev` to fetch required Node.js dependencies (`tree-sitter`, `@modelcontextprotocol/sdk`).
- **Deterministic Release** — Updated `release:pack` to bundle `package-lock.json` in the tarball to ensure reproducible production installs.

## [0.13.2] - 2026-05-12

### Added
- `graph_expand_node`: Added `incomplete: true` flag and hint for source code <= 1 line.
- `graph_god_nodes`: Now exposes `enrichableNodeCount` and `totalInGraph` for clarity.
- `metadata.json`: Now includes `enrichableNodeCount` stat.

### Fixed
- AST bounds resolution: Changed tree-sitter coordinate extraction to use wrapper block start/end instead of entity name tags, preventing function/class body truncation.
- `getContextBundle`: Now excludes test fixtures from callees by default.

## [0.13.1] - 2026-05-11

### Changed
- **Default Graph Persistence** — `para-graph build` now implicitly preserves existing graph metadata (semantic enrichment) without requiring the `--import` flag. This prevents accidental data loss (BUG-03).
- **Clean Mode** — Replaced `--import` with `--clean` flag. Use `--clean` to explicitly wipe the existing graph and perform a hard reset.
- **Project Name Propagation** — Fixed `projectName` displaying as `unknown` in `metadata.json`. The CLI now correctly extracts and passes the project name to the JSONL exporter.

## [0.13.0] - 2026-05-11

### Added
- **Compact Memory Engine** — Integrated `MemoryStore` mapping generic entities (e.g., memory chunks) to `.beads/graph/memory-slices.jsonl`.
- **CurationWorker** — Implemented heuristic clustering algorithms (`para-graph mem`) for semantic memory consolidation.
- **MCP Tools for Memory** — Added `memory_curate` and `memory_summary` resource endpoints for intelligent memory retrieval.
- **Developer DX** — Added `dev:test-install` script to streamline decoupled environment testing directly with `para install-tool --local`.

### Changed
- **PHP SCM Upgrades** — Added support for deep method chaining (`$obj->a()->b()`) and object instantiation patterns.
- **Go SCM Upgrades** — Added support for method selector expressions and struct initializers.
- **Install Hooks Strategy** — Unified `post_install()` developer testing to rely purely on Git-synced templates. No template overriding is allowed during `--local` install, preventing "Dogfooding Traps".

## [0.12.0] - 2026-05-09

### Changed
- **Decoupled Intelligence Distribution** — Tarball no longer bundles `templates/` directory. AI Intelligence (workflows, skills, rules) is now fetched on-demand from GitHub via `post_install()` hook or `./para install-tool para-graph --sync`.
- **`install-hooks.sh` auto-sync** — `post_install()` detects missing templates and attempts `fetch_templates_from_git()` automatically during installation. Falls back gracefully when offline.
- **`package.json` `files` array** — Removed `"templates/"` from npm pack scope to align with decoupled distribution.

### Notes
- During `--update` install, initial `⚠️ Source not found` warnings from `install_agents` are expected (templates absent in tarball). The `post_install()` hook immediately re-installs agents correctly from GitHub.
- `tool.manifest.yml` still declares the `agents:` block — it serves as the declaration for `--sync` to know what to fetch.
- Users can update AI Intelligence independently via `./para install-tool para-graph --sync` without waiting for a new engine release.

## [0.11.1] - 2026-05-07

### Added
- **Enrichment Tracker (P-Tracker)** — `EnrichmentStats` interface tracks `totalEnriched`, `lastEnrichedAt`, `recentNodes` (max 5). Persisted to `metadata.json` for cross-session resume.
- **`enrichNode()` method** — Encapsulates semantic update + stats tracking with deduplication. Re-enriching an existing node does NOT double-count.
- **`graph_god_nodes` MCP tool** — Returns top-N most connected (God) nodes sorted by degree. Supports `unenrichedOnly` filter to prioritize enrichment candidates.
- **Enrichment Audit Logger** — Auto-appends enrichment records to `.beads/graph/enrichment-log.md` in Markdown table format. Sanitizes `|` and `\n` characters.
- **Typed `GraphMetadata`** — Formalized `metadata.json` schema with `version`, `generatedAt`, `projectName`, and optional `enrichment` block.

### Changed
- `graph_enrich` now calls `GraphStore.saveGraph()` after enrichment (prevents data loss on RAM-only state).
- `GraphStore` loads/restores `enrichmentStats` from `metadata.json` on graph initialization (backward compatible).
- `graph_enrich` response now includes `enrichmentStats` for Agent awareness.

## [0.11.0] - 2026-05-07

### Added
- **EdgeResolver** — Post-build resolution engine resolves bare `targetId` to full entity IDs (4-level priority chain: same-file → import-hint → unique-name → ambiguous)
- Built-in globals skip list for JS/TS (console, JSON, Math, this, super, etc.)

### Fixed
- CALLS edges now use enclosing function/class scope as `sourceId` instead of file path
- `detectGodNodes()`, `fanIn()`, `fanOut()` now return meaningful results

## [0.10.1] - 2026-05-06
### Fixed
- **Hotfix:** Fixed a critical bug in the hook injection template where `~/.gemini/settings.json` schemas for `gemini-cli@0.41+` expect an object for `hooks` (`{"beforeTool": []}`) instead of an array. The CLI `hooks install` command now correctly handles the schema object structure.

## [0.10.0] - 2026-05-06

### Added
- **Agent Auto-trigger (Hook Injection)** — `para-graph hooks install` injects a BeforeTool hook into `~/.gemini/settings.json` that nudges the AI Agent to use Knowledge Graph MCP tools before file scanning.
- **CLI Hooks Subcommand** — `para-graph hooks [install|uninstall|status]` with idempotent state tracking via `.para/tools/graph/hooks/state.json`.
- **Automatic Backup** — Settings backup stored in `.para/tools/graph/hooks/backups/` before any modification. Restore on uninstall.
- **Build Lock Reset** — `para-graph build` automatically resets the `.gemini_reminded` lock file after graph rebuild, ensuring fresh nudges.
- **Workspace Guard** — Hooks command requires PARA workspace context (`.para-workspace.yml`).

## [0.9.0] - 2026-05-06

### Added
- **Deep CALLS Capture** — Member call edges (`obj.method()`) with object+method pairing via Tree-sitter SSEC patterns. Supports direct member (`obj.method()`), nested member (`this.obj.method()`), and constructor calls (`new ClassName()`).
- **Edge Confidence Schema** — `confidence` field on `GraphEdge` interface (`EXTRACTED` | `INFERRED` | `AMBIGUOUS`). All Tree-sitter edges auto-tagged `EXTRACTED`. Agent-injected edges get `INFERRED`.
- **Topology Calculator** — `fanIn()`, `fanOut()`, `getTopologyProfile()` methods on `CodeGraph` for runtime role heuristics (controller/service/utility/leaf).
- **God Nodes Detection** — `detectGodNodes(topN)` identifies most-connected real entities, filtering synthetic file nodes and `?unresolved` edges. Inspired by Graphify (Clean Room).
- **Python Deep CALLS** — Upgraded Python attribute calls from target-only to object+method captures. Added nested attribute call pattern.

## [0.8.6] - 2026-05-05

### Added
- **Additive Manifest Schema** — `shipped_in` and `min_engine_version` fields for Engine-Aligned Versioning. Backward-compatible with existing parsers.
- **Install Hooks** (`install-hooks.sh`) — `pre_install()`/`post_install()` lifecycle hooks for decoupled tool updates. Tools control their own validation logic.

## [0.8.5] - 2026-05-04

### Added
- **Universal Para-Injector** (`para-graph inject`) — Scans Markdown files for Graph bindings (`graph_nodes`, `impact_nodes`) and automatically injects graph context, blast radius risks, and auto-harnessing guards.

## [0.8.4] - 2026-05-04

### Added
- Centralized Graph Intelligence Router (§3) for PARA sidecar skills
- Graceful Fallback (Source-Only Mode) for environments without graph
- Workflow Integration Snippets for `/plan`, `/docs`, `/brainstorm`, `/spec`

## [0.8.3] - 2026-04-29

### Fixed
- **Parser** — Bypass tree-sitter chunking limit for large files by dynamically allocating bufferSize.

## [0.8.2] - 2026-04-29

### Added
- **Cross-Platform Path Resolution** — Dynamically resolve workspace root and CLI paths (`.para-workspace.yml` lookup) to support both dev and installed modes across OS (Windows/Linux/Mac).
- **`@resources/` Namespace** — MCP Server and `GraphStore` now transparently support cross-repository graph resolution for external references.
- **CLI Project Shorthand** — Support `para-graph build <project-name>` to automatically find paths without manually specifying `target-dir`.
- **Serve Auto-Detect** — `para-graph serve` without arguments now auto-detects workspace root.

## [0.8.1] - 2026-04-28

### Added
- `mcp:` block in `tool.manifest.yml` — Manifest-Declared MCP config. Enables automatic IDE setup via PARA Workspace `mcp-setup` command.

## [0.8.0] - 2026-04-28

### Added
- `agents:` block in `tool.manifest.yml` — declares bundled AI intelligence (workflows, skills, rules)
- `templates/agents/` directory — ships workflow `/para-graph` (v1.8.0), skill `graph-enrichment` (v1.0.0), rule `graph-first-policy` (v1.0.0) with tarball
- Manifest-Declared Intelligence architecture for PARA Workspace tool distribution

## [0.7.0] - 2026-04-24

### Added
- **Agentic Bash Edge Resolution** — Moved complex Bash link resolution (dynamic sourcing/imports) to Agent space.
- **`graph_add_edges` MCP tool** — Allows AI agents to batch inject missing `CALLS` and `IMPORTS_FROM` relationships directly into the graph.
- **Atomic Persistence** — `GraphStore.saveRelations()` implemented to persist agent-injected edges directly to `relations.jsonl`.
- `AddEdgesResult` model for structured injection feedback.

## [0.6.0] - 2026-04-23

### Added
- **Graph Traversal Engine** — BFS traversal with upstream/downstream/both direction support, cycle detection, and configurable depth (max 5, hardcap 100 nodes).
- **`graph_impact_analysis` MCP tool** — Analyze the impact of changing a code entity: returns all affected nodes, files, and dependency paths.
- **`graph_context_bundle` MCP tool** — Get comprehensive context for a code entity in one call: source code, callers, callees, imports, and related tests.
- `TraversalResult`, `ContextBundle`, `TraversalDirection` types in models.
- Unit tests for traversal and context bundle (12 new tests).

## [0.5.0] - 2026-04-23

### Added
- Multi-language support: Python, Bash, Go, PHP, TS, TSX via Tree-sitter.
- Language Registry pattern (`src/parser/registry.ts`) for lazy-loading parser bindings.
- S-Expression Semantic Entity Convention (SSEC) standard for query files.

### Changed
- Refactored parsing engine to Pure Query-based Architecture.
- Replaced imperative AST walk logic with declarative Tree-sitter Queries.
- Build command scans for all supported language extensions automatically.

## [0.4.0] - 2026-04-22

### Added
- Subcommand CLI router: `para-graph build`, `para-graph serve`
- NPM package configuration: `bin`, `exports`, `files`
- Source maps and declaration maps for debugging
- README banner image aligned with PARA ecosystem standards
- CHANGELOG.md

### Changed
- Refactored monolithic `index.ts` into modular `cli.ts` + `commands/`
- MCP server (`mcp/server.ts`) no longer self-executes — pure library export

## [0.3.0] - 2026-04-21

### Added
- Global Workspace Server with LRU cache (GraphStore)
- MCP Server with query, edges, and enrich tools
- JSONL import/export with semantic data preservation (`--import` flag)

## [0.2.0] - 2026-04-21

### Added
- Semantic enrichment via MCP tools (summary, complexity, domainConcepts)
- `graph_enrich` tool for LLM-driven metadata writing

## [0.1.0] - 2026-04-21

### Added
- Initial structural code analysis with Tree-sitter
- TypeScript AST parsing (classes, functions, interfaces, variables)
- Edge detection (imports, calls, contains)
- JSONL output format (entities.jsonl, relations.jsonl, metadata.json)

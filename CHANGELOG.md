# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

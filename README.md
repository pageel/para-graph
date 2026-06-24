<div align="center">
  <img src="./docs/assets/para-graph-banner.png" alt="Para-Graph Banner" width="100%">
  <br/>
  
  <h1>para-graph 🧠</h1>

  <p><b>Structural code analysis tool powered by Tree-sitter AST parsing.</b></p>

  <p>
    <a href="README.md"><b>🇺🇸 English</b></a> •
    <a href="docs/locales/vi-VN.md"><b>🇻🇳 Tiếng Việt</b></a>
  </p>

  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
    <img src="https://img.shields.io/badge/version-0.17.5-brightgreen.svg" alt="Version 0.17.5">
    <img src="https://img.shields.io/badge/Node-%3E%3D18-green.svg" alt="Node >= 18">
    <img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript 5.x">
  </p>
</div>

<br/>

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Output Format](#output-format)
- [Architecture](#architecture)
- [Development](#development)
- [Roadmap](#roadmap)
- [License](#license)

## 🎯 Overview

**para-graph** is a deterministic code analysis tool that extracts structural information from multi-language codebases and produces a knowledge graph in JSONL format.

It uses [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) for fast, accurate AST parsing — no compiler pipeline required. The output graph captures:

- **Entities** — classes, functions, interfaces, arrow functions, methods
- **Relationships** — imports, function calls, inheritance (future)

Part of the [PARA Workspace](https://github.com/pageel/para-workspace) ecosystem.

## 🛠 Requirements / Tech Stack

- **Node.js** >= 18.0.0
- **TypeScript** 5.x
- **Tree-sitter** (native bindings compiled automatically via `node-gyp-build`)

## ✨ Features

- **Multi-Language Support** — TypeScript, TSX, Python 🐍, Bash 🐚, Go 🐹, PHP 🐘
- **Deep CALLS Capture** — Extracts member call chains, object+method pairs, and constructors
- **Topological Edge Confidence** — Edge classification (`EXTRACTED`, `INFERRED`, `AMBIGUOUS`)
- **God Nodes Detection** — Runtime degree analytics (`fanIn`/`fanOut`) with SQLite caching to identify architectural choke points
- **Deterministic parsing** — Tree-sitter AST & Pure SSEC Queries, no LLM heuristics
- **JSONL & SQLite Dual-Backend** — Robust storage with FTS5 semantic search and fast cold starts
- **Global Workspace Server** — Serve multiple project graphs simultaneously via MCP
- **Semantic Enrichment** — Agent-driven context tagging (summary, complexity, domain concepts)
- **Compact Memory** — Architectural logs consolidated in `.beads/graph/` for context retention
- **Fast In-Memory Query Engine** — Indexed lookups with LRU cache (Max=3 projects)
- **Impact Analysis** — BFS traversal to find all affected nodes when changing a code entity
- **Context Bundle** — Get source code, callers, callees, imports, and tests in one MCP call
- **Agentic Edge Resolution** — Inject missing relationships (e.g., dynamic Bash imports) directly via MCP
- **MCP Auto-Setup** — Manifest-declared `mcp:` block enables automatic IDE configuration via `./para mcp-setup`
- **Agent Auto-trigger Hooks** — BeforeTool hooks that nudge the AI Agent to use Knowledge Graph before file scanning
- **Atomic File Structure Snapshots (v0.17.0+)** — Captures project directory tree snapshots, hashing files (sha256) into SQLite for version tracking.
- **Protected Files Guard (v0.17.0+)** — Manages protected files list and alerts if any critical files are missing during snapshot verification.
- **Session Context Compaction (v0.17.1+)** — Scans and compacts active session rules, skills, and project contract, writing a summary to `vibecode_session/artifacts/session.md` for context recovery.
- **RRF Hybrid Search Scorer (v0.17.1+)** — Integrates Reciprocal Rank Fusion (RRF) to merge FTS5 keyword results and LIKE similarity matches.
- **Multi-seed Context Retrieval (v0.17.1+)** — Gathers comprehensive context from multiple seed node IDs with topological distance capping (20 per seed, 50 globally).

## 🚀 Quick Start

> **Prerequisite:** Make sure you have Node.js (>= 18.0.0) and `npm` installed on your system.
> *Notice: `better-sqlite3` is dynamically installed during setup only for Node < 22 environments to skip native compilation on modern Node versions.*

```bash
# Clone
git clone https://github.com/pageel/para-graph.git
cd para-graph

# Install
npm install

# Build
npm run build

# Scan a project by name (auto-detects paths)
npx para-graph build my-project
```

Or run directly without cloning:

```bash
npx para-graph build ./src ./output
```

## 📖 Usage

### CLI Commands

```bash
# Scan by project name (auto-detect workspace)
para-graph build <project-name>

# Scan source code and export graph (manual paths)
para-graph build <target-dir> [output-dir] [--clean]

# Inject Graph Data & Validate Drift in Markdown Docs/Plans
para-graph inject <target-dir>

# Take a snapshot of the project directory structure
para-graph project-snapshot <project-name>

# Compare two project snapshots
para-graph project-diff <project-name> <src-snap-id> <tgt-snap-id>

# Start MCP server for AI Agent integration
para-graph serve [workspace-root]

# Manage BeforeTool hooks
para-graph hooks install
para-graph hooks uninstall
para-graph hooks status

# Show help
para-graph --help
```

### Hooks Command

The `hooks` command manages BeforeTool hooks that automatically nudge your AI Agent to use the Knowledge Graph instead of scanning files blindly.

```bash
# Install hook into ~/.gemini/settings.json
para-graph hooks install

# Check current hook status
para-graph hooks status

# Remove hook and restore original settings
para-graph hooks uninstall
```

**How it works:**
1. `para-graph build` generates the Knowledge Graph
2. `para-graph hooks install` injects a BeforeTool hook into Gemini CLI settings
3. On the next file access, the Agent receives a context nudge: _"Knowledge Graph is available — use MCP tools first"_
4. A lock file prevents repeated nudging in the same session
5. `para-graph build` automatically resets the lock after graph updates

### Build Command

```bash
# Basic usage
para-graph build my-project                  # Shorthand (recommended)
para-graph build ./src                       # Output to ./output/
para-graph build ./src ./my-graph            # Custom output directory
para-graph build ./src ./out --clean        # Wipe existing graph, scan from scratch
```

| Argument | Required | Default | Description |
|:--|:--|:--|:--|
| `project-name` | ✅ (or target-dir) | — | Name of project in workspace (auto-resolves repo/ and .beads/graph/) |
| `target-dir` | ✅ (or project-name)| — | Directory containing supported source files |
| `output-dir` | — | `./output` | Where to write the graph output |
| `--clean` | — | — | Do not load existing graph, overwrite and scan from scratch |

### Serve Command

```bash
# Start MCP server (stdio transport)
para-graph serve /path/to/workspace

# Or let it auto-detect the workspace root (if inside one)
para-graph serve
```

## 🧠 Graph Enrichment Strategy (The 20% Rule)

**para-graph** supports AI-driven semantic enrichment, but you should **NOT** enrich 100% of the graph nodes. We strictly recommend the **20% Rule (Compact Memory Rule)**:

1. **Focus on God Nodes**: Only enrich the top 10-20% of structural nodes that orchestrate logic (high degree/fan-in/fan-out) and core domain entities.
2. **Signal-to-Noise Ratio**: Simple getters, setters, utilities, and test fixtures should rely entirely on Tree-sitter AST and their names. Enriching them bloats the context window and wastes tokens.
3. **Semantic Drift Protection**: By only enriching core architectural hubs (which change less frequently), you reduce the maintenance burden of keeping semantic summaries synced with the source code.
4. **Graph-based Inference**: The AI can naturally infer the purpose of small utility functions by observing the `CALLS` edges connected to a well-enriched God Node.

> **💡 Best Practice:** When using the `/para-graph` workflow's `compact` action, the system is hardcoded to find and enrich the top 3 God Nodes incrementally per run. Do not attempt to batch-enrich the entire project.

## 🤖 MCP Server Setup

To connect `para-graph` to an AI Agent editor (like Claude Desktop, Cursor, or Google Antigravity), you need to configure their respective MCP settings.

### Auto-Setup (Recommended)

If you are using PARA Workspace v1.8.2+, you can automatically configure the MCP server in your IDE by running:

```bash
./para mcp-setup
```

This will safely detect your active IDE and inject the `para-graph` MCP server configuration.

### Manual Setup (Fallback)

If you prefer to configure the server manually:

#### Claude Desktop / Antigravity

Edit your `claude_desktop_config.json` (or `mcp_config.json` for Antigravity) and add the following:

```json
{
  "mcpServers": {
    "para-graph": {
      "command": "<ABSOLUTE_WORKSPACE_PATH>/cli/para",
      "args": [
        "graph",
        "serve",
        "<ABSOLUTE_WORKSPACE_PATH>"
      ]
    }
  }
}
```

*Note: Replace `<ABSOLUTE_WORKSPACE_PATH>` with the absolute path to your PARA Workspace root directory.*

#### Cursor

Go to **Cursor Settings** > **Features** > **MCP Servers** > **Add New MCP Server**:
- **Name:** `para-graph`
- **Type:** `command`
- **Command:** `<ABSOLUTE_WORKSPACE_PATH>/cli/para graph serve <ABSOLUTE_WORKSPACE_PATH>`

### Available MCP Tools
Once connected, your AI Agent gains access to the following tools:
- `graph_query`: Search entities by name or semantic type.
- `graph_edges`: Find function callers and imports connected to a node.
- `graph_enrich`: Save semantic documentation, complexity, and domain concepts to a node.
- `graph_impact_analysis`: Discover upstream/downstream affected files and nodes (blast radius) when changing code.
- `graph_context_bundle`: Get the entire context of a code snippet (source code, callers, callees, imports, tests) in one call. Supports multi-seed node IDs.
- `graph_add_edges`: Batch inject edges (CALLS, IMPORTS_FROM) to resolve relationships for weak AST-linking languages (e.g. Bash).
- `graph_god_nodes`: Retrieve the most connected nodes in the graph to prioritize AI enrichment.
- `graph_expand_node`: Retrieve only the source code for a specific node with AST bounds checking.
- `graph_link_docs`: Link documentation markdown files to graph nodes based on anchor tags.
- `insight_push`: Push a project insight (lesson, risk, decision, pattern, gotcha) to the database.
- `insight_search`: Search project insights using full-text search with metadata filters.
- `insight_validate`: Update the confidence lifecycle of a project insight (hypothesis -> validated -> deprecated).
- `memory_push`: Push a session event (conversation, decision, error) to the project MemoryStore.
- `memory_search`: Full-text search (FTS5) over stored memory events by keyword.
- `memory_curate`: Cluster raw events into semantic slices using session-based curation.
- `graph_audit_csa`: Run Convergent Specification Architecture (CSA) compliance audit for a project.
- `graph_fix_csa`: Run CSA self-healing fix for dangling spec references (auto-replaces drifted spec anchors in code files).
- `project_snapshot`: Take a snapshot of the project directory structure, record metadata to SQLite, and verify protected files. Also detects untracked/ignored physical junk files if requested (`auditJunk: true`).
- `project_diff`: Compare two project snapshots to identify added, removed, and modified files (physical drift detection).
- `project_protected_files`: List, add, or remove protected files for a project.
- `project_session_compact`: Scan rules, skills, and project contract, and write a compacted context summary for agent recovery.
- `project_state_get`: Get cached project metadata and task counts from SQLite. Checks freshness against configuration files via MD5 hashes.
- `project_state_sync`: Sync and cache project metadata and task counts from config files (`project.md`, `backlog.md`, `sprint-current.md`) into SQLite database.

### Library Usage

```typescript
// Import as a library
import { CodeGraph } from 'para-graph';

// Import MCP server factory
import { createServer } from 'para-graph/mcp';
```

## 📊 Output Format

Three files are generated in the output directory:

### `entities.jsonl`

One code entity per line, sorted by file path:

```json
{"id":"src/graph/code-graph.ts::CodeGraph","type":"class","name":"CodeGraph","filePath":"src/graph/code-graph.ts","startLine":10,"endLine":81,"exportType":"named","signature":"export class CodeGraph {"}
```

### `relations.jsonl`

One relationship per line, sorted by source file:

```json
{"sourceId":"src/index.ts","targetId":"./parser/file-walker.js","relation":"IMPORTS_FROM","sourceFile":"src/index.ts","sourceLine":3}
```

### `metadata.json`

Summary statistics:

```json
{
  "version": "0.1.0",
  "nodeCount": 31,
  "edgeCount": 47,
  "fileCount": 6,
  "createdAt": "2026-04-21T03:35:33.508Z"
}
```

### Entity Types

| Type | Description |
|:--|:--|
| `file` | Source file |
| `class` | Class declaration |
| `function` | Function, method, or arrow function |
| `interface` | Interface declaration |
| `variable` | Variable declaration (future) |

### Relation Types

| Relation | Description |
|:--|:--|
| `IMPORTS_FROM` | File imports from another module |
| `CALLS` | Function/method calls another function |
| `INHERITS` | Class extends another (future) |
| `IMPLEMENTS` | Class implements interface (future) |

## 🏗️ Architecture

```
src/
├── cli.ts                    # Subcommand router (shebang entrypoint)
├── commands/
│   ├── build.ts              # Build command — scan, parse, export graph
│   ├── serve.ts              # Serve command — MCP server lifecycle
│   ├── inject.ts             # Inject command — Living Docs context
│   └── hooks.ts              # Hooks command — BeforeTool hook management
├── graph/
│   ├── models.ts             # GraphNode, GraphEdge type definitions
│   ├── code-graph.ts         # In-memory graph with dual indexing
│   ├── jsonl-exporter.ts     # Serialize graph → JSONL files
│   ├── jsonl-importer.ts     # Load graph from JSONL files
│   └── graph-store.ts        # LRU cache manager for multi-project graphs
├── mcp/
│   ├── server.ts             # MCP server factory (pure library export)
│   ├── tools.ts              # MCP tools: query, edges, enrich, impact_analysis, context_bundle, add_edges
│   └── resources.ts          # MCP resources: JSONL file access
├── parser/
│   ├── registry.ts           # Language Registry (lazy-loads parsers by extension)
│   ├── tree-sitter-parser.ts # AST parsing and SSEC mapping engine
│   └── file-walker.ts        # Recursive multi-language file scanner
└── queries/
    ├── typescript.scm        # SSEC query patterns for TS/TSX
    ├── python.scm            # SSEC query patterns for Python
    ├── go.scm                # SSEC query patterns for Go
    ├── php.scm               # SSEC query patterns for PHP
    └── bash.scm              # SSEC query patterns for Bash
```

### Data Flow

```
Source files → File Walker → Registry Lookup → Tree-sitter Parser + SSEC Query → CodeGraph (in-memory) → JSONL Export
                                                                                       │
                                                                                 GraphStore (LRU)
                                                                                       │
                                                                                 MCP Server → AI Agent
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Build TypeScript
npm run build

# Run tests
npm run test
```

### Tech Stack

| Component | Technology |
|:--|:--|
| Runtime | Node.js ≥ 18 |
| Language | TypeScript 5.x (strict mode) |
| AST Parser | tree-sitter + tree-sitter-typescript |
| Test Runner | Vitest |
| Dev Runner | tsx |

## 🧠 AI Intelligence (PARA Workspace)

This tool ships AI intelligence artifacts that enhance the PARA Workspace agent experience. When installed via `./para install-tool para-graph`, these artifacts are automatically fetched from GitHub and installed into your workspace's `.agents/` directory:

| Type | Name | Version | Description & Usage |
|:--|:--|:--|:--|
| Workflow | `/para-graph` | 2.0.1 | Type `@[/para-graph]` to instruct the AI to re-scan and update the graph memory. |
| Skill | para-graph | 2.5.0 | Centralized Graph Intelligence Router. Loaded on-demand for workflows like `/plan`, `/docs`, `/brainstorm` to provide graph enrichment and architecture validation. |
| Skill | csa | 1.1.0 | Global Convergent Specification Architecture (CSA) skill for workspace-wide verification and documentation quality gates. |
| Rule | `graph-first-policy` | 1.1.0 | Enforces graph-first development practices. The agent will proactively query the MCP server before making architecture decisions. |
| Knowledge Item | `para_graph_architecture` | — | Describes the core architecture of the hybrid code-knowledge graph, nodes and edges schemas, and directory layout inside the `.beads/graph/` folder. |
| Knowledge Item | `para_graph_mcp_tools` | — | Instruction guide on using MCP tools (`graph_query`, `graph_context_bundle`, etc.) to query and interact with the code graph. |
| Knowledge Item | `para_graph_workflows` | — | Guides on integrating para-graph CLI commands (`build`, `serve`, `link`) with the PARA workspace workflows. |

> **v0.12.0+**: AI Intelligence is no longer bundled in the tarball. It is fetched on-demand from GitHub via the `post_install()` hook. Update independently: `./para install-tool para-graph --sync`.
>
> Requires PARA Workspace v1.8.5+ for automatic template sync.

## 🗺️ Roadmap

| Phase | Description | Status |
|:--|:--|:--|
| P1 | Structural Base (Tree-sitter AST) | ✅ Done |
| P2 | Semantic Enrichment (Agent-Driven) | ✅ Done |
| P3 | Storage & Query Engine | ✅ Done |
| P4 | CLI Integration & NPM Package | ✅ Done |
| P5 | Multi-language Support & Query Refactor | ✅ Done |
| P6 | Impact & Context Queries | ✅ Done |
| P7 | Agentic Bash Edge Resolution | ✅ Done |
| P8 | Deep CALLS + Pattern Detection | ✅ Done |
| P9 | Edge Resolution & Topology Analytics | ✅ Done |
| P10 | Agent Auto-trigger (Hook Injection) | ✅ Done |
| P11 | Compact Memory | ✅ Done |
| P12 | SQLite Storage Engine (Dual Backend) | ✅ Done |
| P13 | Freshness-Aware Memory | ✅ Done |
| P14 | Schema Evolution + Code Search | 📋 Planned |
| P-Vis | Graph Visualization MVP | 📋 Planned |
| PX | Documentation & Stable Release (v1.0.0) | 📋 Planned |

## 📄 License

[MIT](LICENSE)

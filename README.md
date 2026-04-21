<div align="center">
  <h1>para-graph 🧠</h1>

  <p><b>Structural code analysis tool powered by Tree-sitter AST parsing.</b></p>

  <p>
    <a href="README.md"><b>🇺🇸 English</b></a>
  </p>

  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
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

**para-graph** is a deterministic code analysis tool that extracts structural information from TypeScript codebases and produces a knowledge graph in JSONL format.

It uses [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) for fast, accurate AST parsing — no compiler pipeline required. The output graph captures:

- **Entities** — classes, functions, interfaces, arrow functions, methods
- **Relationships** — imports, function calls, inheritance (future)

Part of the [PARA Workspace](https://github.com/pageel/para-workspace) ecosystem.

## ✨ Features

- **Deterministic parsing** — Tree-sitter AST, no heuristics
- **JSONL output** — one entity/relation per line, easy to stream and process
- **Self-contained** — no external services or databases required
- **Fast** — parses thousands of files in seconds
- **TypeScript-first** — built for TypeScript codebases (more languages planned)

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/pageel/para-graph.git
cd para-graph

# Install
npm install

# Run on any TypeScript project
npx tsx src/index.ts /path/to/your/ts/project ./output
```

## 📖 Usage

```bash
# Basic usage
npx tsx src/index.ts <target-dir> [output-dir]

# Examples
npx tsx src/index.ts ./src                    # Output to ./output/
npx tsx src/index.ts ./src ./my-graph         # Custom output directory
npx tsx src/index.ts ./src --help             # Show help
```

### Arguments

| Argument | Required | Default | Description |
|:--|:--|:--|:--|
| `target-dir` | ✅ | — | Directory containing TypeScript source files |
| `output-dir` | — | `./output` | Where to write the graph output |

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
├── index.ts                  # CLI entry point
├── graph/
│   ├── models.ts             # GraphNode, GraphEdge type definitions
│   ├── code-graph.ts         # In-memory graph with dual indexing
│   └── jsonl-exporter.ts     # Serialize graph → JSONL files
├── parser/
│   ├── tree-sitter-parser.ts # AST parsing and entity extraction
│   └── file-walker.ts        # Recursive TypeScript file scanner
└── queries/
    └── typescript.scm        # Tree-sitter query patterns
```

### Data Flow

```
TypeScript files → File Walker → Tree-sitter Parser → CodeGraph (in-memory) → JSONL Export
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

## 🗺️ Roadmap

| Phase | Description | Status |
|:--|:--|:--|
| P1 | Structural Base (Tree-sitter AST) | ✅ Done |
| P2 | Semantic Enrichment (LLM) | 📋 Planned |
| P3 | Storage & Query Engine | 📋 Planned |
| P4 | PARA Workspace CLI Integration | 📋 Planned |
| P5 | MCP Server Oracle | 📋 Planned |

## 📄 License

[MIT](LICENSE)

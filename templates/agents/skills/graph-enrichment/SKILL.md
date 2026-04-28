---
name: graph-enrichment
description: >
  Guide Agent to read code graph from para-graph MCP server, identify important
  nodes, and write semantic enrichment data. Load this skill when user requests
  "enrich graph", "analyze code graph", or "semantic enrichment". Even if the
  user doesn't mention enrichment explicitly, load this skill when working with
  para-graph output and semantic analysis is beneficial.
version: "1.0.0"
---

# Skill: Graph Enrichment via MCP

> **Trigger:** User mentions "enrich graph", "analyze code graph", "semantic enrichment",
> or Agent needs to understand a codebase that has been scanned by para-graph.

## §1. Overview

This skill teaches the Agent how to use para-graph MCP tools to enrich code graph
nodes with semantic metadata (summaries, complexity ratings, domain concepts).

**Prerequisites:**
- para-graph MCP server running (`npx tsx src/mcp/server.ts <graph-dir>`)
- Graph output exists (`entities.jsonl`, `relations.jsonl`, `metadata.json`)

## §2. Enrichment Workflow

### Step 1: Query Graph

Use MCP tool `graph_query` to list nodes:

```
graph_query()                          → All nodes
graph_query(nodeType: "class")         → Classes only
graph_query(nodeType: "function")      → Functions only
graph_query(namePattern: "parse")      → Nodes matching "parse"
```

### Step 2: Identify Important Nodes

Prioritize enrichment by importance:
1. **Classes** — Architectural backbone
2. **Exported functions** — Public API surface
3. **Complex functions** — High line count (endLine - startLine > 30)
4. **Interfaces** — Contract definitions

### Step 3: Read Source Code

For each node to enrich, read the source file directly:
- Use `filePath` + `startLine`/`endLine` to locate the exact code
- Understand context: what the function does, what the class is responsible for

### Step 4: Write Enrichment

Use MCP tool `graph_enrich`:

```
graph_enrich(
  nodeId: "src/graph/code-graph.ts::CodeGraph",
  summary: "In-memory graph storage with dual indexing for fast lookup by ID and file path",
  complexity: "medium",
  domainConcepts: ["graph", "indexing", "code-analysis"]
)
```

**Field guidelines:**
- `summary`: 1-2 sentences describing **what** (not **how**)
- `complexity`: `low` (< 20 lines, simple logic), `medium` (20-50 lines), `high` (> 50 lines or complex logic)
- `domainConcepts`: 2-5 domain-level keywords, not implementation details

### Step 5: Agentic Edge Resolution (v0.7.0+)

For weakly-typed languages like Bash where Tree-sitter AST linking is limited, you must also look for missing relationships:
1. When reading the source code, identify if the function calls external functions or if the file imports other files.
2. Use MCP tool `graph_add_edges` to inject these missing relationships:

```
graph_add_edges(
  projectName: "para-workspace",
  edges: [
    {
      sourceId: "cli/commands/install.sh",
      targetId: "cli/lib/logger.sh",
      relation: "IMPORTS_FROM"
    },
    {
      sourceId: "cli/commands/install.sh",
      targetId: "cli/lib/rollback.sh::rollback_execute",
      relation: "CALLS"
    }
  ]
)
```

**Edge Injection Guidelines:**
- **Validation**: Ensure both `sourceId` and `targetId` exist in the graph (use `graph_query` to verify if unsure).
- **Relations**: Use `CALLS` for function invocations and `IMPORTS_FROM` for file sourcing/imports.

### Step 6: Verify

Use `graph_query` to confirm enriched nodes have the `semantic` field populated, and use `graph_edges` to verify your injected edges were added successfully.

## §3. Constraints

- **Do NOT auto-enrich the entire graph** — ask user how many nodes to enrich
- **Quality over quantity** — 5 well-enriched nodes > 50 shallow enrichments
- **enrichedBy is always "agent"** — the tool sets this automatically
- **Re-scan safety** — if user re-runs para-graph CLI, remind them to use `--import` flag to preserve enrichment data

## §4. Related

- [para-graph project](../../Projects/para-graph/project.md) — Source project
- [graph-enrichment skill (project-level)](../../Projects/para-graph/.agents/skills/para-graph/SKILL.md) — Project profile

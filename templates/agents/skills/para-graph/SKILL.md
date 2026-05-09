---
name: para-graph
description: >
  Centralized Graph Intelligence Router for PARA Workspace.
  Provides standardized graph enrichment workflow (§2), workflow integration
  snippets for /plan, /docs, /brainstorm, /spec (§3), and graceful fallback
  when para-graph is not installed. Load this skill when working with code
  graphs, semantic enrichment, or any workflow that benefits from codebase
  structure awareness.
version: "2.1.0"
---

# Skill: para-graph — Graph Intelligence Router

> **Trigger:** User mentions "enrich graph", "analyze code graph", "semantic enrichment",
> or Agent is executing a workflow that can benefit from graph intelligence (/plan, /docs, /brainstorm, /spec).

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

## §3. Workflow Integration Router

> **Purpose:** Centralized graph intelligence snippets for sidecar skills.
> Sidecar skills (plan, docs, brainstorm, spec) reference this section
> instead of duplicating graph logic inline.

### §3.1 Availability Detection

Agent MUST check graph availability BEFORE using any graph tools:

```
CHECK: does `.beads/graph/metadata.json` exist for the active project?
→ YES: graph available → proceed with graph pipeline (§3.2)
→ NO:  graph NOT available → use graceful fallback (§3.4)
```

**Detection command:**

```bash
test -f "Projects/<target>/repo/.beads/graph/metadata.json" \
  || test -f "Projects/<target>/.beads/graph/metadata.json" \
  || test -f "Resources/references/<resource-path>/.beads/graph/metadata.json"
```

> ℹ️ Graph data may live in `repo/.beads/`, project-level `.beads/`, or `Resources/references/` for external resources.

### §3.2 Standard Pipeline Steps

Reusable pipeline that workflows call when graph is available:

| Step | MCP Tool / Command                                                       | Purpose                                                      |
| :--- | :----------------------------------------------------------------------- | :----------------------------------------------------------- |
| A    | `/para-graph build [target]`                                             | Refresh graph data from latest source                        |
| B    | `graph_query(projectName, nodeType?, namePattern?)`                      | Identify target nodes                                        |
| C    | `graph_enrich(projectName, nodeId, summary, complexity, domainConcepts)` | Write semantic metadata                                      |
| D    | `graph_context_bundle(projectName, nodeId)`                              | Load full context (source, callers, callees, imports, tests) |
| E    | `graph_edges(projectName, nodeId)`                                       | Understand relationships                                     |
| F    | `graph_impact_analysis(projectName, nodeId, direction?)`                 | Assess change blast radius                                   |

> **Not all steps are needed for every workflow.** Each §3.3 snippet specifies which steps to use.

### §3.3 Integration Snippets

> **Convention:** Sidecar skills reference these snippets by ID (e.g., "See `para-graph §3.3.1`").
> Agent reads the snippet content, then executes inline within the workflow.

#### §3.3.1 For `/plan` — Architecture Context Gathering

**When:** Phase 0 of any detail plan for a project with code.
**Steps:** A → B → D → F

```markdown
> 🔍 **Graph-First (conditional):** If project has `.beads/graph/metadata.json`:
>
> 1. Run `/para-graph build` to refresh (Step A)
> 2. `graph_query` to list classes, exported functions relevant to plan scope (Step B)
> 3. `graph_context_bundle` for key architecture nodes — understand callers/callees (Step D)
> 4. `graph_impact_analysis` if plan modifies existing code — assess blast radius (Step F)
>    If no graph → skip these steps entirely. Plan proceeds with source-only context.
```

#### §3.3.2 For `/docs` — Content Enrichment Pipeline

**When:** Phase 0 of docs-only plan (detail-plan-docs.md template).
**Steps:** A → B → C → D → E

```markdown
Phase 0 Graph Pipeline (skip entirely if no `.beads/graph/`):

Step A — Build/refresh graph:
0.1 🤖 Run `/para-graph build [target]`

Step B — Identify enrichment targets:
0.2 🤖 `graph_query` to list nodes relevant to docs being written
0.3 🤖 Build enrichment hit list (nodes with no `semantic` field)

Step C — Enrich nodes:
0.4 🤖 `graph_enrich` for each approved node (read source BEFORE enriching)

Per-doc context loading (Phase N):
Mode A (graph available): 1. `graph_context_bundle(nodeId)` — source, callers, callees, imports, tests 2. `graph_edges(nodeId)` — relationships and data flow 3. `view_file` — implementation details

Mode B (source-only): 1. `view_file` — target component files 2. Read imports, types, utilities 3. Cross-reference architecture.md

Both modes enforce: write ONLY what exists in source code (zero-hallucination).
```

#### §3.3.3 For `/brainstorm` — Codebase Understanding

**When:** Brainstorm about code architecture, refactoring, or feature design.
**Steps:** A → B → D → E → F

```markdown
> 🔍 **Graph Context (conditional):** If brainstorm topic involves code:
>
> 1. `graph_query` to understand current architecture (Step B)
> 2. `graph_context_bundle` for key nodes under discussion (Step D)
> 3. `graph_edges` to map dependencies (Step E)
> 4. `graph_impact_analysis` if proposing changes (Step F)
>    Ground brainstorm options in actual code structure, not assumptions.
>    If no graph → use `view_file` + `grep_search` for source-only context.
```

#### §3.3.4 For `/spec` — Requirements Traceability

**When:** Writing specification for a feature that touches existing code.
**Steps:** A → B → D → F

```markdown
> 🔍 **Graph Context (conditional):** If spec involves modifying existing code:
>
> 1. `graph_query` to identify affected components (Step B)
> 2. `graph_context_bundle` for components being specified (Step D)
> 3. `graph_impact_analysis` to map downstream effects (Step F)
>    Include graph-derived dependency list in spec's "Affected Components" section.
>    If no graph → manually list affected files via grep/find.
```

### §3.4 Graceful Fallback (Source-Only Mode)

When para-graph is NOT available (no `.beads/graph/`), workflows fall back to:

| Graph step              | Source-only equivalent                                 |
| :---------------------- | :----------------------------------------------------- |
| `graph_query`           | `grep_search` + `list_dir` to find relevant files      |
| `graph_context_bundle`  | `view_file` for source code + import statements        |
| `graph_edges`           | Read import/require statements manually                |
| `graph_impact_analysis` | `grep_search` for function/class usage across codebase |
| `graph_enrich`          | N/A — enrichment requires graph                        |

> **Key principle:** Graph intelligence enhances workflow quality but is NEVER required.
> All workflows MUST work correctly without para-graph installed.

## §4. Constraints

- **Do NOT auto-enrich the entire graph** — ask user how many nodes to enrich
- **Quality over quantity** — 5 well-enriched nodes > 50 shallow enrichments
- **enrichedBy is always "agent"** — the tool sets this automatically
- **Re-scan safety** — if user re-runs para-graph CLI, remind them to use `--import` flag to preserve enrichment data
- **Router is data, not code** — §3 provides instructions for Agent to follow, not executable logic. No circular dependency risk.
- **Sidecar skills MUST NOT duplicate** — if a workflow needs graph logic, it references §3.3.X. Never copy-paste graph pipeline inline.
- **Decoupled Distribution (v0.12.0+)** — Tarball contains only the Engine (`dist/`). AI Intelligence (this SKILL.md, workflows, rules) is fetched from GitHub via `post_install()` hook or `./para install-tool para-graph --sync`. Template changes no longer require an engine release — push to `main` branch and run `--sync`.


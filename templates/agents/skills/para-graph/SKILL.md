---
name: para-graph
description: >
  Centralized Graph Intelligence Router for PARA Workspace.
  Provides standardized graph enrichment workflow (§2), memory curation workflow (§3), workflow integration
  snippets for /plan, /docs, /brainstorm, /spec (§4), and graceful fallback
  when para-graph is not installed. Load this skill when working with code
  graphs, semantic enrichment, or any workflow that benefits from codebase
  structure awareness.
version: "2.5.0"
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

Use MCP tool `graph_god_nodes` to find the most connected nodes in the graph. This tool also returns `enrichableNodeCount` (excluding files) and `totalInGraph` (including files).
> **Note:** `enrichableNodeCount` is the true target for enrichment completion, as `nodeCount` (or `totalInGraph`) includes `file` nodes which are not meant to be enriched.

Prioritize enrichment by importance:

1. **Classes** — Architectural backbone
2. **Exported functions** — Public API surface
3. **Complex functions** — High line count (endLine - startLine > 30)
4. **Interfaces** — Contract definitions

### Step 3: Read Source Code

For each node to enrich, read the source file directly:

- Use `filePath` + `startLine`/`endLine` to locate the exact code
- **Fallback (v0.13.2+):** If you use `expand_node` or `graph_context_bundle` and it returns an `incomplete: true` flag or `sourceCode` that is suspiciously short (< 3 lines) for a function/class, it is likely due to an AST bounds truncation issue. In this case, you MUST use `view_file` on the source file to read the actual code context manually.
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

- `summary`: 1-2 sentences describing **what** (not **how**). MUST NOT use pronouns like "it", "this class", "this function" (Lossless Restatement).
- `complexity`: `low` (< 20 lines, simple logic), `medium` (20-50 lines), `high` (> 50 lines or complex logic)
- `domainConcepts`: 2-5 domain-level keywords, not implementation details

> ⚠️ **Blast Radius in Summary (v2.5.0):** When mentioning blast radius in a `summary`, Agent MUST:
> 1. Run `graph_impact_analysis(direction=upstream)` — upstream only
> 2. Record the upstream value as "Blast Radius" (who breaks if this node changes)
> 3. If also reporting bidirectional impact, label it explicitly:
>    _"Upstream Blast Radius: N nodes. Transitive Impact (both-direction): M nodes."_
> 4. MUST NOT label a `direction=both` result as "Blast Radius" — that is **Transitive Impact**

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

### Step 5b: Framework-Aware Edge Resolution (v2.3.0+)

> **Enhancement over Step 5:** Step 5 covers weakly-typed languages (Bash).
> Step 5b addresses **dynamic binding patterns** in typed frameworks (React, Django)
> where the generic EdgeResolver has low resolution rates due to destructured hooks,
> context consumers, and HOC wrappers.

Agent MUST detect the project's primary framework and load the matching
lang-profile from `references/lang-profiles/` **BEFORE** performing edge injection.

| Detection Signal | Profile | Path |
|:--|:--|:--|
| `.tsx` files + `react` in package.json | React/TypeScript | `references/lang-profiles/react-typescript.md` |
| `manage.py` + `django` in requirements.txt | Python/Django | `references/lang-profiles/python-django.md` |
| `.sh` files only, no package.json | Bash/Shell | _(handled by Step 5 — no separate profile)_ |

**Routing Logic:**

1. Check framework signals (one `find` + one `grep` per framework)
2. **IF match found** → read the matched profile → follow its patterns for edge injection
3. **IF no match** → fall back to generic Step 5 edge injection
4. **IF multiple match** → load the primary one (most `.ext` files wins)

**Constraints:**
- Lang-profiles are **instructions**, not code — zero engine changes needed
- All injected edges MUST use `confidence: 'INFERRED'`
- Maximum 30 edges injected per profile session (safety limit)
- Agent MUST verify target node exists via `graph_query` before injection

### Step 6: Verify

Use `graph_query` to confirm enriched nodes have the `semantic` field populated, and use `graph_edges` to verify your injected edges were added successfully.

## §3. Memory Workflow (Compact Memory)

This section guides the use of `para-graph` MCP tools for memory extraction and consolidation.

### Step 1: Push Raw Memory (`memory_push`)
When encountering important project decisions, context, or rules, push it to memory:
```
memory_push(
  projectPath: "Projects/para-graph",
  content: "The CurationWorker uses heuristic clustering to map..."
)
```
**Lossless Restatement Guidelines**: Never use pronouns (it, this, that). Restate the subject explicitly so that the memory slice remains contextually independent when retrieved later. Example: "SimpleMem uses K-Means" instead of "It uses K-Means".

### Step 2: Retrieve Context (`memory_search`)
When starting a new session or encountering an ambiguous topic, search existing memory:
```
memory_search(
  projectPath: "Projects/para-graph",
  query: "CurationWorker clustering"
)
```
**Pyramid Retriever Guidelines**: If `memory_search` returns a summary node, the system might only return the summary text (`previewOnly` mode) to save tokens. You should then query that specific node ID again (or read its referenced files) to expand its full details if needed.

### Step 3: Curate Memory (`memory_curate`)
When memory becomes fragmented, use the curation tool to summarize and cluster related slices:
```
memory_curate(
  projectPath: "Projects/para-graph"
)
```

## §4. Workflow Integration Router

> **Purpose:** Centralized graph intelligence snippets for sidecar skills.
> Sidecar skills (plan, docs, brainstorm, spec) reference this section
> instead of duplicating graph logic inline.

### §4.1 Availability Detection

Agent MUST check graph availability BEFORE using any graph tools:

```
CHECK: does `.beads/graph/metadata.json` exist for the active project?
→ YES: graph available → proceed with graph pipeline (§4.2)
→ NO:  graph NOT available → use graceful fallback (§4.4)
```

**Detection command:**

```bash
test -f "Projects/<target>/repo/.beads/graph/metadata.json" \
  || test -f "Projects/<target>/.beads/graph/metadata.json" \
  || test -f "Resources/references/<resource-path>/.beads/graph/metadata.json"
```

> ℹ️ Graph data may live in `repo/.beads/`, project-level `.beads/`, or `Resources/references/` for external resources.

### §4.2 Standard Pipeline Steps

Reusable pipeline that workflows call when graph is available:

| Step | MCP Tool / Command                                                       | Purpose                                                      |
| :--- | :----------------------------------------------------------------------- | :----------------------------------------------------------- |
| A    | `/para-graph build [target]`                                             | Refresh graph data from latest source                        |
| B    | `graph_query(projectName, nodeType?, namePattern?)`                      | Identify target nodes                                        |
| C    | `graph_enrich(projectName, nodeId, summary, complexity, domainConcepts)` | Write semantic metadata                                      |
| D    | `graph_context_bundle(projectName, nodeId)`                              | Load full context (source, callers, callees, imports, tests) |
| E    | `graph_edges(projectName, nodeId)`                                       | Understand relationships                                     |
| F    | `graph_impact_analysis(projectName, nodeId, direction?)`                 | Assess change blast radius (see §4.2.F Semantics below)      |
| G    | `grep_search` (pattern verify)                                           | Cross-validate inline pattern counts against graph estimates |
| H    | `graph_link_docs(projectName, links)`                                    | Link doc sections to graph nodes after updating docs        |
| I    | `insight_push(projectName, category, domain, title, description, sourceType, ...)` | Push project insights (decisions, risks, gotchas) to SQLite |
| J    | `insight_search(projectName, query, category?, domain?, limit?)`         | Search project insights with full-text search                |
| K    | `graph_audit_csa(projectName)`                                           | Run CSA compliance audit for a project                       |
| L    | `graph_fix_csa(projectName, dryRun?)`                                    | Run self-healing fix for csa dangling links                  |

> **Not all steps are needed for every workflow.** Each §4.3 snippet specifies which steps to use.
>
> **Step G is conditional** — only needed when the workflow estimates file counts for **inline code patterns** (e.g., `details: err.message`, `console.log(error)`, hardcoded string literals). For purely structural queries ("who calls function X?"), Step F is sufficient.

#### Step F — Impact Analysis Direction Semantics (v2.5.0)

The `direction` parameter of `graph_impact_analysis` produces fundamentally different metrics. Agent MUST use the correct terminology:

| `direction` | Correct Term | Meaning | When to Use |
|:--|:--|:--|:--|
| `upstream` | **Blast Radius** | Who transitively depends on this node? (callers of callers) | Risk assessment, enrichment summaries, plan scoping |
| `downstream` | **Dependency Radius** | What does this node transitively depend on? | Understanding context, finding external dependencies |
| `both` | **Transitive Impact** | Full bidirectional reachability | Research, architecture brainstorms, holistic analysis |

> ⚠️ **Anti-pattern:** Do NOT call a `direction=both` result "Blast Radius".
> Blast Radius strictly means upstream-only ("if I change X, what breaks?").
> The HTML Docs Dashboard calculates Blast Radius using upstream BFS — reporting
> a `both` value as blast radius creates data inconsistency between graph
> enrichment and rendered documentation.
>
> **Case Study (v2.5.0):** Agent enriched `log_debug` with "Blast Radius ~25" using
> `direction=both`, but the HTML dashboard correctly showed 10 (upstream-only BFS).
> Root cause: no semantic guidance distinguishing direction values.

#### Step G — Pattern Blast Radius Verify (v2.4.0)

> **Rationale:** Graph indexes structural relationships (imports, exports, calls) but cannot detect
> inline code patterns within function bodies. This step bridges that gap by using `grep_search`
> to verify pattern occurrence counts after graph analysis.
>
> **Case Study:** In pageel-crm v0.8.0 Security Hardening, graph correctly identified 16 files
> for hardcoded secrets (import-level pattern) but only estimated 4 files for verbose error
> leakage (`details: err.message` — an inline catch-block pattern). Actual count was 16 files.

**Trigger conditions** (Agent MUST check after Step F):
- The analysis involves an **inline code pattern** (string literal, error handling, logging)
- The issue is NOT purely structural (function call graph, import chain)
- The workflow produces **file count estimates** that will feed into a plan or report

**Action:**
1. Identify the pattern string(s) from the graph/scan analysis
2. Run `grep_search` across the relevant source directory to get **exact file count and locations**
3. Compare grep result with graph estimation from Step F
4. **IF discrepancy found** → update the estimation with grep-verified count and log:
   ```
   ⚠️ Pattern Verify: Graph estimated N files, grep verified M files for pattern [X]
   ```
5. Use the grep-verified count for all downstream workflow outputs (plans, reports, specs)

**Constraint:** Step G supplements graph intelligence, not replaces it. Graph remains the primary tool for structural dependency analysis.

### §4.3 Integration Snippets

> **Convention:** Sidecar skills reference these snippets by ID (e.g., "See `para-graph §4.3.1`").
> Agent reads the snippet content, then executes inline within the workflow.

#### §4.3.1 For `/plan` — Architecture Context Gathering

**When:** Phase 0 of any detail plan for a project with code.
**Steps:** A → B → D → F → G

```markdown
> 🔍 **Graph-First (conditional):** If project has `.beads/graph/metadata.json`:
>
> 1. Run `/para-graph build` to refresh (Step A)
> 2. `graph_query` to list classes, exported functions relevant to plan scope (Step B)
> 3. `graph_context_bundle` for key architecture nodes — understand callers/callees (Step D)
> 4. `graph_impact_analysis` if plan modifies existing code — assess blast radius (Step F)
> 5. `grep_search` to verify inline pattern counts if plan involves code pattern fixes (Step G)
>    If no graph → skip these steps entirely. Plan proceeds with source-only context.
```

#### §4.3.2 For `/docs` — Content Enrichment Pipeline

**When:** `/docs new --graph` or `/docs update --graph`.
**Steps:** A → B → (C optional) → D → E → H

```markdown
Phase 0 Graph Pipeline (skip entirely if no `.beads/graph/`):

Step A — Build/refresh graph:
0.1 🤖 Run `/para-graph build [target]`

Step B — Identify enrichment targets:
0.2 🤖 `graph_query` to list nodes relevant to docs being written
0.3 🤖 Build enrichment hit list (nodes with no `semantic.summary` field)
0.3b 🤖 **Undocumented God Nodes Handling**:
    If `/docs review` reports `🔴 Undocumented Core Components (God Nodes)`, Agent MUST:
    1. Identify the source file and logic of the undocumented God Node.
    2. Add or find the corresponding section (H2/H3) in the project documentation (e.g. `docs/architecture.md`).
    3. Auto-insert the comment `<!-- @graph-node: nodeId -->` right before the heading.
    4. Run Step H (`graph_link_docs`) to bind the node.
0.3c 🤖 **God Node Double-Binding (Enriched & Linked) Goal**:
    To achieve maximum system clarity, God Nodes MUST undergo "Double-Binding" (be both documented/linked AND semantically enriched).
    If `/docs review` reports `⚠️ Unenriched Core Components (God Nodes)` (nodes are linked in docs but missing `semantic.description` in graph), Agent MUST:
    1. Read the source file implementation of the God Node.
    2. Write semantic enrichment via Step C (`graph_enrich`) before proceeding.

Step C — Enrich nodes (OPTIONAL / MANDATORY for God Nodes):
0.4 🤖 `graph_enrich` for important nodes (God Nodes, core classes).
    - Not required for standard doc linking — linkDocs auto-inits semantic since v0.16.1.
    - **MANDATORY for God Nodes** flagged as unenriched to satisfy the Double-Binding status.

Step H — Link document anchors (100% success guaranteed):
0.5 🤖 Call `graph_link_docs` after document creation/modification.
    Anchors use `<!-- @graph-node: nodeId -->` comment format.
    v0.16.1+: linkDocs auto-initializes `semantic: {}` for non-enriched
    nodes — no pre-enrichment required for linking.

Step I — Update Index Statistics (if --graph):
0.6 🤖 After linking, update `## Graph Traceability` section in `docs/README.md`
    with doc coverage metrics (including the `God Nodes fully covered (Enriched & Linked)` ratio) and stale document detection.

Per-doc context loading (Phase N):
Mode A (graph available): 1. `graph_context_bundle(nodeId)` — source, callers, callees, imports, tests 2. `graph_edges(nodeId)` — relationships and data flow 3. `view_file` — implementation details

Mode B (source-only): 1. `view_file` — target component files 2. Read imports, types, utilities 3. Cross-reference architecture.md

Both modes enforce: write ONLY what exists in source code (zero-hallucination).
```

#### §4.3.3 For `/brainstorm` — Codebase Understanding

**When:** Brainstorm about code architecture, refactoring, or feature design.
**Steps:** A → B → D → E → F → G

```markdown
> 🔍 **Graph Context (conditional):** If brainstorm topic involves code:
>
> 1. `graph_query` to understand current architecture (Step B)
> 2. `graph_context_bundle` for key nodes under discussion (Step D)
> 3. `graph_edges` to map dependencies (Step E)
> 4. `graph_impact_analysis` if proposing changes (Step F)
> 5. `grep_search` to verify inline pattern counts if estimating file-level blast radius (Step G)
>    Ground brainstorm options in actual code structure, not assumptions.
>    If no graph → use `view_file` + `grep_search` for source-only context.
```

#### §4.3.4 For `/spec` — Requirements Traceability

**When:** Writing specification for a feature that touches existing code.
**Steps:** A → B → D → F → G

```markdown
> 🔍 **Graph Context (conditional):** If spec involves modifying existing code:
>
> 1. `graph_query` to identify affected components (Step B)
> 2. `graph_context_bundle` for components being specified (Step D)
> 3. `graph_impact_analysis` to map downstream effects (Step F)
> 4. `grep_search` to verify inline pattern counts for scope boundary accuracy (Step G)
>    Include graph-derived dependency list in spec's "Affected Components" section.
>    If no graph → manually list affected files via grep/find.
```

#### §4.3.5 For `/qa` — Stress-Test Validation

**When:** QA stress-testing plans, specs, or artifacts that involve code changes.
**Steps:** A → B → D → F → G

```markdown
> 🔍 **Graph Context (conditional):** If QA target involves code modifications:
>
> 1. `graph_query` + `graph_god_nodes` to identify architectural hot spots (Step B)
> 2. `graph_context_bundle` for components under review (Step D)
> 3. `graph_impact_analysis` to verify blast radius claims in the artifact (Step F)
> 4. `grep_search` to cross-validate any file count estimates in the artifact (Step G)
>    Challenge assumptions: "Does the plan claim 4 files affected? Verify with grep."
>    If no graph → use grep/find for source-only validation.
```

### §4.4 Graceful Fallback (Source-Only Mode)

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

### §4.5 Memory Event & Insight Conventions (v0.16.0)

To allow memory consolidation and cross-entity reasoning, Agent SHOULD follow these conventions when pushing events or insights:

#### Memory Events (`memory_push`)
Recommended `kind` values for doc-graph changes:
- `docs_link`: Logged when docAnchors are linked to graph nodes
- `docs_stale`: Logged when staleness is detected during documentation builds

#### Project Insights (`insight_push`)
Use `insight_push` when a brainstorm, QA run, or bug fix produces reusable knowledge:
- **category**:
  - `lesson`: Lessons learned from fixing bugs or design reviews
  - `risk`: Cross-platform or architectural risks identified
  - `decision`: Brainstorm options evaluated and final choices
  - `pattern`: Reusable code design patterns
  - `gotcha`: Workspace-specific quirks (e.g. SQLite WAL mode details)
- **domain**: Scope of the knowledge (e.g., `path-handling`, `memory`, `parser`, `mcp`, `governance`)

## §5. Constraints

- **Tiered Enrichment Guideline** — Agent SHOULD prioritize God Nodes and Core Entities for enrichment. Coverage targets vary by project size:
  - Small project (< 50 enrichable nodes): up to 60-80% — overhead is minimal
  - Medium project (50-150 nodes): 20-40% — focus God Nodes + public API
  - Large project (> 150 nodes): 10-20% — only God Nodes + core classes
  
  The principle: **every enriched node must earn its tokens** — don't enrich trivial utility functions.
- **Quality over quantity** — 5 well-enriched architectural nodes > 50 shallow enrichments of utility functions.
- **enrichedBy is always "agent"** — the tool sets this automatically
- **Re-scan safety** — if user re-runs para-graph CLI, remind them to use `--import` flag to preserve enrichment data
- **Router is data, not code** — §4 provides instructions for Agent to follow, not executable logic. No circular dependency risk.
- **Sidecar skills MUST NOT duplicate** — if a workflow needs graph logic, it references §4.3.X. Never copy-paste graph pipeline inline.
- **Decoupled Distribution (v0.12.0+)** — Tarball contains only the Engine (`dist/`). AI Intelligence (this SKILL.md, workflows, rules) is fetched from GitHub via `post_install()` hook or `./para install-tool para-graph --sync`. Template changes no longer require an engine release — push to `main` branch and run `--sync`.


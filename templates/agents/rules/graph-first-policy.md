# Rule: Graph-First Investigation Policy

> Agent MUST prioritize graph-based code analysis using `para-graph` MCP tools before performing direct file I/O operations or assuming architecture flow.

## Scope

- [x] Global (applies to all projects with graph data)

## Precondition

- Rule ONLY applies when `.beads/graph/metadata.json` exists for the active project.
- If no graph data exists, Agent SHOULD suggest running `/para-graph build` first, then proceed with standard file I/O.

## Triggers

### Investigative (Code)
- When the user asks to "fix bug", "trace flow", "analyze code", "understand architecture", or similar investigative tasks.
- Before making logic edits to any source files that have internal dependencies or imported components.

### Planning & Design (Architecture)
- Before designing architecture in `/plan create` (Step 5: Design Architecture).
- Before analyzing codebase in `/brainstorm` (exploring technical decisions).
- Before surfacing assumptions in `/spec` (defining scope and boundaries).

## Constraints

### 1. Mandatory Graph Querying
- Agent **MUST** use `mcp_para-graph_graph_query` to locate target components or functions first.
- Agent **MUST** use `mcp_para-graph_graph_edges` to analyze the target's dependencies and dependants (caller/callee relationships).

### 2. File I/O Restrictions
- Agent **MUST NOT** jump straight to `view_file` or `grep_search` to guess the code flow if a graph query can provide the architectural context.
- Agent **MAY** use `view_file` only AFTER the graph edges have been analyzed to read the exact implementation details.

### 3. Transparency
- Agent **SHOULD** mention the graph edges or nodes found in the thought process before calling `replace_file_content`.
- Agent **MUST** explicitly state in its response that `para-graph` was utilized to map out connections before applying any fix.

### 4. Graceful Degradation
- If the MCP server is unavailable or graph data is stale (`metadata.json` older than 7 days), Agent **MAY** fall back to standard file I/O with a warning to the user.
- Agent **SHOULD** suggest running `/para-graph build` to refresh the graph after the task is complete.

## Related

- Skill: `graph-enrichment` — Step-by-step guide for semantic enrichment via MCP.
- Workflow: `/para-graph build` — Rebuilds the Code-Knowledge Graph for a project.

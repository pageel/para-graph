# PARA Graph Workflows & CLI Integration

`para-graph` provides CLI commands invoked directly or via workflows to keep the code graph updated and synchronized.

## CLI Commands

### 1. `para-graph build <project-name>`
- Runs AST parser (Tree-sitter) and updates the JSONL files + SQLite database under `.beads/graph/`.
- Prepend NVM path if run in a headless environment.

### 2. `para-graph serve`
- Starts the MCP server on stdio.
- Exposes 21 tools to AI Agents for codebase semantic queries, memory, insights, CSA governance, and project safety.

### 3. `para-graph link <project-name>`
- Scans documentation and specification files for anchors and creates `DOCUMENTED_BY` edges pointing to the code entities that implement them.
- Covers both CSA spec anchors (`<span id="csa-...">`) and doc graph-node anchors (`<!-- @graph-node -->`).

### 4. `para-graph ki sync`
- Syncs the para-graph specific knowledge templates (`repo/templates/knowledge/`) to the user's local AI agent knowledge store (`~/.gemini/antigravity/knowledge/`).

### 5. `para-graph audit csa <project-name>`
- CLI equivalent of `graph_audit_csa` MCP tool.
- Runs CSA compliance audit checking bidirectional Spec↔Code traceability.

## Workflow Integration Points

### `/para-graph` workflow
- Primary workflow for building and managing the code graph.
- Actions: `build`, `enrich`, `status`, `serve`.

### `/docs` workflow integration
- After creating or updating docs, Agent calls `graph_link_docs` MCP tool to establish doc↔code traceability.
- Graph Traceability statistics are auto-updated in `docs/README.md` via `--graph` flag.
- Uses `<!-- @graph-node: nodeId -->` anchors in doc files (unidirectional, Docs→Code).

### CSA integration (plan phases)
- CSA audit gates are embedded in plan phase checkpoints.
- `graph_audit_csa` runs at Phase 0 (baseline) and final phase (verification).
- `graph_fix_csa` auto-heals drifted spec references during development.

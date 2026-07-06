# PARA Graph Workflows & CLI Integration

`para-graph` provides CLI commands invoked directly or via workflows to keep the code graph updated and synchronized.

## CLI Commands

### 1. `para-graph build <project-name>`
- Runs AST parser (Tree-sitter) and updates the JSONL files + SQLite database under `.beads/graph/`.
- Prepend NVM path if run in a headless environment.

### 2. `para-graph serve`
- Starts the MCP server on stdio.
- Exposes 26 tools to AI Agents for codebase semantic queries, memory, insights, CSA governance, project safety, and session telemetry.

### 3. `para-graph link <project-name>` [DEPRECATED & DISABLED]
- **Deprecated & Disabled since v0.17.4**: Previously scanned documentation for anchors. Throws deprecation error if run. Use Unified CSA instead.

### 4. `para-graph ki sync`
- Syncs the para-graph specific knowledge templates (`repo/templates/knowledge/`) to the user's local AI agent knowledge store (`~/.gemini/antigravity-ide/knowledge/`).

### 5. `para-graph audit csa <project-name>`
- CLI equivalent of `graph_audit_csa` MCP tool.
- Runs CSA compliance audit checking bidirectional Spec↔Code traceability.
- **Plan-Scoped Audit (v0.17.6.5)**: Supports `--plan-scope <path>` flag. When provided, restricts the audit coverage to specifications listed in the plan's Spec Mapping table, and excludes planned spec anchors (tagged `planned: true` during build) from the coverage calculations.

### 6. `para-graph fix csa <project-name>`
- CLI equivalent of `graph_fix_csa` MCP tool.
- Runs self-healing fuzzy matching to correct drifted `// @para-doc` code comments.

### 7. `para-graph inject <project-name> <json-edges>`
- Injects custom edges into the graph.

### 8. `para-graph hooks <project-name>`
- Manages repository integration hooks.

### 9. `para-graph mem <project-name> <command>`
- Directly query, push, or curate memory events from the command line.

### 10. `para-graph project-snapshot <project-name>`
- CLI equivalent of `project_snapshot` MCP tool. Captures directory structure and runs profile-driven Junk Audit scan.

### 11. `para-graph project-diff <project-name> <snap1> <snap2>`
- CLI equivalent of `project_diff` MCP tool. Compares snapshots for physical drift.

### 12. `para-graph --version`
- Displays the current version of the tool.

## Workflow Integration Points

### `/para-graph` workflow
- Primary workflow for building and managing the code graph.
- Actions: `build`, `enrich`, `status`, `serve`, `audit csa`, `fix csa`.

### `/docs` workflow integration
- Doc files in `docs/` are integrated into the **Unified CSA (Tier 2)** gating.
- Traceability statistics are audited via `audit csa` and verified before release.
- Legacy `graph_link_docs` tool and `para-graph link` CLI command are disabled.

### CSA integration (plan phases)
- CSA audit gates are embedded in plan phase checkpoints.
- **Double-Gate Enforcement**: `graph_audit_csa` runs at Phase 0 (baseline) and final phase (verification).
- **Plan-Scoped Gates**: By passing `--plan-scope`, the audit focuses solely on active features. Planned specs registry is parsed to tag anchors as planned (`planned: true`) which excludes them from global coverage checks but validates active development plan alignment.
- `graph_fix_csa` auto-heals drifted spec references during development.

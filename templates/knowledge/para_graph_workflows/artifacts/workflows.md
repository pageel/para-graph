# PARA Graph Workflows & CLI Integration

`para-graph` provides CLI commands that are invoked directly or via workflows to keep the code graph updated and synchronized.

## Primary CLI Commands

### 1. `para-graph build <project-name>`
- Runs AST parser and updates the JSONL files + SQLite database under `.beads/graph/`.
- Prepend NVM path if run in a headless environment.

### 2. `para-graph serve`
- Starts the MCP server on stdio.
- Exposes tools to AI Agents for codebase semantic queries.

### 3. `para-graph link <project-name>`
- Scans documentation files for specification anchors (e.g. `csa` anchors) and creates `DOCUMENTED_BY` edges pointing to the code entities that implement them.

### 4. `para-graph ki sync`
- Syncs the para-graph specific knowledge templates to the user's local AI agent knowledge store (`~/.gemini/antigravity/knowledge/`).

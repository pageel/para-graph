---
description: Build the Code-Knowledge Graph for a specific project
source: custom
---

# /para-graph build [project-name]

> **Workspace Version:** 1.7.15 (Ecosystem Integration)
> **Goal:** Build the Code-Knowledge Graph for a specific project.

Use this workflow when you or the Agent want to update the graph memory of a project after significant code changes, ensuring the MCP Server is serving the latest data.

## 0. Agent Indices Pre-flight

// turbo

> **Layer 3 defense:** Re-read indices to guard against attention decay.

1. Re-read `.agents/rules.md` (workspace rules index)
2. Re-read `.agents/skills.md` (workspace skills index)
3. Check `project.md` for `agent.rules` / `agent.skills` — if true, re-read project indices too

---

## Steps

### 1. Context Resolution

Verify that the target project exists and contains a valid source repository (`repo/`).

```bash
# Verify project exists
ls -ld Projects/[project-name]/repo || echo "Error: Project [project-name] does not exist or has no repo/ directory."
```

### 2. Execution

// turbo

Execute the scan using the `para-graph` CLI.
> ⚠️ **Architecture Note:** The Agent calls `dist/cli.js` of the local `para-graph` project via Node to guarantee we are using the internal version rather than a global npm package. The source code path is standardized as `repo/` and the output graph path is `.beads/graph/`.

```bash
# Scan source code and dump Graph Memory.
# We ALWAYS use --import by default to preserve AI semantic enrichment and agent-injected edges (v0.7.0+) from previous scans.
node Projects/para-graph/repo/dist/cli.js build Projects/[project-name]/repo Projects/[project-name]/.beads/graph --import
```

### 3. Verification & Report

Verify that the storage engine successfully exported the graph files.

```bash
# Read metadata file generated from the build process
cat Projects/[project-name]/.beads/graph/metadata.json 2>/dev/null
```

The Agent should report back to the user using the following format (extracting metrics from `metadata.json`):

```text
🧠 GRAPH REBUILT: [project-name]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Nodes: [nodes_count] | Edges: [edges_count] | Scanned Files: [file_count]
Location: Projects/[project-name]/.beads/graph/

The memory graph has been updated successfully. The MCP Server can now query the latest data!
```

---

## Related

- `/open` — Start session and use Graph-First Policy
- `/brainstorm` — Use graph memory for architecture decisions
- `/plan` — Design new features using graph context

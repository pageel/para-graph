---
description: Build the Code-Knowledge Graph for a specific project
source: custom
---

# /para-graph <action> [target]

> **Workspace Version:** 1.8.5 (Central Gate)
> **Goal:** Manage Code-Knowledge Graph operations for a specific project or resource.
> **Constraint:** Read `.para-workspace.yml` at the workspace root to get the user's preferred language from `preferences.language` (e.g., `vi` for Vietnamese). **All output and reports MUST be translated to this language.**

Available actions:
- `build`: Extract AST and build the `.jsonl` graph files from source code. Supports `--memory` flag.
- `mem`: Trigger the CurationWorker to consolidate and cluster Semantic Memory (`memory-events.jsonl` → `memory-slices.jsonl`).
- `compact`: Maintain Compact Memory by finding and enriching the most critical unenriched God Nodes.
- `enrich`: Perform semantic enrichment on specific nodes using the MCP server.

## 0. Agent Indices Pre-flight

// turbo

> **Layer 3 defense:** Even if `/open` loaded indices at session start, long conversations
> cause attention decay. Force-load here to guarantee rules/skills awareness.

```bash
TARGET="[target]"

# Tier-1 Index Force Load
echo ""
echo "> ⚠️ Proactive Trigger Scan: Workspace Indices"
cat .agents/rules.md 2>/dev/null | head -n 30
cat .agents/skills.md 2>/dev/null | head -n 30

# Tier-2 Index Force Load
echo ""
echo "> ⚠️ Proactive Trigger Scan: Project Indices"
if [[ "$TARGET" != @resources/* ]]; then
  cat "Projects/$TARGET/.agents/rules.md" 2>/dev/null | head -n 30
  cat "Projects/$TARGET/.agents/skills.md" 2>/dev/null | head -n 30
fi
```

---

## Action: build

Use this action when you or the Agent want to update the graph memory after significant code changes.

### 1. Context Resolution

Verify that the target exists (either a Project or an external Resource).

```bash
# Resolve target paths based on namespace
TARGET="[target]"

if [[ "$TARGET" == @resources/* ]]; then
  # Resource namespace: @resources/github.com/rtk-ai/rtk
  RESOURCE_PATH="${TARGET#@resources/}"
  SOURCE_DIR="Resources/references/$RESOURCE_PATH"
  OUT_DIR="$SOURCE_DIR/.beads/graph"
else
  # Standard project namespace
  SOURCE_DIR="Projects/$TARGET/repo"
  OUT_DIR="Projects/$TARGET/.beads/graph"
fi

# Verify source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
  echo "❌ Error: Source directory '$SOURCE_DIR' does not exist."
  exit 1
fi
```

### 2. Execution

// turbo

Execute the scan using the `para-graph` CLI.
> ⚠️ **Architecture Note:** The CLI path is dynamically resolved to support both **dev mode** (source repo at `Projects/para-graph/repo/dist/`) and **installed mode** (tarball installed at `.para/tools/graph/dist/`). This ensures cross-platform compatibility regardless of how the tool was set up.

```bash
# Dynamic CLI path resolution (dev mode vs installed mode)
if [ -f "Projects/para-graph/repo/dist/cli.js" ]; then
  CLI_PATH="Projects/para-graph/repo/dist/cli.js"
elif [ -f ".para/tools/graph/dist/cli.js" ]; then
  CLI_PATH=".para/tools/graph/dist/cli.js"
else
  echo "❌ para-graph CLI not found."
  echo "   Dev mode:      Projects/para-graph/repo/dist/cli.js"
  echo "   Installed mode: .para/tools/graph/dist/cli.js"
  echo "   Run: ./para install-tool para-graph"
  exit 1
fi

# Scan source code and dump Graph Memory.
# We ALWAYS use --import by default to preserve AI semantic enrichment and agent-injected edges (v0.7.0+) from previous scans.
if [[ "$*" == *"--memory"* ]]; then
  node "$CLI_PATH" build "$SOURCE_DIR" "$OUT_DIR" --import
  node "$CLI_PATH" mem "$SOURCE_DIR"
else
  node "$CLI_PATH" build "$SOURCE_DIR" "$OUT_DIR" --import
fi
```

### 3. Verification & Report

Verify that the storage engine successfully exported the graph files.

```bash
# Read metadata file generated from the build process
cat "$OUT_DIR/metadata.json" 2>/dev/null
```

The Agent should report back to the user using the following format (extracting metrics from `metadata.json`):

```text
🧠 GRAPH REBUILT: [target]
- Nodes: [nodes_count] | Edges: [edges_count] | Scanned: [file_count] files
- Location: [OUT_DIR]

The memory graph has been updated successfully. The MCP Server can now query the latest data!
```

### 4. Enrichment Suggestion

After a successful build, the Agent SHOULD actively prompt the user if they want to semantically enrich the new graph nodes (classes, exported functions) using the `para-graph` skill.

**Example suggestion:**
> "I have finished building the Graph. There are some core architecture nodes (Classes, Functions) that have not been semantically analyzed yet. Would you like me to use MCP to scan these nodes and perform data enrichment?"

If the user agrees, the Agent MUST execute the `compact` action to build the Compact Memory.

---

## Action: mem

Use this action to trigger the CurationWorker to process raw memory events (`memory-events.jsonl`) into consolidated memory slices (`memory-slices.jsonl`).

```bash
TARGET="[target]"
if [[ "$TARGET" == @resources/* ]]; then
  SOURCE_DIR="Resources/references/${TARGET#@resources/}"
else
  SOURCE_DIR="Projects/$TARGET/repo"
fi

# Dynamic CLI path resolution (dev mode vs installed mode)
if [ -f "Projects/para-graph/repo/dist/cli.js" ]; then
  CLI_PATH="Projects/para-graph/repo/dist/cli.js"
elif [ -f ".para/tools/graph/dist/cli.js" ]; then
  CLI_PATH=".para/tools/graph/dist/cli.js"
else
  echo "❌ para-graph CLI not found."
  exit 1
fi

node "$CLI_PATH" mem "$SOURCE_DIR"
```

---

## Action: compact

Use this action to actively maintain the "Compact Memory" of the project by finding and enriching the most critical structural nodes (God Nodes).

**Execution Steps:**
1. Call `graph_god_nodes(unenrichedOnly: true, topN: 3)` (or the number requested by the user) to identify the most critical hubs that have not been enriched.
2. For each God Node returned:
   - Read the source code to understand its purpose (use `graph_context_bundle` or `view_file`).
   - Call `graph_enrich` to write a concise summary, complexity, and domain concepts.
3. Read the generated `.beads/graph/enrichment-log.md` file using `view_file`.
4. Report the Audit Log and the `totalEnriched` status back to the user.

---

## Action: enrich

Use this action to semantically enrich specific existing graph nodes (classes, exported functions, missing edges) requested by the user.

The Agent MUST load `.agents/skills/para-graph/SKILL.md` and rigorously follow the **Enrichment Workflow (§2)**.
The Agent will interact directly with the `mcp_para-graph_*` tools. No bash scripts are required for this action.

---

## Related

- `/open` — Start session and use Graph-First Policy
- `/brainstorm` — Use graph memory for architecture decisions
- `/plan` — Design new features using graph context

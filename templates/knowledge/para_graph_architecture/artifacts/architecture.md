# PARA Graph Core Architecture

The `para-graph` tool generates a hybrid structure containing both structural code AST nodes (generated via tree-sitter) and semantic data nodes (linked via LLM).

## Database & Graph Layout

The graph database is stored in a PARA project directory under `.beads/graph/`:

- `entities.jsonl`: Line-delimited JSON of all graph nodes (for simple JSON parsing).
- `relations.jsonl`: Line-delimited JSON of all graph edges.
- `<project-name>.db`: SQLite database optimized for relational queries, FTS5 searching, and MCP tools performance.
- `metadata.json`: Enrichment statistics and workspace metadata.

## Node Schema

Nodes represent code entities and files. Standard fields:
- `id`: Unique identifier (e.g. relative file path, class/function path).
- `name`: Human-readable name.
- `type`: Node type (`file`, `class`, `function`, `interface`, `variable`, `spec_anchor`).
- `semantic`: JSON string holding complexity, domain concepts, and summary (for LLM enrichment).

## Edge Schema

Edges represent directed relationships between nodes:
- `source_id`: Source node ID.
- `target_id`: Target node ID.
- `relation`: Edge type (`DEPENDS_ON`, `CALLS`, `DEFINES`, `DOCUMENTED_BY`).
- `source_file`: File path where the edge is defined.
- `source_line`: Line number of the edge definition.

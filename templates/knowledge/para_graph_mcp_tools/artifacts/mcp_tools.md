# PARA Graph MCP Tools Guide

The `para-graph` tool registers several Model Context Protocol (MCP) tools for AI Agents to search, inspect, and analyze codebase structures.

## Available Tools

### 1. `graph_query`
- **Purpose**: Search and filter nodes.
- **Parameters**:
  - `projectName` (string, required): Project folder name.
  - `nodeType` (string, optional): Filter by `file`, `class`, `function`, etc.
  - `namePattern` (string, optional): Substring filter for names.

### 2. `graph_context_bundle`
- **Purpose**: Retrieve full context bundle (node detail, outbound relations, sibling nodes, and doc links).
- **Parameters**:
  - `projectName` (string, required): Project folder name.
  - `nodeId` (string, required): Node identifier to query.

### 3. `graph_edges`
- **Purpose**: Get all edges (incoming/outgoing) connected to a specific node.
- **Parameters**:
  - `projectName` (string, required)
  - `nodeId` (string, required)

### 4. `graph_enrich`
- **Purpose**: Enrich a node with semantic information (summary, complexity, domain concepts).
- **Parameters**:
  - `projectName` (string, required)
  - `nodeId` (string, required)
  - `semantic` (object, required): Enriched metadata object.

# Rule: CSA Compliance and Documentation Harness

<!-- ⚠️ GOVERNED — /para-rule only. Overwritten by para update -->

> Governance rule to enforce Convergent Specification Architecture (CSA) compliance, ensuring bidirectional traceability between source code and documentation.

## Scope

- [x] Project-specific (example-project)
- [ ] Global reusable

## Triggers

- Ending a session (`/end` or session cleanup)
- Completing an implementation phase in `/plan`
- Committing code changes or running build/test pipelines

## Constraints

### C1: Minimum CSA Coverage Gate
- The project's **Weighted Graph Coverage** **MUST** be at least **90.0%**.
- The Agent **MUST NOT** declare a phase completed (`✅ Done`), remove the `active_plan` marker in `project.md`, or run the `/end` session synchronization if the score is below this threshold.

### C2: Mandatory Bidirectional Double-Binding
- Every public code entity (exported class, interface, function) introduced in a phase **MUST** have a corresponding back-reference comment using the `@para-doc` syntax directly above its declaration:
  ```typescript
  // @para-doc [artifacts/specs/doc.md#heading-anchor]
  export function myNewFunction() { ... }
  ```
- Correspondingly, the referenced documentation file **MUST** contain a graph anchor `<!-- @graph-node: nodeId -->` linking to the code node to complete the double-binding.

### C3: Automated Graph and Docs Synchronization
- After making modifications to source code or documentation files, the Agent **MUST** execute:
  1. Graph Rebuild: `./para-graph build` (or `npm run graph:build`) to refresh AST indices.
  2. HTML Compilation: Run the docs compilation script to compile Markdown to HTML and automatically refresh the `Graph Traceability` metrics.

### C4: Source-Verified Verification Gate
- Every modified or created documentation file **MUST** pass the anti-hallucination verification step.
- The file **MUST** carry the `<!-- ⚠️ SOURCE-VERIFIED — Cross-referenced with [files] on YYYY-MM-DD -->` guard header comment immediately below the main title.

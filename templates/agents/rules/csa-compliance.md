# Rule: CSA Compliance and Documentation Harness

<!-- ⚠️ GOVERNED — /para-rule only. Overwritten by para update -->

> Governance rule to enforce Convergent Specification Architecture (CSA) compliance, ensuring bidirectional traceability between source code and documentation.

## Scope

- [x] Project-specific
- [ ] Global reusable

## Triggers

- Ending a session (`/end` or session cleanup)
- Completing an implementation phase in `/plan`
- Committing code changes or running build/test pipelines

## Constraints

### C1: Configurable Tiered CSA Compliance Gates
- The project **MUST** meet the configured CSA coverage thresholds defined in `project.md` (under `csa:` map):
  - **Tier 1 (Specs):** Verified in `artifacts/specs/`. Hard gate (default threshold: **90.0%**). If spec coverage is below this threshold, the Agent **MUST NOT** pass phase completion (`✅ Done`), remove the `active_plan` marker, or close the session via `/end`.
  - **Tier 2 (Docs):** Verified in `docs/`. Configurable gate type (`soft`, `hard`, or `off`, default: `soft`, default threshold: **50.0%**). If configured to `hard`, it blocks like Spec. If `soft`, it acts as a warning only.
- **Commit Checkpoint (Intermediate Phases):**
  - Do NOT enforce global 100% CSA coverage checks during intermediate development phases. This preserves flexibility for incremental commits.
  - **Phase-scoped Local Check:** Agent MUST verify that all Spec Anchor IDs allocated specifically to the current Phase (via the plan's CSA mapping table) are bound to the codebase. If any phase-scoped anchor is missing or misaligned, Agent MUST issue a warning.
- **Final Push Release Gate (Final Phase):**
  - Strict global CSA compliance checks MUST be performed in the final phase of a plan before proposing a git push or creating a release.
  - Spec Coverage MUST meet the configured threshold (default **90.0%** or **100.0%** if configured) and have **zero dangling edges** to pass.
  - **Fail-safe Protocol:** If the audit fails, Agent MUST abort git staging/commit/push proposals, output detailed diagnostic errors to Chat UI, and reload context. Any corrective actions taken to resolve the failures MUST be logged in the plan walkthrough or task list.

### C2: Mandatory Unified Double-Binding (Specs & Docs)
- Every public code entity (exported class, interface, function) introduced in a development phase **MUST** have a corresponding back-reference comment using the `@para-doc` syntax directly above its declaration.
- **Short-form Reference (Recommended & Mandated):** Since v0.17.4, write only the unique anchor ID prefixed with `#` (for dynamic resolution via SQLite DB):
  ```typescript
  // @para-doc [#csa-anchor-id]
  export function myNewFunction() { ... }
  ```
- **Long-form Reference (Deprecated):** Avoid writing full paths (like `[artifacts/specs/spec-xxx.md#heading-anchor]`) as it couples code to file locations, causes duplication errors, and increases file churn.
- Correspondingly, the referenced spec or doc markdown file **MUST** contain a unique HTML anchor `<span id="csa-anchor-id"></span>` linking to the code node to complete the double-binding.
- Legacy `<!-- @graph-node: nodeId -->` and `docAnchors[]` fields are **deprecated** since v0.17.2 and will be removed in v0.19.0.

### C3: Automated Graph Build and Audit Sync
- After making modifications to source code, specs, or documentation files, the Agent **MUST** execute:
  1. Graph Rebuild: Run `npx para-graph build .` or equivalent local command to refresh AST indices.
  2. Compliance Audit: Run `npx para-graph audit csa --project .` or use the `graph_audit_csa` MCP tool to verify the tiered compliance gates.
  3. Final Gate Verification: For final phase validation, ensure `npx para-graph audit csa` reports PASS before any Git push or release creation.

### C4: Source-Verified Verification Gate
- Every modified or created documentation file **MUST** pass the anti-hallucination verification step.
- The file **MUST** carry the `<!-- ⚠️ SOURCE-VERIFIED — Cross-referenced with [files] on YYYY-MM-DD -->` guard header comment immediately below the main title.

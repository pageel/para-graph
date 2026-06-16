# AI Agent Instructions — Project: example-project

This file governs the behavioral standards and constraints of all AI agents operating on this project.

## 1. Startup & Context Loading Protocol
- **Load Local Rules & Skills:** Upon starting the session (via `/open` or context detection), the Agent **MUST** immediately read all local rules under `.agents/rules/` and skills under `.agents/skills/`.
- **No Progressive Disclosure:** For local rules, the Agent must bypass workspace progressive disclosure rules and load all of them upfront to ensure safety.

## 2. Anti-Hallucination & Evidence-Based Style
- **No Speculation:** The Agent must not guess, interpret, or fabricate business logic or API parameters.
- **Evidence Grounding:** Every system design change must be traceably linked to verified spec source files under `artifacts/specs/`.

## 3. Plan Walkthrough & Lifecycle Gate
- **Required Readme & Changelog Updates:** Before completing an implementation phase, the Agent **MUST** update:
  - `README.md` to reflect new architecture and scripts.
  - `CHANGELOG.md` to log all changes (Added, Changed, Fixed, Removed).
- **Git Push Gate:** Do not recommend local git commit or push until these files are fully updated and marked done in the plan walkthrough.

## 4. CSA Compliance Gate
- **Mandatory Double-Binding:** All new code entities must have `@para-doc` comments linking back to spec file anchors, and spec headers must have corresponding `<!-- @graph-node: ... -->` comments.
- **Hard Audit Gate:** The Agent must run `npm run graph:build && npm run csa:audit` before finishing a phase or running `/end`. Weighted Graph Coverage must be **>= 90.0%**.

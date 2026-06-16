---
name: csa
description: Global Convergent Specification Architecture (CSA) skill for workspace-wide verification and documentation quality gates.
---

# Global CSA (Convergent Specification Architecture) Skill

This skill enforces and standardizes the **Convergent Specification Architecture (CSA)** across all projects in the workspace. It establishes bidirectional traceability between source code implementation and technical specifications, preventing document-code drift and ensuring software quality.

---

## 1. Core CSA Principles

1. **Bidirectional Traceability (Double-Binding):** Every public code entity (class, interface, function, API endpoint) must link to its corresponding design specification, and vice versa.
2. **Source-Verified Integrity:** All design and documentation files must be strictly cross-referenced against the actual codebase implementation before release.
3. **Zero-Drift Enforcement (Audit Gate):** Source code builds and version control commits are gated by an automated audit script that checks graph coverage.

---

## 2. Technical CSA Workflow

### Entity Double-Binding Protocol

When writing or modifying code entities:
1. **Spec-to-Code Link:** Find the corresponding feature section in the specification Markdown file (under `artifacts/specs/`). Define a unique HTML span anchor (format: `csa-[domain]-[module]-[element]`) in that section:
   ```markdown
   ### User Authentication <span id="csa-user-auth"></span>
   ```
2. **Code-to-Spec Link:** In the source code file, directly above the entity declaration, add a `@para-doc` comment linking back to the specification file anchor. Use the appropriate comment syntax for the target language:

   | Language / File type | Comment Syntax | Example |
   |:---|:---|:---|
   | **TypeScript / JavaScript / Go / Rust / PHP** | `//` | `// @para-doc [specs/doc.md#anchor]` |
   | **Python / Shell (Bash) / Ruby** | `#` | `# @para-doc [specs/doc.md#anchor]` |
   | **HTML / Markdown** | `<!-- ... -->` | `<!-- @para-doc [specs/doc.md#anchor] -->` |
   | **CSS / SCSS** | `/* ... */` | `/* @para-doc [specs/doc.md#anchor] */` |

### Execution Loop & Verification
After editing code or specifications, the Agent must run:
```bash
# 1. Rebuild the AST graph to refresh node and edge indexes
npx para-graph build <project-name>

# 2. Run the CSA compliance audit tool to verify coverage score (Min 90.0%)
npx para-graph audit csa --project .
```

---

## 3. Standard Project Integration Templates

To activate CSA in a new project, copy the following templates into the project's `.agents/` configuration directory.

### Template A: Project Agent Instructions (`.agents/AGENTS.md`)
Create a file at `.agents/AGENTS.md` using the template below:

```markdown
# AI Agent Instructions — Project: [Project Name]

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
- **Mandatory Double-Binding:** All new code entities must have `@para-doc` comments linking back to spec file HTML anchors (`<span id="csa-..."></span>`).
- **Hard Audit Gate:** The Agent must run `npx para-graph build <project-name> && npx para-graph audit csa --project .` before finishing a phase or running `/end`. Weighted Graph Coverage must be **>= 90.0%**.
```

---

### Template B: CSA Rule Specification (`.agents/rules/csa-compliance.md`)
Create a file at `.agents/rules/csa-compliance.md` using the template below:

```markdown
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

### C1: Minimum CSA Coverage Gate
- The project's **Weighted Graph Coverage** **MUST** be at least **90.0%**.
- The Agent **MUST NOT** declare a phase completed (`✅ Done`), remove the `active_plan` marker in `project.md`, or run the `/end` session synchronization if the score is below this threshold.

### C2: Mandatory Bidirectional Double-Binding
- Every public code entity (exported class, interface, function) introduced in a phase **MUST** have a corresponding back-reference comment using the `@para-doc` syntax directly above its declaration:
  ```typescript
  // @para-doc [artifacts/specs/doc.md#heading-anchor]
  export function myNewFunction() { ... }
  ```
- Correspondingly, the referenced documentation file **MUST** contain a unique HTML anchor `<span id="csa-anchor-id"></span>` linking to the code node to complete the double-binding.

### C3: Automated Graph and Docs Synchronization
- After making modifications to source code or documentation files, the Agent **MUST** execute:
  1. Graph Rebuild: `npx para-graph build <project-name>` to refresh AST indices.
  2. Compliance Audit: Run `npx para-graph audit csa --project .` to automatically verify the traceability and coverage metrics.

### C4: Source-Verified Verification Gate
- Every modified or created documentation file **MUST** pass the anti-hallucination verification step.
- The file **MUST** carry the `<!-- ⚠️ SOURCE-VERIFIED — Cross-referenced with [files] on YYYY-MM-DD -->` guard header comment immediately below the main title.
```

---

### Template C: Project-level Skill (`.agents/skills/[project-name]/SKILL.md`)
Create a file at `.agents/skills/[project-name]/SKILL.md` using the template below:

```markdown
---
name: [project-name]
description: Process coordination and quality control skill for project [project-name].
---

# Project Skill: [project-name]

## Plan Completion Gate Checklist
Whenever concluding or updating an active plan/phase, the Agent must perform these tasks:
1. **Update README.md:** Ensure usage guides, structure, and scripts are accurate (including localizations under docs/locales/ if applicable).
2. **Update CHANGELOG.md:** Document all changes matching the version target.
3. **Walkthrough Verification:** Check off completion items in the plan's Walkthrough.
4. **CSA Audit Reporting:** Print the live output of `npm run csa:audit` in the chat and embed the raw report directly into the plan's Walkthrough section.

## Technical CSA Process

### 1. Graph Impact Analysis
* Prior to refactoring or writing new code, execute `graph_impact_analysis` to define the blast radius of target entities.
* If the blast radius extends outside the active phase's scope, halt and propose a plan amendment.

### 2. Entity Double-Binding
* **Code side:** Prepend public declarations with:
  ```typescript
  // @para-doc [artifacts/specs/spec-file.md#heading-anchor]
  export class TargetEntity { ... }
  ```
* **Spec side:** Add a unique HTML anchor in the spec section:
  ```markdown
  ### Section Title <span id="csa-target-entity"></span>
  ```

### 3. Automated Verification Gate
* Run graph rebuild: `npx para-graph build <project-name>`
* Run CSA compliance checker: `npx para-graph audit csa --project .` (verify coverage >= 90%)
```

---

## 4. Real-world References (Case Study)

The following files serve as concrete reference implementations of the templates above:
- **AGENTS.md Reference:** [example-agents.md](./references/example-agents.md)
- **csa-compliance.md Rule Reference:** [example-csa-compliance.md](./references/example-csa-compliance.md)
- **SKILL.md Project Reference:** [example-skill.md](./references/example-skill.md)

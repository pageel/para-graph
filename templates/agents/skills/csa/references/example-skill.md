---
name: example-project
description: Process coordination and quality control skill for project example-project.
---

# Project Skill: example-project

## Plan Completion Gate Checklist
Whenever concluding or updating an active plan/phase, the Agent must perform these tasks:
1. **Update README.md:** Ensure usage guides, structure, and scripts are accurate (including its translation under docs/locales/[locale-code].md if major features are changed).
2. **Update CHANGELOG.md:** Document all changes matching the version target.
3. **Walkthrough Verification:** Check off completion items in the plan's Walkthrough.

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
* **Spec side:** Append hidden HTML comments to spec headers:
  ```markdown
  ### Section Title <!-- @graph-node: src/path/to/file.ts::TargetEntity -->
  ```

### 3. Automated Verification Gate
* Run graph rebuild: `npm run graph:build`
* Run CSA compliance checker: `npm run csa:audit` (verify coverage >= 90%)

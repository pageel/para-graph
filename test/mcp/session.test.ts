import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Define static sandbox paths
const tempHome = path.resolve('./artifacts/tests/tmp/sandbox/home');
const tempWorkspace = path.resolve('./artifacts/tests/tmp/sandbox/workspace');
const projectName = 'test-project';

// Mock os.homedir globally to avoid ESM namespace modification errors
vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return {
    ...original,
    homedir: () => tempHome,
  };
});

import * as os from 'node:os';
import { registerTools } from '../../src/mcp/tools.js';

describe('MCP Tool: project_session_compact', () => {
  beforeEach(() => {
    // Setup clean sandbox directories
    fs.mkdirSync(tempHome, { recursive: true });
    fs.mkdirSync(path.join(tempWorkspace, 'Projects', projectName, '.agents'), { recursive: true });
    fs.mkdirSync(path.join(tempWorkspace, '.agents'), { recursive: true });
  });

  afterEach(() => {
    // Teardown and clean sandbox
    try {
      fs.rmSync(path.resolve('./artifacts/tests/tmp/sandbox'), { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup issues
    }
    vi.restoreAllMocks();
  });

  it('should compile context and write compacted session.md to knowledge stores', async () => {
    // 1. Create mock files in the sandbox workspace
    const workspaceRules = '# Workspace Rules Index\n| Rule | Trigger | File |\n| Governance | Touching kernel/ | rules/governance.md |';
    const workspaceSkills = '# Workspace Skills Index\n| Skill | Trigger | File |\n| TDD | Running tests | tdd/SKILL.md |';
    const projectRules = '# Project Rules Index\n| Rule | Trigger | File |\n| Maintenance | Git ops | maintenance.md |';
    const projectSkills = '# Project Skills Index\n| Skill | Trigger | File |\n| para-graph | Creating plans | para-graph/SKILL.md |';
    const projectMd = '---\nname: "test-project"\nversion: "0.1.0"\nactive_plan: "plans/plan.md"\n---\n# Project Contract';
    const agentsMd = '# Agent Guidelines\n1. Use Vietnamese for plans.';

    fs.writeFileSync(path.join(tempWorkspace, '.agents/rules.md'), workspaceRules);
    fs.writeFileSync(path.join(tempWorkspace, '.agents/skills.md'), workspaceSkills);
    fs.writeFileSync(path.join(tempWorkspace, 'Projects', projectName, '.agents/rules.md'), projectRules);
    fs.writeFileSync(path.join(tempWorkspace, 'Projects', projectName, '.agents/skills.md'), projectSkills);
    fs.writeFileSync(path.join(tempWorkspace, 'Projects', projectName, 'project.md'), projectMd);
    fs.writeFileSync(path.join(tempWorkspace, 'Projects', projectName, '.agents/AGENTS.md'), agentsMd);

    // 2. Register tools
    const handlers: Record<string, any> = {};
    const mockServer = {
      tool: (name: string, desc: string, schema: any, handler: any) => {
        handlers[name] = handler;
      }
    };
    registerTools(mockServer as any, tempWorkspace);

    const sessionCompactHandler = handlers['project_session_compact'];
    expect(sessionCompactHandler).toBeDefined();

    // 3. Call the compaction tool
    const result = await sessionCompactHandler({ projectName });
    const content = JSON.parse(result.content[0].text);

    expect(content.success).toBe(true);

    // 4. Verify target session.md files exist and contain compacted context
    const path1 = path.join(tempHome, '.gemini/antigravity-ide/knowledge/vibecode_session/artifacts/session.md');
    const path2 = path.join(tempHome, '.gemini/antigravity-ide/knowledge/para_vibecode_session/artifacts/session.md');

    expect(fs.existsSync(path1)).toBe(true);
    expect(fs.existsSync(path2)).toBe(true);

    const compactedText = fs.readFileSync(path1, 'utf-8');
    expect(compactedText).toContain('test-project');
    expect(compactedText).toContain('0.1.0');
    expect(compactedText).toContain('Workspace Rules Index');
    expect(compactedText).toContain('Project Rules Index');
    expect(compactedText).toContain('Agent Guidelines');
  });

  it('should degrade gracefully if some optional files are missing', async () => {
    // Only write minimal required files
    const projectMd = '---\nname: "test-project"\nversion: "0.1.0"\nactive_plan: "plans/plan.md"\n---\n# Project Contract';
    fs.writeFileSync(path.join(tempWorkspace, 'Projects', projectName, 'project.md'), projectMd);

    const handlers: Record<string, any> = {};
    const mockServer = {
      tool: (name: string, desc: string, schema: any, handler: any) => {
        handlers[name] = handler;
      }
    };
    registerTools(mockServer as any, tempWorkspace);

    const sessionCompactHandler = handlers['project_session_compact'];
    const result = await sessionCompactHandler({ projectName });
    const content = JSON.parse(result.content[0].text);

    expect(content.success).toBe(true);
    expect(content.warnings).toBeDefined();
    expect(content.warnings.length).toBeGreaterThan(0);

    const path1 = path.join(tempHome, '.gemini/antigravity-ide/knowledge/vibecode_session/artifacts/session.md');
    expect(fs.existsSync(path1)).toBe(true);
  });
});

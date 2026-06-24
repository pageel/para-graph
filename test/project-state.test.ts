import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseProjectFile, parseBacklogFile, parseSprintFile } from '../src/utils/project-parser.js';
import { SqliteManager } from '../src/graph/store/sqlite-manager.js';
import { registerTools } from '../src/mcp/tools.js';
import fs from 'fs';
import path from 'path';

let mockFiles: Record<string, string> = {};

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn((p) => {
      if (typeof p === 'string' && (p.endsWith('project.md') || p.endsWith('backlog.md') || p.endsWith('sprint-current.md'))) {
        return true;
      }
      return actual.existsSync(p);
    }),
    readFileSync: vi.fn((p, opts) => {
      if (typeof p === 'string') {
        const matchedKey = Object.keys(mockFiles).find(k => p.endsWith(k));
        if (matchedKey) return mockFiles[matchedKey];
      }
      return actual.readFileSync(p, opts);
    }),
  };
});

describe('Project Parser', () => {
  describe('parseProjectFile', () => {
    it('should parse project frontmatter correctly', () => {
      const content = `---
name: "para-graph"
version: "0.17.5"
status: "active"
active_plan: "artifacts/plans/v0.17.5-2026-06-24-state-cache.md"
---
# Project Title
`;
      const result = parseProjectFile(content);
      expect(result.version).toBe('0.17.5');
      expect(result.status).toBe('active');
      expect(result.active_plan).toBe('artifacts/plans/v0.17.5-2026-06-24-state-cache.md');
    });

    it('should handle missing fields gracefully', () => {
      const content = `---
name: "para-graph"
---
`;
      const result = parseProjectFile(content);
      expect(result.version).toBe('');
      expect(result.status).toBe('');
      expect(result.active_plan).toBe('');
    });

    it('should handle invalid YAML frontmatter gracefully', () => {
      const content = `invalid content`;
      const result = parseProjectFile(content);
      expect(result.version).toBe('');
      expect(result.status).toBe('');
      expect(result.active_plan).toBe('');
    });
  });

  describe('parseBacklogFile', () => {
    it('should count active and completed tasks correctly', () => {
      const content = `
# Backlog
## 📋 Active Tasks
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

## ✅ Completed (Archived)
- [x] Task 4
- [x] Task 5
`;
      const result = parseBacklogFile(content);
      expect(result.activeCount).toBe(3);
      expect(result.completedCount).toBe(2);
    });

    it('should handle empty backlog gracefully', () => {
      const result = parseBacklogFile('');
      expect(result.activeCount).toBe(0);
      expect(result.completedCount).toBe(0);
    });
  });

  describe('parseSprintFile', () => {
    it('should count sprint pending and completed tasks correctly', () => {
      const content = `
# Sprint Current
- [ ] Sprint Task 1
- [x] Sprint Task 2
- [ ] Sprint Task 3
- [x] Sprint Task 4
`;
      const result = parseSprintFile(content);
      expect(result.pendingCount).toBe(2);
      expect(result.completedCount).toBe(2);
    });

    it('should handle empty sprint file gracefully', () => {
      const result = parseSprintFile('');
      expect(result.pendingCount).toBe(0);
      expect(result.completedCount).toBe(0);
    });
  });
});

describe('SqliteManager Project State Cache', () => {
  const dbPath = path.join(process.cwd(), 'test', '.test-output', 'test-state.db');
  let manager: SqliteManager | null = null;

  beforeEach(() => {
    if (fs.existsSync(dbPath)) {
      try { fs.unlinkSync(dbPath); } catch (e) {}
    }
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    manager = new SqliteManager('test-project', dbPath);
    manager.initSchema();
  });

  afterEach(() => {
    if (manager) {
      try { manager.close(); } catch (e) {}
    }
    if (fs.existsSync(dbPath)) {
      try { fs.unlinkSync(dbPath); } catch (e) {}
    }
  });

  it('should save and get project state cache correctly', () => {
    if (!manager) return;
    const state = {
      active_plan: 'plans/active.md',
      version: '0.1.0',
      status: 'active',
      backlog_active_count: 5,
      backlog_completed_count: 10,
      sprint_pending_count: 2,
      sprint_completed_count: 3,
      project_hash: 'hash-project',
      backlog_hash: 'hash-backlog',
      sprint_hash: 'hash-sprint',
      synced_at: Date.now()
    };

    manager.saveProjectState('test-project', state);
    const retrieved = manager.getProjectState('test-project');

    expect(retrieved).toBeDefined();
    expect(retrieved!.active_plan).toBe(state.active_plan);
    expect(retrieved!.version).toBe(state.version);
    expect(retrieved!.status).toBe(state.status);
    expect(retrieved!.backlog_active_count).toBe(state.backlog_active_count);
    expect(retrieved!.backlog_completed_count).toBe(state.backlog_completed_count);
    expect(retrieved!.sprint_pending_count).toBe(state.sprint_pending_count);
    expect(retrieved!.sprint_completed_count).toBe(state.sprint_completed_count);
    expect(retrieved!.project_hash).toBe(state.project_hash);
    expect(retrieved!.backlog_hash).toBe(state.backlog_hash);
    expect(retrieved!.sprint_hash).toBe(state.sprint_hash);
    expect(retrieved!.synced_at).toBe(state.synced_at);
  });

  it('should return null if project state cache does not exist', () => {
    if (!manager) return;
    const retrieved = manager.getProjectState('non-existent');
    expect(retrieved).toBeNull();
  });
});

describe('MCP Tools: project_state_get and project_state_sync', () => {
  let handlers: Record<string, any>;

  beforeEach(() => {
    handlers = {};
    const mockServer = {
      tool: (name: string, desc: string, schema: any, handler: any) => {
        handlers[name] = handler;
      }
    };
    registerTools(mockServer as any, '/workspace');
  });

  afterEach(() => {
    mockFiles = {};
    vi.restoreAllMocks();
  });

  it('should sync project state and return success', async () => {
    const syncHandler = handlers['project_state_sync'];
    expect(syncHandler).toBeDefined();

    mockFiles = {
      'project.md': `---
name: "test-project"
version: "1.0.0"
status: "active"
active_plan: "plans/active.md"
---`,
      'backlog.md': `- [ ] Task 1\n- [x] Task 2`,
      'sprint-current.md': `- [ ] Task 3\n- [ ] Task 4`
    };

    const initSchemaSpy = vi.spyOn(SqliteManager.prototype, 'initSchema').mockImplementation(() => {});
    const saveStateSpy = vi.spyOn(SqliteManager.prototype, 'saveProjectState').mockImplementation(() => {});
    const closeSpy = vi.spyOn(SqliteManager.prototype, 'close').mockImplementation(() => {});

    const result = await syncHandler({ projectName: 'test-project' });
    const content = JSON.parse(result.content[0].text);

    expect(content.success).toBe(true);
    expect(content.state.version).toBe('1.0.0');
    expect(content.state.backlog_active_count).toBe(1);
    expect(content.state.backlog_completed_count).toBe(1);
    expect(content.state.sprint_pending_count).toBe(2);

    expect(saveStateSpy).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('should get project state and check freshness', async () => {
    const getHandler = handlers['project_state_get'];
    expect(getHandler).toBeDefined();

    const mockState = {
      active_plan: 'plans/active.md',
      version: '1.0.0',
      status: 'active',
      backlog_active_count: 1,
      backlog_completed_count: 1,
      sprint_pending_count: 2,
      sprint_completed_count: 0,
      project_hash: '46f86faa6bbf9ac94a7e459509a20ed0', // md5 of 'project'
      backlog_hash: '1793b1ff583250c6861250872d36a86b', // md5 of 'backlog'
      sprint_hash: '1d08fdad0400ce91f60e43105b4df9c1', // md5 of 'sprint'
      synced_at: Date.now()
    };

    mockFiles = {
      'project.md': 'project',
      'backlog.md': 'backlog',
      'sprint-current.md': 'sprint'
    };

    const initSchemaSpy = vi.spyOn(SqliteManager.prototype, 'initSchema').mockImplementation(() => {});
    const getStateSpy = vi.spyOn(SqliteManager.prototype, 'getProjectState').mockReturnValue(mockState);
    const closeSpy = vi.spyOn(SqliteManager.prototype, 'close').mockImplementation(() => {});

    const result = await getHandler({ projectName: 'test-project' });
    const content = JSON.parse(result.content[0].text);

    expect(content.fresh).toBe(true);
    expect(content.state.version).toBe('1.0.0');
    expect(getStateSpy).toHaveBeenCalled();
  });
});


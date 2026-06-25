import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerTools } from '../../src/mcp/tools.js';
import { SqliteManager } from '../../src/graph/store/sqlite-manager.js';
import * as fileScanner from '../../src/utils/file-scanner.js';
import * as fs from 'node:fs';
import * as junkAuditor from '../../src/utils/junk-auditor.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: vi.fn((path, options) => {
      if (typeof path === 'string' && path.includes('mock-file.txt')) {
        return 'file content';
      }
      return actual.readFileSync(path, options);
    }),
    statSync: vi.fn((path) => {
      if (typeof path === 'string' && path.includes('mock-file.txt')) {
        return { size: 12 } as any;
      }
      return actual.statSync(path);
    }),
  };
});

describe('MCP Tools: project_snapshot', () => {
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

  it('should take a project snapshot, check protected files and persist to database', async () => {
    const snapshotHandler = handlers['project_snapshot'];
    expect(snapshotHandler).toBeDefined();

    // Mock file scanner returning mock files
    const scanSpy = vi.spyOn(fileScanner, 'scanDirectory').mockReturnValue([
      '/workspace/Projects/test-project/repo/mock-file.txt',
    ]);

    // Mock SQLiteManager and DB connection
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([
          { filePath: '.para-workspace.yml', description: 'Missing protected file' },
          { filePath: 'mock-file.txt', description: 'Present protected file' }
        ])
      })
    };

    const initSchemaSpy = vi.spyOn(SqliteManager.prototype, 'initSchema').mockImplementation(() => {});
    const getConnectionSpy = vi.spyOn(SqliteManager.prototype, 'getConnection').mockReturnValue(mockDb as any);
    const insertSnapshotSpy = vi.spyOn(SqliteManager.prototype, 'insertSnapshot').mockImplementation(() => {});
    const closeSpy = vi.spyOn(SqliteManager.prototype, 'close').mockImplementation(() => {});

    const result = await snapshotHandler({ projectName: 'test-project' });
    const content = JSON.parse(result.content[0].text);

    expect(content.success).toBe(true);
    expect(content.totalFiles).toBe(1);
    expect(content.snapshotId).toBeDefined();
    expect(content.warnings).toContain('Protected file is missing: .para-workspace.yml');
    
    expect(scanSpy).toHaveBeenCalled();
    expect(insertSnapshotSpy).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('should call auditJunk and return junk warnings if auditJunk is true', async () => {
    const snapshotHandler = handlers['project_snapshot'];
    expect(snapshotHandler).toBeDefined();

    const scanSpy = vi.spyOn(fileScanner, 'scanDirectory').mockReturnValue([
      '/workspace/Projects/test-project/repo/mock-file.txt',
    ]);

    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([])
      })
    };

    const initSchemaSpy = vi.spyOn(SqliteManager.prototype, 'initSchema').mockImplementation(() => {});
    const getConnectionSpy = vi.spyOn(SqliteManager.prototype, 'getConnection').mockReturnValue(mockDb as any);
    const insertSnapshotSpy = vi.spyOn(SqliteManager.prototype, 'insertSnapshot').mockImplementation(() => {});
    const closeSpy = vi.spyOn(SqliteManager.prototype, 'close').mockImplementation(() => {});

    // Mock auditJunk module
    const auditJunkSpy = vi.spyOn(junkAuditor, 'auditJunk').mockReturnValue({
      classified: {
        safe: ['junk-file-1.tmp'],
        prompt: ['junk-file-2.log'],
        report: []
      },
      totalFiles: 2,
      totalSize: 100,
      profileUsed: 'default',
      autoDetected: true
    });

    const result = await snapshotHandler({ 
      projectName: 'test-project',
      auditJunk: true 
    });
    const content = JSON.parse(result.content[0].text);

    expect(content.success).toBe(true);
    expect(content.junkFiles).toContain('junk-file-1.tmp');
    expect(content.junkFiles).toContain('junk-file-2.log');
    expect(content.junkFiles.length).toBe(2);
    expect(auditJunkSpy).toHaveBeenCalledWith(
      '/workspace/Projects/test-project',
      expect.any(Object)
    );

    vi.restoreAllMocks();
  });

  it('should exclude .beads, artifacts, sessions, docs when rootDir is not a repo subdir', async () => {
    const snapshotHandler = handlers['project_snapshot'];
    const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false); // Make /repo not exist
    const scanSpy = vi.spyOn(fileScanner, 'scanDirectory').mockReturnValue([
      '/workspace/Projects/test-project/mock-file.txt',
    ]);

    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([])
      })
    };
    const initSchemaSpy = vi.spyOn(SqliteManager.prototype, 'initSchema').mockImplementation(() => {});
    const getConnectionSpy = vi.spyOn(SqliteManager.prototype, 'getConnection').mockReturnValue(mockDb as any);
    const insertSnapshotSpy = vi.spyOn(SqliteManager.prototype, 'insertSnapshot').mockImplementation(() => {});
    const closeSpy = vi.spyOn(SqliteManager.prototype, 'close').mockImplementation(() => {});

    await snapshotHandler({ projectName: 'test-project' });

    expect(scanSpy).toHaveBeenCalledWith('/workspace/Projects/test-project', expect.objectContaining({
      excludePatterns: expect.arrayContaining([
        '.beads/**',
        'artifacts/**',
        'sessions/**',
        'docs/**'
      ])
    }));

    vi.restoreAllMocks();
  });

  it('should NOT exclude .beads, artifacts, sessions, docs when rootDir is a repo subdir', async () => {
    const snapshotHandler = handlers['project_snapshot'];
    const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (typeof p === 'string' && p.endsWith('repo')) return true;
      return false;
    });
    const scanSpy = vi.spyOn(fileScanner, 'scanDirectory').mockReturnValue([
      '/workspace/Projects/test-project/repo/mock-file.txt',
    ]);

    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([])
      })
    };
    const initSchemaSpy = vi.spyOn(SqliteManager.prototype, 'initSchema').mockImplementation(() => {});
    const getConnectionSpy = vi.spyOn(SqliteManager.prototype, 'getConnection').mockReturnValue(mockDb as any);
    const insertSnapshotSpy = vi.spyOn(SqliteManager.prototype, 'insertSnapshot').mockImplementation(() => {});
    const closeSpy = vi.spyOn(SqliteManager.prototype, 'close').mockImplementation(() => {});

    await snapshotHandler({ projectName: 'test-project' });

    expect(scanSpy).toHaveBeenCalledWith('/workspace/Projects/test-project/repo', expect.objectContaining({
      excludePatterns: expect.not.arrayContaining([
        '.beads/**',
        'artifacts/**',
        'sessions/**',
        'docs/**'
      ])
    }));

    vi.restoreAllMocks();
  });
});

describe('MCP Tools: project_diff', () => {
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

  it('should call compareSnapshots and return difference', async () => {
    const diffHandler = handlers['project_diff'];
    expect(diffHandler).toBeDefined();

    const mockDiff = {
      added: [{ filePath: 'new.txt', size: 10, hash: 'h1' }],
      removed: [],
      modified: []
    };

    const initSchemaSpy = vi.spyOn(SqliteManager.prototype, 'initSchema').mockImplementation(() => {});
    const compareSpy = vi.spyOn(SqliteManager.prototype, 'compareSnapshots').mockReturnValue(mockDiff);
    const closeSpy = vi.spyOn(SqliteManager.prototype, 'close').mockImplementation(() => {});

    const result = await diffHandler({
      projectName: 'test-project',
      sourceSnapshotId: 'snap-1',
      targetSnapshotId: 'snap-2'
    });
    const content = JSON.parse(result.content[0].text);

    expect(content.added.length).toBe(1);
    expect(content.added[0].filePath).toBe('new.txt');
    expect(compareSpy).toHaveBeenCalledWith('snap-1', 'snap-2');
    expect(closeSpy).toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});

describe('MCP Tools: project_protected_files', () => {
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

  it('should support action list, add and remove', async () => {
    const protectedFilesHandler = handlers['project_protected_files'];
    expect(protectedFilesHandler).toBeDefined();

    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([{ file_path: 'project.md', description: 'test' }]),
        run: vi.fn()
      })
    };

    const initSchemaSpy = vi.spyOn(SqliteManager.prototype, 'initSchema').mockImplementation(() => {});
    const getConnectionSpy = vi.spyOn(SqliteManager.prototype, 'getConnection').mockReturnValue(mockDb as any);
    const closeSpy = vi.spyOn(SqliteManager.prototype, 'close').mockImplementation(() => {});

    // 1. Test List
    const listResult = await protectedFilesHandler({
      projectName: 'test-project',
      action: 'list'
    });
    const listContent = JSON.parse(listResult.content[0].text);
    expect(listContent.files.length).toBe(1);
    expect(listContent.files[0].file_path).toBe('project.md');

    // 2. Test Add
    const addResult = await protectedFilesHandler({
      projectName: 'test-project',
      action: 'add',
      filePath: 'test-file.txt',
      description: 'Test file description'
    });
    const addContent = JSON.parse(addResult.content[0].text);
    expect(addContent.success).toBe(true);

    // 3. Test Remove
    const removeResult = await protectedFilesHandler({
      projectName: 'test-project',
      action: 'remove',
      filePath: 'test-file.txt'
    });
    const removeContent = JSON.parse(removeResult.content[0].text);
    expect(removeContent.success).toBe(true);

    expect(closeSpy).toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});

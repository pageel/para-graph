import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveSourceDir, resolveGraphDir } from '../../../src/graph/store/pathResolver.js';
import * as fs from 'node:fs';
import { resolve } from 'node:path';

vi.mock('node:fs');

describe('pathResolver', () => {
  const workspaceRoot = '/test/workspace';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('resolveGraphDir', () => {
    it('resolves graph dir for standard project', () => {
      const result = resolveGraphDir(workspaceRoot, 'para-graph');
      expect(result).toBe(resolve(workspaceRoot, 'Projects', 'para-graph', '.beads', 'graph'));
    });

    it('resolves graph dir for external resource', () => {
      const result = resolveGraphDir(workspaceRoot, '@resources/ai-agents/kernel');
      expect(result).toBe(resolve(workspaceRoot, 'Resources', 'references', 'ai-agents/kernel', '.beads', 'graph'));
    });
  });

  describe('resolveSourceDir', () => {
    it('returns repo directory if it exists', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('repo')) return true;
        return false;
      });

      const result = resolveSourceDir(workspaceRoot, 'para-graph');
      expect(result).toBe(resolve(workspaceRoot, 'Projects', 'para-graph', 'repo'));
    });

    it('falls back to project root directory if repo directory does not exist', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation(() => false);

      const result = resolveSourceDir(workspaceRoot, 'para-graph');
      expect(result).toBe(resolve(workspaceRoot, 'Projects', 'para-graph'));
    });

    it('resolves source dir for external resource', () => {
      const result = resolveSourceDir(workspaceRoot, '@resources/ai-agents/kernel');
      expect(result).toBe(resolve(workspaceRoot, 'Resources', 'references', 'ai-agents/kernel'));
    });
  });

  describe('security validations', () => {
    it('throws error for invalid project names (Path Traversal prevention)', () => {
      expect(() => resolveGraphDir(workspaceRoot, '../../secret')).toThrow();
      expect(() => resolveGraphDir(workspaceRoot, 'project/name')).toThrow();
      expect(() => resolveGraphDir(workspaceRoot, 'project\\name')).toThrow();
      expect(() => resolveGraphDir(workspaceRoot, 'proj.name')).toThrow();
    });

    it('throws error for invalid external resource paths', () => {
      expect(() => resolveGraphDir(workspaceRoot, '@resources/')).toThrow();
      expect(() => resolveGraphDir(workspaceRoot, '@resources/../secret')).toThrow();
      expect(() => resolveGraphDir(workspaceRoot, '@resources/a/../b')).toThrow();
      expect(() => resolveGraphDir(workspaceRoot, '@resources/abc/..')).toThrow();
    });

    it('throws error for project name or resource path exceeding 100 characters', () => {
      const longProjectName = 'a'.repeat(101);
      expect(() => resolveGraphDir(workspaceRoot, longProjectName)).toThrow();
      const longResource = '@resources/' + 'a'.repeat(100);
      expect(() => resolveGraphDir(workspaceRoot, longResource)).toThrow();
    });
  });
});

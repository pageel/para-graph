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
});

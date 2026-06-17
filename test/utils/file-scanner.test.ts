import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { scanDirectory } from '../../src/utils/file-scanner.js';

describe('file-scanner', () => {
  const sandboxPath = path.resolve(__dirname, '../../../../artifacts/tests/tmp/sandbox');

  beforeEach(() => {
    // Setup a clean sandbox environment
    if (fs.existsSync(sandboxPath)) {
      fs.rmSync(sandboxPath, { recursive: true, force: true });
    }
    fs.mkdirSync(sandboxPath, { recursive: true });

    // Create mock files and folders
    fs.writeFileSync(path.join(sandboxPath, 'file1.txt'), 'hello');
    fs.writeFileSync(path.join(sandboxPath, 'file2.log'), 'log data');
    
    const dir1 = path.join(sandboxPath, 'dir1');
    fs.mkdirSync(dir1);
    fs.writeFileSync(path.join(dir1, 'file3.txt'), 'nested');

    // Folder to exclude
    const nodeModules = path.join(sandboxPath, 'node_modules');
    fs.mkdirSync(nodeModules);
    fs.writeFileSync(path.join(nodeModules, 'package.json'), '{}');

    // Deep directory structure (> 5 levels)
    // sandbox (0) -> dir1 (1) -> d2 (2) -> d3 (3) -> d4 (4) -> d5 (5) -> d6 (6) -> fileDeep.txt
    let deepDir = dir1;
    for (let i = 2; i <= 6; i++) {
      deepDir = path.join(deepDir, `d${i}`);
      fs.mkdirSync(deepDir);
    }
    fs.writeFileSync(path.join(deepDir, 'fileDeep.txt'), 'deep content');
  });

  afterEach(() => {
    if (fs.existsSync(sandboxPath)) {
      fs.rmSync(sandboxPath, { recursive: true, force: true });
    }
  });

  it('should scan all files at default depth limit', () => {
    const files = scanDirectory(sandboxPath);
    // Normalize to POSIX paths for consistent assertions
    const relativeFiles = files.map((f: string) => path.relative(sandboxPath, f).replace(/\\/g, '/'));
    
    expect(relativeFiles).toContain('file1.txt');
    expect(relativeFiles).toContain('file2.log');
    expect(relativeFiles).toContain('dir1/file3.txt');
    // Default maxDepth = 5, d6 is at level 6 so fileDeep.txt should be ignored
    expect(relativeFiles).not.toContain('dir1/d2/d3/d4/d5/d6/fileDeep.txt');
  });

  it('should support custom maxDepth option', () => {
    // With maxDepth = 7, fileDeep.txt (at depth 7) should be scanned
    const files = scanDirectory(sandboxPath, { maxDepth: 7 });
    const relativeFiles = files.map((f: string) => path.relative(sandboxPath, f).replace(/\\/g, '/'));
    expect(relativeFiles).toContain('dir1/d2/d3/d4/d5/d6/fileDeep.txt');

    // With maxDepth = 1, only files in the root sandbox should be scanned
    const shallowFiles = scanDirectory(sandboxPath, { maxDepth: 1 });
    const relativeShallow = shallowFiles.map((f: string) => path.relative(sandboxPath, f).replace(/\\/g, '/'));
    expect(relativeShallow).toContain('file1.txt');
    expect(relativeShallow).toContain('file2.log');
    expect(relativeShallow).not.toContain('dir1/file3.txt');
  });

  it('should support excludePatterns using glob patterns', () => {
    const files = scanDirectory(sandboxPath, {
      excludePatterns: ['**/node_modules/**', '**/*.log']
    });
    const relativeFiles = files.map((f: string) => path.relative(sandboxPath, f).replace(/\\/g, '/'));
    
    expect(relativeFiles).toContain('file1.txt');
    expect(relativeFiles).toContain('dir1/file3.txt');
    expect(relativeFiles).not.toContain('file2.log'); // excluded by **/*.log
    expect(relativeFiles).not.toContain('node_modules/package.json'); // excluded by **/node_modules/**
  });

  it('should ignore symbolic links completely to prevent loops', () => {
    // Create a circular symlink: sandbox/dir_sym -> sandbox
    const symlinkPath = path.join(sandboxPath, 'dir_sym');
    try {
      fs.symlinkSync(sandboxPath, symlinkPath, 'dir');
    } catch (err) {
      // Skip symlink test if environment lacks privileges (e.g. non-admin Windows)
      console.warn('Failed to create symlink in this environment:', err);
      return;
    }

    const files = scanDirectory(sandboxPath);
    const relativeFiles = files.map((f: string) => path.relative(sandboxPath, f).replace(/\\/g, '/'));
    
    // Files inside symlink should not be listed
    expect(relativeFiles).not.toContain('dir_sym/file1.txt');
    expect(relativeFiles).toContain('file1.txt');
  });

  it('should enforce directory confinement to prevent path traversal', () => {
    expect(() => {
      scanDirectory(path.join(sandboxPath, '../'), { rootDir: sandboxPath });
    }).toThrow(/Path Traversal/);
  });
});

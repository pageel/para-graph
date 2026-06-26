import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { auditJunk, classifyJunkFiles } from '../src/utils/junk-auditor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DIR = resolve(__dirname, '.test-output', 'junk-auditor');

// @para-doc [#csa-junk-gov-test-auditor]
describe('Junk Auditor Tests', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should gracefully handle non-git directories and return empty result', () => {
    const caseDir = join(TEST_DIR, 'non-git-case');
    mkdirSync(caseDir, { recursive: true });
    
    // Create some file
    writeFileSync(join(caseDir, 'untracked-junk.log'), 'some log data');
    
    const config = {
      allowlist: [],
      tiers: { safe: ['*.log'], prompt: [], report: [] },
      autoClean: false,
      cleanScope: 'safe',
      profileUsed: 'default',
      autoDetected: false
    };

    const result = auditJunk(caseDir, config);
    expect(result.classified.safe).toEqual([]);
    expect(result.classified.prompt).toEqual([]);
    expect(result.classified.report).toEqual([]);
    expect(result.totalFiles).toBe(0);
    expect(result.totalSize).toBe(0);
  });

  it('should detect untracked and ignored files that are not in the allowlist', () => {
    const caseDir = join(TEST_DIR, 'git-junk-case');
    mkdirSync(caseDir, { recursive: true });

    // 1. Init git repo
    execSync('git init', { cwd: caseDir });
    execSync('git config user.name "Test User"', { cwd: caseDir });
    execSync('git config user.email "test@example.com"', { cwd: caseDir });
    execSync('git config commit.gpgsign false', { cwd: caseDir });

    // 2. Create allowlisted file and commit it
    writeFileSync(join(caseDir, 'package.json'), JSON.stringify({ name: 'test' }));
    execSync('git add package.json', { cwd: caseDir });
    execSync('git commit -m "initial commit"', { cwd: caseDir });

    // 3. Create untracked junk files
    writeFileSync(join(caseDir, 'junk-file-1.tmp'), 'temp data');
    writeFileSync(join(caseDir, 'junk-file-2.log'), 'log data');

    // 4. Create ignored junk file
    writeFileSync(join(caseDir, '.gitignore'), '*.ignored\n');
    writeFileSync(join(caseDir, 'ignored-file.ignored'), 'ignored data');

    // 5. Run audit
    const config = {
      allowlist: ['package.json', '.gitignore'],
      tiers: {
        safe: ['*.log', '*.tmp'],
        prompt: ['*.ignored'],
        report: []
      },
      autoClean: false,
      cleanScope: 'safe',
      profileUsed: 'default',
      autoDetected: false
    };

    const result = auditJunk(caseDir, config);

    expect(result.classified.safe).toContain('junk-file-1.tmp');
    expect(result.classified.safe).toContain('junk-file-2.log');
    expect(result.classified.prompt).toContain('ignored-file.ignored');
    expect(result.classified.safe.length).toBe(2);
    expect(result.classified.prompt.length).toBe(1);
    expect(result.totalFiles).toBe(3);
    expect(result.profileUsed).toBe('default');
    expect(result.autoDetected).toBe(false);
  });

  it('should respect allowlist path wildcard/patterns and regex', () => {
    const caseDir = join(TEST_DIR, 'git-allowlist-case');
    mkdirSync(caseDir, { recursive: true });

    execSync('git init', { cwd: caseDir });
    execSync('git config user.name "Test User"', { cwd: caseDir });
    execSync('git config user.email "test@example.com"', { cwd: caseDir });
    execSync('git config commit.gpgsign false', { cwd: caseDir });

    // Create a mock src file
    mkdirSync(join(caseDir, 'src'), { recursive: true });
    writeFileSync(join(caseDir, 'src/main.ts'), 'console.log("hello");');
    
    // Create actual junk files
    writeFileSync(join(caseDir, 'temp-junk.txt'), 'junk');
    writeFileSync(join(caseDir, 'src/temp-junk-in-src.txt'), 'junk');

    // Allowlist: package.json, .gitignore, src/**/*.ts
    const config = {
      allowlist: [
        'package.json',
        '.gitignore',
        '^src\\/.*\\.ts$' // Regex matching typescript files in src
      ],
      tiers: {
        safe: ['*.txt'],
        prompt: [],
        report: []
      },
      autoClean: false,
      cleanScope: 'safe',
      profileUsed: 'default',
      autoDetected: false
    };

    const result = auditJunk(caseDir, config);
    
    expect(result.classified.safe).toContain('temp-junk.txt');
    expect(result.classified.safe).toContain('src/temp-junk-in-src.txt');
    expect(result.classified.safe.length).toBe(2);
    expect(result.totalFiles).toBe(2);
  });

  it('should exclude allowed files before classification (allowlist priority)', () => {
    const caseDir = join(TEST_DIR, 'git-allowlist-priority');
    mkdirSync(caseDir, { recursive: true });

    execSync('git init', { cwd: caseDir });
    execSync('git config user.name "Test User"', { cwd: caseDir });
    execSync('git config user.email "test@example.com"', { cwd: caseDir });
    execSync('git config commit.gpgsign false', { cwd: caseDir });

    writeFileSync(join(caseDir, 'package.json'), '{}');
    writeFileSync(join(caseDir, 'untracked.log'), 'log');

    const config = {
      allowlist: ['package.json'],
      tiers: {
        safe: ['*.log', 'package.json'], // package.json is in tiers AND allowlist
        prompt: [],
        report: []
      },
      autoClean: false,
      cleanScope: 'safe',
      profileUsed: 'default',
      autoDetected: false
    };

    const result = auditJunk(caseDir, config);
    expect(result.classified.safe).toContain('untracked.log');
    expect(result.classified.safe).not.toContain('package.json');
    expect(result.totalFiles).toBe(1);
  });

  it('should handle fs.statSync errors gracefully and report size 0', () => {
    const caseDir = join(TEST_DIR, 'git-stat-error');
    mkdirSync(caseDir, { recursive: true });

    execSync('git init', { cwd: caseDir });
    execSync('git config user.name "Test User"', { cwd: caseDir });
    execSync('git config user.email "test@example.com"', { cwd: caseDir });
    execSync('git config commit.gpgsign false', { cwd: caseDir });

    writeFileSync(join(caseDir, 'ghost.log'), 'ghost');

    const config = {
      allowlist: [],
      tiers: {
        safe: ['*.log'],
        prompt: [],
        report: []
      },
      autoClean: false,
      cleanScope: 'safe',
      profileUsed: 'default',
      autoDetected: false
    };

    // Spy on fs.statSync to throw error
    const statSpy = vi.spyOn(fs, 'statSync').mockImplementation(() => {
      throw new Error('stat error');
    });

    const result = auditJunk(caseDir, config);
    expect(result.classified.safe).toContain('ghost.log');
    expect(result.totalSize).toBe(0); // Should not crash, and size should be 0

    statSpy.mockRestore();
  });

  describe('classifyJunkFiles', () => {
    it('should correctly classify files into safe, prompt, and report tiers', () => {
      const config = {
        allowlist: [],
        tiers: {
          safe: ['*.log', 'temp/**/*.tmp'],
          prompt: ['*.tar.gz', 'critical/*.key'],
          report: []
        },
        autoClean: false,
        cleanScope: 'safe',
        profileUsed: 'default',
        autoDetected: false
      };

      const files = [
        'debug.log',
        'temp/cache.tmp',
        'backup.tar.gz',
        'critical/ssh.key',
        'unknown-junk.xyz'
      ];

      const result = classifyJunkFiles(files, config);

      expect(result.safe).toContain('debug.log');
      expect(result.safe).toContain('temp/cache.tmp');
      expect(result.prompt).toContain('backup.tar.gz');
      expect(result.prompt).toContain('critical/ssh.key');
      expect(result.report).toContain('unknown-junk.xyz');
      expect(result.safe.length).toBe(2);
      expect(result.prompt.length).toBe(2);
      expect(result.report.length).toBe(1);
    });

    it('should handle empty file list', () => {
      const config = {
        allowlist: [],
        tiers: { safe: ['*.log'], prompt: [], report: [] },
        autoClean: false,
        cleanScope: 'safe',
        profileUsed: 'default',
        autoDetected: false
      };
      const result = classifyJunkFiles([], config);
      expect(result.safe).toEqual([]);
      expect(result.prompt).toEqual([]);
      expect(result.report).toEqual([]);
    });

    it('should prioritize prompt over safe in case of tier conflict (fail-safe wins)', () => {
      const config = {
        allowlist: [],
        tiers: {
          safe: ['logs/*.tar.gz'],
          prompt: ['*.tar.gz'],
          report: []
        },
        autoClean: false,
        cleanScope: 'safe',
        profileUsed: 'default',
        autoDetected: false
      };

      const result = classifyJunkFiles(['logs/archive.tar.gz'], config);
      expect(result.prompt).toContain('logs/archive.tar.gz');
      expect(result.safe).not.toContain('logs/archive.tar.gz');
    });

    it('should classify directory prefix patterns correctly when pattern ends with /', () => {
      const config = {
        allowlist: [],
        tiers: {
          safe: ['output/', 'Projects/'],
          prompt: [],
          report: []
        },
        autoClean: false,
        cleanScope: 'safe' as const,
        profileUsed: 'default',
        autoDetected: false
      };

      const files = [
        'output/entities.jsonl',
        'Projects/p1/db.db',
        'Projects/test.db',
        'other/file.txt'
      ];

      const result = classifyJunkFiles(files, config);
      expect(result.safe).toContain('output/entities.jsonl');
      expect(result.safe).toContain('Projects/p1/db.db');
      expect(result.safe).toContain('Projects/test.db');
      expect(result.report).toContain('other/file.txt');
      expect(result.safe.length).toBe(3);
      expect(result.report.length).toBe(1);
    });
  });
});


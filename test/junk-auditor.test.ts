import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { auditJunk } from '../src/utils/junk-auditor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DIR = resolve(__dirname, '.test-output', 'junk-auditor');

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

  it('should gracefully handle non-git directories and return empty list', () => {
    const caseDir = join(TEST_DIR, 'non-git-case');
    mkdirSync(caseDir, { recursive: true });
    
    // Create some file
    writeFileSync(join(caseDir, 'untracked-junk.log'), 'some log data');
    
    const result = auditJunk(caseDir, []);
    expect(result).toEqual([]);
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

    // 5. Run audit - allowlist only contains package.json and .gitignore
    const allowlist = ['package.json', '.gitignore'];
    const result = auditJunk(caseDir, allowlist);

    expect(result).toContain('junk-file-1.tmp');
    expect(result).toContain('junk-file-2.log');
    expect(result).toContain('ignored-file.ignored');
    expect(result).not.toContain('package.json');
    expect(result).not.toContain('.gitignore');
    expect(result.length).toBe(3);
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
    const allowlist = [
      'package.json',
      '.gitignore',
      '^src\\/.*\\.ts$' // Regex matching typescript files in src
    ];

    const result = auditJunk(caseDir, allowlist);
    
    expect(result).toContain('temp-junk.txt');
    expect(result).toContain('src/temp-junk-in-src.txt');
    expect(result).not.toContain('src/main.ts');
  });
});

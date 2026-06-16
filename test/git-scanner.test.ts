// Trigger IDE test index update
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { findRenamedAnchorInGit } from '../src/utils/git-scanner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DIR = resolve(__dirname, '.test-output', 'git-scanner');

describe('Git History Rename Scanner', () => {
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

  it('should detect renamed anchor in git commits history', () => {
    const caseDir = join(TEST_DIR, 'case1');
    mkdirSync(caseDir, { recursive: true });

    // 1. Initialize git repo
    execSync('git init', { cwd: caseDir });
    // Cấu hình git local
    execSync('git config user.name "Test User"', { cwd: caseDir });
    execSync('git config user.email "test@example.com"', { cwd: caseDir });
    execSync('git config commit.gpgsign false', { cwd: caseDir });

    const specPath = join(caseDir, 'spec.md');

    // 2. Commit 1: Tạo anchor cũ
    writeFileSync(specPath, '# Specification\n\n<span id="csa-old-anchor"></span>\nSome spec content.');
    execSync('git add spec.md', { cwd: caseDir });
    execSync('git commit -m "initial commit"', { cwd: caseDir });

    // 3. Commit 2: Đổi tên anchor thành mới
    writeFileSync(specPath, '# Specification\n\n<span id="csa-new-anchor"></span>\nSome spec content.');
    execSync('git add spec.md', { cwd: caseDir });
    execSync('git commit -m "rename anchor"', { cwd: caseDir });

    // 4. Run scanner
    const result = findRenamedAnchorInGit('csa-old-anchor', caseDir);
    expect(result).toBe('csa-new-anchor');
  });

  it('should return null if anchor was never modified or not in git', () => {
    const caseDir = join(TEST_DIR, 'case2');
    mkdirSync(caseDir, { recursive: true });
    execSync('git init', { cwd: caseDir });
    const result = findRenamedAnchorInGit('non-existent-anchor', caseDir);
    expect(result).toBeNull();
  });
});

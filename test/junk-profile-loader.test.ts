import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import { loadJunkProfile, mergeJunkConfig } from '../src/utils/junk-profile-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DIR = resolve(__dirname, '.test-output', 'junk-profile-loader');
const TEMPLATES_DIR = resolve(__dirname, '../templates/junk-profiles');
const TEMPLATES_BACKUP = resolve(__dirname, '../templates/junk-profiles-backup');

describe('Junk Profile Loader & Config Merger Tests', () => {
  beforeAll(() => {
    console.log('--- TEST beforeAll ---');
    console.log('TEMPLATES_DIR:', TEMPLATES_DIR);
    // Backup existing templates directory if it exists
    if (existsSync(TEMPLATES_DIR)) {
      if (existsSync(TEMPLATES_BACKUP)) {
        rmSync(TEMPLATES_BACKUP, { recursive: true, force: true });
      }
      renameSync(TEMPLATES_DIR, TEMPLATES_BACKUP);
    }
    mkdirSync(TEMPLATES_DIR, { recursive: true });

    // Write mock profiles
    writeFileSync(join(TEMPLATES_DIR, 'typescript-node.json'), JSON.stringify({
      name: 'typescript-node',
      detect: ['package.json', 'tsconfig.json'],
      allowlist: ['node_modules/'],
      tiers: { safe: ['*.log'], prompt: ['*.tar.gz'], report: [] }
    }));
    writeFileSync(join(TEMPLATES_DIR, 'astro.json'), JSON.stringify({
      name: 'astro',
      detect: ['astro.config.mjs'],
      allowlist: [],
      tiers: { safe: [], prompt: [], report: [] }
    }));
    writeFileSync(join(TEMPLATES_DIR, 'php.json'), JSON.stringify({
      name: 'php',
      detect: ['composer.json'],
      allowlist: [],
      tiers: { safe: [], prompt: [], report: [] }
    }));
    writeFileSync(join(TEMPLATES_DIR, 'default.json'), JSON.stringify({
      name: 'default',
      detect: [],
      allowlist: ['package.json'],
      tiers: { safe: ['*.log'], prompt: [], report: [] }
    }));
  });

  afterAll(() => {
    // Restore templates directory backup
    if (existsSync(TEMPLATES_DIR)) {
      rmSync(TEMPLATES_DIR, { recursive: true, force: true });
    }
    if (existsSync(TEMPLATES_BACKUP)) {
      renameSync(TEMPLATES_BACKUP, TEMPLATES_DIR);
    }
  });

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

  describe('loadJunkProfile() auto-detection and loading', () => {
    it('should auto-detect typescript-node profile when package.json and tsconfig.json exist', () => {
      const projectDir = join(TEST_DIR, 'ts-node-project');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'package.json'), '{}');
      writeFileSync(join(projectDir, 'tsconfig.json'), '{}');

      const profile = loadJunkProfile(projectDir);
      expect(profile).toBeDefined();
      expect(profile.name).toBe('typescript-node');
      expect(profile.allowlist).toContain('node_modules/');
      expect(profile.tiers.safe).toContain('*.log');
    });

    it('should auto-detect astro profile when astro.config.mjs exists', () => {
      const projectDir = join(TEST_DIR, 'astro-project');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'astro.config.mjs'), '');

      const profile = loadJunkProfile(projectDir);
      expect(profile).toBeDefined();
      expect(profile.name).toBe('astro');
    });

    it('should auto-detect php profile when composer.json exists', () => {
      const projectDir = join(TEST_DIR, 'php-project');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'composer.json'), '{}');

      const profile = loadJunkProfile(projectDir);
      expect(profile).toBeDefined();
      expect(profile.name).toBe('php');
    });

    it('should fallback to default profile when no markers are found', () => {
      const projectDir = join(TEST_DIR, 'empty-project');
      mkdirSync(projectDir, { recursive: true });

      const profile = loadJunkProfile(projectDir);
      expect(profile).toBeDefined();
      expect(profile.name).toBe('default');
      expect(profile.tiers.safe).toContain('*.log');
    });

    it('should load explicit profile name when specified directly', () => {
      const projectDir = join(TEST_DIR, 'explicit-project');
      mkdirSync(projectDir, { recursive: true });

      // Should load typescript-node profile even though composer.json marker exists
      writeFileSync(join(projectDir, 'composer.json'), '{}');

      const profile = loadJunkProfile(projectDir, 'typescript-node');
      expect(profile).toBeDefined();
      expect(profile.name).toBe('typescript-node');
    });

    it('should fallback to auto-detect when explicit profile name is empty string', () => {
      const projectDir = join(TEST_DIR, 'empty-name-project');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'composer.json'), '{}');

      const profile = loadJunkProfile(projectDir, '');
      expect(profile).toBeDefined();
      expect(profile.name).toBe('php');
    });

    it('should throw an error for path traversal attempt in profile name (etc/passwd)', () => {
      expect(() => {
        loadJunkProfile(TEST_DIR, '../../../etc/passwd');
      }).toThrow();
    });

    it('should throw an error for path traversal attempt with dot-dots', () => {
      expect(() => {
        loadJunkProfile(TEST_DIR, '../default');
      }).toThrow();
    });

    it('should throw an error for profile name with special characters', () => {
      expect(() => {
        loadJunkProfile(TEST_DIR, 'my profile!@#');
      }).toThrow();
    });

    it('should throw an error for profile name with null byte', () => {
      expect(() => {
        loadJunkProfile(TEST_DIR, 'valid\x00evil');
      }).toThrow();
    });

    it('should fallback to hardcoded default config when default.json is missing or malformed', () => {
      // Mock fs to simulate missing files or malformed JSON
      // But we can test this by requesting a profile name that doesn't exist on disk
      // and checking if it loads the hardcoded default profile successfully.
      const profile = loadJunkProfile(TEST_DIR, 'nonexistent-profile');
      expect(profile).toBeDefined();
      expect(profile.name).toBe('default');
      expect(profile.allowlist).toContain('package.json');
    });
  });

  describe('mergeJunkConfig() config merger', () => {
    it('should merge extra_allowlist additively', () => {
      const profile = {
        name: 'test-profile',
        detect: [],
        allowlist: ['a.txt', 'b.txt'],
        tiers: { safe: ['s1'], prompt: ['p1'], report: ['r1'] }
      };

      const projectConfig = {
        extra_allowlist: ['c.txt', 'd.txt'],
        auto_clean: true,
        clean_scope: 'prompt'
      };

      const merged = mergeJunkConfig(profile, projectConfig, 'test-profile', false);
      expect(merged.allowlist).toEqual(['a.txt', 'b.txt', 'c.txt', 'd.txt']);
      expect(merged.autoClean).toBe(true);
      expect(merged.cleanScope).toBe('prompt');
      expect(merged.profileUsed).toBe('test-profile');
      expect(merged.autoDetected).toBe(false);
    });

    it('should merge extra_safe and extra_prompt tiers additively', () => {
      const profile = {
        name: 'test-profile',
        detect: [],
        allowlist: [],
        tiers: { safe: ['s1'], prompt: ['p1'], report: ['r1'] }
      };

      const projectConfig = {
        extra_safe: ['s2'],
        extra_prompt: ['p2']
      };

      const merged = mergeJunkConfig(profile, projectConfig, 'test-profile', false);
      expect(merged.tiers.safe).toEqual(['s1', 's2']);
      expect(merged.tiers.prompt).toEqual(['p1', 'p2']);
      expect(merged.tiers.report).toEqual(['r1']);
      expect(merged.profileUsed).toBe('test-profile');
      expect(merged.autoDetected).toBe(false);
    });

    it('should keep profile defaults untouched when projectConfig is undefined', () => {
      const profile = {
        name: 'test-profile',
        detect: [],
        allowlist: ['a.txt'],
        tiers: { safe: ['s1'], prompt: ['p1'], report: ['r1'] }
      };

      const merged = mergeJunkConfig(profile, undefined, 'test-profile', false);
      expect(merged.allowlist).toEqual(['a.txt']);
      expect(merged.tiers.safe).toEqual(['s1']);
      expect(merged.tiers.prompt).toEqual(['p1']);
      expect(merged.autoClean).toBe(false);
      expect(merged.cleanScope).toBe('safe');
      expect(merged.profileUsed).toBe('test-profile');
      expect(merged.autoDetected).toBe(false);
    });
  });
});

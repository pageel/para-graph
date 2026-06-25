import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// @para-doc [#csa-junk-gov-profile-schema]
export interface JunkProfile {
  name: string;
  detect: string[];
  allowlist: string[];
  tiers: {
    safe: string[];
    prompt: string[];
    report: string[];
  };
}

// @para-doc [#csa-junk-gov-yaml-schema]
export interface ProjectJunkConfig {
  profile?: string;
  auto_clean?: boolean;
  clean_scope?: string;
  extra_allowlist?: string[];
  extra_safe?: string[];
  extra_prompt?: string[];
}

// @para-doc [#csa-junk-gov-yaml-schema]
export interface MergedJunkConfig {
  allowlist: string[];
  tiers: {
    safe: string[];
    prompt: string[];
    report: string[];
  };
  autoClean: boolean;
  cleanScope: string;
}

const HARDCODED_DEFAULT: JunkProfile = {
  name: 'default',
  detect: [],
  allowlist: [
    'package.json', 'package-lock.json',
    'tsconfig.json', 'tsconfig.build.json',
    '.gitignore', 'tool.manifest.yml',
    'install-hooks.sh', 'project.md',
    'README.md', 'LICENSE', 'CHANGELOG.md'
  ],
  tiers: {
    safe: ['*.log'],
    prompt: ['*.tar.gz', '*.tgz'],
    report: []
  }
};

// @para-doc [#csa-junk-gov-profile-loader]
export function loadJunkProfile(rootDir: string, profileName?: string): JunkProfile {
  const templatesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../templates/junk-profiles');

  if (profileName !== undefined && profileName !== '' && profileName !== 'auto') {
    // 1. Whitelist Regex Guard
    if (!/^[a-zA-Z0-9_-]+$/.test(profileName)) {
      throw new Error(`Invalid profile name: ${profileName}`);
    }

    // 2. Sandbox Path Containment Guard
    const targetPath = resolve(templatesDir, `${profileName}.json`);
    if (!targetPath.startsWith(templatesDir)) {
      throw new Error(`Path traversal detected: ${profileName}`);
    }

    try {
      if (existsSync(targetPath)) {
        const content = readFileSync(targetPath, 'utf8');
        return JSON.parse(content) as JunkProfile;
      }
    } catch {
      // Fallback on error
    }

    return HARDCODED_DEFAULT;
  }

  // Auto-detect or explicit "auto" / empty string
  const candidates: { profile: JunkProfile; matchCount: number }[] = [];
  try {
    if (existsSync(templatesDir)) {
      const files = readdirSync(templatesDir);
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'default.json') {
          try {
            const profilePath = join(templatesDir, file);
            const content = readFileSync(profilePath, 'utf8');
            const profile = JSON.parse(content) as JunkProfile;

            if (profile.detect && profile.detect.length > 0) {
              let matchCount = 0;
              for (const marker of profile.detect) {
                if (existsSync(join(rootDir, marker))) {
                  matchCount++;
                }
              }
              if (matchCount === profile.detect.length) {
                candidates.push({ profile, matchCount });
              }
            }
          } catch {
            // Ignore malformed files during scan
          }
        }
      }
    }
  } catch {
    // Ignore folder read errors
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.matchCount - a.matchCount);
    return candidates[0].profile;
  }

  // Fallback to default.json
  const defaultPath = join(templatesDir, 'default.json');
  try {
    if (existsSync(defaultPath)) {
      const content = readFileSync(defaultPath, 'utf8');
      return JSON.parse(content) as JunkProfile;
    }
  } catch {
    // Fallback on error
  }

  return HARDCODED_DEFAULT;
}

// @para-doc [#csa-junk-gov-config-merger]
export function mergeJunkConfig(profile: JunkProfile, projectConfig: ProjectJunkConfig | undefined): MergedJunkConfig {
  const extraAllowlist = projectConfig?.extra_allowlist ?? [];
  const extraSafe = projectConfig?.extra_safe ?? [];
  const extraPrompt = projectConfig?.extra_prompt ?? [];
  const autoClean = projectConfig?.auto_clean ?? false;
  const cleanScope = projectConfig?.clean_scope ?? 'safe';

  return {
    allowlist: [...profile.allowlist, ...extraAllowlist],
    tiers: {
      safe: [...profile.tiers.safe, ...extraSafe],
      prompt: [...profile.tiers.prompt, ...extraPrompt],
      report: [...(profile.tiers.report ?? [])]
    },
    autoClean,
    cleanScope
  };
}

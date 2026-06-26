import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { join } from 'node:path';
import picomatch from 'picomatch';
import { MergedJunkConfig } from './junk-profile-loader.js';

export interface ClassifiedJunk {
  safe: string[];
  prompt: string[];
  report: string[];
}

export interface AuditJunkResult {
  classified: ClassifiedJunk;
  totalFiles: number;
  totalSize: number;
  profileUsed: string;
  autoDetected: boolean;
}

// @para-doc [#csa-junk-gov-tier-dir-prefix]
function compilePatterns(patterns: string[]) {
  if (patterns.length === 0) {
    return () => false;
  }
  const matchers = patterns.map(p => {
    const hasSlash = p.includes('/');
    return {
      pattern: p,
      match: picomatch(p, { dot: true, matchBase: !hasSlash })
    };
  });
  return (file: string) => {
    const normalized = file.replace(/\\/g, '/');
    return matchers.some(m => {
      if (m.pattern.endsWith('/') && normalized.startsWith(m.pattern)) {
        return true;
      }
      return m.match(normalized);
    });
  };
}

// @para-doc [#csa-junk-gov-tier-classifier]
// @para-doc [#csa-junk-gov-test-auditor]
export function classifyJunkFiles(files: string[], config: MergedJunkConfig): ClassifiedJunk {
  const result: ClassifiedJunk = {
    safe: [],
    prompt: [],
    report: []
  };

  const safePatterns = config.tiers?.safe?.filter(p => p.trim().length > 0) ?? [];
  const promptPatterns = config.tiers?.prompt?.filter(p => p.trim().length > 0) ?? [];
  const reportPatterns = config.tiers?.report?.filter(p => p.trim().length > 0) ?? [];

  const isSafe = compilePatterns(safePatterns);
  const isPrompt = compilePatterns(promptPatterns);
  const isReport = compilePatterns(reportPatterns);

  for (const file of files) {
    // Rule: prioritize prompt over safe (fail-safe wins)
    if (isPrompt(file)) {
      result.prompt.push(file);
    } else if (isSafe(file)) {
      result.safe.push(file);
    } else if (isReport(file)) {
      result.report.push(file);
    } else {
      // Default to report (Tier 3) for unknowns
      result.report.push(file);
    }
  }

  return result;
}

// @para-doc [#csa-junk-gov-audit-signature]
// @para-doc [#csa-junk-auditor]
export function auditJunk(repoPath: string, config: MergedJunkConfig): AuditJunkResult {
  // Pre-flight check: Verify if it is a git repository by checking for .git directory
  if (!fs.existsSync(join(repoPath, '.git'))) {
    return {
      classified: { safe: [], prompt: [], report: [] },
      totalFiles: 0,
      totalSize: 0,
      profileUsed: config.profileUsed,
      autoDetected: config.autoDetected
    };
  }

  try {
    // 1. Get untracked files (others) excluding standard ignores
    const stdoutUntracked = execFileSync(
      'git',
      ['ls-files', '--others', '--exclude-standard'],
      {
        cwd: repoPath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 10 * 1024 * 1024
      }
    );

    // 2. Get ignored files
    const stdoutIgnored = execFileSync(
      'git',
      ['ls-files', '--others', '--ignored', '--exclude-standard'],
      {
        cwd: repoPath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 10 * 1024 * 1024
      }
    );

    // Split output by windows/unix newline format and filter empty lines
    const filesUntracked = stdoutUntracked.split(/\r?\n/).filter(line => line.trim().length > 0);
    const filesIgnored = stdoutIgnored.split(/\r?\n/).filter(line => line.trim().length > 0);

    // Combine both lists and remove duplicates
    const allFiles = Array.from(new Set([...filesUntracked, ...filesIgnored]));

    // Exclude allowed files before classification (allowlist priority)
    const junkFiles = allFiles.filter(file => {
      const normalizedPath = file.replace(/\\/g, '/');

      const isAllowed = config.allowlist.some(pattern => {
        // 1. Exact match
        if (normalizedPath === pattern) return true;

        // 1.5 Directory prefix match
        if (pattern.endsWith('/') && normalizedPath.startsWith(pattern)) return true;

        // 2. Glob match (picomatch)
        try {
          const hasSlash = pattern.includes('/');
          if (picomatch(pattern, { dot: true, matchBase: !hasSlash })(normalizedPath)) {
            return true;
          }
        } catch {
          // Skip glob parse error
        }

        // 3. Regex match (backward compatibility)
        try {
          if (
            pattern.startsWith('^') ||
            pattern.endsWith('$') ||
            /[\*\+\?\[\]\(\)\{\}\^\|]/.test(pattern)
          ) {
            return new RegExp(pattern).test(normalizedPath);
          }
        } catch {
          // Skip regex syntax error
        }

        return false;
      });

      return !isAllowed;
    });

    // Classify remaining junk files
    const classified = classifyJunkFiles(junkFiles, config);

    // Calculate total size safely (error-handled statSync)
    let totalSize = 0;
    for (const file of junkFiles) {
      try {
        const filePath = join(repoPath, file);
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          totalSize += stat.size;
        }
      } catch {
        // Safe fallback on error, size is treated as 0
      }
    }

    return {
      classified,
      totalFiles: junkFiles.length,
      totalSize,
      profileUsed: config.profileUsed,
      autoDetected: config.autoDetected
    };
  } catch (error) {
    // Gracefully fallback on git command failure
    return {
      classified: { safe: [], prompt: [], report: [] },
      totalFiles: 0,
      totalSize: 0,
      profileUsed: config.profileUsed,
      autoDetected: config.autoDetected
    };
  }
}

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Audit directory for junk files (untracked or ignored) using Git CLI.
 * Gracefully handles non-git folders and executes without a shell wrapper
 * to prevent shell injection vulnerabilities.
 *
 * @param repoPath - Absolute path to the repository directory
 * @param allowlist - List of allowed files or regex patterns
 * @returns List of identified junk file paths relative to repoPath
 */
export function auditJunk(repoPath: string, allowlist: string[]): string[] {
  // Pre-flight check: Verify if it is a git repository by checking for .git directory
  if (!existsSync(join(repoPath, '.git'))) {
    return [];
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

    // Combine both list and remove duplicates
    const allFiles = Array.from(new Set([...filesUntracked, ...filesIgnored]));

    return allFiles.filter(file => {
      // Normalize Windows backslashes to forward slashes
      const normalizedPath = file.replace(/\\/g, '/');

      // Check if file matches any pattern in the allowlist
      const isAllowed = allowlist.some(pattern => {
        try {
          // If the pattern contains regex metadata, evaluate as regex
          if (
            pattern.startsWith('^') ||
            pattern.endsWith('$') ||
            /[\*\+\?\[\]\(\)\{\}\^\|]/.test(pattern)
          ) {
            return new RegExp(pattern).test(normalizedPath);
          }
        } catch {
          // Fallback to exact match on error
        }
        return normalizedPath === pattern;
      });

      return !isAllowed;
    });
  } catch (error) {
    // Gracefully fallback on git command failure
    return [];
  }
}

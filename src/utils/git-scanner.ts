import { execSync } from 'node:child_process';

// Trigger IDE index update
/**
 * Scan git history to find if an anchor ID was renamed.
 * It looks for commits deleting the old anchor and adding a new anchor in the same file.
 */
export function findRenamedAnchorInGit(anchorId: string, repoDir: string): string | null {
  try {
    // 1. Find the commit that modified the anchor ID
    const logOutput = execSync(`git log -S "${anchorId}" --format="%H" -n 1`, {
      cwd: repoDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (!logOutput) return null;

    const commitHash = logOutput.split('\n')[0];

    // 2. Get the diff of that commit
    const diffOutput = execSync(`git show ${commitHash}`, {
      cwd: repoDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    // 3. Parse the diff to see if an anchor was deleted and another added in the same file
    const lines = diffOutput.split('\n');
    let currentFileHasDelete = false;
    let addedAnchors: string[] = [];

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        // Evaluate previous file before switching
        if (currentFileHasDelete && addedAnchors.length > 0) {
          return addedAnchors[0];
        }
        currentFileHasDelete = false;
        addedAnchors = [];
      }

      if (line.startsWith('-') && !line.startsWith('---') && line.includes(anchorId)) {
        currentFileHasDelete = true;
      }

      if (line.startsWith('+') && !line.startsWith('+++')) {
        const match = line.match(/id=["'](csa-[a-z0-9-]+)["']/);
        if (match) {
          addedAnchors.push(match[1]);
        }
      }
    }

    if (currentFileHasDelete && addedAnchors.length > 0) {
      return addedAnchors[0];
    }
  } catch (e) {
    // Graceful fallback if git command fails or folder is not a git repo
  }
  
  return null;
}

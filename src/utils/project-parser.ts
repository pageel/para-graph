export interface ProjectInfo {
  version: string;
  status: string;
  active_plan: string;
}

export interface BacklogInfo {
  activeCount: number;
  completedCount: number;
}

export interface SprintInfo {
  pendingCount: number;
  completedCount: number;
}

export function parseProjectFile(content: string): ProjectInfo {
  const result: ProjectInfo = { version: '', status: '', active_plan: '' };
  try {
    const match = content.match(/^---([\s\S]*?)---/);
    if (!match) return result;
    const yamlContent = match[1];
    const lines = yamlContent.split(/\r?\n/);
    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join(':').trim().replace(/^["']|["']$/g, ''); // strip quotes
        if (key === 'version') result.version = val;
        if (key === 'status') result.status = val;
        if (key === 'active_plan') result.active_plan = val;
      }
    }
  } catch (e) {
    // Ignore and return defaults
  }
  return result;
}

export function parseBacklogFile(content: string): BacklogInfo {
  const result = { activeCount: 0, completedCount: 0 };
  try {
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      if (/^\s*-\s*\[ \]/i.test(line)) {
        result.activeCount++;
      } else if (/^\s*-\s*\[[xX]\]/.test(line)) {
        result.completedCount++;
      }
    }
  } catch (e) {
    // Ignore and return defaults
  }
  return result;
}

export function parseSprintFile(content: string): SprintInfo {
  const result = { pendingCount: 0, completedCount: 0 };
  try {
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      if (/^\s*-\s*\[ \]/i.test(line)) {
        result.pendingCount++;
      } else if (/^\s*-\s*\[[xX]\]/.test(line)) {
        result.completedCount++;
      }
    }
  } catch (e) {
    // Ignore and return defaults
  }
  return result;
}

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

describe('CLI Subcommand Routing', () => {
  it('should support audit csa command', () => {
    let output = '';
    try {
      output = execSync('npx tsx src/cli.ts audit csa --project .', { encoding: 'utf-8' });
    } catch (err: any) {
      output = err.stdout || err.message || '';
    }
    expect(output).toContain('CSA COMPLIANCE AUDIT REPORT');
  }, 60000);

  it('should support fix csa command', () => {
    const output = execSync('npx tsx src/cli.ts fix csa --project .', { encoding: 'utf-8' });
    expect(output).toContain('[CSA Fix]');
  }, 60000);

  it('should support project-snapshot command', () => {
    const output = execSync('npx tsx src/cli.ts project-snapshot para-graph', { encoding: 'utf-8' });
    const startIdx = output.indexOf('{');
    const endIdx = output.lastIndexOf('}');
    const parsed = JSON.parse(output.slice(startIdx, endIdx + 1));
    expect(parsed.success).toBe(true);
    expect(parsed.snapshotId).toBeDefined();
  }, 60000);

  it('should support project-diff command', () => {
    const snapOutput = execSync('npx tsx src/cli.ts project-snapshot para-graph', { encoding: 'utf-8' });
    const startIdx = snapOutput.indexOf('{');
    const endIdx = snapOutput.lastIndexOf('}');
    const parsedSnap = JSON.parse(snapOutput.slice(startIdx, endIdx + 1));
    const snapId = parsedSnap.snapshotId;

    const diffOutput = execSync(`npx tsx src/cli.ts project-diff para-graph ${snapId} ${snapId}`, { encoding: 'utf-8' });
    const diffStart = diffOutput.indexOf('{');
    const diffEnd = diffOutput.lastIndexOf('}');
    const diff = JSON.parse(diffOutput.slice(diffStart, diffEnd + 1));
    
    expect(diff.added).toBeDefined();
    expect(diff.removed).toBeDefined();
    expect(diff.modified).toBeDefined();
  }, 60000);
});

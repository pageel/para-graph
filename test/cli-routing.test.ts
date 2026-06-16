import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

describe('CLI Subcommand Routing', () => {
  it('should support audit csa command', () => {
    const output = execSync('npx tsx src/cli.ts audit csa --project .', { encoding: 'utf-8' });
    expect(output).toContain('CSA COMPLIANCE AUDIT REPORT');
  }, 60000);

  it('should support fix csa command', () => {
    const output = execSync('npx tsx src/cli.ts fix csa --project .', { encoding: 'utf-8' });
    expect(output).toContain('[para-graph] Running CSA fix for project: .');
  }, 60000);
});

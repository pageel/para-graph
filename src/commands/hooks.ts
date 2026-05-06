/**
 * para-graph hooks command — Install/Uninstall/Status for BeforeTool hooks.
 *
 * Manages Gemini CLI hooks that nudge the AI Agent to use the Knowledge Graph
 * instead of blind file scanning.
 *
 * State is tracked in `.para/tools/graph/hooks/state.json`.
 * Backups are stored in `.para/tools/graph/hooks/backups/`.
 */

import { join, dirname } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, copyFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { findWorkspaceRoot } from '../utils/workspace.js';

const require = createRequire(import.meta.url);

// ── Types ──────────────────────────────────────────────────────────────

interface HookPlatformState {
  installed: boolean;
  version: string;
  installed_at: string;
  backup_path: string;
  target_file: string;
}

interface HookState {
  [platform: string]: HookPlatformState;
}

interface RunHooksOptions {
  subcommand: string;
}

// ── Paths ──────────────────────────────────────────────────────────────

function getGeminiSettingsPath(): string {
  return join(homedir(), '.gemini', 'settings.json');
}

function getHooksDir(wsRoot: string): string {
  return join(wsRoot, '.para', 'tools', 'graph', 'hooks');
}

function getStatePath(hooksDir: string): string {
  return join(hooksDir, 'state.json');
}

function getBackupsDir(hooksDir: string): string {
  return join(hooksDir, 'backups');
}

// ── State Management ───────────────────────────────────────────────────

function readState(statePath: string): HookState {
  if (!existsSync(statePath)) return {};
  try {
    return JSON.parse(readFileSync(statePath, 'utf-8')) as HookState;
  } catch {
    return {};
  }
}

function writeState(statePath: string, state: HookState): void {
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

// ── Prompt ─────────────────────────────────────────────────────────────

function promptYesNo(question: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// ── Hook Template ──────────────────────────────────────────────────────

function loadHookTemplate(): Record<string, unknown> {
  // Load from bundled template file
  const templatePath = join(dirname(new URL(import.meta.url).pathname), '..', 'hooks', 'gemini.json');
  if (existsSync(templatePath)) {
    return JSON.parse(readFileSync(templatePath, 'utf-8'));
  }

  // Fallback: try relative to dist/
  const altPath = join(dirname(new URL(import.meta.url).pathname), '..', '..', 'src', 'hooks', 'gemini.json');
  if (existsSync(altPath)) {
    return JSON.parse(readFileSync(altPath, 'utf-8'));
  }

  throw new Error('[para-graph] Could not find hook template (gemini.json). Is the package built correctly?');
}

// ── Install ────────────────────────────────────────────────────────────

async function installHook(wsRoot: string): Promise<void> {
  const hooksDir = getHooksDir(wsRoot);
  const statePath = getStatePath(hooksDir);
  const backupsDir = getBackupsDir(hooksDir);
  const settingsPath = getGeminiSettingsPath();

  // Get version
  const pkg = require('../../package.json') as { version: string };

  // Ensure hooks directory exists
  mkdirSync(backupsDir, { recursive: true });

  // Check idempotent
  const state = readState(statePath);
  if (state.gemini?.installed && state.gemini?.version === pkg.version) {
    console.log(`[para-graph] Gemini hook already installed (v${pkg.version}). Skipping.`);
    return;
  }

  // Read or create settings.json
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch (err) {
      console.error(`[para-graph] Error parsing ${settingsPath}:`, err);
      console.error('[para-graph] Cannot inject hook into malformed settings file.');
      process.exit(1);
    }
  } else {
    // Create parent directory if needed
    mkdirSync(dirname(settingsPath), { recursive: true });
    console.log(`[para-graph] ${settingsPath} does not exist. Will create it.`);
  }

  // Backup
  const timestamp = Math.floor(Date.now() / 1000);
  const backupFilename = `gemini-settings-${timestamp}.json`;
  const backupPath = join(backupsDir, backupFilename);

  if (existsSync(settingsPath)) {
    copyFileSync(settingsPath, backupPath);
    console.log(`[para-graph] Backup saved: ${backupPath}`);
  }

  // Show what will be injected
  const hookTemplate = loadHookTemplate();
  console.log('\n[para-graph] Will inject the following hook into ~/.gemini/settings.json:');
  console.log(`  Matcher: ${(hookTemplate as { matcher?: string }).matcher}`);
  console.log('  Action: Nudge Agent to use Knowledge Graph before file scanning.\n');

  // Prompt
  const confirmed = await promptYesNo('Proceed with hook injection?');
  if (!confirmed) {
    console.log('[para-graph] Aborted by user.');
    // Cleanup backup if we made one for a fresh file
    if (existsSync(backupPath)) {
      unlinkSync(backupPath);
    }
    return;
  }

  // Inject hook
  // Gemini CLI v0.41+ settings.json uses a `hooks` object with event keys
  const existingHooksObj = (settings.hooks ?? {}) as Record<string, unknown>;
  const beforeToolHooks = (existingHooksObj.beforeTool ?? []) as Record<string, unknown>[];

  // Remove any existing para-graph hook (update case)
  const filteredHooks = beforeToolHooks.filter(
    (h) => {
      const cmd = (h as { hooks?: Array<{ command?: string }> }).hooks?.[0]?.command ?? '';
      return !cmd.includes('para-graph');
    }
  );

  filteredHooks.push(hookTemplate);
  existingHooksObj.beforeTool = filteredHooks;
  settings.hooks = existingHooksObj;

  // Write settings
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  console.log(`[para-graph] Hook injected into ${settingsPath}`);

  // Update state
  state.gemini = {
    installed: true,
    version: pkg.version,
    installed_at: new Date().toISOString(),
    backup_path: `backups/${backupFilename}`,
    target_file: settingsPath,
  };
  writeState(statePath, state);
  console.log('[para-graph] State updated. Done!');
}

// ── Uninstall ──────────────────────────────────────────────────────────

async function uninstallHook(wsRoot: string): Promise<void> {
  const hooksDir = getHooksDir(wsRoot);
  const statePath = getStatePath(hooksDir);
  const settingsPath = getGeminiSettingsPath();

  const state = readState(statePath);
  if (!state.gemini?.installed) {
    console.log('[para-graph] No Gemini hook installed. Nothing to do.');
    return;
  }

  // Try restore from backup
  const backupPath = state.gemini.backup_path
    ? join(hooksDir, state.gemini.backup_path)
    : null;

  if (backupPath && existsSync(backupPath)) {
    const confirmed = await promptYesNo('Restore original settings.json from backup?');
    if (confirmed) {
      copyFileSync(backupPath, settingsPath);
      console.log(`[para-graph] Restored ${settingsPath} from backup.`);
    } else {
      // Manual removal
      await removeHookFromSettings(settingsPath);
    }
  } else {
    // No backup available — manual removal
    await removeHookFromSettings(settingsPath);
  }

  // Update state
  state.gemini = {
    ...state.gemini,
    installed: false,
    installed_at: new Date().toISOString(),
  };
  writeState(statePath, state);
  console.log('[para-graph] Hook uninstalled. State updated.');
}

async function removeHookFromSettings(settingsPath: string): Promise<void> {
  if (!existsSync(settingsPath)) {
    console.log(`[para-graph] ${settingsPath} not found. Nothing to remove.`);
    return;
  }

  const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  const existingHooksObj = (settings.hooks ?? {}) as Record<string, unknown>;
  const beforeToolHooks = (existingHooksObj.beforeTool ?? []) as Record<string, unknown>[];

  const filtered = beforeToolHooks.filter((h) => {
    const cmd = (h as { hooks?: Array<{ command?: string }> }).hooks?.[0]?.command ?? '';
    return !cmd.includes('para-graph');
  });

  if (filtered.length === beforeToolHooks.length) {
    console.log('[para-graph] No para-graph hook found in settings.json.');
    return;
  }

  existingHooksObj.beforeTool = filtered;
  settings.hooks = existingHooksObj;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  console.log(`[para-graph] Removed para-graph hook from ${settingsPath}.`);
}

// ── Status ─────────────────────────────────────────────────────────────

function showStatus(wsRoot: string): void {
  const hooksDir = getHooksDir(wsRoot);
  const statePath = getStatePath(hooksDir);
  const state = readState(statePath);

  console.log('[para-graph] Hook Status:');
  console.log(`  Workspace: ${wsRoot}`);
  console.log(`  State file: ${statePath}`);
  console.log();

  if (!state.gemini) {
    console.log('  Gemini: Not installed');
    return;
  }

  console.log(`  Gemini:`);
  console.log(`    Installed: ${state.gemini.installed ? '✅ Yes' : '❌ No'}`);
  console.log(`    Version: ${state.gemini.version}`);
  console.log(`    Installed at: ${state.gemini.installed_at}`);
  console.log(`    Backup: ${state.gemini.backup_path}`);
  console.log(`    Target: ${state.gemini.target_file}`);
}

// ── Main ───────────────────────────────────────────────────────────────

export async function runHooks(options: RunHooksOptions): Promise<void> {
  // Guard: must be inside PARA workspace
  const wsRoot = findWorkspaceRoot();
  if (!wsRoot) {
    console.error('[para-graph] Error: Must run inside a PARA workspace (.para-workspace.yml not found).');
    console.error('[para-graph] Hooks require .para/tools/graph/ for state management.');
    process.exit(1);
  }

  switch (options.subcommand) {
    case 'install':
      await installHook(wsRoot);
      break;
    case 'uninstall':
      await uninstallHook(wsRoot);
      break;
    case 'status':
      showStatus(wsRoot);
      break;
    default:
      console.error(`[para-graph] Unknown hooks subcommand: ${options.subcommand}`);
      console.error('Usage: para-graph hooks [install|uninstall|status]');
      process.exit(1);
  }
}

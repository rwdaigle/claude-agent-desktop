#!/usr/bin/env node
/**
 * Sets up git hooks for the project.
 * This script is run automatically after `bun install` via the prepare script.
 *
 * Uses `core.hooksPath` to point git to the project's hooks directory.
 * This works correctly with git worktrees.
 */
import { execSync } from 'child_process';
import { chmodSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const hooksDir = join(__dirname, 'hooks');

function setupHooks() {
  // Verify we're in a git repository
  try {
    execSync('git rev-parse --git-dir', { cwd: projectRoot, encoding: 'utf-8' });
  } catch {
    console.warn('Not a git repository, skipping hooks setup');
    return;
  }

  // Check hooks directory exists
  if (!existsSync(hooksDir)) {
    console.warn(`Hooks directory not found: ${hooksDir}`);
    return;
  }

  // Make hooks executable
  const hooks = ['pre-commit'];
  for (const hook of hooks) {
    const hookPath = join(hooksDir, hook);
    if (existsSync(hookPath)) {
      chmodSync(hookPath, 0o755);
    }
  }

  // Set core.hooksPath to point to our hooks directory (local config only)
  try {
    execSync(`git config --local core.hooksPath "${hooksDir}"`, {
      cwd: projectRoot,
      encoding: 'utf-8'
    });
    console.log(`Git hooks configured: core.hooksPath = ${hooksDir}`);
  } catch (error) {
    console.error('Failed to configure git hooks:', error.message);
    return;
  }

  console.log('Git hooks setup complete!');
}

setupHooks();

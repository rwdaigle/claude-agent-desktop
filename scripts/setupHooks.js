#!/usr/bin/env node
/**
 * Git hooks setup script.
 *
 * NOTE: This script is now a no-op. Git hooks are set up via a universal
 * pre-commit hook in .git/hooks/ that automatically delegates to the
 * workspace-specific scripts/hooks/pre-commit script.
 *
 * This approach works without any configuration because:
 * 1. The hook in .git/hooks/pre-commit detects the current worktree
 * 2. It runs scripts/hooks/pre-commit from that worktree
 * 3. No core.hooksPath configuration needed
 *
 * The scripts/hooks/pre-commit file in each workspace runs lint, format,
 * and typecheck with auto-fix before each commit.
 */

console.log('Git hooks are configured via .git/hooks/pre-commit (no setup required)');

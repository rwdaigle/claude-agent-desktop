# Per-Customer Configuration System

> Implementation plan for enabling per-customer/tenant configurations in Claude Agent Desktop.

## Overview

Implement a layered configuration system that allows per-customer customizations while distributing the same binary:

- **Layer 1 (Bundled)**: Default configuration shipped with the app
- **Layer 2 (Customer)**: Customer-specific configuration fetched from a git repository branch
- **Layer 3 (User)**: Local user overrides in workspace

## Key Design Decisions

- **Git authentication**: User configures SSH key in settings (generate or import)
- **Sync timing**: Auto-sync on startup (non-blocking) + manual "Sync Now" button
- **Repo URL**: User-configurable in app settings

---

## Architecture

### Customer Config Repository Structure

```
customer-configs/              # Single git repository
├── customer/acme-corp         # Branch per customer
├── customer/beta-inc
└── each branch contains:
    ├── manifest.json          # CustomerConfigManifest
    ├── CLAUDE.md              # Customer-specific instructions
    ├── settings.json          # Permissions and settings
    └── skills/                # Precompiled skills
        └── custom-skill/
            ├── SKILL.md
            └── scripts/
                ├── tool-binary    # Precompiled
                └── tool.py        # Python script
```

### Local Storage Structure

```
~/Library/Application Support/claude-agent-desktop/
├── config.json                # AppConfig with customerConfig
├── ssh/                       # SSH keys for git auth
│   ├── id_ed25519.enc         # Encrypted private key
│   └── id_ed25519.pub         # Public key (unencrypted)
└── customer-configs/          # Git-cloned customer configs
    └── acme-corp/             # Customer slug as directory
        ├── .git/
        ├── manifest.json
        ├── CLAUDE.md
        ├── settings.json
        └── skills/
```

### Workspace Structure (Runtime - Merged)

```
~/.claude-agent/
├── .claude/
│   ├── settings.json          # Merged settings
│   ├── CLAUDE.md              # Merged CLAUDE.md
│   └── skills/                # Merged skills
│       ├── workspace-tools/   # From bundled
│       ├── xlsx/              # From bundled
│       └── custom-skill/      # From customer
```

---

## Config Schema

### AppConfig Extension

**File**: `src/main/lib/config.ts`

```typescript
export interface CustomerConfig {
  customerSlug?: string; // e.g., "acme-corp"
  configRepoUrl?: string; // e.g., "git@github.com:org/customer-configs.git"
  lastSyncTimestamp?: number; // Unix timestamp
  lastSyncError?: string; // Error message if failed
}

export interface AppConfig {
  // Existing fields
  workspaceDir?: string;
  debugMode?: boolean;
  chatModelPreference?: ChatModelPreference | 'smart';
  apiKey?: string;
  allowedDirectories?: string[];

  // New customer config fields
  customerConfig?: CustomerConfig;
}
```

### Customer Manifest Schema

**File**: `src/shared/types/customer-config.ts`

```typescript
export interface CustomerConfigManifest {
  version: string; // Schema version "1.0"
  customerName: string; // Display name
  systemPromptAdditions?: string; // Additional system prompt
  modelConfig?: {
    defaultModel?: 'fast' | 'smart-sonnet' | 'smart-opus';
    allowedModels?: ('fast' | 'smart-sonnet' | 'smart-opus')[];
  };
  permissions?: {
    additionalDirectories?: string[];
    disallowedTools?: string[];
  };
  allowedTools?: string[];
  skills?: Array<{ name: string; enabled: boolean }>;
}
```

---

## New Modules

### 1. ssh-keys.ts

**File**: `src/main/lib/ssh-keys.ts`

SSH key management for git authentication:

```typescript
// Generate new Ed25519 key pair
export async function generateSshKeyPair(): Promise<{ publicKey: string }>;

// Import existing private key
export async function importSshPrivateKey(keyContent: string): Promise<{ publicKey: string }>;

// Get public key for display (user copies to git host)
export async function getSshPublicKey(): Promise<string | null>;

// Get path to private key for git operations (writes temp file)
export async function getSshPrivateKeyPath(): Promise<string>;

// Check if SSH key is configured
export async function hasSshKey(): Promise<boolean>;

// Remove stored key
export async function deleteSshKey(): Promise<void>;
```

**Implementation details:**

- Store private key encrypted using Electron's `safeStorage` API
- Write decrypted key to temp file only during git operations, delete after
- Store in `~/Library/Application Support/claude-agent-desktop/ssh/`
- Public key stored unencrypted for easy copying

### 2. customer-git.ts

**File**: `src/main/lib/customer-git.ts`

Git operations for customer configs:

```typescript
// Get local directory for customer configs
export function getCustomerConfigDir(customerSlug: string): string;

// Clone or update customer config from git repository
export async function syncCustomerConfig(
  repoUrl: string,
  customerSlug: string
): Promise<{ success: boolean; error?: string }>;

// Check if customer config exists locally
export async function checkCustomerConfigStatus(
  customerSlug: string
): Promise<{ exists: boolean; hasChanges: boolean; lastFetch?: Date }>;

// Remove customer config from local filesystem
export async function removeCustomerConfig(customerSlug: string): Promise<void>;
```

**Implementation details:**

- Clone with `--depth 1 --single-branch --branch customer/<slug>`
- Sync via `git fetch origin && git reset --hard origin/customer/<slug>`
- Use bundled git or spawn system git
- Pass SSH key via `GIT_SSH_COMMAND` environment variable:
  ```
  GIT_SSH_COMMAND="ssh -i /path/to/temp/key -o StrictHostKeyChecking=accept-new"
  ```

### 3. config-merger.ts

**File**: `src/main/lib/config-merger.ts`

Merge configuration layers:

```typescript
export interface MergedConfig {
  claudeMd: string; // Merged CLAUDE.md content
  systemPromptAppend: string; // Merged system prompt additions
  settings: {
    permissions: {
      additionalDirectories: string[];
    };
  };
  modelPreference: ChatModelPreference;
  allowedTools: string[];
  skills: Array<{
    name: string;
    path: string;
    source: 'bundled' | 'customer';
  }>;
}

// Load and merge all configuration layers
export async function loadMergedConfig(): Promise<MergedConfig>;

// Merge CLAUDE.md files from all layers
export function mergeClaudeMd(bundled: string, customer?: string, user?: string): string;

// Merge system prompt additions
export function mergeSystemPrompt(bundledAppend: string, customerAdditions?: string): string;

// Merge settings with proper precedence
export function mergeSettings(bundled: object, customer?: object, user?: object): object;
```

**Merge rules:**

- **CLAUDE.md**: Concatenate (bundled + customer + user)
- **System prompt**: Concatenate with newlines
- **Settings/arrays**: Merge uniquely (union)
- **Settings/objects**: Deep merge (later overrides)
- **Skills**: Customer can add or disable bundled skills

### 4. config-validation.ts

**File**: `src/main/lib/config-validation.ts`

Validation functions:

```typescript
export function validateCustomerSlug(slug: string): { valid: boolean; error?: string };
export function validateRepoUrl(url: string): { valid: boolean; error?: string };
export function validateManifest(manifest: unknown): { valid: boolean; errors: string[] };
```

---

## File Modifications

### 1. config.ts

- Extend `AppConfig` interface with `customerConfig`
- Add `getCustomerConfig()` / `setCustomerConfig()` functions
- Update `ensureWorkspaceDir()` to use merged config instead of just bundled

### 2. claude-session.ts

- Load merged config on session start
- Apply merged system prompt via `systemPromptAppend`
- Apply merged `allowedTools`
- Apply merged model preferences

### 3. config-handlers.ts

Add IPC handlers:

**SSH Key handlers:**

- `ssh:generate-key` - Generate new key pair, return public key
- `ssh:import-key` - Import private key, return public key
- `ssh:get-public-key` - Get public key for display
- `ssh:has-key` - Check if key exists
- `ssh:delete-key` - Remove stored key

**Customer config handlers:**

- `config:get-customer-config`
- `config:set-customer-config`
- `config:sync-customer-config`
- `config:clear-customer-config`

### 4. preload/index.ts

Add to bridge:

**SSH methods:**

```typescript
ssh: {
  generateKey: () => ipcRenderer.invoke('ssh:generate-key'),
  importKey: (privateKey: string) => ipcRenderer.invoke('ssh:import-key', privateKey),
  getPublicKey: () => ipcRenderer.invoke('ssh:get-public-key'),
  hasKey: () => ipcRenderer.invoke('ssh:has-key'),
  deleteKey: () => ipcRenderer.invoke('ssh:delete-key'),
}
```

**Customer config methods:**

```typescript
config: {
  // ... existing methods ...
  getCustomerConfig: () => ipcRenderer.invoke('config:get-customer-config'),
  setCustomerConfig: (config: CustomerConfig) => ipcRenderer.invoke('config:set-customer-config', config),
  syncCustomerConfig: () => ipcRenderer.invoke('config:sync-customer-config'),
  clearCustomerConfig: () => ipcRenderer.invoke('config:clear-customer-config'),
}
```

### 5. Settings.tsx

Add "Customer Configuration" section with two subsections:

**SSH Key Setup:**

- "Generate New Key" button - creates Ed25519 key pair
- "Import Private Key" - text area or file picker
- Public key display with "Copy" button (for adding to GitHub/GitLab)
- Key status indicator (configured / not configured)
- "Delete Key" button with confirmation

**Customer Config:**

- Customer slug input field
- Config repository URL input field (SSH URL format: `git@github.com:org/repo.git`)
- Connection status display (connected, syncing, error, offline)
- Last sync timestamp
- "Sync Now" button
- "Disconnect" button
- Error message display

---

## Startup Flow

```
app.whenReady()
  → loadAppConfig()
  → if (customerConfig && hasSshKey) {
      syncCustomerConfig()  // Background, non-blocking
    }
  → loadMergedConfig()
  → ensureWorkspaceDir()  // Uses merged config
  → start
```

---

## Error Handling

| Scenario                | Behavior                              |
| ----------------------- | ------------------------------------- |
| No network on startup   | Use cached config, show warning       |
| No network on sync      | Show error, keep existing             |
| Invalid customer slug   | Show error, don't save                |
| Invalid repo URL        | Show error, don't save                |
| Git clone fails         | Show error with details, allow retry  |
| Invalid manifest        | Show error, fall back to bundled only |
| Missing customer branch | Show "Customer not found" error       |
| Corrupted local cache   | Auto-delete and re-clone              |
| No SSH key configured   | Prompt user to set up SSH key first   |

---

## Implementation Order

### Phase 1: Foundation

1. Create `src/shared/types/customer-config.ts` - Type definitions
2. Extend `AppConfig` in `src/main/lib/config.ts`
3. Create `src/main/lib/config-validation.ts`

### Phase 2: SSH Key Management

4. Create `src/main/lib/ssh-keys.ts`
5. Add SSH IPC handlers in `config-handlers.ts`
6. Update `preload/index.ts` with SSH bridge
7. Add SSH Key UI section in `Settings.tsx`

### Phase 3: Git Operations

8. Create `src/main/lib/customer-git.ts` (uses ssh-keys module)
9. Test git operations manually with SSH auth

### Phase 4: Configuration Merging

10. Create `src/main/lib/config-merger.ts`
11. Update `ensureWorkspaceDir()` in `config.ts`

### Phase 5: SDK Integration

12. Update `claude-session.ts` to use merged config

### Phase 6: Customer Config UI

13. Add customer config IPC handlers in `config-handlers.ts`
14. Update `preload/index.ts` with customer config bridge
15. Add Customer Config UI section in `Settings.tsx`

### Phase 7: Testing & Polish

16. Add unit tests for validation and merge logic
17. Integration testing (end-to-end sync flow)
18. Documentation updates

---

## Critical Files

**Existing files to modify:**

- `src/main/lib/config.ts` - AppConfig extension, ensureWorkspaceDir updates
- `src/main/lib/claude-session.ts` - SDK integration for merged config
- `src/main/handlers/config-handlers.ts` - New IPC handlers
- `src/renderer/pages/Settings.tsx` - Customer config UI
- `src/preload/index.ts` - New IPC bridge methods

**New files to create:**

- `src/shared/types/customer-config.ts` - Type definitions
- `src/main/lib/ssh-keys.ts` - SSH key management
- `src/main/lib/customer-git.ts` - Git operations for customer configs
- `src/main/lib/config-merger.ts` - Configuration layer merging
- `src/main/lib/config-validation.ts` - Input validation

---

## Example Customer Config Repository

### manifest.json

```json
{
  "version": "1.0",
  "customerName": "Acme Corporation",
  "systemPromptAdditions": "You are assisting Acme Corp engineers. Always follow Acme coding standards.",
  "modelConfig": {
    "defaultModel": "smart-sonnet",
    "allowedModels": ["fast", "smart-sonnet"]
  },
  "permissions": {
    "additionalDirectories": ["/Users/*/acme-projects"],
    "disallowedTools": []
  },
  "allowedTools": ["Bash", "Read", "Edit", "Write", "WebFetch", "Skill"],
  "skills": [
    { "name": "workspace-tools", "enabled": true },
    { "name": "xlsx", "enabled": false }
  ]
}
```

### CLAUDE.md

```markdown
# Acme Corporation Development Guidelines

## Coding Standards

- Use TypeScript for all new code
- Follow Acme naming conventions
- Include unit tests for all new features

## Internal Resources

- API documentation: https://internal.acme.com/api-docs
- Design system: https://internal.acme.com/design

## Contact

For questions, reach out to #dev-support on Slack.
```

### Custom Skill Example

```
skills/
└── acme-deploy/
    ├── SKILL.md
    └── scripts/
        └── deploy.py
```

**SKILL.md:**

```markdown
---
name: acme-deploy
description: Deploy to Acme's internal infrastructure
---

# Acme Deploy

This skill provides deployment commands for Acme's internal infrastructure.
```

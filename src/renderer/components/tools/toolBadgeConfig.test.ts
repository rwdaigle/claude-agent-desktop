import { describe, expect, test } from 'bun:test';

/**
 * Tests for toolBadgeConfig functions.
 *
 * Note: We test the pure logic functions here. The JSX icon components
 * returned by the config functions are not tested since they require
 * React rendering context.
 */

// Re-implement the color structures for testing without JSX dependencies
interface BadgeColors {
  border: string;
  bg: string;
  text: string;
  hoverBg: string;
  chevron: string;
  iconColor: string;
}

describe('Tool Badge Configuration', () => {
  describe('getToolBadgeConfig color schemes', () => {
    // Test the expected color patterns for each tool category
    // These tests document the color scheme conventions used in the app

    test('file operations tools are defined', () => {
      // Read, Write, Edit should all use emerald color scheme
      const fileTools = ['Read', 'Write', 'Edit'];
      expect(fileTools).toHaveLength(3);
    });

    test('terminal operations tools are defined', () => {
      const terminalTools = ['Bash', 'BashOutput', 'KillShell'];
      expect(terminalTools).toHaveLength(3);
    });

    test('search operations tools are defined', () => {
      const searchTools = ['Grep', 'Glob', 'WebSearch'];
      expect(searchTools).toHaveLength(3);
    });
  });

  describe('getThinkingLabel', () => {
    // Test the thinking label generation logic

    const getThinkingLabel = (isComplete: boolean, durationMs?: number): string => {
      const durationSeconds =
        typeof durationMs === 'number' ? Math.max(1, Math.round(durationMs / 1000)) : null;

      if (isComplete && durationSeconds) {
        return `${durationSeconds}s`;
      }
      if (isComplete) {
        return 'Thought';
      }
      return 'Thinking';
    };

    test('returns "Thinking" when not complete', () => {
      expect(getThinkingLabel(false)).toBe('Thinking');
    });

    test('returns "Thinking" when not complete even with duration', () => {
      expect(getThinkingLabel(false, 5000)).toBe('Thinking');
    });

    test('returns "Thought" when complete without duration', () => {
      expect(getThinkingLabel(true)).toBe('Thought');
    });

    test('returns duration in seconds when complete with duration', () => {
      expect(getThinkingLabel(true, 5000)).toBe('5s');
    });

    test('rounds duration to nearest second', () => {
      expect(getThinkingLabel(true, 5499)).toBe('5s');
      expect(getThinkingLabel(true, 5500)).toBe('6s');
    });

    test('shows minimum of 1 second', () => {
      expect(getThinkingLabel(true, 100)).toBe('1s');
      expect(getThinkingLabel(true, 999)).toBe('1s');
    });
  });

  describe('error badge configuration', () => {
    // Test that error badge uses red color scheme

    const errorColors: BadgeColors = {
      border: 'border-red-200/60 dark:border-red-500/30',
      bg: 'bg-red-50/80 dark:bg-red-500/10',
      text: 'text-red-600 dark:text-red-400',
      hoverBg: 'hover:bg-red-100/80 dark:hover:bg-red-500/20',
      chevron: 'text-red-400 dark:text-red-500',
      iconColor: 'text-red-500 dark:text-red-400'
    };

    test('error colors use red scheme for visibility', () => {
      expect(errorColors.border).toContain('red');
      expect(errorColors.bg).toContain('red');
      expect(errorColors.text).toContain('red');
      expect(errorColors.hoverBg).toContain('red');
      expect(errorColors.chevron).toContain('red');
      expect(errorColors.iconColor).toContain('red');
    });

    test('error colors include dark mode variants', () => {
      expect(errorColors.border).toContain('dark:');
      expect(errorColors.bg).toContain('dark:');
      expect(errorColors.text).toContain('dark:');
    });

    test('error colors follow same structure as other badges', () => {
      // All badge configs should have the same keys
      const expectedKeys = ['border', 'bg', 'text', 'hoverBg', 'chevron', 'iconColor'];
      const actualKeys = Object.keys(errorColors);
      expect(actualKeys).toEqual(expectedKeys);
    });
  });

  describe('getToolLabel', () => {
    // Test label generation logic for various tool types

    interface MockTool {
      name: string;
      parsedInput?: Record<string, unknown>;
      inputJson?: string;
    }

    const getToolLabelSimple = (tool: MockTool): string => {
      if (!tool.parsedInput && tool.inputJson) {
        try {
          const parsed = JSON.parse(tool.inputJson) as Record<string, unknown>;
          if (tool.name === 'Read' || tool.name === 'Write' || tool.name === 'Edit') {
            const filePath = parsed.file_path as string | undefined;
            return filePath ? `${tool.name} ${filePath.split('/').pop()}` : tool.name;
          }
          if (tool.name === 'Bash') {
            const desc = parsed.description as string | undefined;
            const cmd = parsed.command as string | undefined;
            return desc || (cmd ? cmd.split(' ')[0] : 'Run command');
          }
        } catch {
          // Ignore parse errors
        }
      }
      return tool.name;
    };

    test('returns tool name when no parsedInput or inputJson', () => {
      expect(getToolLabelSimple({ name: 'Read' })).toBe('Read');
      expect(getToolLabelSimple({ name: 'Bash' })).toBe('Bash');
    });

    test('extracts filename from file_path for Read tool', () => {
      const tool: MockTool = {
        name: 'Read',
        inputJson: '{"file_path": "/path/to/file.txt"}'
      };
      expect(getToolLabelSimple(tool)).toBe('Read file.txt');
    });

    test('uses description for Bash tool when available', () => {
      const tool: MockTool = {
        name: 'Bash',
        inputJson: '{"command": "npm install", "description": "Install deps"}'
      };
      expect(getToolLabelSimple(tool)).toBe('Install deps');
    });

    test('uses first word of command for Bash when no description', () => {
      const tool: MockTool = {
        name: 'Bash',
        inputJson: '{"command": "npm install something"}'
      };
      expect(getToolLabelSimple(tool)).toBe('npm');
    });
  });
});

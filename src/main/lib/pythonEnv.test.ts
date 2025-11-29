import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Tests for Python environment configuration and PEP 723 metadata.
 *
 * Note: Direct testing of pythonEnv.ts requires mocking Electron's app module.
 * These tests validate the logic and data structures, plus verify Python scripts
 * have proper PEP 723 inline metadata for dependency management.
 */

describe('Python Environment Config Logic', () => {
  describe('buildPythonEnv structure', () => {
    // Tests the structure returned by buildPythonEnv
    const buildPythonEnvFromBase = (
      baseDir: string
    ): Record<string, string> => {
      return {
        UV_PYTHON_INSTALL_DIR: join(baseDir, 'python'),
        UV_CACHE_DIR: join(baseDir, 'uv-cache')
      };
    };

    test('returns UV_PYTHON_INSTALL_DIR with python subdirectory', () => {
      const env = buildPythonEnvFromBase('/test/userData');
      expect(env.UV_PYTHON_INSTALL_DIR).toBe('/test/userData/python');
    });

    test('returns UV_CACHE_DIR with uv-cache subdirectory', () => {
      const env = buildPythonEnvFromBase('/test/userData');
      expect(env.UV_CACHE_DIR).toBe('/test/userData/uv-cache');
    });

    test('returns exactly two environment variables', () => {
      const env = buildPythonEnvFromBase('/test/userData');
      expect(Object.keys(env)).toHaveLength(2);
      expect(Object.keys(env)).toContain('UV_PYTHON_INSTALL_DIR');
      expect(Object.keys(env)).toContain('UV_CACHE_DIR');
    });

    test('paths are absolute when given absolute base', () => {
      const env = buildPythonEnvFromBase('/Users/test/Library/Application Support/app');
      expect(env.UV_PYTHON_INSTALL_DIR.startsWith('/')).toBe(true);
      expect(env.UV_CACHE_DIR.startsWith('/')).toBe(true);
    });
  });

  describe('environment variable merging', () => {
    // Tests the pattern used when merging Python env vars into session env
    const mergeEnvVars = (
      baseEnv: Record<string, string>,
      pythonEnv: Record<string, string>
    ): Record<string, string> => {
      return { ...baseEnv, ...pythonEnv };
    };

    test('python env vars override base env vars', () => {
      const baseEnv = {
        PATH: '/usr/bin',
        UV_PYTHON_INSTALL_DIR: '/old/path'
      };
      const pythonEnv = {
        UV_PYTHON_INSTALL_DIR: '/new/path',
        UV_CACHE_DIR: '/cache'
      };
      const merged = mergeEnvVars(baseEnv, pythonEnv);
      expect(merged.UV_PYTHON_INSTALL_DIR).toBe('/new/path');
    });

    test('preserves non-python env vars from base', () => {
      const baseEnv = { PATH: '/usr/bin', HOME: '/home/user' };
      const pythonEnv = {
        UV_PYTHON_INSTALL_DIR: '/python',
        UV_CACHE_DIR: '/cache'
      };
      const merged = mergeEnvVars(baseEnv, pythonEnv);
      expect(merged.PATH).toBe('/usr/bin');
      expect(merged.HOME).toBe('/home/user');
    });
  });
});

describe('PEP 723 Inline Metadata', () => {
  // Helper to extract PEP 723 metadata from Python file content
  const extractPep723Metadata = (
    content: string
  ): { requiresPython?: string; dependencies?: string[] } | null => {
    const scriptBlockMatch = content.match(
      /^# \/\/\/ script\n((?:# .+\n)*?)# \/\/\/$/m
    );
    if (!scriptBlockMatch) return null;

    const block = scriptBlockMatch[1];
    const result: { requiresPython?: string; dependencies?: string[] } = {};

    const pythonMatch = block.match(/# requires-python = "([^"]+)"/);
    if (pythonMatch) {
      result.requiresPython = pythonMatch[1];
    }

    const depsMatch = block.match(/# dependencies = \[([^\]]*)\]/);
    if (depsMatch) {
      const depsStr = depsMatch[1];
      if (depsStr.trim()) {
        result.dependencies = depsStr
          .split(',')
          .map((d) => d.trim().replace(/"/g, ''))
          .filter(Boolean);
      } else {
        result.dependencies = [];
      }
    }

    return result;
  };

  describe('metadata parsing', () => {
    test('extracts requires-python from valid metadata', () => {
      const content = `# /// script
# requires-python = ">=3.12"
# dependencies = ["pypdf>=4.0"]
# ///

import sys`;
      const metadata = extractPep723Metadata(content);
      expect(metadata?.requiresPython).toBe('>=3.12');
    });

    test('extracts dependencies list', () => {
      const content = `# /// script
# requires-python = ">=3.12"
# dependencies = ["pypdf>=4.0", "pillow>=10.0"]
# ///

import sys`;
      const metadata = extractPep723Metadata(content);
      expect(metadata?.dependencies).toEqual(['pypdf>=4.0', 'pillow>=10.0']);
    });

    test('handles empty dependencies list', () => {
      const content = `# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///

import sys`;
      const metadata = extractPep723Metadata(content);
      expect(metadata?.dependencies).toEqual([]);
    });

    test('returns null for file without metadata', () => {
      const content = `import sys\nprint("hello")`;
      const metadata = extractPep723Metadata(content);
      expect(metadata).toBeNull();
    });
  });

  describe('PDF skill scripts', () => {
    const pdfScriptsDir = join(
      __dirname,
      '../../../.claude/skills/pdf/scripts'
    );

    const getPythonFiles = (dir: string): string[] => {
      try {
        return readdirSync(dir)
          .filter((f) => f.endsWith('.py') && !f.includes('test'))
          .map((f) => join(dir, f));
      } catch {
        return [];
      }
    };

    test('all Python scripts have PEP 723 metadata', () => {
      const files = getPythonFiles(pdfScriptsDir);
      expect(files.length).toBeGreaterThan(0);

      for (const file of files) {
        const content = readFileSync(file, 'utf-8');
        const metadata = extractPep723Metadata(content);
        expect(metadata).not.toBeNull();
        expect(metadata?.requiresPython).toBe('>=3.12');
      }
    });

    test('convert_pdf_to_images.py uses pypdfium2 (not pdf2image)', () => {
      const file = join(pdfScriptsDir, 'convert_pdf_to_images.py');
      const content = readFileSync(file, 'utf-8');
      const metadata = extractPep723Metadata(content);

      expect(metadata?.dependencies).toBeDefined();
      expect(metadata?.dependencies?.some((d) => d.includes('pypdfium2'))).toBe(
        true
      );
      expect(metadata?.dependencies?.some((d) => d.includes('pdf2image'))).toBe(
        false
      );

      // Also check imports in the file
      expect(content).toContain('import pypdfium2');
      expect(content).not.toContain('from pdf2image');
    });
  });

  describe('DOCX skill scripts', () => {
    const docxScriptsDir = join(
      __dirname,
      '../../../.claude/skills/docx/scripts'
    );

    test('document.py has defusedxml dependency', () => {
      const file = join(docxScriptsDir, 'document.py');
      const content = readFileSync(file, 'utf-8');
      const metadata = extractPep723Metadata(content);

      expect(metadata).not.toBeNull();
      expect(metadata?.dependencies?.some((d) => d.includes('defusedxml'))).toBe(
        true
      );
    });

    test('utilities.py has defusedxml dependency', () => {
      const file = join(docxScriptsDir, 'utilities.py');
      const content = readFileSync(file, 'utf-8');
      const metadata = extractPep723Metadata(content);

      expect(metadata).not.toBeNull();
      expect(metadata?.dependencies?.some((d) => d.includes('defusedxml'))).toBe(
        true
      );
    });
  });

  describe('XLSX skill scripts', () => {
    const xlsxDir = join(__dirname, '../../../.claude/skills/xlsx');

    test('recalc.py uses xlcalculator (not LibreOffice)', () => {
      const file = join(xlsxDir, 'recalc.py');
      const content = readFileSync(file, 'utf-8');
      const metadata = extractPep723Metadata(content);

      expect(metadata).not.toBeNull();
      expect(metadata?.dependencies?.some((d) => d.includes('xlcalculator'))).toBe(
        true
      );
      expect(metadata?.dependencies?.some((d) => d.includes('openpyxl'))).toBe(
        true
      );

      // Check imports - should use xlcalculator, not subprocess for soffice
      expect(content).toContain('from xlcalculator import');
      expect(content).not.toContain("'soffice'");
      expect(content).not.toContain('setup_libreoffice_macro');
    });
  });
});

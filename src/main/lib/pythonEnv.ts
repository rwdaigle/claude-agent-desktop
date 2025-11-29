import { join } from 'path';
import { app } from 'electron';

/**
 * Returns the paths used by UV for Python and package management.
 * These are set via environment variables to ensure Python and packages
 * are installed in a controlled location rather than user's system directories.
 *
 * - pythonInstallDir: Where UV installs Python interpreters
 * - cacheDir: Where UV caches downloaded packages
 */
export function getPythonEnvPaths(): { pythonInstallDir: string; cacheDir: string } {
  const userDataDir = app.getPath('userData');
  return {
    pythonInstallDir: join(userDataDir, 'python'),
    cacheDir: join(userDataDir, 'uv-cache')
  };
}

/**
 * Builds environment variables for UV's Python management.
 * These ensure UV uses our controlled directories instead of system defaults.
 *
 * - UV_PYTHON_INSTALL_DIR: Controls where Python is downloaded/installed
 * - UV_CACHE_DIR: Controls where packages are cached
 */
export function buildPythonEnv(): Record<string, string> {
  const paths = getPythonEnvPaths();
  return {
    UV_PYTHON_INSTALL_DIR: paths.pythonInstallDir,
    UV_CACHE_DIR: paths.cacheDir
  };
}

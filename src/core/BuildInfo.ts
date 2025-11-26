/**
 * Build-time constants for version tracking and diagnostics.
 *
 * This module provides compile-time configuration and build metadata that can be
 * injected by the build system. These values are used throughout G3D for version
 * tracking, diagnostics, analytics, and crash reporting.
 *
 * Build systems (Webpack, Rollup, Vite, etc.) can replace the placeholder values
 * using DefinePlugin or similar mechanisms to inject actual build information.
 *
 * @module BuildInfo
 */

/**
 * Parses a semantic version string into its component parts.
 *
 * @param version - Semantic version string (e.g., "5.0.0")
 * @returns Object containing major, minor, and patch version numbers
 */
function parseVersion(version: string): { major: number; minor: number; patch: number } {
  const parts = version.split('.');
  return {
    major: parseInt(parts[0] || '0', 10),
    minor: parseInt(parts[1] || '0', 10),
    patch: parseInt(parts[2] || '0', 10),
  };
}

/**
 * Current G3D version string.
 * Replace at build time with actual version from package.json.
 */
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '5.0.0';

/**
 * Parsed version components.
 */
const versionParts = parseVersion(VERSION);

/**
 * Build-time constants and version information for G3D.
 *
 * All values can be replaced at build time through bundler configuration.
 * Default values are provided for development builds and when build-time
 * injection is not configured.
 *
 * @example
 * ```typescript
 * // Check if running in development mode
 * if (BuildInfo.IS_DEVELOPMENT) {
 *   console.log('Debug mode enabled');
 * }
 *
 * // Log version information
 * console.log(`G3D v${BuildInfo.VERSION} (${BuildInfo.GIT_COMMIT})`);
 *
 * // Send diagnostics with build info
 * analytics.track({
 *   version: BuildInfo.VERSION,
 *   buildNumber: BuildInfo.BUILD_NUMBER,
 *   buildDate: BuildInfo.BUILD_DATE,
 * });
 * ```
 *
 * @example Webpack Configuration
 * ```javascript
 * // webpack.config.js
 * const webpack = require('webpack');
 * const { execSync } = require('child_process');
 * const pkg = require('./package.json');
 *
 * module.exports = {
 *   plugins: [
 *     new webpack.DefinePlugin({
 *       __VERSION__: JSON.stringify(pkg.version),
 *       __BUILD_NUMBER__: process.env.BUILD_NUMBER || '0',
 *       __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
 *       __GIT_COMMIT__: JSON.stringify(
 *         execSync('git rev-parse --short HEAD').toString().trim()
 *       ),
 *       __GIT_BRANCH__: JSON.stringify(
 *         execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
 *       ),
 *       __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
 *     }),
 *   ],
 * };
 * ```
 */
const BuildInfo = {
  /**
   * Semantic version string (e.g., "5.0.0").
   * Follows semver specification: MAJOR.MINOR.PATCH
   */
  VERSION,

  /**
   * Major version number.
   * Incremented for incompatible API changes.
   */
  VERSION_MAJOR: versionParts.major,

  /**
   * Minor version number.
   * Incremented for backwards-compatible functionality additions.
   */
  VERSION_MINOR: versionParts.minor,

  /**
   * Patch version number.
   * Incremented for backwards-compatible bug fixes.
   */
  VERSION_PATCH: versionParts.patch,

  /**
   * Sequential build number.
   * Typically injected by CI/CD systems (Jenkins, GitHub Actions, etc.).
   * Default is 0 for local development builds.
   */
  BUILD_NUMBER: typeof __BUILD_NUMBER__ !== 'undefined' ? __BUILD_NUMBER__ : 0,

  /**
   * ISO 8601 timestamp of when the build was created.
   * Format: YYYY-MM-DDTHH:mm:ss.sssZ
   */
  BUILD_DATE: typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : new Date().toISOString(),

  /**
   * Short Git commit hash (7-8 characters).
   * Identifies the exact source code revision used for this build.
   */
  GIT_COMMIT: typeof __GIT_COMMIT__ !== 'undefined' ? __GIT_COMMIT__ : 'dev',

  /**
   * Git branch name.
   * Identifies which branch the build was created from.
   */
  GIT_BRANCH: typeof __GIT_BRANCH__ !== 'undefined' ? __GIT_BRANCH__ : 'main',

  /**
   * Development mode flag.
   * When true, enables debug features, verbose logging, and development tools.
   * Set to false in production builds.
   */
  IS_DEVELOPMENT: typeof __DEV__ !== 'undefined' ? __DEV__ : false,

  /**
   * Production mode flag.
   * When true, enables optimizations and strips assertions and debug code.
   * Set to true in production builds.
   */
  IS_PRODUCTION: typeof __DEV__ !== 'undefined' ? !__DEV__ : true,
} as const;

// Type declarations for build-time injected globals
declare const __VERSION__: string;
declare const __BUILD_NUMBER__: number;
declare const __BUILD_DATE__: string;
declare const __GIT_COMMIT__: string;
declare const __GIT_BRANCH__: string;
declare const __DEV__: boolean;

export default BuildInfo;

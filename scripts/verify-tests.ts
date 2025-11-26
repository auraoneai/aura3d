#!/usr/bin/env tsx
/**
 * Test Verification Script
 *
 * Ensures all modules have adequate test coverage by:
 * - Scanning for all .ts source files
 * - Checking for corresponding .test.ts files
 * - Reporting missing tests
 * - Verifying minimum coverage thresholds
 * - Exiting with error if thresholds not met
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

interface TestCoverageReport {
  totalFiles: number;
  testedFiles: number;
  missingTests: string[];
  coveragePercentage: number;
  moduleBreakdown: Map<string, ModuleCoverage>;
}

interface ModuleCoverage {
  module: string;
  totalFiles: number;
  testedFiles: number;
  percentage: number;
  missingTests: string[];
}

interface CoverageThresholds {
  math: number;
  core: number;
  ecs: number;
  rendering: number;
  physics: number;
  default: number;
}

const COVERAGE_THRESHOLDS: CoverageThresholds = {
  math: 100,
  core: 95,
  ecs: 95,
  rendering: 90,
  physics: 90,
  default: 80
};

const EXCLUDED_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/*.bench.ts',
  '**/tests/**',
  '**/__tests__/**',
  '**/types/**',
  '**/index.ts'
];

/**
 * Find all TypeScript source files in the project
 */
async function findSourceFiles(rootDir: string): Promise<string[]> {
  const pattern = path.join(rootDir, 'src', '**', '*.ts');

  const files = await glob(pattern, {
    ignore: EXCLUDED_PATTERNS,
    absolute: true
  });

  return files;
}

/**
 * Check if a test file exists for a given source file
 */
function hasTestFile(sourceFile: string): boolean {
  const dir = path.dirname(sourceFile);
  const basename = path.basename(sourceFile, '.ts');

  // Check for various test file patterns
  const testPatterns = [
    path.join(dir, `${basename}.test.ts`),
    path.join(dir, `${basename}.spec.ts`),
    path.join(dir, '__tests__', `${basename}.test.ts`),
    path.join(dir, '__tests__', `${basename}.spec.ts`)
  ];

  return testPatterns.some(pattern => fs.existsSync(pattern));
}

/**
 * Extract module name from file path
 */
function getModuleName(filePath: string, rootDir: string): string {
  const relativePath = path.relative(path.join(rootDir, 'src'), filePath);
  const parts = relativePath.split(path.sep);
  return parts[0] || 'root';
}

/**
 * Get the coverage threshold for a module
 */
function getThreshold(module: string): number {
  const lowerModule = module.toLowerCase();
  if (lowerModule in COVERAGE_THRESHOLDS) {
    return COVERAGE_THRESHOLDS[lowerModule as keyof CoverageThresholds];
  }
  return COVERAGE_THRESHOLDS.default;
}

/**
 * Generate test coverage report
 */
async function generateReport(rootDir: string): Promise<TestCoverageReport> {
  const sourceFiles = await findSourceFiles(rootDir);
  const moduleBreakdown = new Map<string, ModuleCoverage>();
  const missingTests: string[] = [];

  // Analyze each source file
  for (const sourceFile of sourceFiles) {
    const module = getModuleName(sourceFile, rootDir);
    const hasTest = hasTestFile(sourceFile);

    if (!moduleBreakdown.has(module)) {
      moduleBreakdown.set(module, {
        module,
        totalFiles: 0,
        testedFiles: 0,
        percentage: 0,
        missingTests: []
      });
    }

    const moduleCoverage = moduleBreakdown.get(module)!;
    moduleCoverage.totalFiles++;

    if (hasTest) {
      moduleCoverage.testedFiles++;
    } else {
      const relativePath = path.relative(rootDir, sourceFile);
      missingTests.push(relativePath);
      moduleCoverage.missingTests.push(relativePath);
    }
  }

  // Calculate percentages
  for (const [, coverage] of moduleBreakdown) {
    coverage.percentage = coverage.totalFiles > 0
      ? (coverage.testedFiles / coverage.totalFiles) * 100
      : 0;
  }

  const totalFiles = sourceFiles.length;
  const testedFiles = totalFiles - missingTests.length;
  const coveragePercentage = totalFiles > 0 ? (testedFiles / totalFiles) * 100 : 0;

  return {
    totalFiles,
    testedFiles,
    missingTests,
    coveragePercentage,
    moduleBreakdown
  };
}

/**
 * Print report to console
 */
function printReport(report: TestCoverageReport, rootDir: string): void {
  console.log('\n=== Test Coverage Report ===\n');

  console.log(`Total Files:     ${report.totalFiles}`);
  console.log(`Tested Files:    ${report.testedFiles}`);
  console.log(`Missing Tests:   ${report.missingTests.length}`);
  console.log(`Coverage:        ${report.coveragePercentage.toFixed(2)}%\n`);

  console.log('=== Module Breakdown ===\n');

  const sortedModules = Array.from(report.moduleBreakdown.entries())
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [moduleName, coverage] of sortedModules) {
    const threshold = getThreshold(moduleName);
    const status = coverage.percentage >= threshold ? '✓' : '✗';
    const color = coverage.percentage >= threshold ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';

    console.log(
      `${color}${status}${reset} ${moduleName.padEnd(20)} ` +
      `${coverage.testedFiles}/${coverage.totalFiles} files ` +
      `(${coverage.percentage.toFixed(1)}% / ${threshold}% required)`
    );
  }

  if (report.missingTests.length > 0) {
    console.log('\n=== Missing Tests ===\n');
    for (const file of report.missingTests.slice(0, 20)) {
      console.log(`  - ${file}`);
    }
    if (report.missingTests.length > 20) {
      console.log(`  ... and ${report.missingTests.length - 20} more`);
    }
  }
}

/**
 * Check if thresholds are met
 */
function checkThresholds(report: TestCoverageReport): boolean {
  let allPassed = true;

  for (const [moduleName, coverage] of report.moduleBreakdown) {
    const threshold = getThreshold(moduleName);
    if (coverage.percentage < threshold) {
      allPassed = false;
    }
  }

  return allPassed;
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const rootDir = path.resolve(__dirname, '..');

  console.log(`Scanning for tests in: ${rootDir}`);

  try {
    const report = await generateReport(rootDir);
    printReport(report, rootDir);

    const thresholdsMet = checkThresholds(report);

    console.log('\n=== Summary ===\n');

    if (thresholdsMet) {
      console.log('\x1b[32m✓ All coverage thresholds met!\x1b[0m');
      process.exit(0);
    } else {
      console.log('\x1b[31m✗ Some modules do not meet coverage thresholds\x1b[0m');
      console.log('\nPlease add tests for the missing files or adjust thresholds.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error generating test report:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateReport, checkThresholds, TestCoverageReport, ModuleCoverage };

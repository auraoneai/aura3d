#!/usr/bin/env tsx
/**
 * Coverage Report Generator
 *
 * Creates detailed coverage analysis by:
 * - Parsing coverage/lcov.info
 * - Generating per-module reports
 * - Highlighting low-coverage files
 * - Outputting markdown summary
 */

import * as fs from 'fs';
import * as path from 'path';

interface FileCoverage {
  file: string;
  lines: {
    found: number;
    hit: number;
    percentage: number;
  };
  functions: {
    found: number;
    hit: number;
    percentage: number;
  };
  branches: {
    found: number;
    hit: number;
    percentage: number;
  };
}

interface ModuleCoverageStats {
  module: string;
  files: FileCoverage[];
  totalLines: { found: number; hit: number; percentage: number };
  totalFunctions: { found: number; hit: number; percentage: number };
  totalBranches: { found: number; hit: number; percentage: number };
  overallPercentage: number;
}

interface CoverageReport {
  modules: Map<string, ModuleCoverageStats>;
  totalCoverage: {
    lines: { found: number; hit: number; percentage: number };
    functions: { found: number; hit: number; percentage: number };
    branches: { found: number; hit: number; percentage: number };
    overall: number;
  };
  lowCoverageFiles: FileCoverage[];
}

const LOW_COVERAGE_THRESHOLD = 70;

/**
 * Parse LCOV file
 */
function parseLcov(lcovPath: string): FileCoverage[] {
  if (!fs.existsSync(lcovPath)) {
    throw new Error(`LCOV file not found: ${lcovPath}`);
  }

  const content = fs.readFileSync(lcovPath, 'utf-8');
  const files: FileCoverage[] = [];
  let currentFile: Partial<FileCoverage> | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    if (trimmed.startsWith('SF:')) {
      // Start of a new file
      if (currentFile && currentFile.file) {
        files.push(currentFile as FileCoverage);
      }
      currentFile = {
        file: trimmed.substring(3),
        lines: { found: 0, hit: 0, percentage: 0 },
        functions: { found: 0, hit: 0, percentage: 0 },
        branches: { found: 0, hit: 0, percentage: 0 }
      };
    } else if (trimmed.startsWith('LF:') && currentFile) {
      currentFile.lines!.found = parseInt(trimmed.substring(3), 10);
    } else if (trimmed.startsWith('LH:') && currentFile) {
      currentFile.lines!.hit = parseInt(trimmed.substring(3), 10);
      currentFile.lines!.percentage = currentFile.lines!.found > 0
        ? (currentFile.lines!.hit / currentFile.lines!.found) * 100
        : 0;
    } else if (trimmed.startsWith('FNF:') && currentFile) {
      currentFile.functions!.found = parseInt(trimmed.substring(4), 10);
    } else if (trimmed.startsWith('FNH:') && currentFile) {
      currentFile.functions!.hit = parseInt(trimmed.substring(4), 10);
      currentFile.functions!.percentage = currentFile.functions!.found > 0
        ? (currentFile.functions!.hit / currentFile.functions!.found) * 100
        : 0;
    } else if (trimmed.startsWith('BRF:') && currentFile) {
      currentFile.branches!.found = parseInt(trimmed.substring(4), 10);
    } else if (trimmed.startsWith('BRH:') && currentFile) {
      currentFile.branches!.hit = parseInt(trimmed.substring(4), 10);
      currentFile.branches!.percentage = currentFile.branches!.found > 0
        ? (currentFile.branches!.hit / currentFile.branches!.found) * 100
        : 0;
    } else if (trimmed === 'end_of_record' && currentFile && currentFile.file) {
      files.push(currentFile as FileCoverage);
      currentFile = null;
    }
  }

  return files;
}

/**
 * Extract module name from file path
 */
function getModuleName(filePath: string): string {
  const parts = filePath.split('/');
  const srcIndex = parts.indexOf('src');
  if (srcIndex !== -1 && srcIndex + 1 < parts.length) {
    return parts[srcIndex + 1];
  }
  return 'unknown';
}

/**
 * Generate coverage report
 */
function generateReport(files: FileCoverage[]): CoverageReport {
  const modules = new Map<string, ModuleCoverageStats>();
  const lowCoverageFiles: FileCoverage[] = [];

  // Group files by module
  for (const file of files) {
    const moduleName = getModuleName(file.file);

    if (!modules.has(moduleName)) {
      modules.set(moduleName, {
        module: moduleName,
        files: [],
        totalLines: { found: 0, hit: 0, percentage: 0 },
        totalFunctions: { found: 0, hit: 0, percentage: 0 },
        totalBranches: { found: 0, hit: 0, percentage: 0 },
        overallPercentage: 0
      });
    }

    const moduleStats = modules.get(moduleName)!;
    moduleStats.files.push(file);
    moduleStats.totalLines.found += file.lines.found;
    moduleStats.totalLines.hit += file.lines.hit;
    moduleStats.totalFunctions.found += file.functions.found;
    moduleStats.totalFunctions.hit += file.functions.hit;
    moduleStats.totalBranches.found += file.branches.found;
    moduleStats.totalBranches.hit += file.branches.hit;

    // Check for low coverage
    const avgCoverage = (file.lines.percentage + file.functions.percentage + file.branches.percentage) / 3;
    if (avgCoverage < LOW_COVERAGE_THRESHOLD) {
      lowCoverageFiles.push(file);
    }
  }

  // Calculate percentages for each module
  for (const [, moduleStats] of modules) {
    moduleStats.totalLines.percentage = moduleStats.totalLines.found > 0
      ? (moduleStats.totalLines.hit / moduleStats.totalLines.found) * 100
      : 0;
    moduleStats.totalFunctions.percentage = moduleStats.totalFunctions.found > 0
      ? (moduleStats.totalFunctions.hit / moduleStats.totalFunctions.found) * 100
      : 0;
    moduleStats.totalBranches.percentage = moduleStats.totalBranches.found > 0
      ? (moduleStats.totalBranches.hit / moduleStats.totalBranches.found) * 100
      : 0;
    moduleStats.overallPercentage = (
      moduleStats.totalLines.percentage +
      moduleStats.totalFunctions.percentage +
      moduleStats.totalBranches.percentage
    ) / 3;
  }

  // Calculate total coverage
  let totalLinesFound = 0, totalLinesHit = 0;
  let totalFunctionsFound = 0, totalFunctionsHit = 0;
  let totalBranchesFound = 0, totalBranchesHit = 0;

  for (const file of files) {
    totalLinesFound += file.lines.found;
    totalLinesHit += file.lines.hit;
    totalFunctionsFound += file.functions.found;
    totalFunctionsHit += file.functions.hit;
    totalBranchesFound += file.branches.found;
    totalBranchesHit += file.branches.hit;
  }

  const linesPercentage = totalLinesFound > 0 ? (totalLinesHit / totalLinesFound) * 100 : 0;
  const functionsPercentage = totalFunctionsFound > 0 ? (totalFunctionsHit / totalFunctionsFound) * 100 : 0;
  const branchesPercentage = totalBranchesFound > 0 ? (totalBranchesHit / totalBranchesFound) * 100 : 0;
  const overall = (linesPercentage + functionsPercentage + branchesPercentage) / 3;

  return {
    modules,
    totalCoverage: {
      lines: { found: totalLinesFound, hit: totalLinesHit, percentage: linesPercentage },
      functions: { found: totalFunctionsFound, hit: totalFunctionsHit, percentage: functionsPercentage },
      branches: { found: totalBranchesFound, hit: totalBranchesHit, percentage: branchesPercentage },
      overall
    },
    lowCoverageFiles: lowCoverageFiles.sort((a, b) => {
      const avgA = (a.lines.percentage + a.functions.percentage + a.branches.percentage) / 3;
      const avgB = (b.lines.percentage + b.functions.percentage + b.branches.percentage) / 3;
      return avgA - avgB;
    })
  };
}

/**
 * Generate markdown report
 */
function generateMarkdown(report: CoverageReport): string {
  const lines: string[] = [];

  lines.push('# Coverage Report\n');
  lines.push(`Generated: ${new Date().toISOString()}\n`);

  lines.push('## Overall Coverage\n');
  lines.push('| Metric | Coverage |');
  lines.push('|--------|----------|');
  lines.push(`| Lines | ${report.totalCoverage.lines.percentage.toFixed(2)}% (${report.totalCoverage.lines.hit}/${report.totalCoverage.lines.found}) |`);
  lines.push(`| Functions | ${report.totalCoverage.functions.percentage.toFixed(2)}% (${report.totalCoverage.functions.hit}/${report.totalCoverage.functions.found}) |`);
  lines.push(`| Branches | ${report.totalCoverage.branches.percentage.toFixed(2)}% (${report.totalCoverage.branches.hit}/${report.totalCoverage.branches.found}) |`);
  lines.push(`| **Overall** | **${report.totalCoverage.overall.toFixed(2)}%** |\n`);

  lines.push('## Module Coverage\n');
  lines.push('| Module | Lines | Functions | Branches | Overall |');
  lines.push('|--------|-------|-----------|----------|---------|');

  const sortedModules = Array.from(report.modules.values())
    .sort((a, b) => b.overallPercentage - a.overallPercentage);

  for (const module of sortedModules) {
    lines.push(
      `| ${module.module} | ` +
      `${module.totalLines.percentage.toFixed(1)}% | ` +
      `${module.totalFunctions.percentage.toFixed(1)}% | ` +
      `${module.totalBranches.percentage.toFixed(1)}% | ` +
      `${module.overallPercentage.toFixed(1)}% |`
    );
  }

  if (report.lowCoverageFiles.length > 0) {
    lines.push('\n## Low Coverage Files (< 70%)\n');
    lines.push('| File | Lines | Functions | Branches |');
    lines.push('|------|-------|-----------|----------|');

    for (const file of report.lowCoverageFiles.slice(0, 20)) {
      const fileName = file.file.split('/').slice(-2).join('/');
      lines.push(
        `| ${fileName} | ` +
        `${file.lines.percentage.toFixed(1)}% | ` +
        `${file.functions.percentage.toFixed(1)}% | ` +
        `${file.branches.percentage.toFixed(1)}% |`
      );
    }
  }

  return lines.join('\n');
}

/**
 * Print console report
 */
function printConsoleReport(report: CoverageReport): void {
  console.log('\n=== Coverage Report ===\n');

  console.log('Overall Coverage:');
  console.log(`  Lines:     ${report.totalCoverage.lines.percentage.toFixed(2)}%`);
  console.log(`  Functions: ${report.totalCoverage.functions.percentage.toFixed(2)}%`);
  console.log(`  Branches:  ${report.totalCoverage.branches.percentage.toFixed(2)}%`);
  console.log(`  Overall:   ${report.totalCoverage.overall.toFixed(2)}%\n`);

  console.log('Module Coverage:');
  const sortedModules = Array.from(report.modules.values())
    .sort((a, b) => b.overallPercentage - a.overallPercentage);

  for (const module of sortedModules) {
    const color = module.overallPercentage >= 80 ? '\x1b[32m' : '\x1b[33m';
    const reset = '\x1b[0m';
    console.log(`  ${color}${module.module.padEnd(20)}${reset} ${module.overallPercentage.toFixed(1)}%`);
  }

  if (report.lowCoverageFiles.length > 0) {
    console.log(`\nLow Coverage Files: ${report.lowCoverageFiles.length}`);
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const rootDir = path.resolve(__dirname, '..');
  const lcovPath = path.join(rootDir, 'coverage', 'lcov.info');
  const outputPath = path.join(rootDir, 'coverage', 'COVERAGE_REPORT.md');

  try {
    const files = parseLcov(lcovPath);
    const report = generateReport(files);

    printConsoleReport(report);

    const markdown = generateMarkdown(report);
    fs.writeFileSync(outputPath, markdown, 'utf-8');

    console.log(`\nMarkdown report written to: ${outputPath}`);
  } catch (error) {
    console.error('Error generating coverage report:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateReport, generateMarkdown, CoverageReport, FileCoverage };

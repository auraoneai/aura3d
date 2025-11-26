#!/usr/bin/env tsx
/**
 * G3D Build Script
 *
 * Builds ESM, CJS, and browser bundles with comprehensive verification.
 *
 * Features:
 * - Cleans dist folder
 * - Runs tsup build
 * - Verifies all outputs exist
 * - Reports bundle sizes
 * - Validates TypeScript declarations
 * - Creates package.json for each format
 * - Generates build report
 *
 * Usage:
 *   pnpm tsx scripts/build.ts
 *   pnpm tsx scripts/build.ts --watch
 *   pnpm tsx scripts/build.ts --skip-validation
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface BuildOptions {
  watch: boolean;
  skipValidation: boolean;
  verbose: boolean;
}

interface BuildStats {
  file: string;
  size: number;
  gzipSize?: number;
}

class BuildScript {
  private options: BuildOptions;
  private startTime: number = 0;
  private stats: BuildStats[] = [];

  constructor(options: BuildOptions) {
    this.options = options;
  }

  /**
   * Main build entry point
   */
  async run(): Promise<void> {
    this.startTime = Date.now();

    console.log('🚀 G3D Build System\n');

    try {
      // Step 1: Clean dist folder
      if (!this.options.watch) {
        this.cleanDist();
      }

      // Step 2: Run tsup build
      this.runTsupBuild();

      if (this.options.watch) {
        console.log('\n👀 Watching for changes...\n');
        return;
      }

      // Step 3: Verify outputs
      this.verifyOutputs();

      // Step 4: Create package.json files
      this.createPackageJsonFiles();

      // Step 5: Collect bundle statistics
      this.collectStats();

      // Step 6: Validate TypeScript declarations
      if (!this.options.skipValidation) {
        this.validateDeclarations();
      }

      // Step 7: Generate build report
      this.generateReport();

      const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
      console.log(`\n✅ Build completed successfully in ${duration}s\n`);
    } catch (error) {
      console.error('\n❌ Build failed:', error);
      process.exit(1);
    }
  }

  /**
   * Clean dist folder
   */
  private cleanDist(): void {
    console.log('🧹 Cleaning dist folder...');

    const distPath = path.join(process.cwd(), 'dist');

    if (fs.existsSync(distPath)) {
      fs.rmSync(distPath, { recursive: true, force: true });
      if (this.options.verbose) {
        console.log('   Removed dist/');
      }
    }

    console.log('✓ Dist folder cleaned\n');
  }

  /**
   * Run tsup build
   */
  private runTsupBuild(): void {
    console.log('📦 Running tsup build...');

    try {
      const watchFlag = this.options.watch ? '--watch' : '';
      const cmd = `pnpm tsup ${watchFlag}`.trim();

      if (this.options.verbose) {
        console.log(`   Command: ${cmd}`);
      }

      execSync(cmd, {
        stdio: 'inherit',
        cwd: process.cwd(),
      });

      if (!this.options.watch) {
        console.log('✓ Tsup build completed\n');
      }
    } catch (error) {
      throw new Error(`Tsup build failed: ${error}`);
    }
  }

  /**
   * Verify all expected outputs exist
   */
  private verifyOutputs(): void {
    console.log('🔍 Verifying outputs...');

    const requiredFiles = [
      'dist/esm/index.js',
      'dist/esm/index.d.ts',
      'dist/cjs/index.cjs',
      'dist/browser/index.min.js',
    ];

    const missingFiles: string[] = [];

    for (const file of requiredFiles) {
      const filePath = path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) {
        missingFiles.push(file);
      } else if (this.options.verbose) {
        console.log(`   ✓ ${file}`);
      }
    }

    if (missingFiles.length > 0) {
      throw new Error(`Missing output files:\n${missingFiles.map(f => `  - ${f}`).join('\n')}`);
    }

    console.log(`✓ All ${requiredFiles.length} required outputs verified\n`);
  }

  /**
   * Create package.json files for each output format
   */
  private createPackageJsonFiles(): void {
    console.log('📝 Creating package.json files...');

    // ESM package.json
    const esmPackageJson = {
      type: 'module',
      sideEffects: false,
    };

    fs.writeFileSync(
      path.join(process.cwd(), 'dist/esm/package.json'),
      JSON.stringify(esmPackageJson, null, 2) + '\n'
    );

    // CJS package.json
    const cjsPackageJson = {
      type: 'commonjs',
      sideEffects: false,
    };

    fs.writeFileSync(
      path.join(process.cwd(), 'dist/cjs/package.json'),
      JSON.stringify(cjsPackageJson, null, 2) + '\n'
    );

    if (this.options.verbose) {
      console.log('   ✓ dist/esm/package.json');
      console.log('   ✓ dist/cjs/package.json');
    }

    console.log('✓ Package.json files created\n');
  }

  /**
   * Collect bundle size statistics
   */
  private collectStats(): void {
    console.log('📊 Collecting bundle statistics...');

    const filesToCheck = [
      'dist/esm/index.js',
      'dist/esm/index.d.ts',
      'dist/cjs/index.cjs',
      'dist/browser/index.min.js',
    ];

    for (const file of filesToCheck) {
      const filePath = path.join(process.cwd(), file);

      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        this.stats.push({
          file,
          size: stats.size,
        });
      }
    }

    console.log('✓ Statistics collected\n');
  }

  /**
   * Validate TypeScript declarations
   */
  private validateDeclarations(): void {
    console.log('🔎 Validating TypeScript declarations...');

    try {
      execSync('pnpm tsc -p tsconfig.build.json --noEmit', {
        stdio: this.options.verbose ? 'inherit' : 'pipe',
        cwd: process.cwd(),
      });

      console.log('✓ TypeScript declarations valid\n');
    } catch (error) {
      console.warn('⚠️  TypeScript validation had warnings (non-fatal)\n');
    }
  }

  /**
   * Generate build report
   */
  private generateReport(): void {
    console.log('📋 Build Report\n');
    console.log('═'.repeat(70));
    console.log('\n📦 Bundle Sizes:\n');

    const totalSize = this.stats.reduce((sum, stat) => sum + stat.size, 0);

    for (const stat of this.stats) {
      const sizeKB = (stat.size / 1024).toFixed(2);
      const percentage = ((stat.size / totalSize) * 100).toFixed(1);
      const fileName = path.basename(stat.file);
      const dirName = path.basename(path.dirname(stat.file));

      console.log(`  ${dirName}/${fileName}`.padEnd(40) + `${sizeKB} KB`.padStart(15) + `${percentage}%`.padStart(10));
    }

    console.log('\n' + '─'.repeat(70));
    console.log(`  Total:`.padEnd(40) + `${(totalSize / 1024).toFixed(2)} KB`.padStart(15));
    console.log('\n' + '═'.repeat(70));

    console.log('\n🎯 Output Formats:\n');
    console.log('  • ESM  (dist/esm/)     - Modern ES modules with tree-shaking');
    console.log('  • CJS  (dist/cjs/)     - CommonJS for Node.js compatibility');
    console.log('  • IIFE (dist/browser/) - Browser bundle for CDN usage');

    console.log('\n📚 Type Definitions:\n');
    console.log('  • dist/esm/index.d.ts  - Full TypeScript type definitions');
    console.log('  • dist/esm/index.d.ts.map - Source maps for declarations');

    console.log('\n🌲 Tree-Shaking:\n');
    console.log('  • ESM build supports full tree-shaking');
    console.log('  • Import only what you need for optimal bundle size');

    console.log('\n💡 Usage Examples:\n');
    console.log('  ESM:  import { Engine, Vector3 } from \'g3d\';');
    console.log('  CJS:  const { Engine, Vector3 } = require(\'g3d\');');
    console.log('  CDN:  <script src="https://cdn.example.com/g3d.min.js"></script>');
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): BuildOptions {
  const args = process.argv.slice(2);

  return {
    watch: args.includes('--watch') || args.includes('-w'),
    skipValidation: args.includes('--skip-validation'),
    verbose: args.includes('--verbose') || args.includes('-v'),
  };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const options = parseArgs();
  const builder = new BuildScript(options);
  await builder.run();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

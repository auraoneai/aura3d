# G3D Build System Documentation

This document describes the complete build system for G3D 5.0.

## Overview

G3D uses **tsup** (powered by esbuild) for fast, modern builds. The build system produces three output formats:

- **ESM** (`dist/esm/`) - Modern ES modules with tree-shaking support
- **CJS** (`dist/cjs/`) - CommonJS for Node.js and legacy bundlers
- **Browser** (`dist/browser/`) - Minified IIFE bundle for CDN usage

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all formats
pnpm build

# Build and watch for changes
pnpm build:watch

# Clean build (remove dist and rebuild)
pnpm build:clean

# Build with verification
pnpm build:verify
```

## Build Outputs

### ESM Build (`dist/esm/`)

Modern ES module output optimized for tree-shaking:

```typescript
// Import the entire library
import * as G3D from 'g3d';

// Or import specific modules (tree-shakeable)
import { Engine, Vector3, Camera } from 'g3d';

// Import submodules directly
import { Vector3, Matrix4 } from 'g3d/math';
import { World, Entity } from 'g3d/ecs';
```

**Features:**
- ES2022 target
- Full tree-shaking support
- Code splitting with chunks
- TypeScript declarations (.d.ts)
- Source maps

**Files:**
- `index.js` - Main entry point
- `index.d.ts` - TypeScript declarations
- `index.d.ts.map` - Declaration source maps
- `chunks/` - Code-split chunks
- `package.json` - Module type indicator

### CJS Build (`dist/cjs/`)

CommonJS output for Node.js and legacy bundlers:

```javascript
// Node.js or legacy bundlers
const { Engine, Vector3, Camera } = require('g3d');

// Submodule imports
const { Vector3 } = require('g3d/math');
const { World } = require('g3d/ecs');
```

**Features:**
- ES2022 target (runtime transpilation may be needed for older Node)
- No code splitting (single bundle per entry)
- Source maps
- Compatible with Node.js 18+

**Files:**
- `index.cjs` - Main entry point
- `package.json` - CommonJS type indicator

### Browser Bundle (`dist/browser/`)

Minified IIFE bundle for direct browser usage via CDN:

```html
<!-- Load from CDN -->
<script src="https://cdn.example.com/g3d/5.0.0/index.min.js"></script>

<script>
  // Access via global G3D object
  const engine = G3D.Engine.create({ canvas });
  const pos = new G3D.Vector3(0, 10, 0);
</script>
```

**Features:**
- ES2020 target (broad browser support)
- Minified and optimized
- Global `G3D` namespace
- No external dependencies
- Source maps

**Files:**
- `index.min.js` - Minified bundle
- `index.min.js.map` - Source map

## Package Exports

The package.json defines comprehensive exports for all major modules:

```json
{
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.cjs"
    },
    "./math": { /* ... */ },
    "./ecs": { /* ... */ },
    "./rendering": { /* ... */ },
    "./physics": { /* ... */ },
    "./animation": { /* ... */ },
    "./audio": { /* ... */ },
    "./ai": { /* ... */ }
  }
}
```

This enables granular imports for better tree-shaking:

```typescript
import { Vector3 } from 'g3d/math';        // Only math module
import { World } from 'g3d/ecs';           // Only ECS module
import { Camera } from 'g3d/rendering';    // Only rendering module
```

## Configuration Files

### tsconfig.build.json

Build-specific TypeScript configuration that extends the base `tsconfig.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.test.ts", "**/*.spec.ts", "**/*.bench.ts"]
}
```

**Key differences from base config:**
- Enables emit (`noEmit: false`)
- Generates declarations and source maps
- Excludes test files

### tsup.config.ts

tsup bundler configuration defining all three output formats:

```typescript
import { defineConfig } from 'tsup';

export default defineConfig([
  // ESM build
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    splitting: true,
    treeshake: true,
    // ...
  },
  // CJS build
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    // ...
  },
  // Browser bundle
  {
    entry: ['src/index.ts'],
    format: ['iife'],
    globalName: 'G3D',
    minify: true,
    // ...
  }
]);
```

**Features:**
- Three separate build configurations
- Custom chunk naming
- Name preservation for debugging
- External dependencies handling
- Platform-specific settings

## Build Scripts

### scripts/build.ts

Comprehensive build script with verification:

```bash
# Run the build script directly
pnpm tsx scripts/build.ts

# With options
pnpm tsx scripts/build.ts --watch          # Watch mode
pnpm tsx scripts/build.ts --skip-validation # Skip TS validation
pnpm tsx scripts/build.ts --verbose        # Verbose output
```

**Features:**
1. Cleans dist folder
2. Runs tsup build
3. Verifies all outputs exist
4. Creates package.json for each format
5. Collects bundle statistics
6. Validates TypeScript declarations
7. Generates detailed build report

**Example output:**
```
🚀 G3D Build System

🧹 Cleaning dist folder...
✓ Dist folder cleaned

📦 Running tsup build...
✓ Tsup build completed

🔍 Verifying outputs...
✓ All 4 required outputs verified

📝 Creating package.json files...
✓ Package.json files created

📊 Collecting bundle statistics...
✓ Statistics collected

🔎 Validating TypeScript declarations...
✓ TypeScript declarations valid

📋 Build Report
══════════════════════════════════════════════════════════════════════

📦 Bundle Sizes:

  esm/index.js                              1234.56 KB        45.0%
  esm/index.d.ts                             567.89 KB        20.5%
  cjs/index.cjs                              800.00 KB        29.0%
  browser/index.min.js                       150.00 KB         5.5%

──────────────────────────────────────────────────────────────────────
  Total:                                    2752.45 KB

══════════════════════════════════════════════════════════════════════

✅ Build completed successfully in 5.23s
```

## NPM Publishing

The package is configured for optimal publishing:

### .npmignore

Excludes development files from the published package:

```
src/
scripts/
tests/
*.test.ts
tsconfig.json
tsup.config.ts
# ... etc
```

Only includes:
- `dist/` - All build outputs
- `package.json` - Package metadata
- `README.md` - Documentation
- `LICENSE` - License file

### Pre-publish Hook

The `prepublishOnly` script ensures a clean build and passing tests:

```json
{
  "scripts": {
    "prepublishOnly": "pnpm build:clean && pnpm test"
  }
}
```

This runs automatically when executing `npm publish`.

## Development Workflow

### Standard Development

```bash
# 1. Make changes to source files
vim src/math/Vector3.ts

# 2. Run type checking
pnpm typecheck

# 3. Run tests
pnpm test

# 4. Build
pnpm build
```

### Watch Mode Development

```bash
# Terminal 1: Watch TypeScript
pnpm typecheck:watch

# Terminal 2: Watch tests
pnpm test:watch

# Terminal 3: Watch build
pnpm build:watch
```

### Pre-Release Checklist

1. Run full test suite: `pnpm test`
2. Check test coverage: `pnpm test:coverage`
3. Run strict type checking: `pnpm typecheck:strict`
4. Clean build: `pnpm build:clean`
5. Verify build: `pnpm build:verify`
6. Update version: `npm version [patch|minor|major]`
7. Publish: `npm publish`

## Performance

### Build Speed

tsup (esbuild) provides exceptional build performance:

- **Development builds**: < 1 second
- **Production builds**: 3-5 seconds (including validation)
- **Watch mode**: < 100ms incremental rebuilds

### Bundle Sizes

Approximate sizes (will vary):

- **ESM**: ~1.2 MB (unminified, tree-shakeable)
- **CJS**: ~800 KB (unminified)
- **Browser**: ~150 KB (minified + gzipped)
- **Types**: ~500 KB (.d.ts files)

**Note**: End users importing specific modules will get much smaller bundles due to tree-shaking.

Example: Importing only `Vector3` and `Matrix4`:
```typescript
import { Vector3, Matrix4 } from 'g3d/math';
// Final bundle: ~5-10 KB (gzipped)
```

## Troubleshooting

### Build Fails

```bash
# Clean everything and rebuild
rm -rf node_modules dist
pnpm install
pnpm build:clean
```

### Type Errors

```bash
# Check types without emitting
pnpm typecheck

# More strict checking
pnpm typecheck:strict
```

### Missing tsup

```bash
# Install dependencies
pnpm install
```

### Large Bundle Sizes

1. Ensure you're using ESM imports for tree-shaking
2. Import from submodules: `g3d/math` instead of `g3d`
3. Use dynamic imports for large, rarely-used modules
4. Check your bundler configuration

### Source Maps Not Working

Source maps are generated by default. If debugging isn't working:

1. Ensure your bundler is configured to read source maps
2. Check that `.map` files exist alongside `.js` files
3. Verify browser DevTools has source maps enabled

## Advanced Configuration

### Custom Build Targets

Edit `tsup.config.ts` to add custom builds:

```typescript
export default defineConfig([
  // ... existing configs ...

  // ES5 legacy build
  {
    entry: ['src/index.ts'],
    format: ['iife'],
    target: 'es5',
    outDir: 'dist/legacy',
    minify: true,
  },
]);
```

### Conditional Exports

The package.json supports conditional exports for different environments:

```json
{
  "exports": {
    ".": {
      "browser": "./dist/browser/index.min.js",
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.cjs",
      "default": "./dist/esm/index.js"
    }
  }
}
```

### External Dependencies

To exclude dependencies from the bundle, add them to tsup config:

```typescript
{
  external: ['three', 'gsap'],
}
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build and Test

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build:verify
```

## References

- [tsup Documentation](https://tsup.egoist.dev/)
- [esbuild Documentation](https://esbuild.github.io/)
- [TypeScript Documentation](https://www.typescriptlang.org/)
- [Node.js Package Exports](https://nodejs.org/api/packages.html#exports)

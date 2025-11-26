# G3D Build System - Quick Start

## Installation

```bash
# Install tsup (already in package.json)
pnpm install
```

## Build Commands

```bash
# Build all formats (ESM, CJS, Browser)
pnpm build

# Build and watch for changes
pnpm build:watch

# Clean build (remove dist and rebuild)
pnpm build:clean

# Build with full verification
pnpm build:verify

# Type-check only (no emit)
pnpm typecheck

# Generate type declarations only
pnpm build:types
```

## Output Structure

```
dist/
├── esm/                    # ES Modules (tree-shakeable)
│   ├── index.js
│   ├── index.d.ts
│   ├── index.d.ts.map
│   ├── package.json        # { "type": "module" }
│   └── chunks/             # Code-split chunks
├── cjs/                    # CommonJS (Node.js)
│   ├── index.cjs
│   └── package.json        # { "type": "commonjs" }
└── browser/                # Browser bundle (CDN)
    ├── index.min.js        # Minified IIFE
    └── index.min.js.map
```

## Usage Examples

### ESM (Recommended)

```typescript
// Modern bundlers with tree-shaking
import { Engine, Vector3, Camera } from 'g3d';

// Import specific modules for better tree-shaking
import { Vector3, Matrix4 } from 'g3d/math';
import { World, Entity } from 'g3d/ecs';
```

### CommonJS

```javascript
// Node.js or legacy bundlers
const { Engine, Vector3, Camera } = require('g3d');

// Module imports
const { Vector3 } = require('g3d/math');
```

### Browser (CDN)

```html
<script src="https://cdn.example.com/g3d@5.0.0/browser/index.min.js"></script>
<script>
  const engine = G3D.Engine.create({ canvas });
  const pos = new G3D.Vector3(0, 10, 0);
</script>
```

## Configuration Files

### tsconfig.build.json (36 lines)
Build-specific TypeScript configuration extending base tsconfig.json

### tsup.config.ts (74 lines)
Three build configurations:
- ESM with tree-shaking and code splitting
- CJS for Node.js compatibility
- Browser IIFE bundle (minified)

### scripts/build.ts (320 lines)
Comprehensive build script with:
- Clean dist folder
- Run tsup build
- Verify outputs exist
- Create format-specific package.json files
- Collect bundle statistics
- Validate TypeScript declarations
- Generate detailed build report

### .npmignore (65 lines)
Excludes development files from npm package

## Development Workflow

```bash
# 1. Make code changes
vim src/math/Vector3.ts

# 2. Type check
pnpm typecheck

# 3. Test
pnpm test

# 4. Build
pnpm build
```

## Watch Mode Development

```bash
# Terminal 1: TypeScript checking
pnpm typecheck:watch

# Terminal 2: Test watching
pnpm test:watch

# Terminal 3: Build watching
pnpm build:watch
```

## Pre-Publish Checklist

```bash
# 1. Run tests
pnpm test

# 2. Check coverage
pnpm test:coverage

# 3. Type check (strict)
pnpm typecheck:strict

# 4. Clean build
pnpm build:clean

# 5. Verify build
pnpm build:verify

# 6. Update version
npm version [patch|minor|major]

# 7. Publish (runs prepublishOnly hook)
npm publish
```

## CI/CD

GitHub Actions workflow automatically:
- Type checks code
- Runs all tests
- Builds all formats
- Verifies outputs exist
- Generates coverage reports
- Runs on Node 18 and 20

## Performance

- **Development builds**: < 1 second
- **Production builds**: 3-5 seconds
- **Watch mode rebuilds**: < 100ms
- **ESM bundle**: ~1.2 MB (unminified, tree-shakeable)
- **CJS bundle**: ~800 KB (unminified)
- **Browser bundle**: ~150 KB (minified + gzipped)

## Troubleshooting

### Build fails

```bash
rm -rf node_modules dist
pnpm install
pnpm build:clean
```

### Type errors

```bash
pnpm typecheck
pnpm typecheck:strict
```

### Missing dependencies

```bash
pnpm install
```

## Further Reading

- **BUILD.md** - Complete build system documentation
- **CONTRIBUTING.md** - Development guidelines
- **tsup docs** - https://tsup.egoist.dev/
- **esbuild docs** - https://esbuild.github.io/

## Key Features

- Zero configuration needed - just run `pnpm build`
- Three output formats (ESM, CJS, Browser)
- Full tree-shaking support in ESM
- TypeScript declarations with source maps
- Fast incremental rebuilds with watch mode
- Comprehensive build verification
- Automated CI/CD with GitHub Actions
- Production-ready npm publishing setup

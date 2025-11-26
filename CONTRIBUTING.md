# Contributing to G3D 5.0

Thank you for your interest in contributing to G3D! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Build System](#build-system)
- [Testing](#testing)
- [Code Style](#code-style)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Project Structure](#project-structure)

## Getting Started

### Prerequisites

- **Node.js**: v18 or higher
- **pnpm**: v8 or higher
- **Git**: Latest version
- **TypeScript**: Knowledge of TypeScript is essential

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/g3d.git
cd g3d
```

3. Add upstream remote:

```bash
git remote add upstream https://github.com/g3d/g3d.git
```

## Development Setup

### Install Dependencies

```bash
pnpm install
```

### Verify Setup

Run the following commands to ensure everything is working:

```bash
# Type checking
pnpm typecheck

# Run tests
pnpm test

# Build the project
pnpm build
```

If all commands complete successfully, you're ready to start developing!

## Build System

G3D uses **tsup** (powered by esbuild) for fast builds. See [BUILD.md](./BUILD.md) for detailed documentation.

### Build Commands

```bash
# Build all formats (ESM, CJS, Browser)
pnpm build

# Build and watch for changes
pnpm build:watch

# Clean build
pnpm build:clean

# Build with verification
pnpm build:verify

# Type checking only
pnpm typecheck

# Type checking in watch mode
pnpm typecheck:watch
```

### Build Outputs

- **ESM**: `dist/esm/` - Modern ES modules with tree-shaking
- **CJS**: `dist/cjs/` - CommonJS for Node.js
- **Browser**: `dist/browser/` - Minified IIFE for CDN

## Testing

### Test Commands

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run tests with UI
pnpm test:ui

# Run benchmarks
pnpm test:bench
```

### Writing Tests

- Place test files next to the code they test: `Vector3.ts` → `Vector3.test.ts`
- Use descriptive test names that explain what is being tested
- Follow the Arrange-Act-Assert pattern
- Aim for high test coverage (>80%)

Example test structure:

```typescript
import { describe, it, expect } from 'vitest';
import { Vector3 } from './Vector3';

describe('Vector3', () => {
  describe('constructor', () => {
    it('should create a vector with default values', () => {
      // Arrange & Act
      const v = new Vector3();

      // Assert
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
      expect(v.z).toBe(0);
    });

    it('should create a vector with custom values', () => {
      // Arrange & Act
      const v = new Vector3(1, 2, 3);

      // Assert
      expect(v.x).toBe(1);
      expect(v.y).toBe(2);
      expect(v.z).toBe(3);
    });
  });

  describe('add', () => {
    it('should add two vectors correctly', () => {
      // Arrange
      const a = new Vector3(1, 2, 3);
      const b = new Vector3(4, 5, 6);

      // Act
      const result = a.add(b);

      // Assert
      expect(result.x).toBe(5);
      expect(result.y).toBe(7);
      expect(result.z).toBe(9);
    });
  });
});
```

### Benchmarks

For performance-critical code, add benchmarks:

```typescript
import { bench, describe } from 'vitest';
import { Vector3 } from './Vector3';

describe('Vector3 Performance', () => {
  bench('Vector3 add', () => {
    const a = new Vector3(1, 2, 3);
    const b = new Vector3(4, 5, 6);
    a.add(b);
  });

  bench('Vector3 normalize', () => {
    const v = new Vector3(1, 2, 3);
    v.normalize();
  });
});
```

## Code Style

### TypeScript Guidelines

- Use TypeScript strict mode (already enabled)
- Avoid `any` type - use `unknown` if type is truly unknown
- Use interfaces for object shapes, types for unions/intersections
- Prefer const assertions for readonly data
- Use explicit return types for public APIs

### Naming Conventions

- **Classes**: PascalCase (`Vector3`, `PhysicsWorld`)
- **Interfaces**: PascalCase with `I` prefix (`IDisposable`, `ISerializable`)
- **Types**: PascalCase (`TypedArray`, `JSONValue`)
- **Functions/Methods**: camelCase (`normalize`, `createEntity`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_ENTITIES`, `DEFAULT_GRAVITY`)
- **Private members**: camelCase with `_` prefix (`_internalState`)

### Documentation

All public APIs must have JSDoc comments:

```typescript
/**
 * Represents a 3D vector with x, y, and z components.
 *
 * This class provides comprehensive vector operations including arithmetic,
 * geometric transformations, and utility functions.
 *
 * @example
 * ```typescript
 * const v1 = new Vector3(1, 2, 3);
 * const v2 = new Vector3(4, 5, 6);
 * const result = v1.add(v2); // Vector3(5, 7, 9)
 * ```
 */
export class Vector3 {
  /**
   * Creates a new Vector3 instance.
   *
   * @param x - The x component (default: 0)
   * @param y - The y component (default: 0)
   * @param z - The z component (default: 0)
   */
  constructor(
    public x: number = 0,
    public y: number = 0,
    public z: number = 0
  ) {}

  /**
   * Adds another vector to this vector.
   *
   * @param other - The vector to add
   * @returns A new vector containing the sum
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(1, 2, 3);
   * const v2 = new Vector3(4, 5, 6);
   * const sum = v1.add(v2); // Vector3(5, 7, 9)
   * ```
   */
  add(other: Vector3): Vector3 {
    return new Vector3(
      this.x + other.x,
      this.y + other.y,
      this.z + other.z
    );
  }
}
```

### Code Organization

- One class per file
- Group related functionality in modules
- Keep files under 500 lines when possible
- Use barrel exports (`index.ts`) for public APIs

### Performance Considerations

- Avoid allocations in hot paths
- Use object pooling for frequently created objects
- Prefer `for` loops over `forEach` in performance-critical code
- Profile before optimizing

## Commit Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Build system changes
- `ci`: CI/CD changes
- `chore`: Other changes that don't modify src or test files

**Examples:**

```
feat(math): add quaternion slerp method

Implement spherical linear interpolation for smooth rotation blending.
Includes comprehensive tests and benchmarks.

Closes #123
```

```
fix(physics): correct collision detection for rotated boxes

The previous implementation didn't account for rotation when checking
box-box collisions. This updates the algorithm to use SAT (Separating
Axis Theorem) for accurate rotated collision detection.

Fixes #456
```

## Pull Request Process

### Before Submitting

1. **Update from upstream:**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run all checks:**
   ```bash
   pnpm typecheck
   pnpm test
   pnpm build
   ```

3. **Update documentation:**
   - Update JSDoc comments
   - Update README.md if adding new features
   - Add examples if applicable

4. **Add tests:**
   - Unit tests for new functionality
   - Integration tests if needed
   - Benchmarks for performance-critical code

### Submitting a PR

1. **Push to your fork:**
   ```bash
   git push origin feature/my-feature
   ```

2. **Create pull request:**
   - Go to GitHub and create a PR from your fork
   - Use a clear, descriptive title
   - Fill out the PR template
   - Link related issues

3. **PR title format:**
   ```
   feat(module): add new feature
   fix(module): fix bug in component
   docs: update API documentation
   ```

4. **PR description should include:**
   - What changes were made
   - Why the changes were needed
   - How to test the changes
   - Screenshots/videos if UI changes
   - Breaking changes (if any)

### Review Process

- A maintainer will review your PR
- Address any requested changes
- Keep your branch up to date with main
- Once approved, a maintainer will merge your PR

## Project Structure

```
g3d/
├── src/                    # Source code
│   ├── core/              # Core engine systems
│   ├── math/              # Math library
│   ├── ecs/               # Entity Component System
│   ├── rendering/         # Rendering system
│   ├── physics/           # Physics simulation
│   ├── animation/         # Animation system
│   ├── audio/             # Audio system
│   ├── input/             # Input handling
│   ├── ai/                # AI and pathfinding
│   ├── particles/         # Particle systems
│   ├── terrain/           # Terrain rendering
│   ├── types/             # Shared TypeScript types
│   └── index.ts           # Main entry point
├── scripts/               # Build and utility scripts
│   ├── build.ts           # Build verification script
│   ├── verify-tests.ts    # Test verification
│   └── coverage-report.ts # Coverage reporting
├── dist/                  # Build output (generated)
│   ├── esm/               # ES modules
│   ├── cjs/               # CommonJS
│   └── browser/           # Browser bundle
├── .github/               # GitHub configuration
│   └── workflows/         # CI/CD workflows
├── tsconfig.json          # TypeScript config (development)
├── tsconfig.build.json    # TypeScript config (build)
├── tsup.config.ts         # Build configuration
├── vitest.config.ts       # Test configuration
├── package.json           # Package manifest
├── BUILD.md               # Build system documentation
├── CONTRIBUTING.md        # This file
└── README.md              # Project documentation
```

## Questions?

If you have questions or need help:

1. Check existing documentation (README.md, BUILD.md)
2. Search existing issues on GitHub
3. Ask in discussions
4. Create a new issue with the "question" label

## License

By contributing to G3D, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing to G3D!

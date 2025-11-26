#!/usr/bin/env python3
"""
G3D 5.0 Dependency Graph Analyzer
Detects layer violations and circular dependencies
"""

import os
import re
from pathlib import Path
from collections import defaultdict, deque
from typing import Dict, List, Set, Tuple

# Define layer structure
LAYERS = {
    1: {
        'core': [],
        'math': ['core']
    },
    2: {
        'ecs': ['core', 'math']
    },
    3: {
        'rendering': ['core', 'math', 'ecs'],
        'physics': ['core', 'math', 'ecs'],
        'audio': ['core', 'ecs'],
        'net': ['core', 'ecs'],
        'input': ['core']
    },
    4: {
        'animation': ['core', 'math', 'ecs', 'rendering'],
        'ai': ['core', 'math', 'ecs'],
        'simulation': ['core', 'math', 'ecs', 'physics'],
        'world': ['core', 'math', 'ecs', 'rendering'],
        'terrain': ['core', 'math', 'ecs', 'rendering'],
        'ocean': ['core', 'math', 'ecs', 'rendering'],
        'weather': ['core', 'math', 'ecs', 'rendering'],
        'voxel': ['core', 'math', 'ecs', 'rendering']
    },
    5: {
        'ui': ['core', 'math', 'ecs', 'rendering', 'input'],
        'editor': ['core', 'math', 'ecs', 'rendering'],
        'scripting': ['core', 'ecs'],
        'timeline': ['core', 'ecs', 'animation'],
        'profiling': ['core'],
        'analytics': ['core'],
        'cloud': ['core', 'net'],
        'localization': ['core'],
        'assets': ['core', 'rendering'],
        'serialization': ['core', 'ecs']
    },
    6: {
        'scientific': ['core', 'math', 'rendering'],
        'medical': ['core', 'math', 'rendering'],
        'architecture': ['core', 'math', 'ecs', 'rendering'],
        'xr': ['core', 'math', 'ecs', 'rendering', 'input'],
        'ecommerce': ['core', 'math', 'rendering', 'input']
    }
}

# Flatten layer structure for lookup
MODULE_ALLOWED_DEPS = {}
MODULE_LAYER = {}
for layer_num, modules in LAYERS.items():
    for module, allowed in modules.items():
        MODULE_ALLOWED_DEPS[module] = set(allowed)
        MODULE_LAYER[module] = layer_num


class DependencyAnalyzer:
    def __init__(self, src_dir: str):
        self.src_dir = Path(src_dir)
        self.violations = []
        self.dependencies = defaultdict(set)  # module -> set of modules it imports

    def extract_imports(self, file_path: Path) -> List[Tuple[str, int]]:
        """Extract cross-module imports from a TypeScript file."""
        imports = []
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                for line_num, line in enumerate(f, 1):
                    # Match import statements with parent directory navigation
                    match = re.search(r"from\s+['\"]\.\.\/([^'\"\/]+)", line)
                    if match:
                        imported_module = match.group(1)
                        imports.append((imported_module, line_num))
        except Exception as e:
            print(f"Error reading {file_path}: {e}")
        return imports

    def analyze_module(self, module_name: str) -> List[Dict]:
        """Analyze all files in a module for cross-module dependencies."""
        module_path = self.src_dir / module_name
        if not module_path.exists():
            return []

        violations = []
        allowed_imports = MODULE_ALLOWED_DEPS.get(module_name, set())

        # Find all TypeScript files
        for ts_file in module_path.rglob('*.ts'):
            # Skip test files
            if '__tests__' in str(ts_file) or '.test.' in str(ts_file):
                continue

            imports = self.extract_imports(ts_file)
            for imported_module, line_num in imports:
                # Track dependency
                self.dependencies[module_name].add(imported_module)

                # Check if this import is allowed
                if imported_module not in allowed_imports and imported_module != module_name:
                    # Check if it's importing from a higher layer
                    importing_layer = MODULE_LAYER.get(module_name, 0)
                    imported_layer = MODULE_LAYER.get(imported_module, 0)

                    violations.append({
                        'module': module_name,
                        'imports': imported_module,
                        'file': str(ts_file.relative_to(self.src_dir)),
                        'line': line_num,
                        'importing_layer': importing_layer,
                        'imported_layer': imported_layer,
                        'type': 'layer_violation' if imported_layer >= importing_layer else 'forbidden_import'
                    })

        return violations

    def find_circular_dependencies(self) -> List[List[str]]:
        """Find circular dependencies using DFS."""
        cycles = []
        visited = set()
        rec_stack = set()
        path = []

        def dfs(node: str):
            if node in rec_stack:
                # Found a cycle
                cycle_start = path.index(node)
                cycle = path[cycle_start:] + [node]
                cycles.append(cycle)
                return

            if node in visited:
                return

            visited.add(node)
            rec_stack.add(node)
            path.append(node)

            for neighbor in self.dependencies.get(node, []):
                if neighbor in MODULE_ALLOWED_DEPS:  # Only follow known modules
                    dfs(neighbor)

            path.pop()
            rec_stack.remove(node)

        # Run DFS from each module
        for module in MODULE_ALLOWED_DEPS.keys():
            if module not in visited:
                dfs(module)

        return cycles

    def analyze_all(self):
        """Analyze all modules."""
        print("=== G3D 5.0 DEPENDENCY VERIFICATION ===\n")

        all_violations = []

        # Analyze each layer
        for layer_num in sorted(LAYERS.keys()):
            print(f"=== LAYER {layer_num} ===\n")

            for module_name in sorted(LAYERS[layer_num].keys()):
                violations = self.analyze_module(module_name)

                if violations:
                    all_violations.extend(violations)
                    print(f"Layer {layer_num}: {module_name} ✗")
                    print(f"  VIOLATIONS FOUND: {len(violations)}")

                    # Group by imported module
                    by_import = defaultdict(list)
                    for v in violations:
                        by_import[v['imports']].append(v)

                    for imported, vios in sorted(by_import.items()):
                        print(f"    - Imports '{imported}' ({len(vios)} occurrences)")
                        for v in vios[:3]:  # Show first 3 examples
                            print(f"      {v['file']}:{v['line']}")
                        if len(vios) > 3:
                            print(f"      ... and {len(vios) - 3} more")
                else:
                    print(f"Layer {layer_num}: {module_name} ✓")

                print()

        # Check for circular dependencies
        print("\n=== CIRCULAR DEPENDENCIES ===\n")
        cycles = self.find_circular_dependencies()

        if cycles:
            print(f"Found {len(cycles)} circular dependency chains:\n")
            for i, cycle in enumerate(cycles, 1):
                print(f"{i}. {' → '.join(cycle)}")
        else:
            print("✓ No circular dependencies found")

        # Summary
        print("\n\n=== SUMMARY ===\n")
        print(f"Total violations: {len(all_violations)}")
        print(f"Circular dependencies: {len(cycles)}")

        # Critical violations (lower layer importing higher layer)
        critical = [v for v in all_violations if v['type'] == 'layer_violation']
        print(f"Critical layer violations: {len(critical)}")

        if critical:
            print("\nCRITICAL VIOLATIONS (Lower layer importing higher layer):")
            for v in critical[:10]:
                print(f"  - {v['module']} (L{v['importing_layer']}) → {v['imports']} (L{v['imported_layer']})")
                print(f"    {v['file']}:{v['line']}")
            if len(critical) > 10:
                print(f"  ... and {len(critical) - 10} more")

        return all_violations, cycles


def main():
    src_dir = "/Users/gurbakshchahal/G3D/src"
    analyzer = DependencyAnalyzer(src_dir)
    violations, cycles = analyzer.analyze_all()

    # Save detailed report
    with open("/Users/gurbakshchahal/G3D/dependency_analysis.txt", "w") as f:
        f.write("=== G3D 5.0 DETAILED DEPENDENCY ANALYSIS ===\n\n")

        f.write(f"Total Violations: {len(violations)}\n")
        f.write(f"Circular Dependencies: {len(cycles)}\n\n")

        f.write("=== ALL VIOLATIONS ===\n\n")
        for v in violations:
            f.write(f"{v['module']} (Layer {v['importing_layer']}) → {v['imports']} (Layer {v['imported_layer']})\n")
            f.write(f"  File: {v['file']}:{v['line']}\n")
            f.write(f"  Type: {v['type']}\n\n")

        if cycles:
            f.write("\n=== CIRCULAR DEPENDENCIES ===\n\n")
            for i, cycle in enumerate(cycles, 1):
                f.write(f"{i}. {' → '.join(cycle)}\n")


if __name__ == "__main__":
    main()

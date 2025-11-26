#!/bin/bash

# G3D 5.0 Dependency Verification Script
# This script checks for layer violations and circular dependencies

SRC_DIR="/Users/gurbakshchahal/G3D/src"
OUTPUT_FILE="/Users/gurbakshchahal/G3D/dependency_report.txt"

echo "=== G3D 5.0 DEPENDENCY VERIFICATION ===" > "$OUTPUT_FILE"
echo "Generated: $(date)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Function to check module imports
check_module_imports() {
    local module=$1
    local allowed_modules=$2
    local layer=$3

    echo "Checking $module (Layer $layer)..." >&2

    # Find all TS files in the module (excluding tests)
    find "$SRC_DIR/$module" -name "*.ts" -not -path "*/__tests__/*" 2>/dev/null | while read file; do
        # Extract imports from other G3D modules
        grep -n "from ['\"]\.\./" "$file" 2>/dev/null | while read line; do
            line_num=$(echo "$line" | cut -d: -f1)
            import_path=$(echo "$line" | sed "s/.*from ['\"]\.\.\/\([^'\"]*\)['\"].*/\1/" | cut -d/ -f1)

            # Check if import is allowed
            if [[ ! " $allowed_modules " =~ " $import_path " ]] && [[ "$import_path" != "$module" ]]; then
                echo "VIOLATION|$module|$import_path|$file|$line_num"
            fi
        done
    done
}

echo "=== LAYER 1: FOUNDATION ===" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Layer 1: core - NO internal dependencies
echo "Layer 1: core" >> "$OUTPUT_FILE"
violations=$(check_module_imports "core" "" "1")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 1: math - Can only import from core
echo "Layer 1: math" >> "$OUTPUT_FILE"
violations=$(check_module_imports "math" "core" "1")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

echo "=== LAYER 2: DATA ===" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Layer 2: ecs
echo "Layer 2: ecs" >> "$OUTPUT_FILE"
violations=$(check_module_imports "ecs" "core math" "2")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

echo "=== LAYER 3: SYSTEMS ===" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Layer 3: rendering
echo "Layer 3: rendering" >> "$OUTPUT_FILE"
violations=$(check_module_imports "rendering" "core math ecs" "3")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 3: physics
echo "Layer 3: physics" >> "$OUTPUT_FILE"
violations=$(check_module_imports "physics" "core math ecs" "3")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 3: audio
echo "Layer 3: audio" >> "$OUTPUT_FILE"
violations=$(check_module_imports "audio" "core ecs" "3")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 3: net
echo "Layer 3: net" >> "$OUTPUT_FILE"
violations=$(check_module_imports "net" "core ecs" "3")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 3: input
echo "Layer 3: input" >> "$OUTPUT_FILE"
violations=$(check_module_imports "input" "core" "3")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

echo "=== LAYER 4: FEATURES ===" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Layer 4: animation
echo "Layer 4: animation" >> "$OUTPUT_FILE"
violations=$(check_module_imports "animation" "core math ecs rendering" "4")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 4: ai
echo "Layer 4: ai" >> "$OUTPUT_FILE"
violations=$(check_module_imports "ai" "core math ecs" "4")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 4: simulation
echo "Layer 4: simulation" >> "$OUTPUT_FILE"
violations=$(check_module_imports "simulation" "core math ecs physics" "4")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 4: world
echo "Layer 4: world" >> "$OUTPUT_FILE"
violations=$(check_module_imports "world" "core math ecs rendering" "4")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 4: terrain
echo "Layer 4: terrain" >> "$OUTPUT_FILE"
violations=$(check_module_imports "terrain" "core math ecs rendering" "4")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 4: ocean
echo "Layer 4: ocean" >> "$OUTPUT_FILE"
violations=$(check_module_imports "ocean" "core math ecs rendering" "4")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 4: weather
echo "Layer 4: weather" >> "$OUTPUT_FILE"
violations=$(check_module_imports "weather" "core math ecs rendering" "4")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 4: voxel
echo "Layer 4: voxel" >> "$OUTPUT_FILE"
violations=$(check_module_imports "voxel" "core math ecs rendering" "4")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

echo "=== LAYER 5: TOOLS ===" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Layer 5: ui
echo "Layer 5: ui" >> "$OUTPUT_FILE"
violations=$(check_module_imports "ui" "core math ecs rendering input" "5")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 5: editor
echo "Layer 5: editor" >> "$OUTPUT_FILE"
violations=$(check_module_imports "editor" "core math ecs rendering" "5")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 5: scripting
echo "Layer 5: scripting" >> "$OUTPUT_FILE"
violations=$(check_module_imports "scripting" "core ecs" "5")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 5: timeline
echo "Layer 5: timeline" >> "$OUTPUT_FILE"
violations=$(check_module_imports "timeline" "core ecs animation" "5")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 5: profiling
echo "Layer 5: profiling" >> "$OUTPUT_FILE"
violations=$(check_module_imports "profiling" "core" "5")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 5: analytics
echo "Layer 5: analytics" >> "$OUTPUT_FILE"
violations=$(check_module_imports "analytics" "core" "5")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 5: cloud
echo "Layer 5: cloud" >> "$OUTPUT_FILE"
violations=$(check_module_imports "cloud" "core net" "5")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 5: localization
echo "Layer 5: localization" >> "$OUTPUT_FILE"
violations=$(check_module_imports "localization" "core" "5")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 5: assets
echo "Layer 5: assets" >> "$OUTPUT_FILE"
violations=$(check_module_imports "assets" "core rendering" "5")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 5: serialization
echo "Layer 5: serialization" >> "$OUTPUT_FILE"
violations=$(check_module_imports "serialization" "core ecs" "5")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

echo "=== LAYER 6: DOMAINS ===" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Layer 6: scientific
echo "Layer 6: scientific" >> "$OUTPUT_FILE"
violations=$(check_module_imports "scientific" "core math rendering" "6")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 6: medical
echo "Layer 6: medical" >> "$OUTPUT_FILE"
violations=$(check_module_imports "medical" "core math rendering" "6")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 6: architecture
echo "Layer 6: architecture" >> "$OUTPUT_FILE"
violations=$(check_module_imports "architecture" "core math ecs rendering" "6")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 6: xr
echo "Layer 6: xr" >> "$OUTPUT_FILE"
violations=$(check_module_imports "xr" "core math ecs rendering input" "6")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

# Layer 6: ecommerce
echo "Layer 6: ecommerce" >> "$OUTPUT_FILE"
violations=$(check_module_imports "ecommerce" "core math rendering input" "6")
if [ -z "$violations" ]; then
    echo "  ✓ No violations" >> "$OUTPUT_FILE"
else
    echo "  ✗ VIOLATIONS FOUND:" >> "$OUTPUT_FILE"
    echo "$violations" | while IFS='|' read type module imported file line; do
        echo "    - Imports $imported (line $line in $(basename $file))" >> "$OUTPUT_FILE"
    done
fi
echo "" >> "$OUTPUT_FILE"

echo "" >> "$OUTPUT_FILE"
echo "=== VERIFICATION COMPLETE ===" >> "$OUTPUT_FILE"
echo "Check complete at $(date)" >> "$OUTPUT_FILE"

cat "$OUTPUT_FILE"

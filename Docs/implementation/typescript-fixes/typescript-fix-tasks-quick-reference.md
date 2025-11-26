# TypeScript Error Fix - 10 Parallel Tasks Quick Reference

## Task Summary

| Task | Error Types | Count | Difficulty | Time | Parallelizable |
|------|-------------|-------|------------|------|----------------|
| **Task 1** | TS1205 | ~70 | ⭐ Easy | 1-2h | ✅ Yes |
| **Task 2** | TS4114 | ~28 | ⭐ Easy | 30m | ✅ Yes |
| **Task 3** | TS6133 | ~123 | ⭐ Easy | 2-3h | ✅ Yes |
| **Task 4** | TS2554, TS2339, TS2576 | ~50 | ⭐⭐⭐ High | 4-6h | ❌ No (API) |
| **Task 5** | TS2339, TS2554 | ~150 | ⭐⭐⭐ High | 1-2d | ✅ Yes |
| **Task 6** | TS2339 | ~30 | ⭐⭐ Medium | 4-6h | ✅ Yes |
| **Task 7** | TS2532, TS18048, TS2345, TS2322 | ~400 | ⭐⭐ Medium | 2-3d | ✅ Yes |
| **Task 8** | TS2532, TS18048, TS2345, TS2322 | ~150 | ⭐⭐ Medium | 1-2d | ✅ Yes |
| **Task 9** | TS2532, TS18048, TS2345, TS2322 | ~200 | ⭐⭐ Medium | 1-2d | ✅ Yes |
| **Task 10** | TS2345, TS2322, TS2564, TS2307, TS2551 | ~200 | ⭐⭐ Medium | 1-2d | ✅ Yes |

---

## Task 1: Fix Type Exports (TS1205)
**Files:** All `index.ts` files  
**Fix:** `export { Type }` → `export type { Type }`  
**Can Start:** ✅ Immediately

---

## Task 2: Add Override Modifiers (TS4114)
**Files:** System subclasses, UIElement subclasses  
**Fix:** Add `override` keyword to overriding methods  
**Can Start:** ✅ Immediately

---

## Task 3: Fix Unused Variables (TS6133)
**Files:** All files with unused imports/variables  
**Fix:** Remove unused imports, prefix unused params with `_`  
**Can Start:** ✅ Immediately

---

## Task 4: Standardize Logger API (TS2554, TS2339, TS2576)
**Files:** `src/core/Logger.ts` + all Logger usages  
**Fix:** Choose one Logger pattern, update all usages  
**Can Start:** ✅ Immediately (but blocks other Logger fixes)  
**Dependency:** Must complete before fixing Logger errors in other tasks

---

## Task 5: Fix Matrix3/Matrix4 API (TS2339, TS2554)
**Files:** `src/simulation/mpm/MaterialModels.ts` (148 errors), other Matrix users  
**Fix:** Align with actual Matrix3/Matrix4 API  
**Can Start:** ✅ After reading Matrix3.ts and Matrix4.ts  
**Dependency:** Must understand Matrix API first

---

## Task 6: Fix Vector3 API (TS2339)
**Files:** `src/simulation/smoke/SmokeRenderer.ts`, other Vector3 users  
**Fix:** Align with actual Vector3 API  
**Can Start:** ✅ After reading Vector3.ts  
**Dependency:** Must understand Vector3 API first

---

## Task 7: Fix Null Safety - Simulation (TS2532, TS18048, TS2345, TS2322)
**Files:** 
- `src/simulation/mpm/MaterialModels.ts` (148 errors)
- `src/simulation/sph/SPHFluidFramework.ts` (126 errors)
- `src/simulation/mpm/Grid.ts` (40 errors)
- Other simulation files

**Fix:** Add null checks, optional chaining, nullish coalescing  
**Can Start:** ✅ After Task 5 (if uses Matrix API)  
**Dependency:** May need Matrix API fixes first

---

## Task 8: Fix Null Safety - Terrain (TS2532, TS18048, TS2345, TS2322)
**Files:**
- `src/terrain/generation/NoiseGenerator.ts` (54 errors)
- `src/terrain/Splatmap.ts` (32 errors)
- Other terrain files

**Fix:** Add null checks, optional chaining, nullish coalescing  
**Can Start:** ✅ Immediately

---

## Task 9: Fix Null Safety - Rendering/UI/Voxel/Weather (TS2532, TS18048, TS2345, TS2322)
**Files:**
- `src/voxel/GreedyMesher.ts` (81 errors)
- `src/weather/SnowSystem.ts` (25 errors)
- `src/ui/UICanvas.ts` (21 errors)
- Other files

**Fix:** Add null checks, optional chaining, nullish coalescing  
**Can Start:** ✅ Immediately

---

## Task 10: Fix Type Assignments & Remaining (TS2345, TS2322, TS2564, TS2307, TS2551)
**Files:** Various files with type mismatches  
**Fix:** Type guards, property initialization, import paths  
**Can Start:** ✅ Immediately

---

## Parallel Execution Plan

### Batch 1 (Can run in parallel immediately):
- ✅ Task 1: Type Exports
- ✅ Task 2: Override Modifiers
- ✅ Task 3: Unused Variables
- ✅ Task 8: Terrain Null Safety
- ✅ Task 9: Rendering/UI/Voxel/Weather Null Safety
- ✅ Task 10: Type Assignments

### Batch 2 (After reading APIs):
- ✅ Task 4: Logger API (must complete before Logger fixes elsewhere)
- ✅ Task 5: Matrix API (can run parallel with Task 6)
- ✅ Task 6: Vector API (can run parallel with Task 5)

### Batch 3 (After API fixes):
- ✅ Task 7: Simulation Null Safety (may depend on Matrix API fixes)

---

## Quick Commands

### Check Error Count:
```bash
grep -c "error TS" logs.txt
```

### Check Specific Error Type:
```bash
grep -c "error TS1205" logs.txt
grep -c "error TS4114" logs.txt
grep -c "error TS6133" logs.txt
```

### Compile Check:
```bash
tsc --noEmit
```

### Find Files with Most Errors:
```bash
grep -o "src/[^:]*\.ts" logs.txt | sort | uniq -c | sort -rn | head -20
```

---

## Progress Tracking

After each task, update:
- [ ] Task 1: Type Exports - ___ errors remaining
- [ ] Task 2: Override Modifiers - ___ errors remaining
- [ ] Task 3: Unused Variables - ___ errors remaining
- [ ] Task 4: Logger API - ___ errors remaining
- [ ] Task 5: Matrix API - ___ errors remaining
- [ ] Task 6: Vector API - ___ errors remaining
- [ ] Task 7: Simulation Null Safety - ___ errors remaining
- [ ] Task 8: Terrain Null Safety - ___ errors remaining
- [ ] Task 9: Rendering/UI/Voxel/Weather - ___ errors remaining
- [ ] Task 10: Type Assignments - ___ errors remaining

**Total Errors Remaining:** ___ / 7,760

---

**See FIX-TYPESCRIPT-ERRORS-EXECUTION-PROMPT.md for detailed instructions.**


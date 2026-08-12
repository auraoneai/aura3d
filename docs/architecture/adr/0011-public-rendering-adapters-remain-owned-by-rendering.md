# ADR 0011: Public rendering adapters remain owned by rendering

- **Date:** 2026-08-11
- **Status:** accepted for Aura3D 2.0.0
- **Workstream:** 2.0 renderer completion

## Context

Aura3D 2.0 adds root geometry construction and a portable shader-material
extension. These public adapters could accidentally become new geometry or
shader engines if their ownership is not bounded.

## Decision

`RootGeometry` is a root-safe descriptor adapter whose execution remains owned
by `@aura3d/rendering`. `PortableShaderMaterial`, shader-library composition,
and lean renderer entrypoints remain part of the single rendering owner. They
must compile through the existing renderer backends and may not introduce a
parallel render loop, material system, or backend.

## Evidence

Renderer extension, shader, package-graph, production-path, and browser pixel
tests prove the public adapters reach the retained renderer implementation.

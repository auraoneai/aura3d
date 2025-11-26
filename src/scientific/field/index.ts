/**
 * Field Visualization Module
 *
 * Complete field visualization system for scientific data.
 * Supports scalar and vector fields with GPU-accelerated rendering.
 */

export { FieldData } from './FieldData';
export type { ScalarFieldData, VectorFieldData } from './FieldData';
export { FieldManager } from './FieldManager';
export type { FieldType, FieldEntry, FieldManagerOptions, ProgressCallback } from './FieldManager';
export { ColorMap } from './ColorMap';
export type { RGB, RGBA, ColorStop } from './ColorMap';
export {
    ScalarFieldRenderer
} from './ScalarFieldRenderer';
export type {
    VolumeRenderOptions,
    IsosurfaceOptions,
    SliceAxis,
    SliceOptions
} from './ScalarFieldRenderer';
export {
    VectorFieldRenderer
} from './VectorFieldRenderer';
export type {
    GlyphType,
    ColorMode,
    ScaleMode,
    VectorRenderOptions
} from './VectorFieldRenderer';
export {
    StreamlineIntegrator
} from './StreamlineIntegrator';
export type {
    TraceDirection,
    StreamlineOptions,
    Streamline
} from './StreamlineIntegrator';
export {
    ParticleTracer
} from './ParticleTracer';
export type {
    SeedingStrategy,
    ParticleTracerOptions,
    Particle
} from './ParticleTracer';
export {
    FieldProbe
} from './FieldProbe';
export type {
    ProbeResult,
    ProbeOptions
} from './FieldProbe';
export {
    FieldDataLoader
} from './FieldDataLoader';
export type {
    FileFormat,
    LoadOptions
} from './FieldDataLoader';

/**
 * G3D Scientific Visualization Module
 *
 * Complete scientific visualization and climate simulation system.
 * Provides field visualization, particle tracing, and global climate simulation.
 *
 * @module scientific
 * @version 5.0.0
 *
 * @example
 * ```typescript
 * import { FieldManager, VectorFieldRenderer, ClimateSystem } from '@g3d/scientific';
 *
 * // Field visualization
 * const manager = new FieldManager();
 * const field = await manager.load('wind', 'data/wind.vtk');
 * const renderer = new VectorFieldRenderer(gl);
 * renderer.render(field, viewMatrix, projMatrix);
 *
 * // Climate simulation
 * const climate = new ClimateSystem();
 * climate.setDate(new Date(2024, 6, 15));
 * climate.update(deltaTime);
 * const weather = climate.getWeatherAt(40.7, -74.0);
 * console.log(`Temperature: ${weather.temperatureC}°C`);
 * ```
 */

// Field Visualization
export {
    FieldData
} from './field/FieldData';
export type {
    ScalarFieldData,
    VectorFieldData
} from './field/FieldData';

export {
    FieldManager
} from './field/FieldManager';
export type {
    FieldType,
    FieldEntry,
    FieldManagerOptions,
    ProgressCallback
} from './field/FieldManager';

export {
    ColorMap,
    MarchingCubesTables
} from './field/ColorMap';
export type {
    RGB,
    RGBA,
    ColorStop
} from './field/ColorMap';

export {
    ScalarFieldRenderer
} from './field/ScalarFieldRenderer';
export type {
    VolumeRenderOptions,
    IsosurfaceOptions,
    SliceAxis,
    SliceOptions
} from './field/ScalarFieldRenderer';

export {
    VectorFieldRenderer
} from './field/VectorFieldRenderer';
export type {
    GlyphType,
    ColorMode,
    ScaleMode,
    VectorRenderOptions
} from './field/VectorFieldRenderer';

export {
    StreamlineIntegrator
} from './field/StreamlineIntegrator';
export type {
    TraceDirection,
    StreamlineOptions,
    Streamline
} from './field/StreamlineIntegrator';

export {
    ParticleTracer
} from './field/ParticleTracer';
export type {
    SeedingStrategy,
    ParticleTracerOptions,
    Particle
} from './field/ParticleTracer';

export {
    FieldProbe
} from './field/FieldProbe';
export type {
    ProbeResult,
    ProbeOptions
} from './field/FieldProbe';

export {
    FieldDataLoader
} from './field/FieldDataLoader';
export type {
    FileFormat,
    LoadOptions
} from './field/FieldDataLoader';

// Climate Simulation
export {
    ClimateZone
} from './climate/ClimateZone';
export type {
    KoppenClimate,
    ClimateZoneProperties
} from './climate/ClimateZone';

export {
    ClimateGrid
} from './climate/ClimateGrid';
export type {
    GridCell
} from './climate/ClimateGrid';

export {
    TemperatureSimulator
} from './climate/TemperatureSimulator';
export type {
    TemperatureConfig
} from './climate/TemperatureSimulator';

export {
    PressureHumiditySimulator
} from './climate/PressureHumiditySimulator';
export type {
    PressureHumidityConfig
} from './climate/PressureHumiditySimulator';

export {
    WindSimulator
} from './climate/WindSimulator';
export type {
    WindConfig
} from './climate/WindSimulator';

export {
    WeatherEventGenerator
} from './climate/WeatherEventGenerator';
export type {
    EventType,
    WeatherEvent
} from './climate/WeatherEventGenerator';

export {
    ClimateSystem
} from './climate/ClimateSystem';
export type {
    WeatherData,
    ClimateSystemOptions
} from './climate/ClimateSystem';

// Re-export sub-modules
export * as field from './field';
export * as climate from './climate';

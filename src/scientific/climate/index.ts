/**
 * Climate Simulation Module
 *
 * Complete climate simulation system with weather events,
 * global circulation, and real-time simulation @ 60 FPS.
 */

export {
    ClimateZone
} from './ClimateZone';
export type {
    KoppenClimate,
    ClimateZoneProperties
} from './ClimateZone';

export {
    ClimateGrid
} from './ClimateGrid';
export type {
    GridCell
} from './ClimateGrid';

export {
    TemperatureSimulator
} from './TemperatureSimulator';
export type {
    TemperatureConfig
} from './TemperatureSimulator';

export {
    PressureHumiditySimulator
} from './PressureHumiditySimulator';
export type {
    PressureHumidityConfig
} from './PressureHumiditySimulator';

export {
    WindSimulator
} from './WindSimulator';
export type {
    WindConfig
} from './WindSimulator';

export {
    WeatherEventGenerator
} from './WeatherEventGenerator';
export type {
    EventType,
    WeatherEvent
} from './WeatherEventGenerator';

export {
    ClimateSystem
} from './ClimateSystem';
export type {
    WeatherData,
    ClimateSystemOptions
} from './ClimateSystem';

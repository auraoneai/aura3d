/**
 * Weather and atmospheric systems
 * Complete weather simulation with rain, snow, fog, clouds, and day/night cycle
 * @module Weather
 */

export { WeatherSystem } from './WeatherSystem';
export type { WeatherSystemConfig } from './WeatherSystem';
export { WeatherState, WeatherType } from './WeatherState';
export type { WeatherStateConfig } from './WeatherState';
export { WeatherTransition, Easing } from './WeatherTransition';
export type { EasingFunction } from './WeatherTransition';
export { WeatherPresets } from './WeatherPresets';
export { RainSystem } from './RainSystem';
export type { Puddle } from './RainSystem';
export { SnowSystem } from './SnowSystem';
export type { SnowAccumulation } from './SnowSystem';
export { WetnessSystem, WetnessMaterials } from './WetnessSystem';
export type { WetnessRegion, WetnessMaterial } from './WetnessSystem';
export { LightningSystem } from './LightningSystem';
export type {
    LightningStrike,
    LightningSegment,
    LightningParams
} from './LightningSystem';
export { WindSystem } from './WindSystem';
export type { WindZone } from './WindSystem';
export { FogSystem } from './FogSystem';
export type { FogLayer, FogVolume } from './FogSystem';
export { TimeOfDay } from './TimeOfDay';
export type {
    TimeOfDayParams,
    SunData,
    MoonData,
    SkyColors
} from './TimeOfDay';
export { CloudSystem, CloudType } from './CloudSystem';
export type { CloudLayer, CloudBillboard } from './CloudSystem';

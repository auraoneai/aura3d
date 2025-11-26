/**
 * Fire and combustion simulation module.
 * Provides complete fire simulation with temperature fields, turbulence,
 * combustion, and particle systems.
 * @module simulation/fire
 */

export { FireSimulation } from './FireSimulation';
export type { FireSimulationConfig } from './FireSimulation';
export { TemperatureField } from './TemperatureField';
export { TurbulenceSimulation } from './TurbulenceSimulation';
export { FireParticleSystem } from './FireParticleSystem';
export type { FireParticle, FireParticleConfig } from './FireParticleSystem';

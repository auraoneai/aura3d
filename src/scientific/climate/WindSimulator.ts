/**
 * Wind Simulator
 *
 * Simulates global wind patterns including pressure gradient winds,
 * Coriolis effect, trade winds, westerlies, and local effects.
 *
 * @example
 * ```typescript
 * const simulator = new WindSimulator(grid);
 * simulator.update(deltaTime);
 * const wind = simulator.getWindAt(40, -74);
 * ```
 */

import { ClimateGrid } from './ClimateGrid';
import { PressureHumiditySimulator } from './PressureHumiditySimulator';

export interface WindConfig {
    coriolisStrength?: number;
    frictionCoefficient?: number;
    pressureGradientFactor?: number;
    maxWindSpeed?: number;
}

/**
 * Wind simulator with Coriolis effect
 */
export class WindSimulator {
    private grid: ClimateGrid;
    private pressureSimulator: PressureHumiditySimulator;
    private config: Required<WindConfig>;

    private readonly EARTH_ROTATION = 7.2921e-5; // rad/s

    constructor(grid: ClimateGrid, pressureSimulator: PressureHumiditySimulator, config: WindConfig = {}) {
        this.grid = grid;
        this.pressureSimulator = pressureSimulator;
        this.config = {
            coriolisStrength: config.coriolisStrength ?? 1.0,
            frictionCoefficient: config.frictionCoefficient ?? 0.1,
            pressureGradientFactor: config.pressureGradientFactor ?? 0.01,
            maxWindSpeed: config.maxWindSpeed ?? 50 // m/s
        };
    }

    /**
     * Update wind field
     */
    public update(deltaTime: number): void {
        this.updatePressureGradientWind(deltaTime);
        this.applyCoriolisEffect(deltaTime);
        this.applyFriction(deltaTime);
        this.applyGlobalCirculation(deltaTime);
    }

    /**
     * Update wind based on pressure gradients
     */
    private updatePressureGradientWind(deltaTime: number): void {
        for (let latIdx = 0; latIdx < this.grid.height; latIdx++) {
            for (let lonIdx = 0; lonIdx < this.grid.width; lonIdx++) {
                const gradient = this.pressureSimulator.getPressureGradient(lonIdx, latIdx);
                const density = this.pressureSimulator.getAirDensity(lonIdx, latIdx);

                // Pressure gradient force: F = -∇P / ρ
                const forceX = -gradient.dx / density * this.config.pressureGradientFactor;
                const forceY = -gradient.dy / density * this.config.pressureGradientFactor;

                // Update wind velocity
                const u = this.grid.getWindU(lonIdx, latIdx);
                const v = this.grid.getWindV(lonIdx, latIdx);

                this.grid.setWindU(lonIdx, latIdx, u + forceX * deltaTime);
                this.grid.setWindV(lonIdx, latIdx, v + forceY * deltaTime);
            }
        }
    }

    /**
     * Apply Coriolis effect
     */
    private applyCoriolisEffect(deltaTime: number): void {
        for (let latIdx = 0; latIdx < this.grid.height; latIdx++) {
            const lat = this.grid.indexToLatitude(latIdx);
            const f = 2 * this.EARTH_ROTATION * Math.sin(lat * Math.PI / 180) * this.config.coriolisStrength;

            for (let lonIdx = 0; lonIdx < this.grid.width; lonIdx++) {
                const u = this.grid.getWindU(lonIdx, latIdx);
                const v = this.grid.getWindV(lonIdx, latIdx);

                // Coriolis acceleration: a = f × v
                const coriolisU = f * v * deltaTime;
                const coriolisV = -f * u * deltaTime;

                this.grid.setWindU(lonIdx, latIdx, u + coriolisU);
                this.grid.setWindV(lonIdx, latIdx, v + coriolisV);
            }
        }
    }

    /**
     * Apply friction (surface drag)
     */
    private applyFriction(deltaTime: number): void {
        for (let latIdx = 0; latIdx < this.grid.height; latIdx++) {
            for (let lonIdx = 0; lonIdx < this.grid.width; lonIdx++) {
                const u = this.grid.getWindU(lonIdx, latIdx);
                const v = this.grid.getWindV(lonIdx, latIdx);

                // Friction force proportional to velocity
                const frictionFactor = 1 - this.config.frictionCoefficient * deltaTime;

                this.grid.setWindU(lonIdx, latIdx, u * frictionFactor);
                this.grid.setWindV(lonIdx, latIdx, v * frictionFactor);
            }
        }
    }

    /**
     * Apply global circulation patterns (trade winds, westerlies, etc.)
     */
    private applyGlobalCirculation(deltaTime: number): void {
        for (let latIdx = 0; latIdx < this.grid.height; latIdx++) {
            const lat = this.grid.indexToLatitude(latIdx);

            // Global wind pattern strengths
            let baseU = 0;

            // Trade winds (0-30°)
            if (Math.abs(lat) < 30) {
                baseU = lat > 0 ? -3 : -3; // Easterly
            }
            // Westerlies (30-60°)
            else if (Math.abs(lat) < 60) {
                baseU = lat > 0 ? 5 : 5; // Westerly
            }
            // Polar easterlies (60-90°)
            else {
                baseU = lat > 0 ? -2 : -2; // Easterly
            }

            for (let lonIdx = 0; lonIdx < this.grid.width; lonIdx++) {
                const u = this.grid.getWindU(lonIdx, latIdx);

                // Blend with global pattern
                const blendFactor = 0.01 * deltaTime;
                this.grid.setWindU(lonIdx, latIdx, u + (baseU - u) * blendFactor);
            }
        }
    }

    /**
     * Apply local effects (sea breeze, mountain winds, etc.)
     */
    public applySeaBreeze(lonIdx: number, latIdx: number, deltaTime: number): void {
        if (!this.grid.isOcean(lonIdx, latIdx)) return;

        // Check for land neighbors
        const neighbors = [
            [lonIdx + 1, latIdx],
            [lonIdx - 1, latIdx],
            [lonIdx, latIdx + 1],
            [lonIdx, latIdx - 1]
        ];

        for (const [nlon, nlat] of neighbors) {
            if (nlat < 0 || nlat >= this.grid.height) continue;

            if (!this.grid.isOcean(nlon, nlat)) {
                const oceanTemp = this.grid.getTemperature(lonIdx, latIdx);
                const landTemp = this.grid.getTemperature(nlon, nlat);

                // Temperature difference drives breeze
                const tempDiff = landTemp - oceanTemp;
                const breezeStrength = tempDiff * 0.1;

                // Wind from ocean to land during day (land warmer)
                const u = this.grid.getWindU(lonIdx, latIdx);
                const v = this.grid.getWindV(lonIdx, latIdx);

                const dx = nlon - lonIdx;
                const dy = nlat - latIdx;

                this.grid.setWindU(lonIdx, latIdx, u + dx * breezeStrength * deltaTime);
                this.grid.setWindV(lonIdx, latIdx, v + dy * breezeStrength * deltaTime);
            }
        }
    }

    /**
     * Clamp wind speeds to maximum
     */
    public clampWindSpeeds(): void {
        for (let latIdx = 0; latIdx < this.grid.height; latIdx++) {
            for (let lonIdx = 0; lonIdx < this.grid.width; lonIdx++) {
                const u = this.grid.getWindU(lonIdx, latIdx);
                const v = this.grid.getWindV(lonIdx, latIdx);
                const speed = Math.sqrt(u * u + v * v);

                if (speed > this.config.maxWindSpeed) {
                    const scale = this.config.maxWindSpeed / speed;
                    this.grid.setWindU(lonIdx, latIdx, u * scale);
                    this.grid.setWindV(lonIdx, latIdx, v * scale);
                }
            }
        }
    }

    /**
     * Get wind at lat/lon with interpolation
     */
    public getWindAt(lat: number, lon: number): { u: number; v: number; speed: number; direction: number } {
        const lonIdx = this.grid.longitudeToIndex(lon);
        const latIdx = this.grid.latitudeToIndex(lat);

        const u = this.grid.getWindU(lonIdx, latIdx);
        const v = this.grid.getWindV(lonIdx, latIdx);
        const speed = Math.sqrt(u * u + v * v);
        const direction = (Math.atan2(u, v) * 180 / Math.PI + 360) % 360;

        return { u, v, speed, direction };
    }

    /**
     * Calculate wind divergence
     */
    public getWindDivergence(lonIdx: number, latIdx: number): number {
        const uE = this.grid.getWindU(lonIdx + 1, latIdx);
        const uW = this.grid.getWindU(lonIdx - 1, latIdx);
        const vN = latIdx > 0 ? this.grid.getWindV(lonIdx, latIdx - 1) : 0;
        const vS = latIdx < this.grid.height - 1 ? this.grid.getWindV(lonIdx, latIdx + 1) : 0;

        const du_dx = (uE - uW) / 2;
        const dv_dy = (vS - vN) / 2;

        return du_dx + dv_dy;
    }

    /**
     * Calculate wind vorticity (curl)
     */
    public getWindVorticity(lonIdx: number, latIdx: number): number {
        const uN = latIdx > 0 ? this.grid.getWindU(lonIdx, latIdx - 1) : 0;
        const uS = latIdx < this.grid.height - 1 ? this.grid.getWindU(lonIdx, latIdx + 1) : 0;
        const vE = this.grid.getWindV(lonIdx + 1, latIdx);
        const vW = this.grid.getWindV(lonIdx - 1, latIdx);

        const dv_dx = (vE - vW) / 2;
        const du_dy = (uS - uN) / 2;

        return dv_dx - du_dy;
    }

    /**
     * Classify wind by Beaufort scale
     */
    public getBeaufortScale(lonIdx: number, latIdx: number): {
        scale: number;
        description: string;
    } {
        const speed = this.grid.getWindSpeed(lonIdx, latIdx);

        if (speed < 0.5) return { scale: 0, description: 'Calm' };
        if (speed < 1.5) return { scale: 1, description: 'Light air' };
        if (speed < 3.3) return { scale: 2, description: 'Light breeze' };
        if (speed < 5.5) return { scale: 3, description: 'Gentle breeze' };
        if (speed < 7.9) return { scale: 4, description: 'Moderate breeze' };
        if (speed < 10.7) return { scale: 5, description: 'Fresh breeze' };
        if (speed < 13.8) return { scale: 6, description: 'Strong breeze' };
        if (speed < 17.1) return { scale: 7, description: 'Near gale' };
        if (speed < 20.7) return { scale: 8, description: 'Gale' };
        if (speed < 24.4) return { scale: 9, description: 'Severe gale' };
        if (speed < 28.4) return { scale: 10, description: 'Storm' };
        if (speed < 32.6) return { scale: 11, description: 'Violent storm' };
        return { scale: 12, description: 'Hurricane' };
    }
}

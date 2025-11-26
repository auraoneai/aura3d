/**
 * Climate System
 *
 * Main orchestrator integrating all climate components.
 * Provides unified interface for climate simulation at 60 FPS.
 *
 * @example
 * ```typescript
 * const climate = new ClimateSystem();
 * climate.setDate(new Date(2024, 6, 15)); // July 15, 2024
 * climate.update(deltaTime);
 * const weather = climate.getWeatherAt(40.7, -74.0); // NYC
 * ```
 */

import { ClimateGrid } from './ClimateGrid';
import { ClimateZone, KoppenClimate, ClimateZoneProperties } from './ClimateZone';
import { TemperatureSimulator } from './TemperatureSimulator';
import { PressureHumiditySimulator } from './PressureHumiditySimulator';
import { WindSimulator } from './WindSimulator';
import { WeatherEventGenerator, WeatherEvent, EventType } from './WeatherEventGenerator';

export interface WeatherData {
    temperature: number; // Kelvin
    temperatureC: number; // Celsius
    pressure: number; // Pa
    humidity: number; // %
    windSpeed: number; // m/s
    windDirection: number; // degrees
    precipitation: number; // mm/h
    precipitationType: 'none' | 'rain' | 'snow' | 'sleet';
    cloudCover: number; // 0-1
    dewPoint: number; // Kelvin
    climateZone: ClimateZoneProperties;
}

export interface ClimateSystemOptions {
    enableWeatherEvents?: boolean;
    enableSeasonalVariation?: boolean;
    timeScale?: number;
}

/**
 * Integrated climate system
 */
export class ClimateSystem {
    private grid: ClimateGrid;
    private tempSimulator: TemperatureSimulator;
    private pressureSimulator: PressureHumiditySimulator;
    private windSimulator: WindSimulator;
    private eventGenerator: WeatherEventGenerator;

    private currentDate: Date;
    private simulationTime: number = 0; // seconds
    private options: Required<ClimateSystemOptions>;

    constructor(options: ClimateSystemOptions = {}) {
        this.grid = new ClimateGrid();
        this.tempSimulator = new TemperatureSimulator(this.grid);
        this.pressureSimulator = new PressureHumiditySimulator(this.grid);
        this.windSimulator = new WindSimulator(this.grid, this.pressureSimulator);
        this.eventGenerator = new WeatherEventGenerator(this.grid, this.pressureSimulator, this.windSimulator);

        this.currentDate = new Date();
        this.options = {
            enableWeatherEvents: options.enableWeatherEvents ?? true,
            enableSeasonalVariation: options.enableSeasonalVariation ?? true,
            timeScale: options.timeScale ?? 1.0
        };
    }

    /**
     * Update climate simulation
     */
    public update(deltaTime: number): void {
        const scaledDelta = deltaTime * this.options.timeScale;
        this.simulationTime += scaledDelta;

        // Update date
        this.currentDate = new Date(this.currentDate.getTime() + scaledDelta * 1000);

        const dayOfYear = this.getDayOfYear();
        const timeOfDay = this.getTimeOfDay();

        // Update components
        this.tempSimulator.update(scaledDelta, dayOfYear, timeOfDay);
        this.pressureSimulator.update(scaledDelta);
        this.windSimulator.update(scaledDelta);

        if (this.options.enableWeatherEvents) {
            this.eventGenerator.update(scaledDelta);
        }

        // Clamp wind speeds
        this.windSimulator.clampWindSpeeds();
    }

    /**
     * Get weather at latitude/longitude
     */
    public getWeatherAt(lat: number, lon: number): WeatherData {
        const lonIdx = this.grid.longitudeToIndex(lon);
        const latIdx = this.grid.latitudeToIndex(lat);

        const temperature = this.grid.getTemperatureAt(lat, lon);
        const pressure = this.grid.getPressure(lonIdx, latIdx);
        const humidity = this.grid.getHumidity(lonIdx, latIdx);
        const wind = this.windSimulator.getWindAt(lat, lon);
        const precipitation = this.pressureSimulator.getPrecipitationRate(lonIdx, latIdx);
        const precipType = this.pressureSimulator.getPrecipitationType(lonIdx, latIdx);
        const cloudCover = this.pressureSimulator.getCloudCover(lonIdx, latIdx);
        const dewPoint = this.pressureSimulator.calculateDewPoint(lonIdx, latIdx);

        // Determine climate zone
        const tempC = temperature - 273.15;
        const annualPrecip = precipitation * 24 * 365; // Rough estimate
        const climateZone = ClimateZone.classify(tempC, annualPrecip, tempC - 10, tempC + 10, lat);

        return {
            temperature,
            temperatureC: tempC,
            pressure,
            humidity,
            windSpeed: wind.speed,
            windDirection: wind.direction,
            precipitation,
            precipitationType: precipType,
            cloudCover,
            dewPoint,
            climateZone
        };
    }

    /**
     * Get weather at grid cell
     */
    public getWeatherAtCell(lonIdx: number, latIdx: number): WeatherData {
        const lat = this.grid.indexToLatitude(latIdx);
        const lon = this.grid.indexToLongitude(lonIdx);
        return this.getWeatherAt(lat, lon);
    }

    /**
     * Set current date
     */
    public setDate(date: Date): void {
        this.currentDate = new Date(date);
    }

    /**
     * Get current date
     */
    public getDate(): Date {
        return new Date(this.currentDate);
    }

    /**
     * Get day of year (1-365)
     */
    public getDayOfYear(): number {
        const start = new Date(this.currentDate.getFullYear(), 0, 0);
        const diff = this.currentDate.getTime() - start.getTime();
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }

    /**
     * Get time of day (0-24 hours)
     */
    public getTimeOfDay(): number {
        return this.currentDate.getHours() + this.currentDate.getMinutes() / 60;
    }

    /**
     * Get season at latitude
     */
    public getSeason(lat: number): 'spring' | 'summer' | 'autumn' | 'winter' {
        const dayOfYear = this.getDayOfYear();
        const hemisphere = lat >= 0 ? 'north' : 'south';

        let season: 'spring' | 'summer' | 'autumn' | 'winter';

        if (hemisphere === 'north') {
            if (dayOfYear < 80 || dayOfYear >= 355) season = 'winter';
            else if (dayOfYear < 172) season = 'spring';
            else if (dayOfYear < 266) season = 'summer';
            else season = 'autumn';
        } else {
            if (dayOfYear < 80 || dayOfYear >= 355) season = 'summer';
            else if (dayOfYear < 172) season = 'autumn';
            else if (dayOfYear < 266) season = 'winter';
            else season = 'spring';
        }

        return season;
    }

    /**
     * Create weather event
     */
    public createWeatherEvent(
        type: EventType,
        lat: number,
        lon: number,
        intensity: number = 0.8
    ): string {
        const lonIdx = this.grid.longitudeToIndex(lon);
        const latIdx = this.grid.latitudeToIndex(lat);
        return this.eventGenerator.createEvent(type, lonIdx, latIdx, intensity);
    }

    /**
     * Get active weather events
     */
    public getActiveEvents(): WeatherEvent[] {
        return this.eventGenerator.getActiveEvents();
    }

    /**
     * Get events at location
     */
    public getEventsAt(lat: number, lon: number, radiusDegrees: number = 1): WeatherEvent[] {
        const lonIdx = this.grid.longitudeToIndex(lon);
        const latIdx = this.grid.latitudeToIndex(lat);
        const radiusCells = Math.round(radiusDegrees);
        return this.eventGenerator.getEventsAt(lonIdx, latIdx, radiusCells);
    }

    /**
     * Get climate grid
     */
    public getGrid(): ClimateGrid {
        return this.grid;
    }

    /**
     * Get temperature simulator
     */
    public getTemperatureSimulator(): TemperatureSimulator {
        return this.tempSimulator;
    }

    /**
     * Get pressure/humidity simulator
     */
    public getPressureHumiditySimulator(): PressureHumiditySimulator {
        return this.pressureSimulator;
    }

    /**
     * Get wind simulator
     */
    public getWindSimulator(): WindSimulator {
        return this.windSimulator;
    }

    /**
     * Get event generator
     */
    public getEventGenerator(): WeatherEventGenerator {
        return this.eventGenerator;
    }

    /**
     * Reset simulation
     */
    public reset(): void {
        this.grid.reset();
        this.eventGenerator.clearEvents();
        this.simulationTime = 0;
        this.currentDate = new Date();
    }

    /**
     * Get simulation statistics
     */
    public getStatistics(): {
        globalAvgTemp: number;
        globalAvgPressure: number;
        globalAvgHumidity: number;
        globalAvgWindSpeed: number;
        activeEventCount: number;
        simulationTime: number;
    } {
        const tempStats = this.grid.getStatistics('temperature');
        const pressureStats = this.grid.getStatistics('pressure');
        const humidityStats = this.grid.getStatistics('humidity');
        const windStats = this.grid.getStatistics('windSpeed');

        return {
            globalAvgTemp: tempStats.mean,
            globalAvgPressure: pressureStats.mean,
            globalAvgHumidity: humidityStats.mean,
            globalAvgWindSpeed: windStats.mean,
            activeEventCount: this.eventGenerator.getActiveEvents().length,
            simulationTime: this.simulationTime
        };
    }

    /**
     * Export climate state
     */
    public exportState(): object {
        return {
            grid: this.grid.exportData(),
            date: this.currentDate.toISOString(),
            simulationTime: this.simulationTime,
            events: this.eventGenerator.getActiveEvents()
        };
    }

    /**
     * Import climate state
     */
    public importState(state: any): void {
        if (state.grid) {
            this.grid.importData(state.grid);
        }
        if (state.date) {
            this.currentDate = new Date(state.date);
        }
        if (state.simulationTime !== undefined) {
            this.simulationTime = state.simulationTime;
        }
        if (state.events) {
            this.eventGenerator.clearEvents();
            for (const event of state.events) {
                this.eventGenerator.createEvent(
                    event.type,
                    event.lonIdx,
                    event.latIdx,
                    event.intensity
                );
            }
        }
    }

    /**
     * Set ocean/land mask from heightmap
     */
    public setOceanMaskFromHeightmap(heightmap: Float32Array, seaLevel: number = 0): void {
        for (let latIdx = 0; latIdx < this.grid.height; latIdx++) {
            for (let lonIdx = 0; lonIdx < this.grid.width; lonIdx++) {
                const idx = latIdx * this.grid.width + lonIdx;
                const height = heightmap[idx];
                this.grid.setOcean(lonIdx, latIdx, height < seaLevel);
            }
        }
    }

    /**
     * Get historical weather data (simplified)
     */
    public getHistoricalData(lat: number, lon: number, days: number): WeatherData[] {
        // In production, would store and retrieve actual historical data
        // This is a placeholder that returns current conditions
        const data: WeatherData[] = [];
        const current = this.getWeatherAt(lat, lon);

        for (let i = 0; i < days; i++) {
            data.push({ ...current });
        }

        return data;
    }
}

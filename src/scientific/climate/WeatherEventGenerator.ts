/**
 * Weather Event Generator
 *
 * Generates and tracks weather events like storms, hurricanes,
 * precipitation, and drought conditions.
 *
 * @example
 * ```typescript
 * const generator = new WeatherEventGenerator(grid);
 * generator.update(deltaTime);
 * const events = generator.getActiveEvents();
 * ```
 */

import { ClimateGrid } from './ClimateGrid';
import { PressureHumiditySimulator } from './PressureHumiditySimulator';
import { WindSimulator } from './WindSimulator';

export type EventType = 'hurricane' | 'cyclone' | 'thunderstorm' | 'rain' | 'snow' | 'drought' | 'heatwave';

export interface WeatherEvent {
    id: string;
    type: EventType;
    lonIdx: number;
    latIdx: number;
    intensity: number; // 0-1
    radius: number; // grid cells
    age: number; // seconds
    lifetime: number; // seconds
    windSpeed: number; // m/s
    precipitation: number; // mm/h
}

/**
 * Weather event generator
 */
export class WeatherEventGenerator {
    private grid: ClimateGrid;
    private pressureSimulator: PressureHumiditySimulator;
    private windSimulator: WindSimulator;
    private events: Map<string, WeatherEvent> = new Map();
    private nextEventId: number = 0;

    constructor(
        grid: ClimateGrid,
        pressureSimulator: PressureHumiditySimulator,
        windSimulator: WindSimulator
    ) {
        this.grid = grid;
        this.pressureSimulator = pressureSimulator;
        this.windSimulator = windSimulator;
    }

    /**
     * Update all events
     */
    public update(deltaTime: number): void {
        // Update existing events
        for (const [id, event] of this.events) {
            event.age += deltaTime;

            if (event.age >= event.lifetime) {
                this.events.delete(id);
            } else {
                this.updateEvent(event, deltaTime);
            }
        }

        // Generate new events
        this.tryGenerateEvents(deltaTime);
    }

    /**
     * Update individual event
     */
    private updateEvent(event: WeatherEvent, deltaTime: number): void {
        // Move event based on wind
        const wind = this.windSimulator.getWindAt(
            this.grid.indexToLatitude(event.latIdx),
            this.grid.indexToLongitude(event.lonIdx)
        );

        // Movement (simplified)
        const moveSpeed = 0.5; // grid cells per second
        event.lonIdx = Math.round(event.lonIdx + wind.u * moveSpeed * deltaTime);
        event.latIdx = Math.round(event.latIdx + wind.v * moveSpeed * deltaTime);

        // Wrap/clamp coordinates
        event.lonIdx = ((event.lonIdx % this.grid.width) + this.grid.width) % this.grid.width;
        event.latIdx = Math.max(0, Math.min(this.grid.height - 1, event.latIdx));

        // Decay over lifetime
        const ageRatio = event.age / event.lifetime;
        event.intensity = Math.max(0, 1 - ageRatio);

        // Affect grid
        this.applyEventToGrid(event);
    }

    /**
     * Apply event effects to grid
     */
    private applyEventToGrid(event: WeatherEvent): void {
        const radiusSq = event.radius * event.radius;

        for (let dLat = -event.radius; dLat <= event.radius; dLat++) {
            for (let dLon = -event.radius; dLon <= event.radius; dLon++) {
                const distSq = dLon * dLon + dLat * dLat;
                if (distSq > radiusSq) continue;

                const lonIdx = event.lonIdx + dLon;
                const latIdx = event.latIdx + dLat;

                if (latIdx < 0 || latIdx >= this.grid.height) continue;

                const falloff = 1 - Math.sqrt(distSq) / event.radius;
                const strength = event.intensity * falloff;

                switch (event.type) {
                    case 'hurricane':
                    case 'cyclone':
                        this.applyStormEffects(lonIdx, latIdx, strength, event);
                        break;
                    case 'thunderstorm':
                        this.applyThunderstormEffects(lonIdx, latIdx, strength);
                        break;
                    case 'rain':
                    case 'snow':
                        this.applyPrecipitationEffects(lonIdx, latIdx, strength);
                        break;
                    case 'drought':
                        this.applyDroughtEffects(lonIdx, latIdx, strength);
                        break;
                    case 'heatwave':
                        this.applyHeatwaveEffects(lonIdx, latIdx, strength);
                        break;
                }
            }
        }
    }

    /**
     * Apply storm effects (hurricane/cyclone)
     */
    private applyStormEffects(lonIdx: number, latIdx: number, strength: number, event: WeatherEvent): void {
        // Low pressure center
        const currentPressure = this.grid.getPressure(lonIdx, latIdx);
        this.grid.setPressure(lonIdx, latIdx, currentPressure * (1 - 0.1 * strength));

        // High humidity
        this.grid.setHumidity(lonIdx, latIdx, Math.min(100, 80 + 20 * strength));

        // Circular wind pattern
        const dx = lonIdx - event.lonIdx;
        const dy = latIdx - event.latIdx;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.1) {
            const tangentU = -dy / dist;
            const tangentV = dx / dist;

            const windStrength = event.windSpeed * strength;
            this.grid.setWindU(lonIdx, latIdx, this.grid.getWindU(lonIdx, latIdx) + tangentU * windStrength);
            this.grid.setWindV(lonIdx, latIdx, this.grid.getWindV(lonIdx, latIdx) + tangentV * windStrength);
        }
    }

    /**
     * Apply thunderstorm effects
     */
    private applyThunderstormEffects(lonIdx: number, latIdx: number, strength: number): void {
        // High humidity and precipitation
        this.grid.setHumidity(lonIdx, latIdx, Math.min(100, 70 + 30 * strength));

        // Turbulent winds
        const turbulence = (Math.random() - 0.5) * 10 * strength;
        this.grid.setWindU(lonIdx, latIdx, this.grid.getWindU(lonIdx, latIdx) + turbulence);
        this.grid.setWindV(lonIdx, latIdx, this.grid.getWindV(lonIdx, latIdx) + turbulence);
    }

    /**
     * Apply precipitation effects
     */
    private applyPrecipitationEffects(lonIdx: number, latIdx: number, strength: number): void {
        // Increase humidity
        this.grid.setHumidity(lonIdx, latIdx, Math.min(100, 60 + 40 * strength));
    }

    /**
     * Apply drought effects
     */
    private applyDroughtEffects(lonIdx: number, latIdx: number, strength: number): void {
        // Decrease humidity
        this.grid.setHumidity(lonIdx, latIdx, Math.max(0, 40 - 30 * strength));
    }

    /**
     * Apply heatwave effects
     */
    private applyHeatwaveEffects(lonIdx: number, latIdx: number, strength: number): void {
        // Increase temperature
        const currentTemp = this.grid.getTemperature(lonIdx, latIdx);
        this.grid.setTemperature(lonIdx, latIdx, currentTemp + 10 * strength);
    }

    /**
     * Try to generate new events
     */
    private tryGenerateEvents(deltaTime: number): void {
        // Hurricane generation (over warm ocean)
        if (Math.random() < 0.0001 * deltaTime) {
            this.tryGenerateHurricane();
        }

        // Thunderstorm generation
        if (Math.random() < 0.001 * deltaTime) {
            this.tryGenerateThunderstorm();
        }

        // Rain/snow generation
        if (Math.random() < 0.005 * deltaTime) {
            this.tryGeneratePrecipitation();
        }
    }

    /**
     * Try to generate hurricane
     */
    private tryGenerateHurricane(): void {
        // Find warm ocean location
        for (let i = 0; i < 10; i++) {
            const lonIdx = Math.floor(Math.random() * this.grid.width);
            const latIdx = Math.floor(Math.random() * this.grid.height);
            const lat = this.grid.indexToLatitude(latIdx);

            // Requirements: ocean, warm water, 5-20° latitude
            if (this.grid.isOcean(lonIdx, latIdx) &&
                this.grid.getTemperature(lonIdx, latIdx) > 299 && // >26°C
                Math.abs(lat) > 5 && Math.abs(lat) < 20) {

                const event: WeatherEvent = {
                    id: this.generateEventId(),
                    type: lat > 0 ? 'hurricane' : 'cyclone',
                    lonIdx,
                    latIdx,
                    intensity: 0.8 + Math.random() * 0.2,
                    radius: 20 + Math.floor(Math.random() * 10),
                    age: 0,
                    lifetime: 86400 * 7, // 7 days
                    windSpeed: 30 + Math.random() * 20, // 30-50 m/s
                    precipitation: 50 + Math.random() * 50
                };

                this.events.set(event.id, event);
                break;
            }
        }
    }

    /**
     * Try to generate thunderstorm
     */
    private tryGenerateThunderstorm(): void {
        // Find high humidity, warm location
        for (let i = 0; i < 10; i++) {
            const lonIdx = Math.floor(Math.random() * this.grid.width);
            const latIdx = Math.floor(Math.random() * this.grid.height);

            if (this.grid.getHumidity(lonIdx, latIdx) > 70 &&
                this.grid.getTemperature(lonIdx, latIdx) > 283) { // >10°C

                const event: WeatherEvent = {
                    id: this.generateEventId(),
                    type: 'thunderstorm',
                    lonIdx,
                    latIdx,
                    intensity: 0.6 + Math.random() * 0.4,
                    radius: 5 + Math.floor(Math.random() * 5),
                    age: 0,
                    lifetime: 3600 * 3, // 3 hours
                    windSpeed: 10 + Math.random() * 10,
                    precipitation: 20 + Math.random() * 30
                };

                this.events.set(event.id, event);
                break;
            }
        }
    }

    /**
     * Try to generate precipitation
     */
    private tryGeneratePrecipitation(): void {
        const lonIdx = Math.floor(Math.random() * this.grid.width);
        const latIdx = Math.floor(Math.random() * this.grid.height);

        if (this.pressureSimulator.isCloudFormation(lonIdx, latIdx)) {
            const temp = this.grid.getTemperature(lonIdx, latIdx);
            const type = temp < 273 ? 'snow' : 'rain';

            const event: WeatherEvent = {
                id: this.generateEventId(),
                type,
                lonIdx,
                latIdx,
                intensity: 0.3 + Math.random() * 0.5,
                radius: 10 + Math.floor(Math.random() * 10),
                age: 0,
                lifetime: 3600 * 6, // 6 hours
                windSpeed: 5,
                precipitation: 5 + Math.random() * 15
            };

            this.events.set(event.id, event);
        }
    }

    /**
     * Generate unique event ID
     */
    private generateEventId(): string {
        return `event_${this.nextEventId++}`;
    }

    /**
     * Get all active events
     */
    public getActiveEvents(): WeatherEvent[] {
        return Array.from(this.events.values());
    }

    /**
     * Get events at location
     */
    public getEventsAt(lonIdx: number, latIdx: number, radius: number = 0): WeatherEvent[] {
        const events: WeatherEvent[] = [];

        for (const event of this.events.values()) {
            const dx = lonIdx - event.lonIdx;
            const dy = latIdx - event.latIdx;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= event.radius + radius) {
                events.push(event);
            }
        }

        return events;
    }

    /**
     * Clear all events
     */
    public clearEvents(): void {
        this.events.clear();
    }

    /**
     * Force generate event at location
     */
    public createEvent(
        type: EventType,
        lonIdx: number,
        latIdx: number,
        intensity: number = 0.8
    ): string {
        const event: WeatherEvent = {
            id: this.generateEventId(),
            type,
            lonIdx,
            latIdx,
            intensity,
            radius: type === 'hurricane' || type === 'cyclone' ? 25 : 10,
            age: 0,
            lifetime: type === 'hurricane' || type === 'cyclone' ? 86400 * 7 : 3600 * 6,
            windSpeed: type === 'hurricane' || type === 'cyclone' ? 40 : 15,
            precipitation: type === 'drought' ? 0 : 20
        };

        this.events.set(event.id, event);
        return event.id;
    }

    /**
     * Remove event by ID
     */
    public removeEvent(id: string): boolean {
        return this.events.delete(id);
    }
}

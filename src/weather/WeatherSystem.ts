/**
 * Main weather system manager
 * Coordinates all weather subsystems and state management
 * @module Weather
 */

import { Vector3 } from '../math/Vector3';
import { WeatherState, WeatherType } from './WeatherState';
import { WeatherTransition, Easing } from './WeatherTransition';
import { WeatherPresets } from './WeatherPresets';
import { RainSystem } from './RainSystem';
import { SnowSystem } from './SnowSystem';
import { WetnessSystem } from './WetnessSystem';
import { LightningSystem } from './LightningSystem';
import { WindSystem } from './WindSystem';
import { FogSystem } from './FogSystem';
import { TimeOfDay } from './TimeOfDay';
import { CloudSystem, CloudType } from './CloudSystem';
import { Logger } from '../core/Logger';

/**
 * Weather system configuration
 */
export interface WeatherSystemConfig {
    /** Initial weather type */
    initialWeather?: WeatherType;

    /** Initial time of day in hours */
    initialTime?: number;

    /** Enable automatic weather transitions */
    autoTransitions?: boolean;

    /** Day duration in seconds */
    dayDuration?: number;

    /** Latitude for sun positioning */
    latitude?: number;
}

/**
 * Main weather system coordinating all subsystems
 */
export class WeatherSystem {
    /** Current weather state */
    private currentState: WeatherState;

    /** Weather transition manager */
    private transition: WeatherTransition;

    /** Rain system */
    private rainSystem: RainSystem;

    /** Snow system */
    private snowSystem: SnowSystem;

    /** Wetness system */
    private wetnessSystem: WetnessSystem;

    /** Lightning system */
    private lightningSystem: LightningSystem;

    /** Wind system */
    private windSystem: WindSystem;

    /** Fog system */
    private fogSystem: FogSystem;

    /** Time of day system */
    private timeOfDay: TimeOfDay;

    /** Cloud system */
    private cloudSystem: CloudSystem;

    /** Logger instance */
    private logger: Logger;

    /** Automatic transitions enabled */
    private autoTransitions: boolean;

    /** Time until next auto transition */
    private nextTransitionTime: number;

    /** Camera position */
    private cameraPosition: Vector3;

    /**
     * Creates a new weather system
     * @param config - Weather system configuration
     */
    constructor(config?: WeatherSystemConfig) {
        this.logger = new Logger('WeatherSystem');

        const initialWeatherType = config?.initialWeather ?? WeatherType.CLEAR;
        const initialWeatherConfig = WeatherPresets.getPreset(initialWeatherType);
        this.currentState = new WeatherState(initialWeatherConfig);

        this.transition = new WeatherTransition(this.currentState);
        this.rainSystem = new RainSystem();
        this.snowSystem = new SnowSystem();
        this.wetnessSystem = new WetnessSystem();
        this.lightningSystem = new LightningSystem();
        this.windSystem = new WindSystem();
        this.fogSystem = new FogSystem();
        this.timeOfDay = new TimeOfDay({
            currentTime: config?.initialTime ?? 12.0,
            dayDuration: config?.dayDuration ?? 1200.0,
            latitude: config?.latitude ?? 45.0
        });
        this.cloudSystem = new CloudSystem();

        this.autoTransitions = config?.autoTransitions ?? false;
        this.nextTransitionTime = this.getRandomTransitionInterval();
        this.cameraPosition = new Vector3(0, 0, 0);

        this.applyWeatherState(this.currentState);

        this.logger.info('Weather system initialized', {
            initialWeather: initialWeatherType,
            autoTransitions: this.autoTransitions
        });
    }

    /**
     * Updates the weather system
     * @param deltaTime - Time elapsed in seconds
     */
    public update(deltaTime: number): void {
        // Update transition
        this.currentState = this.transition.update(deltaTime);

        // Update time of day
        this.timeOfDay.update(deltaTime);

        // Apply current weather state to subsystems
        this.applyWeatherState(this.currentState);

        // Update all subsystems
        this.windSystem.update(deltaTime);

        const windAtCamera = this.windSystem.getWindAtPosition(this.cameraPosition);
        this.rainSystem.setWind(windAtCamera);
        this.rainSystem.update(deltaTime);

        this.snowSystem.setWind(windAtCamera);
        this.snowSystem.update(deltaTime);

        const sunData = this.timeOfDay.getSunData();
        this.wetnessSystem.setEnvironment(
            20.0,
            this.currentState.config.fogDensity * 0.8,
            windAtCamera.length(),
            sunData.intensity
        );
        this.wetnessSystem.update(deltaTime, this.currentState.config.rainIntensity);

        // Drain puddles when not raining
        if (this.currentState.config.rainIntensity === 0) {
            this.rainSystem.drainPuddles(deltaTime, 1.0);
        }

        // Melt snow when temperature is above freezing
        if (this.currentState.config.snowIntensity === 0) {
            this.snowSystem.meltSnow(deltaTime, 0.5);
        }

        this.lightningSystem.update(deltaTime);
        this.fogSystem.update(deltaTime);
        this.cloudSystem.update(deltaTime);

        // Handle automatic weather transitions
        if (this.autoTransitions && !this.transition.isActive()) {
            this.nextTransitionTime -= deltaTime;
            if (this.nextTransitionTime <= 0) {
                this.transitionToRandomWeather();
                this.nextTransitionTime = this.getRandomTransitionInterval();
            }
        }
    }

    /**
     * Applies weather state to all subsystems
     * @param state - Weather state to apply
     */
    private applyWeatherState(state: WeatherState): void {
        const config = state.config;

        // Update wind
        this.windSystem.setBaseWind(
            config.windDirection,
            config.windSpeed,
            config.windGustiness,
            0.2
        );

        // Update rain
        this.rainSystem.setIntensity(config.rainIntensity);

        // Update snow
        this.snowSystem.setIntensity(config.snowIntensity);

        // Update lightning
        this.lightningSystem.setFrequency(config.lightningFrequency);

        // Update fog
        this.fogSystem.setBaseFog(
            config.fogDensity,
            config.fogColor,
            10.0,
            config.visibility
        );

        // Update clouds
        this.cloudSystem.setGlobalCoverage(config.cloudCoverage);
        this.cloudSystem.setGlobalDensity(config.cloudDensity);
        this.cloudSystem.setGlobalOpacity(config.cloudOpacity);
    }

    /**
     * Transitions to a new weather state
     * @param weatherType - Target weather type
     * @param duration - Transition duration in seconds
     */
    public transitionTo(weatherType: WeatherType, duration: number = 10.0): void {
        const config = WeatherPresets.getPreset(weatherType);
        const targetState = new WeatherState(config);

        this.transition.startTransition(targetState, duration, Easing.smootherStep);

        this.logger.info(`Transitioning to ${weatherType}`, {
            duration,
            from: this.currentState.config.type
        });
    }

    /**
     * Transitions to a random weather state
     */
    private transitionToRandomWeather(): void {
        const weatherTypes = Object.values(WeatherType);
        const currentType = this.currentState.config.type;

        // Filter out current weather
        const availableTypes = weatherTypes.filter(type => type !== currentType);

        const randomType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        const duration = 15.0 + Math.random() * 20.0;

        this.transitionTo(randomType, duration);
    }

    /**
     * Gets random transition interval
     */
    private getRandomTransitionInterval(): number {
        return 300.0 + Math.random() * 600.0;
    }

    /**
     * Sets weather immediately without transition
     * @param weatherType - Weather type to set
     */
    public setWeatherImmediate(weatherType: WeatherType): void {
        const config = WeatherPresets.getPreset(weatherType);
        const state = new WeatherState(config);

        this.transition.setImmediate(state);
        this.currentState = state;

        this.logger.info(`Set weather immediately to ${weatherType}`);
    }

    /**
     * Sets camera position for particle systems
     * @param position - Camera position
     */
    public setCameraPosition(position: Vector3): void {
        this.cameraPosition = position.clone();
        this.rainSystem.setCameraPosition(position);
        this.snowSystem.setCameraPosition(position);
        this.lightningSystem.setCameraPosition(position);
        this.cloudSystem.setCameraPosition(position);
    }

    /**
     * Gets current weather type
     */
    public getCurrentWeatherType(): WeatherType {
        return this.currentState.config.type;
    }

    /**
     * Gets current weather state
     */
    public getCurrentState(): WeatherState {
        return this.currentState;
    }

    /**
     * Gets rain system
     */
    public getRainSystem(): RainSystem {
        return this.rainSystem;
    }

    /**
     * Gets snow system
     */
    public getSnowSystem(): SnowSystem {
        return this.snowSystem;
    }

    /**
     * Gets wetness system
     */
    public getWetnessSystem(): WetnessSystem {
        return this.wetnessSystem;
    }

    /**
     * Gets lightning system
     */
    public getLightningSystem(): LightningSystem {
        return this.lightningSystem;
    }

    /**
     * Gets wind system
     */
    public getWindSystem(): WindSystem {
        return this.windSystem;
    }

    /**
     * Gets fog system
     */
    public getFogSystem(): FogSystem {
        return this.fogSystem;
    }

    /**
     * Gets time of day system
     */
    public getTimeOfDay(): TimeOfDay {
        return this.timeOfDay;
    }

    /**
     * Gets cloud system
     */
    public getCloudSystem(): CloudSystem {
        return this.cloudSystem;
    }

    /**
     * Checks if weather transition is active
     */
    public isTransitioning(): boolean {
        return this.transition.isActive();
    }

    /**
     * Gets transition progress [0-1]
     */
    public getTransitionProgress(): number {
        return this.transition.getProgress();
    }

    /**
     * Enables or disables automatic weather transitions
     * @param enabled - Enable auto transitions
     */
    public setAutoTransitions(enabled: boolean): void {
        this.autoTransitions = enabled;
        if (enabled) {
            this.nextTransitionTime = this.getRandomTransitionInterval();
        }
    }

    /**
     * Clears all weather effects
     */
    public clearAllEffects(): void {
        this.rainSystem.clear();
        this.rainSystem.clearPuddles();
        this.snowSystem.clear();
        this.snowSystem.clearAccumulation();
        this.wetnessSystem.clear();
        this.lightningSystem.clear();
        this.windSystem.clearWindZones();
        this.fogSystem.clearFogVolumes();

        this.logger.info('Cleared all weather effects');
    }
}

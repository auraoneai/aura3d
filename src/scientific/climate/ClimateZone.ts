/**
 * Climate Zone Classification
 *
 * Köppen climate classification system with zone properties.
 * Maps climate zones to temperature, precipitation, and biome characteristics.
 *
 * @example
 * ```typescript
 * const zone = ClimateZone.classify(25, 1500, 15, 35);
 * console.log(zone.name); // "Tropical Rainforest"
 * console.log(zone.biome); // "Rainforest"
 * ```
 */

export type KoppenClimate =
    | 'Af' | 'Am' | 'Aw' // Tropical
    | 'BWh' | 'BWk' | 'BSh' | 'BSk' // Dry
    | 'Cfa' | 'Cfb' | 'Cfc' | 'Csa' | 'Csb' | 'Csc' | 'Cwa' | 'Cwb' | 'Cwc' // Temperate
    | 'Dfa' | 'Dfb' | 'Dfc' | 'Dfd' | 'Dsa' | 'Dsb' | 'Dsc' | 'Dsd' | 'Dwa' | 'Dwb' | 'Dwc' | 'Dwd' // Continental
    | 'ET' | 'EF'; // Polar

export interface ClimateZoneProperties {
    code: KoppenClimate;
    name: string;
    description: string;
    tempRange: { min: number; max: number }; // °C
    precipRange: { min: number; max: number }; // mm/year
    humidity: { min: number; max: number }; // %
    biome: string;
    vegetation: string;
    color: [number, number, number]; // RGB for visualization
}

/**
 * Climate zone classification and properties
 */
export class ClimateZone {
    /**
     * Köppen climate zone database
     */
    private static readonly zones: { [key in KoppenClimate]: ClimateZoneProperties } = {
        // Tropical
        'Af': {
            code: 'Af',
            name: 'Tropical Rainforest',
            description: 'All months have average precipitation ≥ 60mm',
            tempRange: { min: 18, max: 35 },
            precipRange: { min: 2000, max: 4000 },
            humidity: { min: 70, max: 95 },
            biome: 'Rainforest',
            vegetation: 'Dense tropical rainforest',
            color: [0, 100, 0]
        },
        'Am': {
            code: 'Am',
            name: 'Tropical Monsoon',
            description: 'Driest month < 60mm but ≥ (100 - total annual precip/25)',
            tempRange: { min: 18, max: 35 },
            precipRange: { min: 1500, max: 3000 },
            humidity: { min: 60, max: 90 },
            biome: 'Monsoon Forest',
            vegetation: 'Tropical monsoon forest',
            color: [34, 139, 34]
        },
        'Aw': {
            code: 'Aw',
            name: 'Tropical Savanna',
            description: 'Driest month < 60mm and < (100 - total annual precip/25)',
            tempRange: { min: 18, max: 35 },
            precipRange: { min: 750, max: 1500 },
            humidity: { min: 40, max: 70 },
            biome: 'Savanna',
            vegetation: 'Grassland with scattered trees',
            color: [154, 205, 50]
        },

        // Dry
        'BWh': {
            code: 'BWh',
            name: 'Hot Desert',
            description: 'Mean annual temp ≥ 18°C',
            tempRange: { min: 18, max: 45 },
            precipRange: { min: 0, max: 250 },
            humidity: { min: 10, max: 30 },
            biome: 'Desert',
            vegetation: 'Sparse desert vegetation',
            color: [238, 232, 170]
        },
        'BWk': {
            code: 'BWk',
            name: 'Cold Desert',
            description: 'Mean annual temp < 18°C',
            tempRange: { min: -10, max: 18 },
            precipRange: { min: 0, max: 250 },
            humidity: { min: 10, max: 30 },
            biome: 'Cold Desert',
            vegetation: 'Sparse cold desert vegetation',
            color: [210, 180, 140]
        },
        'BSh': {
            code: 'BSh',
            name: 'Hot Semi-Arid',
            description: 'Mean annual temp ≥ 18°C',
            tempRange: { min: 15, max: 40 },
            precipRange: { min: 250, max: 500 },
            humidity: { min: 20, max: 40 },
            biome: 'Steppe',
            vegetation: 'Grassland and shrubs',
            color: [244, 164, 96]
        },
        'BSk': {
            code: 'BSk',
            name: 'Cold Semi-Arid',
            description: 'Mean annual temp < 18°C',
            tempRange: { min: -5, max: 18 },
            precipRange: { min: 250, max: 500 },
            humidity: { min: 20, max: 40 },
            biome: 'Cold Steppe',
            vegetation: 'Cold grassland',
            color: [222, 184, 135]
        },

        // Temperate
        'Cfa': {
            code: 'Cfa',
            name: 'Humid Subtropical',
            description: 'Coldest month 0-18°C, hot summer',
            tempRange: { min: 0, max: 35 },
            precipRange: { min: 800, max: 2000 },
            humidity: { min: 50, max: 80 },
            biome: 'Subtropical Forest',
            vegetation: 'Mixed broadleaf forest',
            color: [50, 205, 50]
        },
        'Cfb': {
            code: 'Cfb',
            name: 'Oceanic',
            description: 'Coldest month 0-18°C, warm summer',
            tempRange: { min: 0, max: 25 },
            precipRange: { min: 700, max: 1500 },
            humidity: { min: 60, max: 85 },
            biome: 'Temperate Forest',
            vegetation: 'Temperate broadleaf forest',
            color: [60, 179, 113]
        },
        'Cfc': {
            code: 'Cfc',
            name: 'Subpolar Oceanic',
            description: 'Coldest month 0-18°C, cool summer',
            tempRange: { min: -5, max: 15 },
            precipRange: { min: 500, max: 1200 },
            humidity: { min: 65, max: 90 },
            biome: 'Subpolar Forest',
            vegetation: 'Coniferous forest',
            color: [46, 139, 87]
        },
        'Csa': {
            code: 'Csa',
            name: 'Hot Mediterranean',
            description: 'Dry summer, hot',
            tempRange: { min: 5, max: 35 },
            precipRange: { min: 400, max: 900 },
            humidity: { min: 40, max: 70 },
            biome: 'Mediterranean Shrubland',
            vegetation: 'Chaparral and scrubland',
            color: [189, 183, 107]
        },
        'Csb': {
            code: 'Csb',
            name: 'Warm Mediterranean',
            description: 'Dry summer, warm',
            tempRange: { min: 3, max: 28 },
            precipRange: { min: 400, max: 900 },
            humidity: { min: 45, max: 75 },
            biome: 'Mediterranean Woodland',
            vegetation: 'Mediterranean woodland',
            color: [173, 255, 47]
        },
        'Csc': {
            code: 'Csc',
            name: 'Cool Mediterranean',
            description: 'Dry summer, cool',
            tempRange: { min: 0, max: 22 },
            precipRange: { min: 350, max: 800 },
            humidity: { min: 50, max: 80 },
            biome: 'Mediterranean Highland',
            vegetation: 'Highland shrubland',
            color: [107, 142, 35]
        },
        'Cwa': {
            code: 'Cwa',
            name: 'Humid Subtropical (Dry Winter)',
            description: 'Dry winter, hot summer',
            tempRange: { min: 0, max: 35 },
            precipRange: { min: 600, max: 1500 },
            humidity: { min: 45, max: 75 },
            biome: 'Subtropical Woodland',
            vegetation: 'Mixed woodland',
            color: [124, 252, 0]
        },
        'Cwb': {
            code: 'Cwb',
            name: 'Subtropical Highland',
            description: 'Dry winter, warm summer',
            tempRange: { min: -2, max: 25 },
            precipRange: { min: 500, max: 1200 },
            humidity: { min: 50, max: 80 },
            biome: 'Subtropical Highland',
            vegetation: 'Highland forest',
            color: [85, 107, 47]
        },
        'Cwc': {
            code: 'Cwc',
            name: 'Cold Subtropical Highland',
            description: 'Dry winter, cool summer',
            tempRange: { min: -5, max: 20 },
            precipRange: { min: 400, max: 1000 },
            humidity: { min: 55, max: 85 },
            biome: 'Cold Highland',
            vegetation: 'Alpine vegetation',
            color: [128, 128, 0]
        },

        // Continental
        'Dfa': {
            code: 'Dfa',
            name: 'Hot Continental',
            description: 'Coldest month < 0°C, hot summer',
            tempRange: { min: -20, max: 30 },
            precipRange: { min: 500, max: 1200 },
            humidity: { min: 50, max: 75 },
            biome: 'Continental Forest',
            vegetation: 'Mixed deciduous forest',
            color: [34, 139, 34]
        },
        'Dfb': {
            code: 'Dfb',
            name: 'Warm Continental',
            description: 'Coldest month < 0°C, warm summer',
            tempRange: { min: -25, max: 25 },
            precipRange: { min: 450, max: 1000 },
            humidity: { min: 55, max: 80 },
            biome: 'Boreal Forest',
            vegetation: 'Coniferous and mixed forest',
            color: [0, 100, 0]
        },
        'Dfc': {
            code: 'Dfc',
            name: 'Subarctic',
            description: 'Coldest month < 0°C, cool summer',
            tempRange: { min: -40, max: 18 },
            precipRange: { min: 300, max: 700 },
            humidity: { min: 60, max: 85 },
            biome: 'Taiga',
            vegetation: 'Boreal coniferous forest',
            color: [0, 128, 0]
        },
        'Dfd': {
            code: 'Dfd',
            name: 'Severe Subarctic',
            description: 'Extremely cold winter',
            tempRange: { min: -50, max: 15 },
            precipRange: { min: 200, max: 500 },
            humidity: { min: 60, max: 90 },
            biome: 'Extreme Taiga',
            vegetation: 'Sparse coniferous forest',
            color: [0, 100, 0]
        },
        'Dsa': {
            code: 'Dsa',
            name: 'Hot Continental (Dry Summer)',
            description: 'Dry summer, hot',
            tempRange: { min: -15, max: 32 },
            precipRange: { min: 400, max: 900 },
            humidity: { min: 40, max: 70 },
            biome: 'Continental Woodland',
            vegetation: 'Open woodland',
            color: [154, 205, 50]
        },
        'Dsb': {
            code: 'Dsb',
            name: 'Warm Continental (Dry Summer)',
            description: 'Dry summer, warm',
            tempRange: { min: -20, max: 25 },
            precipRange: { min: 350, max: 800 },
            humidity: { min: 45, max: 75 },
            biome: 'Continental Steppe',
            vegetation: 'Grassland and shrubs',
            color: [189, 183, 107]
        },
        'Dsc': {
            code: 'Dsc',
            name: 'Subarctic (Dry Summer)',
            description: 'Dry summer, cool',
            tempRange: { min: -35, max: 18 },
            precipRange: { min: 250, max: 600 },
            humidity: { min: 50, max: 80 },
            biome: 'Dry Taiga',
            vegetation: 'Sparse taiga',
            color: [143, 188, 143]
        },
        'Dsd': {
            code: 'Dsd',
            name: 'Severe Subarctic (Dry Summer)',
            description: 'Dry summer, extremely cold winter',
            tempRange: { min: -45, max: 15 },
            precipRange: { min: 200, max: 500 },
            humidity: { min: 50, max: 85 },
            biome: 'Extreme Dry Taiga',
            vegetation: 'Very sparse taiga',
            color: [107, 142, 35]
        },
        'Dwa': {
            code: 'Dwa',
            name: 'Hot Continental (Dry Winter)',
            description: 'Dry winter, hot summer',
            tempRange: { min: -25, max: 30 },
            precipRange: { min: 400, max: 1000 },
            humidity: { min: 40, max: 70 },
            biome: 'Continental Monsoon',
            vegetation: 'Deciduous forest',
            color: [124, 252, 0]
        },
        'Dwb': {
            code: 'Dwb',
            name: 'Warm Continental (Dry Winter)',
            description: 'Dry winter, warm summer',
            tempRange: { min: -30, max: 25 },
            precipRange: { min: 350, max: 800 },
            humidity: { min: 45, max: 75 },
            biome: 'Continental Mixed Forest',
            vegetation: 'Mixed forest',
            color: [144, 238, 144]
        },
        'Dwc': {
            code: 'Dwc',
            name: 'Subarctic (Dry Winter)',
            description: 'Dry winter, cool summer',
            tempRange: { min: -40, max: 18 },
            precipRange: { min: 250, max: 600 },
            humidity: { min: 50, max: 80 },
            biome: 'Siberian Taiga',
            vegetation: 'Larch forest',
            color: [60, 179, 113]
        },
        'Dwd': {
            code: 'Dwd',
            name: 'Severe Subarctic (Dry Winter)',
            description: 'Dry winter, extremely cold',
            tempRange: { min: -55, max: 15 },
            precipRange: { min: 150, max: 400 },
            humidity: { min: 50, max: 85 },
            biome: 'Extreme Siberian Taiga',
            vegetation: 'Sparse larch forest',
            color: [46, 139, 87]
        },

        // Polar
        'ET': {
            code: 'ET',
            name: 'Tundra',
            description: 'Warmest month 0-10°C',
            tempRange: { min: -40, max: 10 },
            precipRange: { min: 100, max: 400 },
            humidity: { min: 60, max: 90 },
            biome: 'Tundra',
            vegetation: 'Mosses, lichens, dwarf shrubs',
            color: [176, 224, 230]
        },
        'EF': {
            code: 'EF',
            name: 'Ice Cap',
            description: 'All months below 0°C',
            tempRange: { min: -60, max: 0 },
            precipRange: { min: 50, max: 200 },
            humidity: { min: 70, max: 95 },
            biome: 'Ice',
            vegetation: 'No vegetation',
            color: [240, 248, 255]
        }
    };

    /**
     * Classify climate based on temperature and precipitation
     */
    public static classify(
        avgTemp: number,
        annualPrecip: number,
        minTemp: number,
        maxTemp: number,
        latitude?: number
    ): ClimateZoneProperties {
        // Simplified Köppen classification
        // In production, would use more detailed criteria

        // Ice Cap
        if (maxTemp < 0) {
            return this.zones.EF;
        }

        // Tundra
        if (maxTemp < 10) {
            return this.zones.ET;
        }

        // Tropical
        if (minTemp >= 18) {
            if (annualPrecip >= 2000) {
                return this.zones.Af;
            } else if (annualPrecip >= 1500) {
                return this.zones.Am;
            } else {
                return this.zones.Aw;
            }
        }

        // Dry
        const threshold = annualPrecip < 500 ? 250 : 500;
        if (annualPrecip < threshold) {
            if (annualPrecip < 250) {
                return avgTemp >= 18 ? this.zones.BWh : this.zones.BWk;
            } else {
                return avgTemp >= 18 ? this.zones.BSh : this.zones.BSk;
            }
        }

        // Continental (coldest month < 0)
        if (minTemp < 0) {
            if (maxTemp > 22) {
                return this.zones.Dfa;
            } else if (maxTemp > 10) {
                return this.zones.Dfb;
            } else {
                return this.zones.Dfc;
            }
        }

        // Temperate (default)
        if (maxTemp > 22) {
            return this.zones.Cfa;
        } else {
            return this.zones.Cfb;
        }
    }

    /**
     * Get zone by Köppen code
     */
    public static getZone(code: KoppenClimate): ClimateZoneProperties {
        return this.zones[code];
    }

    /**
     * Get all zone codes
     */
    public static getAllCodes(): KoppenClimate[] {
        return Object.keys(this.zones) as KoppenClimate[];
    }

    /**
     * Get zones by category
     */
    public static getZonesByCategory(category: 'tropical' | 'dry' | 'temperate' | 'continental' | 'polar'): ClimateZoneProperties[] {
        const codes = this.getAllCodes();
        const prefix = category === 'tropical' ? 'A' :
                       category === 'dry' ? 'B' :
                       category === 'temperate' ? 'C' :
                       category === 'continental' ? 'D' : 'E';

        return codes
            .filter(code => code.startsWith(prefix))
            .map(code => this.zones[code]);
    }
}

/**
 * Climate Grid
 *
 * Global 360x180 climate grid (1° resolution) storing temperature,
 * pressure, humidity, and wind data. Optimized for real-time simulation @ 60 FPS.
 *
 * @example
 * ```typescript
 * const grid = new ClimateGrid();
 * grid.setTemperature(180, 90, 288.15); // Set temperature at equator
 * const temp = grid.getTemperature(40, -74); // Get temp at lat/lon
 * ```
 */

export interface GridCell {
    temperature: number; // Kelvin
    pressure: number; // Pa
    humidity: number; // %
    windU: number; // m/s (eastward)
    windV: number; // m/s (northward)
    isOcean: boolean;
}

/**
 * Global climate grid
 */
export class ClimateGrid {
    public readonly width: number = 360; // Longitude cells
    public readonly height: number = 180; // Latitude cells

    // Separate arrays for better cache performance
    private temperature: Float32Array; // Kelvin
    private pressure: Float32Array; // Pa
    private humidity: Float32Array; // %
    private windU: Float32Array; // m/s
    private windV: Float32Array; // m/s
    private oceanMask: Uint8Array; // 0 = land, 1 = ocean

    constructor() {
        const size = this.width * this.height;

        this.temperature = new Float32Array(size);
        this.pressure = new Float32Array(size);
        this.humidity = new Float32Array(size);
        this.windU = new Float32Array(size);
        this.windV = new Float32Array(size);
        this.oceanMask = new Uint8Array(size);

        this.initializeDefaults();
    }

    /**
     * Initialize with default Earth-like values
     */
    private initializeDefaults(): void {
        for (let lat = 0; lat < this.height; lat++) {
            for (let lon = 0; lon < this.width; lon++) {
                const idx = this.getIndex(lon, lat);

                // Temperature: decreases with latitude
                const latDeg = this.indexToLatitude(lat);
                const baseTemp = 288.15 - Math.abs(latDeg) * 0.5; // ~15°C at equator
                this.temperature[idx] = baseTemp;

                // Pressure: standard sea level
                this.pressure[idx] = 101325; // Pa

                // Humidity: higher near equator
                this.humidity[idx] = 50 + 30 * Math.cos(latDeg * Math.PI / 180);

                // Wind: zero initial
                this.windU[idx] = 0;
                this.windV[idx] = 0;

                // Ocean mask: simplified (70% ocean)
                this.oceanMask[idx] = Math.random() < 0.7 ? 1 : 0;
            }
        }
    }

    /**
     * Get linear index from lon/lat indices
     */
    private getIndex(lonIdx: number, latIdx: number): number {
        // Wrap longitude
        lonIdx = ((lonIdx % this.width) + this.width) % this.width;

        // Clamp latitude
        latIdx = Math.max(0, Math.min(this.height - 1, latIdx));

        return latIdx * this.width + lonIdx;
    }

    /**
     * Convert longitude to grid index
     */
    public longitudeToIndex(lon: number): number {
        // lon: -180 to 180
        return Math.floor(((lon + 180) % 360) * this.width / 360);
    }

    /**
     * Convert latitude to grid index
     */
    public latitudeToIndex(lat: number): number {
        // lat: -90 to 90
        return Math.floor((90 - lat) * this.height / 180);
    }

    /**
     * Convert grid index to longitude
     */
    public indexToLongitude(lonIdx: number): number {
        return lonIdx * 360 / this.width - 180;
    }

    /**
     * Convert grid index to latitude
     */
    public indexToLatitude(latIdx: number): number {
        return 90 - latIdx * 180 / this.height;
    }

    /**
     * Get temperature at grid cell
     */
    public getTemperature(lonIdx: number, latIdx: number): number {
        return this.temperature[this.getIndex(lonIdx, latIdx)];
    }

    /**
     * Set temperature at grid cell
     */
    public setTemperature(lonIdx: number, latIdx: number, value: number): void {
        this.temperature[this.getIndex(lonIdx, latIdx)] = value;
    }

    /**
     * Get temperature at lat/lon coordinates (with interpolation)
     */
    public getTemperatureAt(lat: number, lon: number): number {
        const lonIdx = this.longitudeToIndex(lon);
        const latIdx = this.latitudeToIndex(lat);

        // Bilinear interpolation
        const lon0 = lonIdx;
        const lon1 = (lonIdx + 1) % this.width;
        const lat0 = Math.min(latIdx, this.height - 1);
        const lat1 = Math.min(latIdx + 1, this.height - 1);

        const tx = ((lon + 180) % 360) * this.width / 360 - lon0;
        const ty = (90 - lat) * this.height / 180 - lat0;

        const t00 = this.temperature[this.getIndex(lon0, lat0)];
        const t10 = this.temperature[this.getIndex(lon1, lat0)];
        const t01 = this.temperature[this.getIndex(lon0, lat1)];
        const t11 = this.temperature[this.getIndex(lon1, lat1)];

        return (1 - tx) * (1 - ty) * t00 +
               tx * (1 - ty) * t10 +
               (1 - tx) * ty * t01 +
               tx * ty * t11;
    }

    /**
     * Get pressure at grid cell
     */
    public getPressure(lonIdx: number, latIdx: number): number {
        return this.pressure[this.getIndex(lonIdx, latIdx)];
    }

    /**
     * Set pressure at grid cell
     */
    public setPressure(lonIdx: number, latIdx: number, value: number): void {
        this.pressure[this.getIndex(lonIdx, latIdx)] = value;
    }

    /**
     * Get humidity at grid cell
     */
    public getHumidity(lonIdx: number, latIdx: number): number {
        return this.humidity[this.getIndex(lonIdx, latIdx)];
    }

    /**
     * Set humidity at grid cell
     */
    public setHumidity(lonIdx: number, latIdx: number, value: number): void {
        this.humidity[this.getIndex(lonIdx, latIdx)] = value;
    }

    /**
     * Get wind U component at grid cell
     */
    public getWindU(lonIdx: number, latIdx: number): number {
        return this.windU[this.getIndex(lonIdx, latIdx)];
    }

    /**
     * Set wind U component at grid cell
     */
    public setWindU(lonIdx: number, latIdx: number, value: number): void {
        this.windU[this.getIndex(lonIdx, latIdx)] = value;
    }

    /**
     * Get wind V component at grid cell
     */
    public getWindV(lonIdx: number, latIdx: number): number {
        return this.windV[this.getIndex(lonIdx, latIdx)];
    }

    /**
     * Set wind V component at grid cell
     */
    public setWindV(lonIdx: number, latIdx: number, value: number): void {
        this.windV[this.getIndex(lonIdx, latIdx)] = value;
    }

    /**
     * Get wind magnitude
     */
    public getWindSpeed(lonIdx: number, latIdx: number): number {
        const u = this.getWindU(lonIdx, latIdx);
        const v = this.getWindV(lonIdx, latIdx);
        return Math.sqrt(u * u + v * v);
    }

    /**
     * Get wind direction (degrees, 0 = north)
     */
    public getWindDirection(lonIdx: number, latIdx: number): number {
        const u = this.getWindU(lonIdx, latIdx);
        const v = this.getWindV(lonIdx, latIdx);
        return (Math.atan2(u, v) * 180 / Math.PI + 360) % 360;
    }

    /**
     * Check if cell is ocean
     */
    public isOcean(lonIdx: number, latIdx: number): boolean {
        return this.oceanMask[this.getIndex(lonIdx, latIdx)] === 1;
    }

    /**
     * Set ocean mask
     */
    public setOcean(lonIdx: number, latIdx: number, isOcean: boolean): void {
        this.oceanMask[this.getIndex(lonIdx, latIdx)] = isOcean ? 1 : 0;
    }

    /**
     * Get all data at grid cell
     */
    public getCell(lonIdx: number, latIdx: number): GridCell {
        const idx = this.getIndex(lonIdx, latIdx);

        return {
            temperature: this.temperature[idx],
            pressure: this.pressure[idx],
            humidity: this.humidity[idx],
            windU: this.windU[idx],
            windV: this.windV[idx],
            isOcean: this.oceanMask[idx] === 1
        };
    }

    /**
     * Set all data at grid cell
     */
    public setCell(lonIdx: number, latIdx: number, cell: Partial<GridCell>): void {
        const idx = this.getIndex(lonIdx, latIdx);

        if (cell.temperature !== undefined) this.temperature[idx] = cell.temperature;
        if (cell.pressure !== undefined) this.pressure[idx] = cell.pressure;
        if (cell.humidity !== undefined) this.humidity[idx] = cell.humidity;
        if (cell.windU !== undefined) this.windU[idx] = cell.windU;
        if (cell.windV !== undefined) this.windV[idx] = cell.windV;
        if (cell.isOcean !== undefined) this.oceanMask[idx] = cell.isOcean ? 1 : 0;
    }

    /**
     * Get neighboring cells (4-connected)
     */
    public getNeighbors(lonIdx: number, latIdx: number): GridCell[] {
        const neighbors: GridCell[] = [];

        const offsets = [
            [0, -1],  // North
            [1, 0],   // East
            [0, 1],   // South
            [-1, 0]   // West
        ];

        for (const [dlon, dlat] of offsets) {
            const nlon = lonIdx + dlon;
            const nlat = latIdx + dlat;

            if (nlat >= 0 && nlat < this.height) {
                neighbors.push(this.getCell(nlon, nlat));
            }
        }

        return neighbors;
    }

    /**
     * Apply diffusion to a field (heat diffusion, etc.)
     */
    public diffuse(
        field: 'temperature' | 'pressure' | 'humidity',
        coefficient: number,
        deltaTime: number
    ): void {
        const src = field === 'temperature' ? this.temperature :
                    field === 'pressure' ? this.pressure :
                    this.humidity;

        const dst = new Float32Array(src.length);

        for (let lat = 0; lat < this.height; lat++) {
            for (let lon = 0; lon < this.width; lon++) {
                const idx = this.getIndex(lon, lat);

                // Get neighbors
                const n = lat > 0 ? src[this.getIndex(lon, lat - 1)] : src[idx];
                const s = lat < this.height - 1 ? src[this.getIndex(lon, lat + 1)] : src[idx];
                const e = src[this.getIndex(lon + 1, lat)];
                const w = src[this.getIndex(lon - 1, lat)];

                // Laplacian
                const laplacian = (n + s + e + w - 4 * src[idx]);

                // Update
                dst[idx] = src[idx] + coefficient * laplacian * deltaTime;
            }
        }

        // Copy back
        src.set(dst);
    }

    /**
     * Get statistics for a field
     */
    public getStatistics(field: 'temperature' | 'pressure' | 'humidity' | 'windSpeed'): {
        min: number;
        max: number;
        mean: number;
        stdDev: number;
    } {
        let data: Float32Array;

        if (field === 'windSpeed') {
            data = new Float32Array(this.width * this.height);
            for (let i = 0; i < data.length; i++) {
                data[i] = Math.sqrt(this.windU[i] ** 2 + this.windV[i] ** 2);
            }
        } else {
            data = field === 'temperature' ? this.temperature :
                   field === 'pressure' ? this.pressure :
                   this.humidity;
        }

        let min = Infinity;
        let max = -Infinity;
        let sum = 0;

        for (let i = 0; i < data.length; i++) {
            min = Math.min(min, data[i]);
            max = Math.max(max, data[i]);
            sum += data[i];
        }

        const mean = sum / data.length;

        let variance = 0;
        for (let i = 0; i < data.length; i++) {
            variance += (data[i] - mean) ** 2;
        }
        variance /= data.length;

        return {
            min,
            max,
            mean,
            stdDev: Math.sqrt(variance)
        };
    }

    /**
     * Export grid data as typed arrays
     */
    public exportData(): {
        temperature: Float32Array;
        pressure: Float32Array;
        humidity: Float32Array;
        windU: Float32Array;
        windV: Float32Array;
        oceanMask: Uint8Array;
    } {
        return {
            temperature: new Float32Array(this.temperature),
            pressure: new Float32Array(this.pressure),
            humidity: new Float32Array(this.humidity),
            windU: new Float32Array(this.windU),
            windV: new Float32Array(this.windV),
            oceanMask: new Uint8Array(this.oceanMask)
        };
    }

    /**
     * Import grid data from typed arrays
     */
    public importData(data: {
        temperature?: Float32Array;
        pressure?: Float32Array;
        humidity?: Float32Array;
        windU?: Float32Array;
        windV?: Float32Array;
        oceanMask?: Uint8Array;
    }): void {
        if (data.temperature) this.temperature.set(data.temperature);
        if (data.pressure) this.pressure.set(data.pressure);
        if (data.humidity) this.humidity.set(data.humidity);
        if (data.windU) this.windU.set(data.windU);
        if (data.windV) this.windV.set(data.windV);
        if (data.oceanMask) this.oceanMask.set(data.oceanMask);
    }

    /**
     * Reset grid to defaults
     */
    public reset(): void {
        this.initializeDefaults();
    }
}

/**
 * Scientific Color Mapping
 *
 * Provides perceptually uniform color maps for scientific visualization.
 * Includes popular colormaps like Viridis, Plasma, and custom map creation.
 *
 * @example
 * ```typescript
 * // Use built-in colormap
 * const viridis = ColorMap.viridis();
 * const color = viridis.getColor(0.5); // [R, G, B]
 *
 * // Create custom colormap
 * const custom = ColorMap.custom([
 *   [0.0, [0, 0, 255]],
 *   [0.5, [0, 255, 0]],
 *   [1.0, [255, 0, 0]]
 * ]);
 *
 * // Generate LUT for GPU
 * const lut = viridis.generateLUT(256);
 * ```
 */

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

export interface ColorStop {
    position: number;
    color: RGB;
}

/**
 * Scientific color mapping
 */
export class ColorMap {
    private stops: ColorStop[];
    public readonly name: string;

    constructor(stops: ColorStop[], name: string = 'custom') {
        this.stops = stops.sort((a, b) => a.position - b.position);
        this.name = name;
    }

    /**
     * Get color at normalized position [0, 1]
     */
    public getColor(t: number): RGB {
        t = Math.max(0, Math.min(1, t));

        // Find surrounding stops
        let i = 0;
        while (i < this.stops.length - 1 && this.stops[i + 1].position < t) {
            i++;
        }

        if (i === this.stops.length - 1) {
            return [...this.stops[i].color];
        }

        const stop0 = this.stops[i];
        const stop1 = this.stops[i + 1];

        // Interpolate
        const localT = (t - stop0.position) / (stop1.position - stop0.position);
        return [
            Math.round(stop0.color[0] + (stop1.color[0] - stop0.color[0]) * localT),
            Math.round(stop0.color[1] + (stop1.color[1] - stop0.color[1]) * localT),
            Math.round(stop0.color[2] + (stop1.color[2] - stop0.color[2]) * localT)
        ];
    }

    /**
     * Get color with alpha
     */
    public getColorRGBA(t: number, alpha: number = 1.0): RGBA {
        const [r, g, b] = this.getColor(t);
        return [r, g, b, Math.round(alpha * 255)];
    }

    /**
     * Map value from data range to color
     */
    public mapValue(value: number, minValue: number, maxValue: number): RGB {
        const t = (value - minValue) / (maxValue - minValue);
        return this.getColor(t);
    }

    /**
     * Generate lookup table (LUT) for GPU textures
     * Returns Uint8Array with RGB or RGBA values
     */
    public generateLUT(size: number = 256, withAlpha: boolean = false): Uint8Array {
        const channels = withAlpha ? 4 : 3;
        const lut = new Uint8Array(size * channels);

        for (let i = 0; i < size; i++) {
            const t = i / (size - 1);
            const color = withAlpha ? this.getColorRGBA(t) : this.getColor(t);

            for (let c = 0; c < channels; c++) {
                lut[i * channels + c] = color[c];
            }
        }

        return lut;
    }

    /**
     * Create custom colormap from color stops
     */
    public static custom(stops: Array<[number, RGB]>, name: string = 'custom'): ColorMap {
        return new ColorMap(
            stops.map(([position, color]) => ({ position, color })),
            name
        );
    }

    /**
     * Viridis colormap (perceptually uniform)
     */
    public static viridis(): ColorMap {
        return new ColorMap([
            { position: 0.000, color: [68, 1, 84] },
            { position: 0.125, color: [72, 40, 120] },
            { position: 0.250, color: [62, 74, 137] },
            { position: 0.375, color: [49, 104, 142] },
            { position: 0.500, color: [38, 130, 142] },
            { position: 0.625, color: [31, 158, 137] },
            { position: 0.750, color: [53, 183, 121] },
            { position: 0.875, color: [109, 205, 89] },
            { position: 1.000, color: [253, 231, 37] }
        ], 'viridis');
    }

    /**
     * Plasma colormap (perceptually uniform)
     */
    public static plasma(): ColorMap {
        return new ColorMap([
            { position: 0.000, color: [13, 8, 135] },
            { position: 0.125, color: [75, 3, 161] },
            { position: 0.250, color: [125, 3, 168] },
            { position: 0.375, color: [168, 34, 150] },
            { position: 0.500, color: [203, 70, 121] },
            { position: 0.625, color: [229, 107, 93] },
            { position: 0.750, color: [248, 148, 65] },
            { position: 0.875, color: [253, 195, 40] },
            { position: 1.000, color: [240, 249, 33] }
        ], 'plasma');
    }

    /**
     * Inferno colormap (perceptually uniform)
     */
    public static inferno(): ColorMap {
        return new ColorMap([
            { position: 0.000, color: [0, 0, 4] },
            { position: 0.125, color: [40, 11, 84] },
            { position: 0.250, color: [101, 21, 110] },
            { position: 0.375, color: [159, 42, 99] },
            { position: 0.500, color: [212, 72, 66] },
            { position: 0.625, color: [245, 125, 21] },
            { position: 0.750, color: [250, 193, 39] },
            { position: 0.875, color: [249, 248, 157] },
            { position: 1.000, color: [252, 255, 164] }
        ], 'inferno');
    }

    /**
     * Magma colormap (perceptually uniform)
     */
    public static magma(): ColorMap {
        return new ColorMap([
            { position: 0.000, color: [0, 0, 4] },
            { position: 0.125, color: [28, 16, 68] },
            { position: 0.250, color: [79, 18, 123] },
            { position: 0.375, color: [129, 37, 129] },
            { position: 0.500, color: [181, 54, 122] },
            { position: 0.625, color: [229, 80, 100] },
            { position: 0.750, color: [251, 135, 97] },
            { position: 0.875, color: [254, 194, 135] },
            { position: 1.000, color: [252, 253, 191] }
        ], 'magma');
    }

    /**
     * Cividis colormap (perceptually uniform, colorblind-friendly)
     */
    public static cividis(): ColorMap {
        return new ColorMap([
            { position: 0.000, color: [0, 32, 76] },
            { position: 0.125, color: [0, 50, 82] },
            { position: 0.250, color: [42, 71, 85] },
            { position: 0.375, color: [87, 88, 85] },
            { position: 0.500, color: [130, 105, 83] },
            { position: 0.625, color: [173, 123, 83] },
            { position: 0.750, color: [214, 143, 88] },
            { position: 0.875, color: [247, 169, 100] },
            { position: 1.000, color: [255, 233, 69] }
        ], 'cividis');
    }

    /**
     * Turbo colormap (improved rainbow)
     */
    public static turbo(): ColorMap {
        return new ColorMap([
            { position: 0.000, color: [48, 18, 59] },
            { position: 0.125, color: [62, 96, 213] },
            { position: 0.250, color: [33, 179, 255] },
            { position: 0.375, color: [15, 240, 210] },
            { position: 0.500, color: [71, 255, 94] },
            { position: 0.625, color: [192, 243, 30] },
            { position: 0.750, color: [252, 180, 20] },
            { position: 0.875, color: [248, 84, 13] },
            { position: 1.000, color: [122, 4, 2] }
        ], 'turbo');
    }

    /**
     * Grayscale colormap
     */
    public static grayscale(): ColorMap {
        return new ColorMap([
            { position: 0.0, color: [0, 0, 0] },
            { position: 1.0, color: [255, 255, 255] }
        ], 'grayscale');
    }

    /**
     * Jet colormap (legacy, not recommended)
     */
    public static jet(): ColorMap {
        return new ColorMap([
            { position: 0.000, color: [0, 0, 143] },
            { position: 0.125, color: [0, 0, 255] },
            { position: 0.250, color: [0, 127, 255] },
            { position: 0.375, color: [0, 255, 255] },
            { position: 0.500, color: [127, 255, 127] },
            { position: 0.625, color: [255, 255, 0] },
            { position: 0.750, color: [255, 127, 0] },
            { position: 0.875, color: [255, 0, 0] },
            { position: 1.000, color: [127, 0, 0] }
        ], 'jet');
    }

    /**
     * Rainbow colormap (HSV)
     */
    public static rainbow(): ColorMap {
        const stops: ColorStop[] = [];
        const numStops = 7;

        for (let i = 0; i < numStops; i++) {
            const hue = i / (numStops - 1);
            const rgb = ColorMap.hsvToRgb(hue, 1.0, 1.0);
            stops.push({ position: hue, color: rgb });
        }

        return new ColorMap(stops, 'rainbow');
    }

    /**
     * Coolwarm diverging colormap
     */
    public static coolwarm(): ColorMap {
        return new ColorMap([
            { position: 0.0, color: [59, 76, 192] },
            { position: 0.25, color: [144, 178, 254] },
            { position: 0.5, color: [221, 221, 221] },
            { position: 0.75, color: [245, 156, 125] },
            { position: 1.0, color: [180, 4, 38] }
        ], 'coolwarm');
    }

    /**
     * RdYlBu diverging colormap (Red-Yellow-Blue)
     */
    public static rdylbu(): ColorMap {
        return new ColorMap([
            { position: 0.000, color: [165, 0, 38] },
            { position: 0.250, color: [253, 174, 97] },
            { position: 0.500, color: [255, 255, 191] },
            { position: 0.750, color: [116, 173, 209] },
            { position: 1.000, color: [49, 54, 149] }
        ], 'rdylbu');
    }

    /**
     * Reverse colormap
     */
    public reverse(): ColorMap {
        const reversed = this.stops.map(stop => ({
            position: 1.0 - stop.position,
            color: stop.color
        }));
        return new ColorMap(reversed, `${this.name}_r`);
    }

    /**
     * Get colormap by name
     */
    public static getByName(name: string): ColorMap {
        const methods: { [key: string]: () => ColorMap } = {
            'viridis': ColorMap.viridis,
            'plasma': ColorMap.plasma,
            'inferno': ColorMap.inferno,
            'magma': ColorMap.magma,
            'cividis': ColorMap.cividis,
            'turbo': ColorMap.turbo,
            'grayscale': ColorMap.grayscale,
            'jet': ColorMap.jet,
            'rainbow': ColorMap.rainbow,
            'coolwarm': ColorMap.coolwarm,
            'rdylbu': ColorMap.rdylbu
        };

        if (name in methods) {
            return methods[name]();
        }

        // Check for reversed
        if (name.endsWith('_r')) {
            const baseName = name.slice(0, -2);
            if (baseName in methods) {
                return methods[baseName]().reverse();
            }
        }

        console.warn(`Unknown colormap: ${name}, using viridis`);
        return ColorMap.viridis();
    }

    /**
     * List available colormap names
     */
    public static listNames(): string[] {
        return [
            'viridis', 'plasma', 'inferno', 'magma', 'cividis',
            'turbo', 'grayscale', 'jet', 'rainbow', 'coolwarm', 'rdylbu'
        ];
    }

    /**
     * HSV to RGB conversion
     */
    private static hsvToRgb(h: number, s: number, v: number): RGB {
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);

        let r: number, g: number, b: number;

        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
            default: r = 0; g = 0; b = 0;
        }

        return [
            Math.round(r * 255),
            Math.round(g * 255),
            Math.round(b * 255)
        ];
    }

    /**
     * Create discrete colormap with N colors
     */
    public discretize(numColors: number): ColorMap {
        const stops: ColorStop[] = [];

        for (let i = 0; i < numColors; i++) {
            const t = i / (numColors - 1);
            const color = this.getColor(t);
            stops.push({ position: t, color });
        }

        return new ColorMap(stops, `${this.name}_discrete${numColors}`);
    }

    /**
     * Blend two colormaps
     */
    public static blend(map1: ColorMap, map2: ColorMap, t: number): ColorMap {
        const stops: ColorStop[] = [];

        for (let i = 0; i <= 10; i++) {
            const position = i / 10;
            const c1 = map1.getColor(position);
            const c2 = map2.getColor(position);

            const color: RGB = [
                Math.round(c1[0] + (c2[0] - c1[0]) * t),
                Math.round(c1[1] + (c2[1] - c1[1]) * t),
                Math.round(c1[2] + (c2[2] - c1[2]) * t)
            ];

            stops.push({ position, color });
        }

        return new ColorMap(stops, `blend_${map1.name}_${map2.name}`);
    }
}

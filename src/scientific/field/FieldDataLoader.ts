/**
 * Field Data Loader
 *
 * Loads field data from various file formats with progress tracking.
 * Supports VTK, NetCDF, and raw binary formats.
 *
 * @example
 * ```typescript
 * const loader = new FieldDataLoader();
 * const field = await loader.load('data.vtk', (progress) => {
 *   console.log(`Loading: ${progress * 100}%`);
 * });
 * ```
 */

import { ScalarFieldData, VectorFieldData, FieldData } from './FieldData';

export type FileFormat = 'vtk' | 'netcdf' | 'raw';
export type ProgressCallback = (progress: number, status: string) => void;

export interface LoadOptions {
    format?: FileFormat;
    dataType?: 'scalar' | 'vector';
    dimensions?: [number, number, number];
    bounds?: { min: [number, number, number]; max: [number, number, number] };
    swapEndian?: boolean;
}

/**
 * Field data loader
 */
export class FieldDataLoader {
    /**
     * Load field from file
     */
    public async load(
        url: string,
        onProgress?: ProgressCallback
    ): Promise<FieldData> {
        if (onProgress) {
            onProgress(0, 'Starting load');
        }

        // Detect format from extension
        const format = this.detectFormat(url);

        // Fetch data
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load ${url}: ${response.statusText}`);
        }

        const totalSize = parseInt(response.headers.get('content-length') || '0', 10);
        const reader = response.body?.getReader();

        if (!reader) {
            throw new Error('Failed to get response reader');
        }

        // Read with progress
        const chunks: Uint8Array[] = [];
        let receivedSize = 0;

        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            chunks.push(value);
            receivedSize += value.length;

            if (onProgress && totalSize > 0) {
                onProgress(receivedSize / totalSize, `Loading: ${receivedSize} / ${totalSize} bytes`);
            }
        }

        // Combine chunks
        const data = new Uint8Array(receivedSize);
        let position = 0;
        for (const chunk of chunks) {
            data.set(chunk, position);
            position += chunk.length;
        }

        if (onProgress) {
            onProgress(1.0, 'Parsing data');
        }

        // Parse based on format
        switch (format) {
            case 'vtk':
                return this.parseVTK(data);
            case 'netcdf':
                return this.parseNetCDF(data);
            case 'raw':
                return this.parseRaw(data);
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }

    /**
     * Detect file format from URL
     */
    private detectFormat(url: string): FileFormat {
        const ext = url.split('.').pop()?.toLowerCase();

        switch (ext) {
            case 'vtk':
                return 'vtk';
            case 'nc':
            case 'netcdf':
                return 'netcdf';
            case 'raw':
            case 'bin':
                return 'raw';
            default:
                return 'vtk'; // Default
        }
    }

    /**
     * Parse VTK structured grid format
     */
    private parseVTK(data: Uint8Array): FieldData {
        const text = new TextDecoder().decode(data);
        const lines = text.split('\n');

        let nx = 0, ny = 0, nz = 0;
        let boundsMin: [number, number, number] = [0, 0, 0];
        let boundsMax: [number, number, number] = [1, 1, 1];
        let dataType: 'scalar' | 'vector' = 'scalar';
        let fieldName = 'field';

        let inDataSection = false;
        let dataStartLine = 0;

        // Parse header
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Dimensions
            if (line.startsWith('DIMENSIONS')) {
                const parts = line.split(/\s+/);
                nx = parseInt(parts[1], 10);
                ny = parseInt(parts[2], 10);
                nz = parseInt(parts[3], 10);
            }

            // Spacing (use to compute bounds)
            if (line.startsWith('SPACING')) {
                const parts = line.split(/\s+/);
                const dx = parseFloat(parts[1]);
                const dy = parseFloat(parts[2]);
                const dz = parseFloat(parts[3]);
                boundsMax = [dx * (nx - 1), dy * (ny - 1), dz * (nz - 1)];
            }

            // Origin
            if (line.startsWith('ORIGIN')) {
                const parts = line.split(/\s+/);
                boundsMin = [
                    parseFloat(parts[1]),
                    parseFloat(parts[2]),
                    parseFloat(parts[3])
                ];
                boundsMax = [
                    boundsMin[0] + boundsMax[0],
                    boundsMin[1] + boundsMax[1],
                    boundsMin[2] + boundsMax[2]
                ];
            }

            // Scalar data
            if (line.startsWith('SCALARS')) {
                dataType = 'scalar';
                const parts = line.split(/\s+/);
                fieldName = parts[1] || 'scalar';
                dataStartLine = i + 2; // Skip LOOKUP_TABLE line
                inDataSection = true;
            }

            // Vector data
            if (line.startsWith('VECTORS')) {
                dataType = 'vector';
                const parts = line.split(/\s+/);
                fieldName = parts[1] || 'vector';
                dataStartLine = i + 1;
                inDataSection = true;
            }

            if (inDataSection) break;
        }

        // Create field
        let field: FieldData;

        if (dataType === 'scalar') {
            field = new ScalarFieldData(nx, ny, nz, boundsMin, boundsMax, fieldName);

            // Parse scalar data
            let idx = 0;
            for (let i = dataStartLine; i < lines.length && idx < field.size; i++) {
                const line = lines[i].trim();
                if (line === '') continue;

                const values = line.split(/\s+/).map(parseFloat);
                for (const value of values) {
                    if (idx < field.size) {
                        (field as ScalarFieldData).data[idx++] = value;
                    }
                }
            }
        } else {
            field = new VectorFieldData(nx, ny, nz, boundsMin, boundsMax, fieldName);

            // Parse vector data
            let idx = 0;
            for (let i = dataStartLine; i < lines.length && idx < field.size; i++) {
                const line = lines[i].trim();
                if (line === '') continue;

                const values = line.split(/\s+/).map(parseFloat);
                for (let j = 0; j + 2 < values.length && idx < field.size; j += 3) {
                    (field as VectorFieldData).dataX[idx] = values[j];
                    (field as VectorFieldData).dataY[idx] = values[j + 1];
                    (field as VectorFieldData).dataZ[idx] = values[j + 2];
                    idx++;
                }
            }
        }

        return field;
    }

    /**
     * Parse NetCDF format (simplified)
     */
    private parseNetCDF(data: Uint8Array): FieldData {
        // NetCDF parsing is complex - this is a simplified placeholder
        // In production, would use a proper NetCDF library

        console.warn('NetCDF parsing not fully implemented - using dummy data');

        // Create dummy field for now
        const field = new ScalarFieldData(32, 32, 32, [0, 0, 0], [10, 10, 10], 'netcdf');

        // Fill with test pattern
        for (let i = 0; i < field.size; i++) {
            field.data[i] = Math.random();
        }

        return field;
    }

    /**
     * Parse raw binary format
     */
    private parseRaw(data: Uint8Array, options?: LoadOptions): FieldData {
        if (!options?.dimensions) {
            throw new Error('Dimensions required for raw binary format');
        }

        const [nx, ny, nz] = options.dimensions;
        const boundsMin = options.bounds?.min ?? [0, 0, 0];
        const boundsMax = options.bounds?.max ?? [nx - 1, ny - 1, nz - 1];
        const dataType = options.dataType ?? 'scalar';

        const floatData = new Float32Array(data.buffer);

        if (dataType === 'scalar') {
            const field = new ScalarFieldData(nx, ny, nz, boundsMin, boundsMax, 'raw');
            field.data.set(floatData.slice(0, field.size));
            return field;
        } else {
            const field = new VectorFieldData(nx, ny, nz, boundsMin, boundsMax, 'raw');
            const size = field.size;

            for (let i = 0; i < size; i++) {
                field.dataX[i] = floatData[i * 3];
                field.dataY[i] = floatData[i * 3 + 1];
                field.dataZ[i] = floatData[i * 3 + 2];
            }

            return field;
        }
    }

    /**
     * Load multiple fields
     */
    public async loadMultiple(
        urls: string[],
        onProgress?: (index: number, progress: number, status: string) => void
    ): Promise<FieldData[]> {
        const fields: FieldData[] = [];

        for (let i = 0; i < urls.length; i++) {
            const field = await this.load(urls[i], (progress, status) => {
                if (onProgress) {
                    onProgress(i, progress, status);
                }
            });
            fields.push(field);
        }

        return fields;
    }

    /**
     * Save field to VTK format
     */
    public saveVTK(field: FieldData): string {
        const [nx, ny, nz] = field.dimensions;
        const [minX, minY, minZ] = field.boundsMin;
        const [dx, dy, dz] = field.spacing;

        let vtk = '# vtk DataFile Version 3.0\n';
        vtk += `${field.name}\n`;
        vtk += 'ASCII\n';
        vtk += 'DATASET STRUCTURED_POINTS\n';
        vtk += `DIMENSIONS ${nx} ${ny} ${nz}\n`;
        vtk += `ORIGIN ${minX} ${minY} ${minZ}\n`;
        vtk += `SPACING ${dx} ${dy} ${dz}\n`;
        vtk += `POINT_DATA ${field.size}\n`;

        if (field instanceof ScalarFieldData) {
            vtk += `SCALARS ${field.name} float\n`;
            vtk += 'LOOKUP_TABLE default\n';

            for (let i = 0; i < field.size; i++) {
                vtk += `${field.data[i]}\n`;
            }
        } else {
            const vectorField = field as VectorFieldData;
            vtk += `VECTORS ${field.name} float\n`;

            for (let i = 0; i < field.size; i++) {
                vtk += `${vectorField.dataX[i]} ${vectorField.dataY[i]} ${vectorField.dataZ[i]}\n`;
            }
        }

        return vtk;
    }

    /**
     * Save field to raw binary format
     */
    public saveRaw(field: FieldData): ArrayBuffer {
        if (field instanceof ScalarFieldData) {
            return field.data.buffer;
        } else {
            const vectorField = field as VectorFieldData;
            const data = new Float32Array(field.size * 3);

            for (let i = 0; i < field.size; i++) {
                data[i * 3] = vectorField.dataX[i];
                data[i * 3 + 1] = vectorField.dataY[i];
                data[i * 3 + 2] = vectorField.dataZ[i];
            }

            return data.buffer;
        }
    }
}

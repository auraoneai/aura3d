/**
 * JSON exporter
 *
 * Exports profiling data to custom JSON format with frame data,
 * statistics summary, configuration info, and pretty print option.
 */

import { ProfilerSession, SessionStatistics } from '../ProfilerSession';
import { FrameProfile } from '../Profiler';

/**
 * JSON export format
 */
export interface JSONExportFormat {
    /** Export metadata */
    metadata: {
        /** Session name */
        name: string;
        /** Export timestamp */
        exportTime: string;
        /** Session start time */
        startTime: number;
        /** Session end time */
        endTime: number;
        /** Session duration */
        duration: number;
        /** Total frames */
        frameCount: number;
        /** Exporter version */
        version: string;
    };
    /** Session statistics */
    statistics: SessionStatistics;
    /** Frame data */
    frames: FrameProfile[];
    /** Configuration */
    config?: Record<string, any>;
}

/**
 * JSON exporter configuration
 */
export interface JSONExporterConfig {
    /** Include frame data */
    includeFrames?: boolean;
    /** Include statistics */
    includeStatistics?: boolean;
    /** Include configuration */
    includeConfig?: boolean;
    /** Pretty print JSON */
    prettyPrint?: boolean;
    /** Indentation for pretty print */
    indent?: number;
    /** Custom configuration to include */
    customConfig?: Record<string, any>;
    /** Maximum frames to export (0 = all) */
    maxFrames?: number;
}

/**
 * Compact export format (minimal data)
 */
export interface CompactExportFormat {
    name: string;
    frameCount: number;
    avgFrameTime: number;
    minFrameTime: number;
    maxFrameTime: number;
    avgFPS: number;
    frameTimes: number[];
}

/**
 * JSON exporter for profiling data.
 * Exports to custom JSON format with statistics and frame data.
 *
 * @example
 * ```typescript
 * const session = Profiler.getSession();
 *
 * // Full export
 * const json = JSONExporter.export(session, {
 *   prettyPrint: true,
 *   includeFrames: true,
 *   includeStatistics: true
 * });
 *
 * // Compact export
 * const compact = JSONExporter.exportCompact(session);
 *
 * // Save to file
 * JSONExporter.exportToFile(session, 'profile.json');
 * ```
 */
export class JSONExporter {
    /**
     * Export session to JSON format
     */
    public static export(
        session: ProfilerSession,
        config: JSONExporterConfig = {}
    ): string {
        const includeFrames = config.includeFrames !== false;
        const includeStatistics = config.includeStatistics !== false;
        const includeConfig = config.includeConfig !== false;
        const prettyPrint = config.prettyPrint !== false;
        const indent = config.indent || 2;
        const maxFrames = config.maxFrames || 0;

        const data: JSONExportFormat = {
            metadata: {
                name: session.getName(),
                exportTime: new Date().toISOString(),
                startTime: 0,
                endTime: 0,
                duration: session.getDuration(),
                frameCount: session.getFrameCount(),
                version: '1.0.0'
            },
            statistics: includeStatistics
                ? session.getStatistics()
                : JSONExporter.createEmptyStatistics(),
            frames: []
        };

        // Get frames
        if (includeFrames) {
            let frames = Array.from(session.getFrames());

            // Limit frames if requested
            if (maxFrames > 0 && frames.length > maxFrames) {
                frames = frames.slice(-maxFrames);
            }

            data.frames = frames;

            // Update metadata times
            if (frames.length > 0) {
                data.metadata.startTime = frames[0].startTime;
                data.metadata.endTime = frames[frames.length - 1].endTime;
            }
        }

        // Add custom config
        if (includeConfig && config.customConfig) {
            data.config = config.customConfig;
        }

        return prettyPrint
            ? JSON.stringify(data, JSONExporter.replacer, indent)
            : JSON.stringify(data, JSONExporter.replacer);
    }

    /**
     * Export to compact format (minimal data)
     */
    public static exportCompact(session: ProfilerSession): string {
        const stats = session.getStatistics();
        const frames = session.getFrames();
        const frameTimes = frames.map(f => f.duration);

        const compact: CompactExportFormat = {
            name: session.getName(),
            frameCount: stats.totalFrames,
            avgFrameTime: stats.averageFrameTime,
            minFrameTime: stats.minFrameTime,
            maxFrameTime: stats.maxFrameTime,
            avgFPS: stats.averageFPS,
            frameTimes
        };

        return JSON.stringify(compact);
    }

    /**
     * Export statistics only
     */
    public static exportStatistics(session: ProfilerSession, prettyPrint: boolean = true): string {
        const stats = session.getStatistics();

        return prettyPrint
            ? JSON.stringify(stats, JSONExporter.replacer, 2)
            : JSON.stringify(stats, JSONExporter.replacer);
    }

    /**
     * Export frame data only
     */
    public static exportFrames(
        session: ProfilerSession,
        maxFrames: number = 0,
        prettyPrint: boolean = true
    ): string {
        let frames = Array.from(session.getFrames());

        if (maxFrames > 0 && frames.length > maxFrames) {
            frames = frames.slice(-maxFrames);
        }

        return prettyPrint
            ? JSON.stringify(frames, JSONExporter.replacer, 2)
            : JSON.stringify(frames, JSONExporter.replacer);
    }

    /**
     * Export to CSV format
     */
    public static exportToCSV(session: ProfilerSession): string {
        const frames = session.getFrames();
        const lines: string[] = [];

        // Header
        lines.push('Frame,StartTime,EndTime,Duration,ScopeCount');

        // Data rows
        for (const frame of frames) {
            lines.push([
                frame.frameNumber,
                frame.startTime.toFixed(3),
                frame.endTime.toFixed(3),
                frame.duration.toFixed(3),
                frame.scopes.length
            ].join(','));
        }

        return lines.join('\n');
    }

    /**
     * Export scope statistics to CSV
     */
    public static exportScopeStatsToCSV(session: ProfilerSession): string {
        const stats = session.getStatistics();
        const lines: string[] = [];

        // Header
        lines.push('Name,CallCount,TotalTime,AverageTime,MinTime,MaxTime,Percentage');

        // Data rows
        for (const [name, scopeStats] of stats.scopeStats.entries()) {
            lines.push([
                `"${name}"`,
                scopeStats.callCount,
                scopeStats.totalTime.toFixed(3),
                scopeStats.averageTime.toFixed(3),
                scopeStats.minTime.toFixed(3),
                scopeStats.maxTime.toFixed(3),
                scopeStats.percentageOfFrame.toFixed(2)
            ].join(','));
        }

        return lines.join('\n');
    }

    /**
     * Export to file (browser only)
     */
    public static exportToFile(
        session: ProfilerSession,
        filename: string = 'profile.json',
        config?: JSONExporterConfig
    ): void {
        if (typeof document === 'undefined') {
            throw new Error('exportToFile is only available in browser environments');
        }

        const json = JSONExporter.export(session, config);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);
    }

    /**
     * Export CSV to file (browser only)
     */
    public static exportCSVToFile(
        session: ProfilerSession,
        filename: string = 'profile.csv'
    ): void {
        if (typeof document === 'undefined') {
            throw new Error('exportCSVToFile is only available in browser environments');
        }

        const csv = JSONExporter.exportToCSV(session);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);
    }

    /**
     * Parse JSON export format
     */
    public static parse(json: string): JSONExportFormat {
        const data = JSON.parse(json, JSONExporter.reviver);

        // Convert Map objects
        if (data.statistics && data.statistics.scopeStats) {
            if (!(data.statistics.scopeStats instanceof Map)) {
                data.statistics.scopeStats = new Map(
                    Object.entries(data.statistics.scopeStats)
                );
            }
        }

        // Convert counter Maps in frames
        if (data.frames) {
            for (const frame of data.frames) {
                if (frame.counters && !(frame.counters instanceof Map)) {
                    frame.counters = new Map(Object.entries(frame.counters));
                }
            }
        }

        return data;
    }

    /**
     * Validate JSON export format
     */
    public static validate(data: JSONExportFormat): {
        valid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        if (!data.metadata) {
            errors.push('Missing metadata');
        } else {
            if (!data.metadata.name) errors.push('Missing metadata.name');
            if (!data.metadata.version) errors.push('Missing metadata.version');
        }

        if (!data.statistics) {
            errors.push('Missing statistics');
        }

        if (!data.frames) {
            errors.push('Missing frames array');
        } else if (!Array.isArray(data.frames)) {
            errors.push('frames must be an array');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Create empty statistics object
     */
    private static createEmptyStatistics(): SessionStatistics {
        return {
            totalFrames: 0,
            totalDuration: 0,
            averageFrameTime: 0,
            minFrameTime: 0,
            maxFrameTime: 0,
            medianFrameTime: 0,
            standardDeviation: 0,
            percentile95: 0,
            percentile99: 0,
            averageFPS: 0,
            scopeStats: new Map()
        };
    }

    /**
     * JSON replacer for Map objects
     */
    private static replacer(key: string, value: any): any {
        if (value instanceof Map) {
            return Object.fromEntries(value);
        }
        return value;
    }

    /**
     * JSON reviver for Map objects
     */
    private static reviver(key: string, value: any): any {
        // This is handled manually in parse()
        return value;
    }

    /**
     * Compare two sessions and export diff
     */
    public static exportComparison(
        session1: ProfilerSession,
        session2: ProfilerSession,
        prettyPrint: boolean = true
    ): string {
        const stats1 = session1.getStatistics();
        const stats2 = session2.getStatistics();

        const comparison = {
            session1: {
                name: session1.getName(),
                avgFrameTime: stats1.averageFrameTime,
                avgFPS: stats1.averageFPS,
                minFrameTime: stats1.minFrameTime,
                maxFrameTime: stats1.maxFrameTime
            },
            session2: {
                name: session2.getName(),
                avgFrameTime: stats2.averageFrameTime,
                avgFPS: stats2.averageFPS,
                minFrameTime: stats2.minFrameTime,
                maxFrameTime: stats2.maxFrameTime
            },
            diff: {
                avgFrameTimeDiff: stats2.averageFrameTime - stats1.averageFrameTime,
                avgFPSDiff: stats2.averageFPS - stats1.averageFPS,
                avgFrameTimePercent: ((stats2.averageFrameTime - stats1.averageFrameTime) / stats1.averageFrameTime) * 100,
                avgFPSPercent: ((stats2.averageFPS - stats1.averageFPS) / stats1.averageFPS) * 100
            }
        };

        return prettyPrint
            ? JSON.stringify(comparison, null, 2)
            : JSON.stringify(comparison);
    }
}

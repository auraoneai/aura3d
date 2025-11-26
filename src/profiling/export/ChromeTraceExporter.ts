/**
 * Chrome trace format exporter
 *
 * Exports profiling data to chrome://tracing format.
 * Supports JSON trace events with phase markers (B/E for begin/end),
 * process and thread IDs, and metadata events.
 */

import { ProfilerSession } from '../ProfilerSession';
import { FrameProfile, ProfileScope } from '../Profiler';

/**
 * Chrome trace event
 */
interface ChromeTraceEvent {
    /** Event name */
    name: string;
    /** Event category */
    cat: string;
    /** Phase (B=begin, E=end, X=complete, i=instant, etc.) */
    ph: string;
    /** Timestamp in microseconds */
    ts: number;
    /** Process ID */
    pid: number;
    /** Thread ID */
    tid: number;
    /** Duration in microseconds (for 'X' phase) */
    dur?: number;
    /** Arguments */
    args?: Record<string, any>;
}

/**
 * Chrome trace format
 */
interface ChromeTraceFormat {
    /** Trace events */
    traceEvents: ChromeTraceEvent[];
    /** Display time unit */
    displayTimeUnit?: string;
    /** Metadata */
    metadata?: Record<string, any>;
}

/**
 * Chrome trace exporter configuration
 */
export interface ChromeTraceExporterConfig {
    /** Process ID */
    processId?: number;
    /** Thread ID */
    threadId?: number;
    /** Include metadata */
    includeMetadata?: boolean;
    /** Use complete events (X) instead of begin/end (B/E) */
    useCompleteEvents?: boolean;
}

/**
 * Chrome trace format exporter.
 * Exports profiling data to chrome://tracing JSON format.
 *
 * @example
 * ```typescript
 * const session = Profiler.getSession();
 * const json = ChromeTraceExporter.export(session);
 *
 * // Save to file
 * const blob = new Blob([json], { type: 'application/json' });
 * const url = URL.createObjectURL(blob);
 * const a = document.createElement('a');
 * a.href = url;
 * a.download = 'profile.json';
 * a.click();
 * ```
 */
export class ChromeTraceExporter {
    /**
     * Export session to Chrome trace format
     */
    public static export(
        session: ProfilerSession,
        config: ChromeTraceExporterConfig = {}
    ): string {
        const processId = config.processId || 1;
        const threadId = config.threadId || 1;
        const includeMetadata = config.includeMetadata !== false;
        const useCompleteEvents = config.useCompleteEvents !== false;

        const trace: ChromeTraceFormat = {
            traceEvents: [],
            displayTimeUnit: 'ms'
        };

        // Add metadata
        if (includeMetadata) {
            trace.metadata = {
                'session-name': session.getName(),
                'frame-count': session.getFrameCount(),
                'duration': session.getDuration(),
                'product-version': 'G3D 5.0',
                'exporter': 'ChromeTraceExporter'
            };

            // Add process name metadata event
            trace.traceEvents.push({
                name: 'process_name',
                cat: '__metadata',
                ph: 'M',
                ts: 0,
                pid: processId,
                tid: threadId,
                args: {
                    name: 'G3D Engine'
                }
            });

            // Add thread name metadata event
            trace.traceEvents.push({
                name: 'thread_name',
                cat: '__metadata',
                ph: 'M',
                ts: 0,
                pid: processId,
                tid: threadId,
                args: {
                    name: 'Main Thread'
                }
            });
        }

        // Convert frames to trace events
        const frames = session.getFrames();

        for (const frame of frames) {
            ChromeTraceExporter.convertFrame(
                frame,
                trace.traceEvents,
                processId,
                threadId,
                useCompleteEvents
            );
        }

        return JSON.stringify(trace, null, 2);
    }

    /**
     * Convert a frame to trace events
     */
    private static convertFrame(
        frame: FrameProfile,
        events: ChromeTraceEvent[],
        processId: number,
        threadId: number,
        useCompleteEvents: boolean
    ): void {
        // Add frame marker
        events.push({
            name: 'Frame',
            cat: 'frame',
            ph: 'i',
            ts: ChromeTraceExporter.msToMicroseconds(frame.startTime),
            pid: processId,
            tid: threadId,
            args: {
                frameNumber: frame.frameNumber,
                duration: frame.duration
            }
        });

        // Convert scopes
        for (const scope of frame.scopes) {
            if (useCompleteEvents) {
                // Use complete event (X)
                events.push({
                    name: scope.name,
                    cat: scope.category,
                    ph: 'X',
                    ts: ChromeTraceExporter.msToMicroseconds(scope.startTime),
                    dur: ChromeTraceExporter.msToMicroseconds(scope.duration),
                    pid: processId,
                    tid: threadId,
                    args: scope.metadata || {}
                });
            } else {
                // Use begin/end events (B/E)
                events.push({
                    name: scope.name,
                    cat: scope.category,
                    ph: 'B',
                    ts: ChromeTraceExporter.msToMicroseconds(scope.startTime),
                    pid: processId,
                    tid: threadId,
                    args: scope.metadata || {}
                });

                events.push({
                    name: scope.name,
                    cat: scope.category,
                    ph: 'E',
                    ts: ChromeTraceExporter.msToMicroseconds(scope.endTime),
                    pid: processId,
                    tid: threadId
                });
            }
        }

        // Add counter events
        if (frame.counters.size > 0) {
            const counterArgs: Record<string, number> = {};

            for (const [name, value] of frame.counters.entries()) {
                counterArgs[name] = value;
            }

            events.push({
                name: 'Counters',
                cat: 'counters',
                ph: 'C',
                ts: ChromeTraceExporter.msToMicroseconds(frame.startTime),
                pid: processId,
                tid: threadId,
                args: counterArgs
            });
        }
    }

    /**
     * Convert milliseconds to microseconds
     */
    private static msToMicroseconds(ms: number): number {
        return Math.floor(ms * 1000);
    }

    /**
     * Export to file (browser only)
     */
    public static exportToFile(
        session: ProfilerSession,
        filename: string = 'profile.json',
        config?: ChromeTraceExporterConfig
    ): void {
        if (typeof document === 'undefined') {
            throw new Error('exportToFile is only available in browser environments');
        }

        const json = ChromeTraceExporter.export(session, config);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);
    }

    /**
     * Export multiple sessions to a single trace file
     */
    public static exportMultipleSessions(
        sessions: ProfilerSession[],
        config: ChromeTraceExporterConfig = {}
    ): string {
        const includeMetadata = config.includeMetadata !== false;
        const useCompleteEvents = config.useCompleteEvents !== false;

        const trace: ChromeTraceFormat = {
            traceEvents: [],
            displayTimeUnit: 'ms'
        };

        // Add global metadata
        if (includeMetadata) {
            trace.metadata = {
                'session-count': sessions.length,
                'product-version': 'G3D 5.0',
                'exporter': 'ChromeTraceExporter'
            };
        }

        // Export each session with a different process ID
        for (let i = 0; i < sessions.length; i++) {
            const session = sessions[i];
            const processId = (config.processId || 1) + i;
            const threadId = config.threadId || 1;

            // Add process metadata
            if (includeMetadata) {
                trace.traceEvents.push({
                    name: 'process_name',
                    cat: '__metadata',
                    ph: 'M',
                    ts: 0,
                    pid: processId,
                    tid: threadId,
                    args: {
                        name: session.getName()
                    }
                });
            }

            // Convert frames
            const frames = session.getFrames();

            for (const frame of frames) {
                ChromeTraceExporter.convertFrame(
                    frame,
                    trace.traceEvents,
                    processId,
                    threadId,
                    useCompleteEvents
                );
            }
        }

        return JSON.stringify(trace, null, 2);
    }

    /**
     * Parse Chrome trace format
     */
    public static parse(json: string): ChromeTraceFormat {
        return JSON.parse(json);
    }

    /**
     * Validate Chrome trace format
     */
    public static validate(trace: ChromeTraceFormat): {
        valid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        if (!trace.traceEvents) {
            errors.push('Missing traceEvents array');
        }

        if (!Array.isArray(trace.traceEvents)) {
            errors.push('traceEvents must be an array');
        }

        // Validate events
        for (let i = 0; i < trace.traceEvents.length; i++) {
            const event = trace.traceEvents[i];

            if (!event.name) {
                errors.push(`Event ${i}: missing name`);
            }

            if (!event.ph) {
                errors.push(`Event ${i}: missing phase (ph)`);
            }

            if (event.ts === undefined) {
                errors.push(`Event ${i}: missing timestamp (ts)`);
            }

            if (event.pid === undefined) {
                errors.push(`Event ${i}: missing process ID (pid)`);
            }

            if (event.tid === undefined) {
                errors.push(`Event ${i}: missing thread ID (tid)`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

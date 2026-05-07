export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface LogEntry {
  readonly level: Exclude<LogLevel, "silent">;
  readonly category: string;
  readonly message: string;
  readonly timestamp: number;
  readonly data?: unknown;
}

export type LogSink = (entry: LogEntry) => void;

const levelRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50
};

export class Logger {
  private readonly sinks = new Set<LogSink>();
  private readonly lastEmitted = new Map<string, number>();

  constructor(private level: LogLevel = "info") {}

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  addSink(sink: LogSink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  debug(category: string, message: string, data?: unknown): void {
    this.log("debug", category, message, data);
  }

  info(category: string, message: string, data?: unknown): void {
    this.log("info", category, message, data);
  }

  warn(category: string, message: string, data?: unknown): void {
    this.log("warn", category, message, data);
  }

  error(category: string, message: string, data?: unknown): void {
    this.log("error", category, message, data);
  }

  log(level: Exclude<LogLevel, "silent">, category: string, message: string, data?: unknown, rateLimitMs = 0): void {
    if (levelRank[level] < levelRank[this.level]) return;
    const key = `${level}:${category}:${message}`;
    const now = Date.now();
    if (rateLimitMs > 0 && now - (this.lastEmitted.get(key) ?? -Infinity) < rateLimitMs) return;
    this.lastEmitted.set(key, now);
    const entry: LogEntry = Object.freeze({ level, category, message, timestamp: now, data });
    for (const sink of [...this.sinks]) {
      try {
        sink(entry);
      } catch {
        this.sinks.delete(sink);
      }
    }
  }
}

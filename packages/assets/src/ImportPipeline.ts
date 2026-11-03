import { redactAssetMessage, redactAssetUrl } from "./AssetLoader";

export interface ImportPipelineContext {
  readonly url: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (event: ImportPipelineProgressEvent) => void;
}

export interface ImportStage<TInput = unknown, TOutput = TInput> {
  readonly name: string;
  canRun?(input: TInput, context: ImportPipelineContext): Promise<boolean> | boolean;
  run(input: TInput, context: ImportPipelineContext): Promise<TOutput> | TOutput;
  rollback?(output: TOutput, context: ImportPipelineContext): Promise<void> | void;
}

export type ImportPipelineProgressStatus = "started" | "skipped" | "completed" | "rollback-started" | "rollback-completed";

export interface ImportPipelineProgressEvent {
  readonly url: string;
  readonly stageName: string;
  readonly status: ImportPipelineProgressStatus;
}

/**
 * `result` settles promptly on cancellation. `settled` acknowledges that any
 * still-running stage has finished and all required rollback has completed;
 * it rejects if cleanup fails. A caller that controls a worker slot or other
 * resource must wait for that acknowledgement before reusing it.
 */
export interface ImportPipelineRun<T> {
  readonly result: Promise<T>;
  readonly settled: Promise<void>;
}

export interface ImportPipelineErrorOptions {
  readonly url: string;
  readonly stageName?: string;
  readonly cause?: unknown;
}

export class ImportPipelineError extends Error {
  readonly url: string;
  readonly stageName?: string;
  override readonly cause?: unknown;

  constructor(message: string, options: ImportPipelineErrorOptions) {
    super(redactAssetMessage(message, options.url));
    this.name = "ImportPipelineError";
    this.url = redactAssetUrl(options.url);
    this.stageName = options.stageName === undefined ? undefined : redactAssetMessage(options.stageName, options.url);
    this.cause = redactImportCause(options.cause, [options.url]);
  }
}

export class ImportPipeline {
  private readonly stages: ImportStage[] = [];

  addStage<TInput, TOutput>(stage: ImportStage<TInput, TOutput>): this {
    if (this.stages.some((existing) => existing.name === stage.name)) {
      throw new Error(`Import stage already exists: ${redactAssetMessage(stage.name)}`);
    }
    this.stages.push(stage as ImportStage);
    return this;
  }

  run<TInput, TOutput = unknown>(input: TInput, context: ImportPipelineContext): Promise<TOutput> {
    return this.start<TInput, TOutput>(input, context).result;
  }

  start<TInput, TOutput = unknown>(input: TInput, context: ImportPipelineContext): ImportPipelineRun<TOutput> {
    // Later configuration changes affect subsequent imports, not one already
    // running, and therefore cannot alter its cleanup sequence midway.
    const stages = this.stages.slice();
    const completed: Array<{ stage: ImportStage; output: unknown }> = [];
    let current: unknown = input;
    let stageName: string | undefined;
    let done = false;
    let resolveResult!: (value: TOutput) => void;
    let rejectResult!: (error: unknown) => void;
    const result = new Promise<TOutput>((resolve, reject) => {
      resolveResult = (value) => { if (!done) { done = true; resolve(value); } };
      rejectResult = (error) => { if (!done) { done = true; reject(error); } };
    });
    const abort = () => rejectResult(this.createAbortError(context, stageName));
    context.signal?.addEventListener("abort", abort, { once: true });
    if (context.signal?.aborted) abort();

    const settled = (async () => {
      try {
        for (const stage of stages) {
          stageName = stage.name;
          this.throwIfAborted(context, stageName);
          const canRun = stage.canRun ? await stage.canRun(current, context) : true;
          this.throwIfAborted(context, stageName);
          if (!canRun) {
            this.report(context, stageName, "skipped");
            this.throwIfAborted(context, stageName);
            continue;
          }
          this.report(context, stageName, "started");
          this.throwIfAborted(context, stageName);
          // Do not abandon the actual stage on cancellation: a late result is
          // still owned by this pipeline and must be rolled back first.
          current = await stage.run(current, context);
          completed.push({ stage, output: current });
          this.throwIfAborted(context, stageName);
          this.report(context, stageName, "completed");
          this.throwIfAborted(context, stageName);
        }
        this.throwIfAborted(context, stageName);
        resolveResult(current as TOutput);
      } catch (error) {
        const failures: unknown[] = [];
        // An aborted signal must not abort cleanup itself. Preserve the other
        // context fields for rollback without carrying that aborted signal.
        const cleanupContext: ImportPipelineContext = { ...context, signal: undefined };
        for (const entry of completed.reverse()) {
          if (!entry.stage.rollback) continue;
          this.report(context, entry.stage.name, "rollback-started");
          try {
            await entry.stage.rollback(entry.output, cleanupContext);
            this.report(context, entry.stage.name, "rollback-completed");
          } catch (rollbackError) {
            failures.push(new ImportPipelineError(`Import pipeline rollback failed at stage ${entry.stage.name} for ${context.url}`, {
              url: context.url, stageName: entry.stage.name, cause: rollbackError
            }));
          }
        }
        if (failures.length > 0) {
          const failure = new ImportPipelineError(`Import pipeline cleanup failed for ${context.url}`, {
            url: context.url, stageName,
            cause: new AggregateError([error, ...failures], "Import and cleanup failed")
          });
          rejectResult(failure);
          throw failure;
        }
        rejectResult(this.toPipelineError(error, context));
      } finally {
        context.signal?.removeEventListener("abort", abort);
      }
    })();
    // `run()` preserves its historical single-promise API. A late cleanup
    // failure remains observable through `start().settled` without creating
    // an unhandled rejection for legacy callers that only await `result`.
    void settled.catch(() => {});
    return { result, settled };
  }

  private throwIfAborted(context: ImportPipelineContext, stageName?: string): void {
    if (context.signal?.aborted) {
      throw this.createAbortError(context, stageName);
    }
  }

  private createAbortError(context: ImportPipelineContext, stageName?: string): ImportPipelineError {
    return new ImportPipelineError(
      stageName ? `Import pipeline aborted at stage ${stageName} for ${context.url}` : `Import pipeline aborted for ${context.url}`,
      { url: context.url, stageName, cause: context.signal?.reason }
    );
  }

  private toPipelineError(error: unknown, context: ImportPipelineContext): Error {
    const safeError = redactImportCause(error, [context.url]);
    if (safeError instanceof ImportPipelineError) return safeError;
    const description = safeError instanceof Error ? safeError.message : String(safeError);
    return new ImportPipelineError(`Import pipeline failed for ${context.url}: ${description}`, {
      url: context.url,
      cause: safeError
    });
  }

  private report(context: ImportPipelineContext, stageName: string, status: ImportPipelineProgressStatus): void {
    try { context.onProgress?.({ url: context.url, stageName, status }); } catch { /* Observers do not own the import. */ }
  }
}

function redactImportText(text: string, urls: readonly string[]): string {
  return urls.reduce((message, url) => redactAssetMessage(message, url), text);
}

function readErrorField(error: Error, key: string): unknown {
  try { return Reflect.get(error, key); } catch { return undefined; }
}

/**
 * Keep the error/aggregate shape needed to diagnose rollback without retaining
 * arbitrary exception objects, their original stacks, or private properties.
 */
export function redactImportCause(
  cause: unknown,
  urls: readonly string[],
  seen = new WeakSet<object>(),
  depth = 0
): unknown {
  if (typeof cause === "string") return redactImportText(cause, urls);
  if (cause === null || cause === undefined || typeof cause === "number" ||
      typeof cause === "boolean" || typeof cause === "bigint") return cause;
  if (typeof cause !== "object") return `[${typeof cause} cause omitted]`;

  try {
    if (!(cause instanceof Error)) return "[non-Error cause omitted]";
    if (seen.has(cause)) return "[circular cause]";
    if (depth >= 8) return "[nested cause omitted]";
    seen.add(cause);
    try {
      const sourceUrl = cause instanceof ImportPipelineError ? readErrorField(cause, "url") : undefined;
      const references = typeof sourceUrl === "string" && !urls.includes(sourceUrl) ? [...urls, sourceUrl] : urls;
      const rawMessage = readErrorField(cause, "message");
      const message = redactImportText(typeof rawMessage === "string" ? rawMessage : "[error details unavailable]", references);
      let copy: Error;
      if (cause instanceof AggregateError) {
        const errors = readErrorField(cause, "errors");
        copy = new AggregateError(
          Array.isArray(errors) ? errors.map((error) => redactImportCause(error, references, seen, depth + 1)) : ["[aggregate errors unavailable]"],
          message
        );
      } else if (cause instanceof ImportPipelineError) {
        const stageName = readErrorField(cause, "stageName");
        copy = new ImportPipelineError(message, {
          url: typeof sourceUrl === "string" ? sourceUrl : urls[0] ?? "",
          stageName: typeof stageName === "string" ? redactImportText(stageName, references) : undefined
        });
      } else if (cause instanceof TypeError) copy = new TypeError(message);
      else if (cause instanceof RangeError) copy = new RangeError(message);
      else if (cause instanceof ReferenceError) copy = new ReferenceError(message);
      else if (cause instanceof SyntaxError) copy = new SyntaxError(message);
      else if (cause instanceof URIError) copy = new URIError(message);
      else if (cause instanceof EvalError) copy = new EvalError(message);
      else copy = new Error(message);

      const name = readErrorField(cause, "name");
      if (typeof name === "string") copy.name = redactImportText(name, references);
      const status = readErrorField(cause, "status");
      if (typeof status === "number") Reflect.set(copy, "status", status);
      const code = readErrorField(cause, "code");
      if (typeof code === "string" || typeof code === "number") {
        Reflect.set(copy, "code", typeof code === "string" ? redactImportText(code, references) : code);
      }
      const nested = readErrorField(cause, "cause");
      if (nested !== undefined) {
        Object.defineProperty(copy, "cause", {
          value: redactImportCause(nested, references, seen, depth + 1),
          configurable: true, writable: true, enumerable: cause instanceof ImportPipelineError
        });
      }
      return copy;
    } finally {
      seen.delete(cause);
    }
  } catch {
    return "[cause unavailable]";
  }
}

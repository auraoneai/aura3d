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
    super(message);
    this.name = "ImportPipelineError";
    this.url = options.url;
    this.stageName = options.stageName;
    this.cause = options.cause;
  }
}

export class ImportPipeline {
  private readonly stages: ImportStage[] = [];

  addStage<TInput, TOutput>(stage: ImportStage<TInput, TOutput>): this {
    if (this.stages.some((existing) => existing.name === stage.name)) {
      throw new Error(`Import stage already exists: ${stage.name}`);
    }
    this.stages.push(stage as ImportStage);
    return this;
  }

  async run<TInput, TOutput = unknown>(input: TInput, context: ImportPipelineContext): Promise<TOutput> {
    const completed: Array<{ stage: ImportStage; output: unknown }> = [];
    let current: unknown = input;

    try {
      for (const stage of this.stages) {
        this.throwIfAborted(context, stage.name);

        if (stage.canRun && !(await this.withAbort(stage.canRun(current, context), context, stage.name))) {
          this.report(context, stage.name, "skipped");
          continue;
        }

        this.report(context, stage.name, "started");
        current = await this.withAbort(stage.run(current, context), context, stage.name);
        completed.push({ stage, output: current });
        this.throwIfAborted(context, stage.name);
        this.report(context, stage.name, "completed");
      }
      return current as TOutput;
    } catch (error) {
      for (const entry of completed.reverse()) {
        if (!entry.stage.rollback) {
          continue;
        }
        this.report(context, entry.stage.name, "rollback-started");
        try {
          await this.withAbort(entry.stage.rollback(entry.output, context), context, entry.stage.name);
          this.report(context, entry.stage.name, "rollback-completed");
        } catch (rollbackError) {
          throw new ImportPipelineError(`Import pipeline rollback failed at stage ${entry.stage.name} for ${context.url}`, {
            url: context.url,
            stageName: entry.stage.name,
            cause: rollbackError
          });
        }
      }
      throw this.toPipelineError(error, context);
    }
  }

  private async withAbort<T>(operation: Promise<T> | T, context: ImportPipelineContext, stageName: string): Promise<T> {
    if (!context.signal) {
      return operation;
    }
    this.throwIfAborted(context, stageName);

    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(this.createAbortError(context, stageName));
      context.signal?.addEventListener("abort", abort, { once: true });
      Promise.resolve(operation).then(
        (value) => {
          context.signal?.removeEventListener("abort", abort);
          resolve(value);
        },
        (error) => {
          context.signal?.removeEventListener("abort", abort);
          reject(error);
        }
      );
    });
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
    if (error instanceof ImportPipelineError) {
      return error;
    }
    if (error instanceof Error) {
      return new ImportPipelineError(`Import pipeline failed for ${context.url}: ${error.message}`, {
        url: context.url,
        cause: error
      });
    }
    return new ImportPipelineError(`Import pipeline failed for ${context.url}: ${String(error)}`, {
      url: context.url,
      cause: error
    });
  }

  private report(context: ImportPipelineContext, stageName: string, status: ImportPipelineProgressStatus): void {
    context.onProgress?.({ url: context.url, stageName, status });
  }
}

export class EngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class LifecycleError extends EngineError {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(`LIFECYCLE_${code}`, message, options);
  }
}

export class ValidationError extends EngineError {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(`VALIDATION_${code}`, message, options);
  }
}

export class ResourceError extends EngineError {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(`RESOURCE_${code}`, message, options);
  }
}

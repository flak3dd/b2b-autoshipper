export class AutomationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'AutomationError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class SupplierError extends AutomationError {
  constructor(message: string, details?: any) {
    super(message, 'SUPPLIER_ERROR', details);
    this.name = 'SupplierError';
  }
}

export class SyncError extends AutomationError {
  constructor(message: string, details?: any) {
    super(message, 'SYNC_ERROR', details);
    this.name = 'SyncError';
  }
}

export class FulfillmentError extends AutomationError {
  constructor(message: string, details?: any) {
    super(message, 'FULFILLMENT_ERROR', details);
    this.name = 'FulfillmentError';
  }
}

export class APIError extends AutomationError {
  constructor(message: string, public readonly statusCode: number, details?: any) {
    super(message, 'API_ERROR', details);
    this.name = 'APIError';
  }
}

export function handleAsyncError<T>(
  fn: () => Promise<T>,
  errorMessage: string = 'Operation failed'
): Promise<T> {
  return fn().catch((error) => {
    throw new AutomationError(errorMessage, 'ASYNC_ERROR', {
      originalError: error.message,
      stack: error.stack,
    });
  });
}
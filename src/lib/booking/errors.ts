export class BookingError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'BookingError';
  }
}

export class ConflictError extends BookingError {
  constructor(message = 'Selected dates conflict with an existing reservation') {
    super(message, 'BOOKING_CONFLICT');
    this.name = 'ConflictError';
  }
}

export class ValidationError extends BookingError {
  readonly issues: { path: string; message: string }[];
  constructor(issues: { path: string; message: string }[]) {
    super(`Validation failed: ${issues.map((i) => i.message).join(', ')}`, 'BOOKING_VALIDATION');
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

export class NotFoundError extends BookingError {
  constructor(what: string) {
    super(`${what} not found`, 'BOOKING_NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends BookingError {
  constructor(message = 'Forbidden') {
    super(message, 'BOOKING_FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * Plain, structured-cloneable representation of a domain error so it can cross
 * the Durable Object RPC boundary (Error subclasses don't survive structured
 * clone with their type). The DO serialises with {@link serializeDomainError};
 * the caller rebuilds the typed error with {@link deserializeDomainError} so
 * existing `instanceof` handling keeps working.
 */
export type DomainErrorPayload =
  | { kind: 'CONFLICT'; message: string }
  | { kind: 'VALIDATION'; message: string; issues: { path: string; message: string }[] }
  | { kind: 'NOT_FOUND'; message: string }
  | { kind: 'FORBIDDEN'; message: string }
  | { kind: 'BOOKING'; message: string; code: string }
  | { kind: 'UNKNOWN'; message: string };

export function serializeDomainError(err: unknown): DomainErrorPayload {
  if (err instanceof ValidationError) {
    return { kind: 'VALIDATION', message: err.message, issues: err.issues };
  }
  if (err instanceof ConflictError) return { kind: 'CONFLICT', message: err.message };
  if (err instanceof NotFoundError) return { kind: 'NOT_FOUND', message: err.message };
  if (err instanceof ForbiddenError) return { kind: 'FORBIDDEN', message: err.message };
  if (err instanceof BookingError) {
    return { kind: 'BOOKING', message: err.message, code: err.code };
  }
  return {
    kind: 'UNKNOWN',
    message: err instanceof Error ? err.message : 'Something went wrong',
  };
}

export function deserializeDomainError(payload: DomainErrorPayload): Error {
  switch (payload.kind) {
    case 'VALIDATION':
      return new ValidationError(payload.issues);
    case 'CONFLICT':
      return new ConflictError(payload.message);
    case 'NOT_FOUND': {
      // NotFoundError's constructor appends " not found"; preserve the original
      // message verbatim instead of reconstructing the subject.
      const e = new NotFoundError('Resource');
      e.message = payload.message;
      return e;
    }
    case 'FORBIDDEN':
      return new ForbiddenError(payload.message);
    case 'BOOKING':
      return new BookingError(payload.message, payload.code);
    default:
      return new Error(payload.message);
  }
}

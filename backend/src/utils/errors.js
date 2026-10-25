export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg = 'Bad request', code = 'BAD_REQUEST') => new AppError(400, code, msg);
export const unauthorized = (msg = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'Forbidden', code = 'FORBIDDEN') => new AppError(403, code, msg);
export const notFound = (msg = 'Not found') => new AppError(404, 'NOT_FOUND', msg);
export const conflict = (msg = 'Conflict', code = 'CONFLICT') => new AppError(409, code, msg);
export const unprocessable = (msg = 'Validation failed', details) => new AppError(422, 'VALIDATION_ERROR', msg, details);
export const unavailable = (msg = 'Service unavailable', code = 'SERVICE_UNAVAILABLE') => new AppError(503, code, msg);

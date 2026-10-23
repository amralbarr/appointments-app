import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

// one shape for every error response, see docs/API.md — whether it came
// from a Nest HttpException, a class-validator failure, or something we
// didn't anticipate at all (that last case is the only reason this isn't
// just a BaseExceptionFilter override).
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = isHttp ? exception.getResponse() : null;
    const message =
      body && typeof body === 'object' && 'message' in body
        ? (body as { message: unknown }).message
        : isHttp
          ? exception.message
          : 'Something went wrong on our end.';

    // the one real gap this filter had: an unanticipated (non-HttpException)
    // error was turned into a generic message and the real exception -
    // stack trace included - was never logged anywhere, making a real
    // production 500 undiagnosable from the server's own logs alone.
    // found for real: a live production chat request 500'd with nothing
    // useful in `pm2 logs` to explain why.
    if (!isHttp) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}: ${
          exception instanceof Error ? exception.message : String(exception)
        }`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message,
      path: request.url,
    });
  }
}

import { NextFunction, Request, Response } from "express";

export function notFoundHandler(
  _req: Request,
  res: Response
) {
  res.status(404).json({
    success: false,
    message: "The requested resource was not found."
  });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(error);

  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "An internal server error occurred."
        : error instanceof Error
          ? error.message
          : "Unknown server error."
  });
}
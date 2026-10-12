import { Response } from "express";

export function success(
  res: Response,
  data: unknown,
  status = 200
) {
  const flat =
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  return res.status(status).json({
    ...flat,
    success: true,
    data
  });
}

export function failure(
  res: Response,
  message: string,
  status = 400
) {
  return res.status(status).json({
    success: false,
    message
  });
}
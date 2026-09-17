import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFound(entity = "资源"): never {
  throw new AppError(404, "NOT_FOUND", `${entity}不存在或已被删除`);
}

export function conflict(message: string, details?: unknown): never {
  throw new AppError(409, "CONFLICT", message, details);
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "请求数据不符合接口要求",
          details: error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  const safeMessage =
    message.includes("D1 binding") || message.includes("no such table")
      ? "本地数据库尚未准备好，请先应用项目迁移"
      : "服务器暂时无法完成请求";

  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: safeMessage } },
    { status: 500 },
  );
}

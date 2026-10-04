export const CHAPTER_REQUEST_TIMEOUT_MS = 15_000;

export class RequestDeadlineError extends Error {
  constructor() {
    super("章节请求超时，保存结果可能未知；草稿仍在当前窗口，请勿关闭，可重试核实。");
    this.name = "RequestDeadlineError";
  }
}

/** Covers both response headers AND body consumption. Timeout is not rollback. */
export async function withRequestDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = CHAPTER_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new RequestDeadlineError());
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

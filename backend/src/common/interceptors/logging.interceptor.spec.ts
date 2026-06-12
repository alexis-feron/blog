import { CallHandler, ExecutionContext } from "@nestjs/common";
import { of, throwError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PinoLogger } from "nestjs-pino";
import { LoggingInterceptor } from "./logging.interceptor";

// ── Mocks ──────────────────────────────────────────────────────────────────

const makeLogger = () =>
  ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }) as unknown as PinoLogger & {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

const makeContext = (
  method: string,
  url: string,
  statusCode: number,
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ method, url, id: "req-1" }),
      getResponse: () => ({ statusCode }),
    }),
  }) as unknown as ExecutionContext;

const makeHandler = (observable = of({})) =>
  ({ handle: () => observable }) as CallHandler;

// ── Tests ──────────────────────────────────────────────────────────────────

describe("LoggingInterceptor", () => {
  let logger: ReturnType<typeof makeLogger>;
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    logger = makeLogger();
    interceptor = new LoggingInterceptor(logger);
    vi.clearAllMocks();
  });

  it("logs successful requests at info level", async () => {
    const ctx = makeContext("GET", "/posts", 200);

    await new Promise<void>((resolve) =>
      interceptor
        .intercept(ctx, makeHandler())
        .subscribe({ complete: resolve }),
    );

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: "/posts",
        statusCode: 200,
        requestId: "req-1",
      }),
      expect.any(String),
    );
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs 4xx client errors at warn level without a stack", async () => {
    const ctx = makeContext("GET", "/posts/unknown", 404);
    const handler = makeHandler(
      throwError(() => ({ status: 404, message: "Not Found", stack: "trace" })),
    );

    await new Promise<void>((resolve) =>
      interceptor.intercept(ctx, handler).subscribe({ error: () => resolve() }),
    );

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
    const [payload] = logger.warn.mock.calls[0];
    expect(payload).toMatchObject({ statusCode: 404, error: "Not Found" });
    expect(payload).not.toHaveProperty("stack");
  });

  it("logs 5xx server errors at error level with the stack", async () => {
    const ctx = makeContext("POST", "/posts", 500);
    const handler = makeHandler(
      throwError(() =>
        Object.assign(new Error("boom"), { stack: "stacktrace" }),
      ),
    );

    await new Promise<void>((resolve) =>
      interceptor.intercept(ctx, handler).subscribe({ error: () => resolve() }),
    );

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
    const [payload] = logger.error.mock.calls[0];
    expect(payload).toMatchObject({ statusCode: 500, error: "boom" });
    expect(payload).toHaveProperty("stack", "stacktrace");
  });

  it("defaults to status 500 when the error carries no status", async () => {
    const ctx = makeContext("PUT", "/posts/1", 200);
    const handler = makeHandler(throwError(() => ({ message: "weird" })));

    await new Promise<void>((resolve) =>
      interceptor.intercept(ctx, handler).subscribe({ error: () => resolve() }),
    );

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][0]).toMatchObject({ statusCode: 500 });
  });
});

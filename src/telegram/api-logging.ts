import { danger } from "../globals.js";
import { formatErrorMessage } from "../infra/errors.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { RuntimeEnv } from "../runtime.js";

export type TelegramApiLogger = (message: string) => void;
type TelegramApiErrorStatusHandler = (args: {
  operation: string;
  err: unknown;
  accountId?: string;
}) => void;

type TelegramApiLoggingParams<T> = {
  operation: string;
  fn: () => Promise<T>;
  runtime?: RuntimeEnv;
  logger?: TelegramApiLogger;
  shouldLog?: (err: unknown) => boolean;
};

const fallbackLogger = createSubsystemLogger("telegram/api");
const REPORT_STATUS_CALLBACK = "setTelegramApiErrorStatus" as const;

function resolveTelegramApiLogger(runtime?: RuntimeEnv, logger?: TelegramApiLogger) {
  if (logger) {
    return logger;
  }
  if (runtime?.error) {
    return runtime.error;
  }
  return (message: string) => fallbackLogger.error(message);
}

function resolveTelegramApiErrorStatus(
  runtime?: RuntimeEnv &
    Partial<Record<typeof REPORT_STATUS_CALLBACK, TelegramApiErrorStatusHandler>>,
): TelegramApiErrorStatusHandler | undefined {
  const handler = runtime?.[REPORT_STATUS_CALLBACK];
  return typeof handler === "function" ? handler : undefined;
}

export async function withTelegramApiErrorLogging<T>({
  operation,
  fn,
  runtime,
  logger,
  shouldLog,
}: TelegramApiLoggingParams<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    resolveTelegramApiErrorStatus(runtime)?.({ operation, err });
    if (!shouldLog || shouldLog(err)) {
      const errText = formatErrorMessage(err);
      const log = resolveTelegramApiLogger(runtime, logger);
      log(danger(`telegram ${operation} failed: ${errText}`));
    }
    throw err;
  }
}

export type LogLevel = "debug" | "info" | "warn" | "error";

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getCurrentLevel(): LogLevel {
  if (typeof window !== "undefined") {
    return (process.env.NEXT_PUBLIC_LOG_LEVEL as LogLevel) || "info";
  }
  return (process.env.LOG_LEVEL as LogLevel) || "info";
}

function shouldLog(messageLevel: LogLevel) {
  return levelPriority[messageLevel] >= levelPriority[getCurrentLevel()];
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (shouldLog("debug")) console.debug("[DEBUG]", ...args);
  },
  info: (...args: unknown[]) => {
    if (shouldLog("info")) console.info("[INFO]", ...args);
  },
  warn: (...args: unknown[]) => {
    if (shouldLog("warn")) console.warn("[WARN]", ...args);
  },
  error: (...args: unknown[]) => {
    if (shouldLog("error")) console.error("[ERROR]", ...args);
  },
};

export default logger; 
export type LogLevel = "debug" | "info" | "warn" | "error";

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

interface LogEntry {
  timestamp: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  message: string;
  context?: any;
  userId?: string;
  sessionId?: string;
  url?: string;
  userAgent?: string;
}

class FrontendLogger {
  private sessionId: string;
  private logBuffer: LogEntry[] = [];
  private maxBufferSize = 100;
  private flushInterval = 30000; // 30 seconds
  private lastFlush = Date.now();

  constructor() {
    this.sessionId = this.generateSessionId();
    
    // Periodic flush of logs
    if (typeof window !== "undefined") {
      setInterval(() => this.flush(), this.flushInterval);
      
      // Flush logs before page unload
      window.addEventListener("beforeunload", () => this.flush());
      
      // Flush logs when page becomes hidden
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          this.flush();
        }
      });
    }
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getCurrentUser(): string | undefined {
    if (typeof window === "undefined") return undefined;
    try {
      const user = localStorage.getItem("user");
      return user ? JSON.parse(user).id?.toString() : undefined;
    } catch {
      return undefined;
    }
  }

  private createLogEntry(level: LogEntry["level"], message: string, context?: any): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      userId: this.getCurrentUser(),
      sessionId: this.sessionId,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      userAgent: typeof window !== "undefined" ? navigator.userAgent : undefined,
    };
  }

  private addToBuffer(entry: LogEntry) {
    this.logBuffer.push(entry);
    
    // Keep buffer size manageable
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
    }

    // Auto-flush on error or if buffer is getting full
    if (entry.level === "ERROR" || this.logBuffer.length >= this.maxBufferSize * 0.8) {
      this.flush();
    }
  }

  private async flush() {
    if (this.logBuffer.length === 0 || Date.now() - this.lastFlush < 5000) {
      return; // Don't flush too frequently
    }

    const logsToSend = [...this.logBuffer];
    this.logBuffer = [];
    this.lastFlush = Date.now();

    // Send logs to backend (implement this endpoint if needed)
    try {
      if (typeof window !== "undefined" && process.env.NODE_ENV === "production") {
        await fetch("/api/logs/frontend", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ logs: logsToSend }),
        }).catch(() => {}); // Silently fail if logging endpoint doesn't exist
      }
    } catch {
      // Silently fail - logging shouldn't break the app
    }

    // Also store in sessionStorage for debugging
    try {
      const existingLogs = JSON.parse(sessionStorage.getItem("app_logs") || "[]");
      const allLogs = [...existingLogs, ...logsToSend].slice(-200); // Keep last 200 logs
      sessionStorage.setItem("app_logs", JSON.stringify(allLogs));
    } catch {
      // Silently fail
    }
  }

  debug(message: string, context?: any) {
    if (this.shouldLog("debug")) {
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, context);
      this.addToBuffer(this.createLogEntry("DEBUG", message, context));
    }
  }

  info(message: string, context?: any) {
    if (this.shouldLog("info")) {
      console.info(`[INFO] ${new Date().toISOString()} - ${message}`, context);
      this.addToBuffer(this.createLogEntry("INFO", message, context));
    }
  }

  warn(message: string, context?: any) {
    if (this.shouldLog("warn")) {
      console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, context);
      this.addToBuffer(this.createLogEntry("WARN", message, context));
    }
  }

  error(message: string, context?: any) {
    if (this.shouldLog("error")) {
      console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, context);
      this.addToBuffer(this.createLogEntry("ERROR", message, context));
    }
  }

  private shouldLog(messageLevel: LogLevel): boolean {
    const currentLevel = this.getCurrentLevel();
    return levelPriority[messageLevel] >= levelPriority[currentLevel];
  }

  private getCurrentLevel(): LogLevel {
    if (typeof window !== "undefined") {
      return (process.env.NEXT_PUBLIC_LOG_LEVEL as LogLevel) || "info";
    }
    return (process.env.LOG_LEVEL as LogLevel) || "info";
  }

  // Method to get logs for debugging
  getLogs(): LogEntry[] {
    try {
      return JSON.parse(sessionStorage.getItem("app_logs") || "[]");
    } catch {
      return [];
    }
  }

  // Method to clear logs
  clearLogs() {
    this.logBuffer = [];
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("app_logs");
    }
  }
}

const createLogger = () => {
  if (typeof window === "undefined") {
    // Server-side logging (during SSR)
    return {
      debug: (message: string, context?: any) => console.debug("[DEBUG]", message, context),
      info: (message: string, context?: any) => console.info("[INFO]", message, context),
      warn: (message: string, context?: any) => console.warn("[WARN]", message, context),
      error: (message: string, context?: any) => console.error("[ERROR]", message, context),
      getLogs: () => [],
      clearLogs: () => {},
    };
  }

  return new FrontendLogger();
};

export const logger = createLogger();
export default logger;
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
      // Prefer localStorage (shared across tabs), fallback to sessionStorage for backward compatibility
      const user = localStorage.getItem("user") || sessionStorage.getItem("user");
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

    // Send logs to file-based backend
    try {
      if (typeof window !== "undefined") {
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
      this.addToBuffer(this.createLogEntry("DEBUG", message, context));
    }
  }

  info(message: string, context?: any) {
    if (this.shouldLog("info")) {
      this.addToBuffer(this.createLogEntry("INFO", message, context));
    }
  }

  warn(message: string, context?: any) {
    if (this.shouldLog("warn")) {
      this.addToBuffer(this.createLogEntry("WARN", message, context));
    }
  }

  error(message: string, context?: any) {
    if (this.shouldLog("error")) {
      this.addToBuffer(this.createLogEntry("ERROR", message, context));
    }
  }

  // Enhanced logging methods for specific use cases
  navigation(from: string, to: string, context?: any) {
    this.info(`Navigation: ${from} → ${to}`, { from, to, ...context });
  }

  userAction(action: string, component: string, context?: any) {
    this.info(`User Action: ${action} in ${component}`, { action, component, ...context });
  }

  apiRequest(method: string, url: string, context?: any) {
    this.debug(`API Request: ${method.toUpperCase()} ${url}`, { method, url, ...context });
  }

  apiResponse(method: string, url: string, status: number, duration?: number, context?: any) {
    const statusEmoji = status >= 400 ? '❌' : status >= 300 ? '⚠️' : '✅';
    const durationText = duration ? ` (${duration}ms)` : '';
    this.debug(`API Response: ${statusEmoji} ${method.toUpperCase()} ${url} ${status}${durationText}`, 
      { method, url, status, duration, ...context });
  }

  performance(metric: string, value: number, context?: any) {
    this.debug(`Performance: ${metric} = ${value}ms`, { metric, value, ...context });
  }

  private shouldLog(messageLevel: LogLevel): boolean {
    const currentLevel = this.getCurrentLevel();
    return levelPriority[messageLevel] >= levelPriority[currentLevel];
  }

  private getCurrentLevel(): LogLevel {
    // Set debug level in development, info in production
    if (typeof window !== "undefined") {
      return process.env.NODE_ENV === "development" ? "debug" : "info";
    }
    return process.env.NODE_ENV === "development" ? "debug" : "info";
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

  // Method to export logs as JSON for debugging
  exportLogs(): void {
    if (typeof window === "undefined") return;
    
    const logs = this.getLogs();
    const dataStr = JSON.stringify(logs, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `frontend_logs_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    URL.revokeObjectURL(link.href);
  }

  // Method to get recent error logs
  getRecentErrors(minutes: number = 10): LogEntry[] {
    const logs = this.getLogs();
    const cutoff = Date.now() - (minutes * 60 * 1000);
    
    return logs.filter(log => 
      log.level === "ERROR" && 
      new Date(log.timestamp).getTime() > cutoff
    );
  }

  // Method to print debug info to console
  printDebugInfo(): void {
    if (typeof window === "undefined") return;
    
    const logs = this.getLogs();
    const recentErrors = this.getRecentErrors();
    const bufferSize = this.logBuffer.length;
    
    console.group("🔍 Frontend Logger Debug Info");
    console.log("📊 Total stored logs:", logs.length);
    console.log("📦 Current buffer size:", bufferSize);
    console.log("🔴 Recent errors (last 10 min):", recentErrors.length);
    console.log("🆔 Session ID:", this.sessionId);
    
    if (recentErrors.length > 0) {
      console.group("Recent Errors:");
      recentErrors.forEach(error => {
        console.error(`[${error.timestamp}] ${error.message}`, error.context);
      });
      console.groupEnd();
    }
    
    console.log("💡 Commands available:");
    console.log("- logger.exportLogs() - Download logs as JSON");
    console.log("- logger.clearLogs() - Clear all logs");
    console.log("- logger.getLogs() - Get all logs array");
    console.log("- logger.getRecentErrors(minutes) - Get recent errors");
    console.groupEnd();
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
      navigation: (from: string, to: string, context?: any) => console.info("[NAVIGATION]", `${from} → ${to}`, context),
      userAction: (action: string, component: string, context?: any) => console.info("[USER_ACTION]", `${action} in ${component}`, context),
      apiRequest: (method: string, url: string, context?: any) => console.debug("[API_REQUEST]", `${method} ${url}`, context),
      apiResponse: (method: string, url: string, status: number, duration?: number, context?: any) => console.debug("[API_RESPONSE]", `${method} ${url} ${status}`, context),
      performance: (metric: string, value: number, context?: any) => console.debug("[PERFORMANCE]", `${metric} = ${value}ms`, context),
      getLogs: () => [],
      clearLogs: () => {},
      exportLogs: () => {},
      getRecentErrors: () => [],
      printDebugInfo: () => {},
    };
  }

  return new FrontendLogger();
};

export const logger = createLogger();

// Make logger globally available for debugging in development
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  (window as any).logger = logger;
  
  // Log performance metrics periodically in development
  if ('performance' in window) {
    setInterval(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation) {
        logger.performance('Page Load Time', navigation.loadEventEnd - navigation.fetchStart);
        logger.performance('DOM Content Loaded', navigation.domContentLoadedEventEnd - navigation.fetchStart);
        logger.performance('First Contentful Paint', navigation.loadEventEnd - navigation.fetchStart);
      }
    }, 60000); // Every minute
  }
}

export default logger;

import fs from 'fs';
import path from 'path';

export type LogLevel = "debug" | "info" | "warn" | "error";

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

class FileLogger {
  private sessionId: string;
  private logsDir: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.logsDir = path.join(process.cwd(), 'logs');
    
    // Ensure logs directory exists
    this.ensureLogsDirectory();
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private ensureLogsDirectory() {
    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create logs directory:', error);
    }
  }

  private getLogFileName(): string {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    return path.join(this.logsDir, `frontend_${today}.log`);
  }

  private getCurrentUser(): string | undefined {
    // In server-side context, we can't access localStorage/sessionStorage
    // This would need to be passed from the client or stored differently
    return undefined;
  }

  private createLogEntry(level: LogEntry["level"], message: string, context?: any): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      userId: this.getCurrentUser(),
      sessionId: this.sessionId,
      url: undefined, // Would need to be passed from client
      userAgent: undefined, // Would need to be passed from client
    };
  }

  private writeToFile(entry: LogEntry) {
    try {
      const logFileName = this.getLogFileName();
      const logLine = `${entry.timestamp} [${entry.level}] ${entry.message}${entry.context ? ' ' + JSON.stringify(entry.context) : ''}\n`;
      
      fs.appendFileSync(logFileName, logLine, 'utf8');
    } catch (error) {
      // Fallback to console if file writing fails
      console.error('Failed to write to log file:', error);
      console.log(`[${entry.level}] ${entry.timestamp} - ${entry.message}`, entry.context);
    }
  }

  debug(message: string, context?: any) {
    const entry = this.createLogEntry("DEBUG", message, context);
    this.writeToFile(entry);
  }

  info(message: string, context?: any) {
    const entry = this.createLogEntry("INFO", message, context);
    this.writeToFile(entry);
  }

  warn(message: string, context?: any) {
    const entry = this.createLogEntry("WARN", message, context);
    this.writeToFile(entry);
  }

  error(message: string, context?: any) {
    const entry = this.createLogEntry("ERROR", message, context);
    this.writeToFile(entry);
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
    const statusEmoji = status >= 400 ? 'ERROR' : status >= 300 ? 'WARN' : 'SUCCESS';
    const durationText = duration ? ` (${duration}ms)` : '';
    this.debug(`API Response: ${statusEmoji} ${method.toUpperCase()} ${url} ${status}${durationText}`, 
      { method, url, status, duration, ...context });
  }

  performance(metric: string, value: number, context?: any) {
    this.debug(`Performance: ${metric} = ${value}ms`, { metric, value, ...context });
  }

  // Method to clean up old log files (keep last 30 days)
  cleanupOldLogs(daysToKeep: number = 30) {
    try {
      const files = fs.readdirSync(this.logsDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      files.forEach(file => {
        if (file.startsWith('frontend_') && file.endsWith('.log')) {
          const dateMatch = file.match(/frontend_(\d{4}-\d{2}-\d{2})\.log/);
          if (dateMatch) {
            const fileDate = new Date(dateMatch[1]);
            if (fileDate < cutoffDate) {
              const filePath = path.join(this.logsDir, file);
              fs.unlinkSync(filePath);
              this.info(`Cleaned up old log file: ${file}`);
            }
          }
        }
      });
    } catch (error) {
      this.error('Failed to cleanup old logs', { error: error.message });
    }
  }
}

// Create and export the file logger instance
export const fileLogger = new FileLogger();

// Clean up old logs on startup
fileLogger.cleanupOldLogs();

export default fileLogger;

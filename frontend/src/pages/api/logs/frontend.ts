import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

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

class ServerLogger {
  private logsDir: string;

  constructor() {
    this.logsDir = path.join(process.cwd(), 'logs');
    this.ensureLogsDirectory();
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
    // Use local date for file rotation (YYYY-MM-DD)
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const todayLocal = `${yyyy}-${mm}-${dd}`;
    return path.join(this.logsDir, `frontend_${todayLocal}.log`);
  }

  writeLog(entry: LogEntry) {
    try {
      const logFileName = this.getLogFileName();
      const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
      const logLine = `${entry.timestamp} [${entry.level}] ${entry.message}${contextStr}\n`;
      
      fs.appendFileSync(logFileName, logLine, 'utf8');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  writeLogs(entries: LogEntry[]) {
    entries.forEach(entry => this.writeLog(entry));
  }
}

const serverLogger = new ServerLogger();

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { logs } = req.body;

    if (!Array.isArray(logs)) {
      return res.status(400).json({ error: 'Invalid logs format' });
    }

    // Write logs to file
    serverLogger.writeLogs(logs);

    res.status(200).json({ success: true, message: 'Logs written successfully' });
  } catch (error) {
    console.error('Error writing logs:', error);
    res.status(500).json({ error: 'Failed to write logs' });
  }
}

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m",   // gray
  info: "\x1b[36m",    // cyan
  warn: "\x1b[33m",    // yellow
  error: "\x1b[31m",   // red
};

const RESET = "\x1b[0m";

class Logger {
  private minLevel: LogLevel;

  constructor(level: LogLevel = "info") {
    this.minLevel = level;
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.minLevel];
  }

  private format(level: LogLevel, message: string, context?: string): string {
    const timestamp = new Date().toISOString();
    const color = LEVEL_COLORS[level];
    const tag = level.toUpperCase().padEnd(5);
    const prefix = context ? `[${context}] ` : "";
    return `${color}${timestamp} ${tag}${RESET} ${prefix}${message}`;
  }

  debug(message: string, context?: string): void {
    if (this.shouldLog("debug")) {
      console.debug(this.format("debug", message, context));
    }
  }

  info(message: string, context?: string): void {
    if (this.shouldLog("info")) {
      console.info(this.format("info", message, context));
    }
  }

  warn(message: string, context?: string): void {
    if (this.shouldLog("warn")) {
      console.warn(this.format("warn", message, context));
    }
  }

  error(message: string, context?: string): void {
    if (this.shouldLog("error")) {
      console.error(this.format("error", message, context));
    }
  }
}

/**
 * Singleton logger instance.
 *
 * Level is configured via the LOG_LEVEL env var (defaults to "info").
 * Import and use directly: `logger.info("message", "ModuleName")`
 */
export const logger = new Logger(
  (process.env["LOG_LEVEL"] as LogLevel | undefined) ?? "info",
);

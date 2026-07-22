/**
 * Structured logging utility for server-side actions, API routes, and cron pipelines.
 */
export interface LogContext {
  [key: string]: unknown;
}

export const logger = {
  info(message: string, context?: LogContext): void {
    if (context) {
      console.log(`[INFO] ${message}`, JSON.stringify(context));
    } else {
      console.log(`[INFO] ${message}`);
    }
  },

  warn(message: string, context?: LogContext): void {
    if (context) {
      console.warn(`[WARN] ${message}`, JSON.stringify(context));
    } else {
      console.warn(`[WARN] ${message}`);
    }
  },

  error(message: string, context?: LogContext): void {
    if (context) {
      console.error(`[ERROR] ${message}`, JSON.stringify(context));
    } else {
      console.error(`[ERROR] ${message}`);
    }
  },

  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'production') {
      if (context) {
        console.debug(`[DEBUG] ${message}`, JSON.stringify(context));
      } else {
        console.debug(`[DEBUG] ${message}`);
      }
    }
  },
};

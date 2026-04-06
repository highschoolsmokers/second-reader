type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

let requestCounter = 0;

export function createRequestId(): string {
  return `req_${Date.now()}_${++requestCounter}`;
}

function formatMessage(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  return JSON.stringify(entry);
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) return;
  // MCP stdio servers must log to stderr to avoid corrupting the protocol stream
  console.error(formatMessage(level, message, context));
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => log('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
};

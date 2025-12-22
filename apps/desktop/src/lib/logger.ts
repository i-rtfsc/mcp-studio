import { invoke } from '@tauri-apps/api/core';

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

interface LogPayload {
  level: LogLevel;
  message: string;
  target?: string;
  fields?: Record<string, unknown>;
  file?: string;
  line?: number;
}

class LoggerService {
  private static instance: LoggerService;

  private constructor() {}

  public static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  private getConsoleStyle(level: LogLevel): string {
    switch (level) {
      case 'trace':
        return 'color: #999';
      case 'debug':
        return 'color: #3b82f6';
      case 'info':
        return 'color: #22c55e';
      case 'warn':
        return 'color: #eab308';
      case 'error':
        return 'color: #ef4444; font-weight: bold';
      default:
        return '';
    }
  }

  private async sendToBackend(payload: LogPayload) {
    try {
      await invoke('log_frontend_message', { payload });
    } catch (error) {
      // Prevent infinite loops if logging fails
      console.error('Failed to send log to backend:', error);
    }
  }

  public async log(
    level: LogLevel,
    message: string,
    meta?: { target?: string; fields?: Record<string, unknown> }
  ) {
    // 1. Browser Console (Dev friendly)
    if (import.meta.env.DEV) {
      const style = this.getConsoleStyle(level);
      const timestamp = new Date().toLocaleTimeString();
      console.log(`%c${timestamp} [${level.toUpperCase()}] ${message}`, style, meta?.fields || '');
    }

    // 2. Send to Rust (Production storage)
    await this.sendToBackend({
      level,
      message,
      target: meta?.target,
      fields: meta?.fields,
    });
  }

  public trace(message: string, meta?: { target?: string; fields?: Record<string, unknown> }) {
    this.log('trace', message, meta);
  }

  public debug(message: string, meta?: { target?: string; fields?: Record<string, unknown> }) {
    this.log('debug', message, meta);
  }

  public info(message: string, meta?: { target?: string; fields?: Record<string, unknown> }) {
    this.log('info', message, meta);
  }

  public warn(message: string, meta?: { target?: string; fields?: Record<string, unknown> }) {
    this.log('warn', message, meta);
  }

  public error(message: string, meta?: { target?: string; fields?: Record<string, unknown> }) {
    this.log('error', message, meta);
  }
}

export const logger = LoggerService.getInstance();

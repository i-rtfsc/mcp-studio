// Type definitions for Backend Events
// Must match domain/events.rs

export type AppEvent =
  | { event: 'config:changed'; payload: { key: string; value: string } }
  | { event: 'mcp:connection_lost'; payload: McpConnectionLostPayload };
// | { event: 'download:progress'; payload: { id: string; progress: number } }

export type EventName = AppEvent['event'];

export type EventPayload<T extends EventName> = Extract<AppEvent, { event: T }>['payload'];

// MCP Connection Events
export interface McpConnectionLostPayload {
  server_id: string;
  status: string;
  error: string;
  reason?: string;
}

-- MCP Studio Database Schema
-- This is the single source of truth for the database schema
-- Note: Connection status and tools are NOT persisted - they are runtime data only

-- System Settings (Key-Value Store for app preferences)
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- MCP Servers table (only configuration, no runtime state)
CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    server_type TEXT NOT NULL DEFAULT 'sse',  -- 'sse', 'stdio', 'streamable_http'
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- MCP Call History
CREATE TABLE IF NOT EXISTS mcp_call_history (
    id TEXT PRIMARY KEY NOT NULL,
    server_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    input_params TEXT,  -- JSON string
    output_result TEXT,  -- JSON string (raw response)
    status TEXT NOT NULL,  -- 'success', 'error'
    error_message TEXT,
    duration_ms INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
);

-- HTTP Received Messages
CREATE TABLE IF NOT EXISTS http_received_messages (
    id TEXT PRIMARY KEY NOT NULL,
    request_id TEXT NOT NULL,
    content_type TEXT,
    file_name TEXT,
    file_path TEXT,  -- local storage path
    file_size INTEGER,
    raw_data TEXT,  -- base64 encoded for small files or JSON metadata
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_mcp_call_history_server_id ON mcp_call_history(server_id);
CREATE INDEX IF NOT EXISTS idx_mcp_call_history_created_at ON mcp_call_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_http_received_messages_request_id ON http_received_messages(request_id);
CREATE INDEX IF NOT EXISTS idx_http_received_messages_created_at ON http_received_messages(created_at DESC);

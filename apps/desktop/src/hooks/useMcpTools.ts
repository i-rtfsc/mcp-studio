import { invoke } from '@tauri-apps/api/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Types
export interface McpTool {
  id: string;
  server_id: string;
  name: string;
  description: string | null;
  input_schema: string | null; // JSON string
  output_schema: string | null; // JSON string
  extra: string | null; // JSON string (annotations, _meta, etc.)
  created_at: string;
}

export interface McpToolsListResult {
  tools: McpTool[];
  raw_response: string; // Raw JSON for debugging
}

export interface McpToolCallResult {
  success: boolean;
  raw_response: string; // Raw JSON for debugging
  result: unknown | null;
  error: string | null;
  duration_ms: number;
}

export interface McpCallHistory {
  id: string;
  server_id: string;
  tool_name: string;
  input_params: string | null;
  output_result: string | null;
  status: 'success' | 'error';
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

export function useMcpTools(serverId: string | null) {
  const queryClient = useQueryClient();

  // Get cached tools from database
  const {
    data: tools,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['mcp-tools', serverId],
    queryFn: async () => {
      if (!serverId) return [];
      return await invoke<McpTool[]>('get_mcp_tools', { serverId });
    },
    enabled: !!serverId,
  });

  // Refresh tools from server (fetches fresh list and caches)
  const refreshTools = useMutation({
    mutationFn: async (serverId: string) => {
      return await invoke<McpToolsListResult>('refresh_mcp_tools', { serverId });
    },
    onSuccess: (_, serverId) => {
      queryClient.invalidateQueries({ queryKey: ['mcp-tools', serverId] });
    },
  });

  // Call a tool
  const callTool = useMutation({
    mutationFn: async ({
      serverId,
      toolName,
      params,
    }: {
      serverId: string;
      toolName: string;
      params?: Record<string, unknown>;
    }) => {
      return await invoke<McpToolCallResult>('call_mcp_tool', {
        serverId,
        toolName,
        params: params || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-call-history'] });
    },
  });

  // Export tools as JSON
  const exportToolsJson = async (serverId: string): Promise<string> => {
    return await invoke<string>('export_mcp_tools_json', { serverId });
  };

  return {
    tools,
    isLoading,
    error,
    refetch,
    refreshTools,
    callTool,
    exportToolsJson,
  };
}

export function useMcpCallHistory(serverId?: string, limit?: number) {
  const {
    data: history,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['mcp-call-history', serverId, limit],
    queryFn: async () => {
      return await invoke<McpCallHistory[]>('get_mcp_call_history', {
        serverId: serverId || null,
        limit: limit || null,
      });
    },
  });

  return {
    history,
    isLoading,
    error,
    refetch,
  };
}

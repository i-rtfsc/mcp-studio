import { useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import { McpConnectionLostPayload } from '@/lib/events';

// Types
export interface McpServer {
  id: string;
  name: string;
  url: string;
  server_type: 'sse' | 'streamable_http' | 'stdio';
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMcpServerCmd {
  name: string;
  url: string;
  server_type?: 'sse' | 'streamable_http' | 'stdio';
}

export interface UpdateMcpServerCmd {
  id: string;
  name: string;
  url: string;
  server_type?: 'sse' | 'streamable_http' | 'stdio';
}

export function useMcpServers() {
  const queryClient = useQueryClient();

  const { data: servers, isLoading, error, refetch } = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: async () => {
      return await invoke<McpServer[]>('list_mcp_servers');
    },
  });

  // Listen for connection lost events
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      try {
        unlisten = await listen<McpConnectionLostPayload>('mcp:connection_lost', async (event) => {
          const { server_id, error: errorMsg, status } = event.payload;
          logger.warn('MCP connection lost', { fields: { server_id, error: errorMsg } });

          // Optimistically update cached server status so UI reflects disconnect immediately
          queryClient.setQueryData<McpServer[] | undefined>(
            ['mcp-servers'],
            (current) =>
              current?.map((server) =>
                server.id === server_id
                  ? {
                      ...server,
                      status: (status as McpServer['status']) || 'disconnected',
                      last_error: errorMsg,
                    }
                  : server,
              ) || current,
          );

          // Update database status
          try {
            await invoke('mark_mcp_server_disconnected', {
              id: server_id,
              error: errorMsg,
            });
          } catch (e) {
            logger.error('Failed to mark server as disconnected', { fields: { error: e } });
          }

          // Refresh server list
          queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
        });
      } catch (e) {
        logger.error('Failed to listen to mcp:connection_lost event', { fields: { error: e } });
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [queryClient]);

  const createServer = useMutation({
    mutationFn: async (cmd: CreateMcpServerCmd) => {
      return await invoke<McpServer>('create_mcp_server', { cmd });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
    },
  });

  const updateServer = useMutation({
    mutationFn: async (cmd: UpdateMcpServerCmd) => {
      return await invoke<McpServer>('update_mcp_server', { cmd });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
    },
  });

  const deleteServer = useMutation({
    mutationFn: async (id: string) => {
      await invoke('delete_mcp_server', { id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
    },
  });

  const connectServer = useMutation({
    mutationFn: async (id: string) => {
      return await invoke<McpServer>('connect_mcp_server', { id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
    },
  });

  const disconnectServer = useMutation({
    mutationFn: async (id: string) => {
      return await invoke<McpServer>('disconnect_mcp_server', { id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
    },
  });

  // Reconnect a disconnected server
  const reconnectServer = useCallback(async (id: string) => {
    logger.info('Attempting to reconnect server', { fields: { server_id: id } });
    return connectServer.mutateAsync(id);
  }, [connectServer]);

  return {
    servers,
    isLoading,
    error,
    refetch,
    createServer,
    updateServer,
    deleteServer,
    connectServer,
    disconnectServer,
    reconnectServer,
  };
}

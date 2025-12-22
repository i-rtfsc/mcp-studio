import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';

// Types
export interface HttpReceivedMessage {
  id: string;
  request_id: string;
  content_type: string | null;
  file_name: string | null;
  file_path: string | null;
  file_size: number | null;
  raw_data: string | null;
  created_at: string;
}

export function useHttpReceiver() {
  const queryClient = useQueryClient();

  // Check server status
  const {
    data: status,
    isLoading: isStatusLoading,
    refetch: checkStatus,
  } = useQuery({
    queryKey: ['http-server-status'],
    queryFn: async () => {
      const running = await invoke<boolean>('is_http_server_running');
      const currentPort = await invoke<number>('get_http_server_port');
      const localIp = await invoke<string | null>('get_local_ip_address');
      return { running, port: currentPort, localIp };
    },
  });

  const isRunning = status?.running ?? false;
  const port = status?.port ?? 9527;
  const localIp = status?.localIp ?? null;

  // List received messages
  const {
    data: messages,
    isLoading: isMessagesLoading,
    error,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: ['http-received-messages'],
    queryFn: async () => {
      return await invoke<HttpReceivedMessage[]>('list_http_received_messages', {
        limit: 100,
      });
    },
  });

  // Auto-refresh when backend emits new webhook events
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    listen('http-receiver:new-message', () => {
      refetchMessages();
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => {
        console.error('Failed to listen for webhook events', err);
      });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [refetchMessages]);

  // Start server
  const startServer = useMutation({
    mutationFn: async (port: number) => {
      const actualPort = await invoke<number>('start_http_server', { port });
      return actualPort;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['http-server-status'] });
    },
  });

  // Stop server
  const stopServer = useMutation({
    mutationFn: async () => {
      await invoke('stop_http_server');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['http-server-status'] });
    },
  });

  // Delete message
  const deleteMessage = useMutation({
    mutationFn: async (id: string) => {
      await invoke('delete_http_received_message', { id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['http-received-messages'] });
    },
  });

  // Refresh messages
  const refreshMessages = useCallback(async () => {
    await Promise.all([refetchMessages(), checkStatus()]);
  }, [refetchMessages, checkStatus]);

  return {
    isRunning,
    port,
    localIp,
    messages,
    isLoading: isStatusLoading || isMessagesLoading,
    error,
    startServer,
    stopServer,
    deleteMessage,
    refreshMessages,
    checkStatus,
  };
}

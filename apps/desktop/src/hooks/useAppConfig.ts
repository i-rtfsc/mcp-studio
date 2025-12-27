import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useAppConfig() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      return await invoke<Record<string, string>>('get_all_settings');
    },
  });

  const setSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      await invoke('set_app_setting', { key, value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  // Stable reference using useCallback
  const getSetting = useCallback(
    (key: string) => settings?.[key],
    [settings]
  );

  return {
    settings,
    isLoading,
    getSetting,
    updateSetting: setSetting.mutateAsync,
  };
}

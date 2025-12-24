import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type McpTool } from '@/hooks/useMcpTools';

interface AppState {
  // Navigation
  activeServerId: string | null;
  setActiveServerId: (id: string | null) => void;

  selectedTool: McpTool | null;
  setSelectedTool: (tool: McpTool | null) => void;

  // Layout
  isInspectorOpen: boolean;
  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;

  // Inspector Content
  inspectorTab: 'tools' | 'http';
  setInspectorTab: (tab: 'tools' | 'http') => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeServerId: null,
      setActiveServerId: (id) => set({ activeServerId: id, selectedTool: null }), // Reset tool on server change

      selectedTool: null,
      setSelectedTool: (tool) => set({ selectedTool: tool }),

      isInspectorOpen: false, // Default to closed
      toggleInspector: () => set((state) => ({ isInspectorOpen: !state.isInspectorOpen })),
      setInspectorOpen: (open) => set({ isInspectorOpen: open }),

      inspectorTab: 'http',
      setInspectorTab: (tab) => set({ inspectorTab: tab }),
    }),
    {
      name: 'mcp-studio-app-state',
      partialize: (state) => ({
        isInspectorOpen: state.isInspectorOpen,
        inspectorTab: state.inspectorTab,
      }),
    }
  )
);

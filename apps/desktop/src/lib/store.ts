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

  // ToolList state (per server)
  toolListSearch: Record<string, string>; // serverId -> search query
  setToolListSearch: (serverId: string, search: string) => void;
  toolListScrollPosition: Record<string, number>; // serverId -> scroll position
  setToolListScrollPosition: (serverId: string, position: number) => void;
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

      // ToolList state
      toolListSearch: {},
      setToolListSearch: (serverId, search) =>
        set((state) => ({
          toolListSearch: { ...state.toolListSearch, [serverId]: search },
        })),
      toolListScrollPosition: {},
      setToolListScrollPosition: (serverId, position) =>
        set((state) => ({
          toolListScrollPosition: { ...state.toolListScrollPosition, [serverId]: position },
        })),
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

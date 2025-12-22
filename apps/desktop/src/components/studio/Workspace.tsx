import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Server,
  AlertCircle,
  Plug,
  Unplug,
  Edit,
  Trash,
  RotateCcw,
  MoreHorizontal,
  LayoutPanelLeft,
} from 'lucide-react';
import { useMcpServers } from '@/hooks/useMcpServers';
import { useMcpTools } from '@/hooks/useMcpTools';
import { useAppStore } from '@/lib/store';
import { ToolDetail } from './ToolDetail';
import { ToolList } from './ToolList';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { AddEditServerDialog } from './AddEditServerDialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function Workspace() {
  const { t } = useTranslation();
  const {
    activeServerId,
    setActiveServerId,
    selectedTool,
    setSelectedTool,
    toggleInspector,
    isInspectorOpen,
  } = useAppStore();
  const { servers, connectServer, disconnectServer, deleteServer, reconnectServer } =
    useMcpServers();

  const { tools, refreshTools } = useMcpTools(activeServerId);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const activeServer = servers?.find((s) => s.id === activeServerId);
  const connected = activeServer?.status === 'connected';

  // Reset selection when server changes
  useEffect(() => {
    setSelectedTool(null);
  }, [activeServerId]);

  // Actions
  const handleConnect = async () => {
    if (!activeServer) return;
    try {
      await connectServer.mutateAsync(activeServer.id);
      if (refreshTools) {
        await refreshTools.mutateAsync(activeServer.id);
      }
      toast.success(t('mcp.servers.actions.connectSuccess', { name: activeServer.name }));
    } catch (error) {
      toast.error(t('mcp.servers.actions.connectError', { message: String(error) }));
    }
  };

  const handleDisconnect = async () => {
    if (!activeServer) return;
    try {
      await disconnectServer.mutateAsync(activeServer.id);
      toast.success(t('mcp.servers.actions.disconnectSuccess', { name: activeServer.name }));
    } catch (error) {
      toast.error(t('mcp.servers.actions.disconnectError', { message: String(error) }));
    }
  };

  const handleReconnect = async () => {
    if (!activeServer) return;
    try {
      toast.info(t('mcp.servers.actions.reconnecting', { name: activeServer.name }));
      await reconnectServer(activeServer.id);
      if (refreshTools) {
        await refreshTools.mutateAsync(activeServer.id);
      }
      toast.success(t('mcp.servers.actions.reconnectSuccess', { name: activeServer.name }));
    } catch (error) {
      toast.error(t('mcp.servers.actions.reconnectError', { message: String(error) }));
    }
  };

  const handleDelete = async () => {
    if (!activeServer) return;
    if (!confirm(t('workspace.deleteServerConfirm'))) return;

    try {
      await deleteServer.mutateAsync(activeServer.id);
      toast.success(t('mcp.servers.actions.deleteSuccess'));
      setActiveServerId(null);
    } catch (error) {
      toast.error(t('mcp.servers.actions.deleteError', { message: String(error) }));
    }
  };

  if (!activeServerId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground bg-background/50 backdrop-blur-sm">
        <div data-tauri-drag-region className="absolute top-0 left-0 w-full h-14" />
        <div className="bg-muted/30 p-4 rounded-full mb-4">
          <Server className="h-16 w-16 opacity-20" />
        </div>
        <h3 className="text-xl font-semibold">{t('workspace.noServerSelected.title')}</h3>
        <p className="text-sm">{t('workspace.noServerSelected.description')}</p>
        <p className="text-xs mt-2 opacity-70">{t('workspace.noServerSelected.tip')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background/50 backdrop-blur-sm">
      {/* Server Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/40 bg-card/30 backdrop-blur-md shrink-0">
        <div data-tauri-drag-region className="absolute top-0 left-0 w-full h-4" />

        <div className="flex items-center gap-4 z-10">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              {connected && (
                <span className="relative flex h-2 w-2 mr-1">
                  <span className="animate-breathe absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              )}
              {activeServer?.name}
              <Badge
                variant={connected ? 'default' : 'outline'}
                className={cn(
                  'ml-2 text-[10px] h-5',
                  activeServer?.status === 'error' &&
                    'bg-destructive text-destructive-foreground border-destructive'
                )}
              >
                {activeServer?.status}
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground truncate max-w-[300px] font-mono flex items-center gap-2">
              {activeServer?.url}
              {connected && tools && tools.length > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                  {t(tools.length === 1 ? 'workspace.toolCount_one' : 'workspace.toolCount_other', {
                    count: tools.length,
                  })}
                </Badge>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 z-10">
          {connected ? (
            <Button variant="outline" size="sm" onClick={handleDisconnect} className="gap-2">
              <Unplug className="h-3.5 w-3.5" />
              {t('mcp.servers.actions.disconnect')}
            </Button>
          ) : (
            <Button variant="default" size="sm" onClick={handleConnect} className="gap-2">
              <Plug className="h-3.5 w-3.5" />
              {t('mcp.servers.actions.connect')}
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
                <Edit className="mr-2 h-4 w-4" />
                {t('mcp.servers.actions.edit')}
              </DropdownMenuItem>
              {(activeServer?.status === 'disconnected' || activeServer?.status === 'error') && (
                <DropdownMenuItem onClick={handleReconnect}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t('mcp.servers.actions.reconnect')}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash className="mr-2 h-4 w-4" />
                {t('mcp.servers.actions.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-1 border border-border/50 bg-background/50"
            onClick={toggleInspector}
            title={isInspectorOpen ? t('workspace.inspector.hide') : t('workspace.inspector.show')}
          >
            <LayoutPanelLeft
              className={cn('h-4 w-4 transition-transform', !isInspectorOpen && 'rotate-180')}
            />
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {!connected && !selectedTool && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="bg-muted/30 p-4 rounded-full mb-4">
              <AlertCircle className="h-12 w-12 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium text-muted-foreground">
              {t('workspace.serverDisconnected.title')}
            </h3>
            <Button variant="default" className="mt-4 gap-2" onClick={handleConnect}>
              <Plug className="h-4 w-4" /> {t('workspace.connectToView')}
            </Button>
          </div>
        )}

        {/* Keep ToolList mounted to preserve scroll position */}
        <div className={cn('h-full w-full', selectedTool ? 'hidden' : 'flex flex-col')}>
          <ToolList />
        </div>

        {selectedTool && <ToolDetail tool={selectedTool} onBack={() => setSelectedTool(null)} />}
      </div>

      <AddEditServerDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        serverToEdit={activeServer}
      />
    </div>
  );
}

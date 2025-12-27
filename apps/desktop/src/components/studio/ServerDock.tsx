import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useMcpServers } from '@/hooks/useMcpServers';
import { useAppStore } from '@/lib/store';
import { Plus, Settings } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { AddEditServerDialog } from './AddEditServerDialog';
import { SettingsDialog } from './SettingsDialog';

// Helper to get initials
const getInitials = (name: string) => {
  return (
    name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || 'S'
  );
};

export function ServerDock() {
  const { t } = useTranslation();
  const { servers } = useMcpServers();
  const { activeServerId, setActiveServerId } = useAppStore();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="flex flex-col h-full items-center bg-gradient-to-b from-muted/50 to-background border-r border-border/40 backdrop-blur-md">
      {/* Spacer for Traffic Lights (macOS) */}
      <div data-tauri-drag-region className="h-14 w-full shrink-0" />

      {/* Server List */}
      <ScrollArea className="flex-1 w-full px-1.5" hideScrollBar>
        <div className="flex flex-col gap-3 items-center py-3">
          {servers?.map((server) => (
            <div key={server.id} className="relative group w-full flex justify-center">
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setActiveServerId(server.id)}
                    className={cn(
                      'relative flex h-10 w-10 items-center justify-center transition-all duration-300 group rounded-full',
                      activeServerId === server.id
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-105'
                        : 'bg-card hover:bg-card/80 text-muted-foreground hover:text-foreground border border-border/50 hover:border-primary/30 hover:shadow-md'
                    )}
                  >
                    {/* Initials / Icon */}
                    <span className="text-[10px] font-bold leading-none select-none tracking-tight">
                      {getInitials(server.name)}
                    </span>

                    {/* Active Indicator Bar (Left) */}
                    {activeServerId === server.id && (
                      <span className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full shadow-[0_0_8px_rgba(var(--primary),0.6)]" />
                    )}

                    {/* Status Dot (Top Right) */}
                    <span
                      className={cn(
                        'absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background flex items-center justify-center z-10 transition-colors duration-300',
                        server.status === 'connected'
                          ? 'bg-green-500'
                          : server.status === 'error'
                            ? 'bg-red-500'
                            : server.status === 'connecting'
                              ? 'bg-blue-500'
                              : 'bg-muted-foreground'
                      )}
                    >
                      {server.status === 'connected' && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-20"></span>
                      )}
                      {server.status === 'connecting' && (
                        <span className="animate-spin h-full w-full rounded-full border-t-transparent border-2 border-white/80"></span>
                      )}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="font-medium flex flex-col gap-1 z-50 ml-3 bg-popover/95 backdrop-blur-sm shadow-xl border-border/50"
                >
                  <span className="font-semibold">{server.name}</span>
                  <span
                    className={cn(
                      'text-[10px] uppercase tracking-wider font-mono',
                      server.status === 'connected'
                        ? 'text-green-500'
                        : server.status === 'error'
                          ? 'text-red-500'
                          : 'text-muted-foreground'
                    )}
                  >
                    {server.status}
                  </span>
                </TooltipContent>
              </Tooltip>
            </div>
          ))}

          {/* Add Server Button */}
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full hover:bg-green-500/10 hover:text-green-600 transition-all duration-300 border border-dashed border-border hover:border-green-500/50 hover:shadow-sm mt-1"
                onClick={() => setIsAddDialogOpen(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="ml-3">
              {t('mcp.servers.actions.add')}
            </TooltipContent>
          </Tooltip>
        </div>
      </ScrollArea>

      {/* Bottom Actions */}
      <div className="mt-auto flex flex-col gap-3 items-center pb-4 px-1.5 w-full">
        <Separator className="w-5 bg-border/60" />
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              onClick={() => setIsSettingsOpen(true)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="ml-3">
            {t('settings.title')}
          </TooltipContent>
        </Tooltip>
      </div>

      <AddEditServerDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} />

      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </div>
  );
}

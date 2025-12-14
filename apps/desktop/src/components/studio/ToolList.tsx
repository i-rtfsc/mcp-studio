import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMcpTools } from '@/hooks/useMcpTools';
import { useAppStore } from '@/lib/store';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Search, Download, RefreshCw, Wrench, Code, FileJson, ChevronRight, Copy, AlertCircle } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { cn } from '@/lib/utils';

function ToolListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-border/40 bg-card/50">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ToolList() {
  const { t } = useTranslation();
  const { activeServerId, setSelectedTool, selectedTool } = useAppStore();
  const { tools, isLoading, error, refreshTools } = useMcpTools(activeServerId);
  const [search, setSearch] = useState('');
  const [showJsonDialog, setShowJsonDialog] = useState(false);
  const [rawJsonContent, setRawJsonContent] = useState('');

  const filteredTools = tools?.filter(tool => 
    tool.name.toLowerCase().includes(search.toLowerCase()) ||
    (tool.description && tool.description.toLowerCase().includes(search.toLowerCase()))
  );

  const handleViewRawJson = async () => {
    if (!activeServerId) return;
    try {
      const result = await refreshTools.mutateAsync(activeServerId);
      setRawJsonContent(result.raw_response || JSON.stringify({ tools: result.tools }, null, 2));
      setShowJsonDialog(true);
    } catch (error) {
      toast.error(t('tool.list.failedToFetchJson', { error: String(error) }));
    }
  };

  const handleExport = async () => {
    if (!activeServerId) return;
    try {
      const result = await refreshTools.mutateAsync(activeServerId);
      const content = result.raw_response || JSON.stringify({ tools: result.tools }, null, 2);

      const filePath = await save({
        filters: [{
          name: 'JSON',
          extensions: ['json']
        }],
        defaultPath: `mcp-tools-${activeServerId}.json`,
      });

      if (filePath) {
        await writeTextFile(filePath, content);
        toast.success(t('tool.list.exportSuccess'));
      }
    } catch (e) {
      toast.error(t('tool.list.exportError', { error: String(e) }));
    }
  };

  if (!activeServerId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center bg-muted/10">
        <div className="bg-muted/30 p-4 rounded-full mb-4">
          <Wrench className="h-8 w-8 opacity-40" />
        </div>
        <h3 className="text-lg font-semibold mb-2">{t('tool.list.noServerSelected')}</h3>
        <p className="text-sm max-w-[200px] leading-relaxed opacity-80">{t('tool.list.selectServerHint')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background/50 border-r border-border/40">
      {/* Header Actions */}
      <div className="flex flex-col gap-4 p-4 border-b border-border/40 bg-card/30 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2">
           <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <Input 
              placeholder={t('tool.list.searchPlaceholder')}
              className="pl-9 bg-background border-border/60 focus-visible:ring-offset-0 focus-visible:border-primary/50 shadow-sm transition-all h-9 rounded-lg"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon-sm" className="shrink-0" onClick={() => refreshTools.mutate(activeServerId)}>
                  <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('tool.list.refresh')}</TooltipContent>
            </Tooltip>
             <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon-sm" className="shrink-0" onClick={handleViewRawJson}>
                  <Code className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('tool.list.viewRawJson')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon-sm" className="shrink-0" onClick={handleExport}>
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('tool.list.exportJson')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Tool List */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {isLoading ? (
            <ToolListSkeleton />
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-6 text-center text-destructive bg-destructive/5 rounded-xl border border-destructive/20">
              <AlertCircle className="h-8 w-8 mb-2" />
              <h3 className="font-semibold mb-1">{t('tool.list.errorLoading')}</h3>
              <p className="text-xs opacity-90">{String(error)}</p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-4 border-destructive/30 hover:bg-destructive/10 text-destructive"
                onClick={() => refreshTools.mutate(activeServerId)}
              >
                {t('tool.list.retry')}
              </Button>
            </div>
          ) : filteredTools?.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
              <Search className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm">{t('tool.list.noToolsFound')}</p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {filteredTools?.map((tool, index) => {
                const isSelected = selectedTool?.name === tool.name;
                return (
                  <div
                    key={tool.name}
                    onClick={() => setSelectedTool(tool)}
                    style={{ animationDelay: `${index * 0.05}s`, animationFillMode: 'both' }}
                    className={cn(
                      "group flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200 relative overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500",
                      isSelected 
                        ? "bg-primary/5 border-primary/50 shadow-sm" 
                        : "bg-card border-border/40 hover:bg-accent/50 hover:border-primary/30 hover:shadow-md"
                    )}
                  >
                    {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                    
                    <div className={cn(
                      "mt-0.5 p-2 rounded-lg transition-colors shrink-0",
                      isSelected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                    )}>
                      <Wrench className="h-4 w-4" />
                    </div>
                    
                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <h3 className={cn(
                          "font-medium text-sm truncate transition-colors",
                          isSelected ? "text-primary" : "text-foreground/90 group-hover:text-foreground"
                        )}>
                          {tool.name}
                        </h3>
                         <ChevronRight className={cn(
                           "h-3.5 w-3.5 transition-all duration-300",
                           isSelected ? "text-primary translate-x-0 opacity-100" : "text-muted-foreground/30 -translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0"
                         )} />
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed opacity-90">
                        {tool.description || t('tool.list.noDescription')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Raw JSON Dialog */}
      <Dialog open={showJsonDialog} onOpenChange={setShowJsonDialog}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b bg-muted/30">
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileJson className="h-5 w-5" />
                {t('tool.list.rawResponseTitle')}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(rawJsonContent);
                  toast.success(t('tool.copiedToClipboard'));
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                {t('tool.copy')}
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden bg-background">
            <ScrollArea className="h-full">
              <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-all">{rawJsonContent}</pre>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Radio,
  Play,
  Square,
  RefreshCw,
  Trash,
  Copy,
  ChevronDown,
  Monitor,
  Smartphone,
  FileText,
  Folder,
  History,
  Clock,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { useHttpReceiver, type HttpReceivedMessage } from '@/hooks/useHttpReceiver';
import { readFile } from '@tauri-apps/plugin-fs';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { cn } from '@/lib/utils';

// Helper to format file size
const formatFileSize = (bytes: number | null): string => {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface DisplayCardProps {
  title: string;
  typeLabel?: string;
  timestamp?: string;
  onDelete?: () => void;
  children: React.ReactNode;
  className?: string;
  isLatest?: boolean;
}

const DisplayCard = ({
  title,
  typeLabel,
  timestamp,
  onDelete,
  children,
  className,
  isLatest,
}: DisplayCardProps) => {
  return (
    <Card
      className={cn(
        'w-full min-w-0 overflow-hidden bg-card border-border/60 shadow-sm transition-all hover:shadow-md rounded-xl',
        className,
        isLatest && 'border-primary/50 shadow-primary/5'
      )}
    >
      <CardHeader
        className={cn(
          'py-3 px-4 border-b border-border/40',
          isLatest ? 'bg-primary/5' : 'bg-muted/40'
        )}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {isLatest && (
                <Badge variant="default" className="text-[10px] h-5 px-1.5 shadow-none">
                  Latest
                </Badge>
              )}
              <CardTitle className="text-xs font-semibold text-muted-foreground tracking-wider flex items-center gap-2">
                {title}
              </CardTitle>
            </div>
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0 -mr-2"
                onClick={onDelete}
              >
                <Trash className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground/70">
            {timestamp && (
              <span className="flex items-center gap-1 whitespace-nowrap">
                <Clock className="h-3 w-3" />
                {new Date(timestamp + (timestamp.endsWith('Z') ? '' : 'Z')).toLocaleString()}
              </span>
            )}
            {typeLabel && (
              <Badge
                variant="outline"
                className="text-[10px] font-mono h-auto min-h-[1.25rem] leading-tight bg-background/50 max-w-full break-all text-left px-2 py-0.5 border-border/50"
                title={typeLabel}
              >
                {typeLabel}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 min-w-0">{children}</CardContent>
    </Card>
  );
};

// Component to preview file content (text/json)
const FileContentPreview = ({ filePath, fileName }: { filePath: string; fileName: string }) => {
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadContent = async () => {
      try {
        const isLikelyText =
          /\.(txt|json|md|xml|csv|log|js|ts|html|css|yml|yaml|toml|ini)$/i.test(fileName) ||
          !fileName.includes('.');

        if (isLikelyText) {
          const text = await readFile(filePath, { baseDir: undefined });
          const decoder = new TextDecoder('utf-8');
          setContent(decoder.decode(text));
        } else {
          setContent(null);
        }
      } catch (err) {
        console.warn('Could not read file content for preview:', err);
        setError(t('http.receiver.binaryContent'));
      }
    };
    loadContent();
  }, [filePath, fileName]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="h-4 w-4" />
        <span className="font-medium">{fileName}</span>
      </div>

      {content ? (
        <div className="bg-muted/30 rounded-md border border-border/50 w-full max-w-full overflow-hidden">
          <pre className="p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words break-all text-foreground/90 max-h-[400px] overflow-x-auto max-w-full">
            {content}
          </pre>
        </div>
      ) : (
        <div className="text-xs italic text-muted-foreground bg-muted/20 p-2 rounded">
          {error || t('http.receiver.fileSaved')}
        </div>
      )}

      <div className="flex items-center gap-2 bg-muted/30 p-1.5 rounded border border-border/30">
        <code className="text-[10px] font-mono text-muted-foreground/80 break-all flex-1 px-1">
          {filePath}
        </code>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => {
            navigator.clipboard.writeText(filePath);
            toast.success('Path copied');
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};

export function WebhookPanel() {
  const { t } = useTranslation();
  const { isInspectorOpen } = useAppStore();
  const [port, setPort] = useState(9527);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const [isAndroidConfigOpen, setIsAndroidConfigOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const {
    isRunning,
    port: currentServerPort,
    localIp,
    messages,
    isLoading,
    startServer,
    stopServer,
    deleteMessage,
    refreshMessages,
  } = useHttpReceiver();

  useEffect(() => {
    if (isRunning && currentServerPort) {
      setPort(currentServerPort);
    }
  }, [isRunning, currentServerPort]);

  const handleStartHttpServer = async () => {
    try {
      const actualPort = await startServer.mutateAsync(port);
      toast.success(t('http.receiver.startSuccess', { port: actualPort }));
    } catch (error) {
      toast.error(t('http.receiver.startError', { message: String(error) }));
    }
  };

  const handleStopHttpServer = async () => {
    try {
      await stopServer.mutateAsync();
      toast.success(t('http.receiver.stopSuccess'));
    } catch (error) {
      toast.error(t('http.receiver.stopError', { message: String(error) }));
    }
  };

  const handleOpenStorage = async () => {
    try {
      await invoke('open_storage_folder');
    } catch (error) {
      toast.error('Failed to open storage folder: ' + String(error));
    }
  };

  const handleDeleteMessage = async (id: string) => {
    try {
      await deleteMessage.mutateAsync(id);
      toast.success(t('http.receiver.deleteSuccess'));
    } catch (error) {
      toast.error(t('http.receiver.deleteError', { message: String(error) }));
    }
  };

  const handlePreviewImage = async (filePath: string, fileName: string) => {
    try {
      const content = await readFile(filePath);
      const blob = new Blob([content]);
      const url = URL.createObjectURL(blob);
      setPreviewImage({ url, name: fileName });
    } catch (error) {
      console.error('Failed to read file', error);
      toast.error('Failed to preview image: ' + String(error));
    }
  };

  const prettifyJson = (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  };

  const renderMessageContent = (msg: HttpReceivedMessage) => {
    const isImage = msg.file_path && msg.file_name?.match(/\.(jpg|jpeg|png|gif|webp)$/i);

    if (isImage) {
      return (
        <div className="space-y-3">
          <div
            className="cursor-pointer border rounded-lg p-2 bg-muted/30 hover:bg-muted/50 transition-colors inline-block max-w-full"
            onClick={() => handlePreviewImage(msg.file_path!, msg.file_name!)}
          >
            <img
              src={convertFileSrc(msg.file_path!)}
              alt={msg.file_name || 'Image'}
              className="max-w-full h-auto rounded shadow-sm"
              style={{ maxHeight: '400px' }}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                readFile(msg.file_path!)
                  .then((content) => {
                    const blob = new Blob([content]);
                    target.src = URL.createObjectURL(blob);
                  })
                  .catch(console.error);
              }}
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">{msg.file_name}</span>
            <span>({formatFileSize(msg.file_size)})</span>
          </div>
          <div className="flex items-center gap-2 bg-muted/30 p-1.5 rounded border border-border/30">
            <code className="text-[10px] font-mono text-muted-foreground/80 break-all flex-1 px-1">
              {msg.file_path}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                navigator.clipboard.writeText(msg.file_path!);
                toast.success('Path copied');
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      );
    }

    if (msg.file_path) {
      return (
        <FileContentPreview
          filePath={msg.file_path}
          fileName={msg.file_name || t('http.receiver.defaultFileName')}
        />
      );
    }

    if (msg.raw_data) {
      const formatted = prettifyJson(msg.raw_data);
      return (
        <div className="bg-muted/30 rounded-md border border-border/50 w-full max-w-full overflow-hidden">
          <pre className="p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words break-all text-foreground/90 max-h-[320px] overflow-auto">
            {formatted}
          </pre>
        </div>
      );
    }

    return (
      <div className="text-sm italic text-muted-foreground py-4 text-center">
        {t('http.receiver.noContent')}
      </div>
    );
  };

  if (!isInspectorOpen) {
    return null;
  }

  // Messages are ordered by created_at DESC (Newest -> Oldest) from backend
  const latestMessage = messages && messages.length > 0 ? messages[0] : null;

  return (
    <div className="flex flex-col h-full bg-background/50 border-l border-border/40 backdrop-blur-sm min-w-0">
      {/* Header */}
      <div className="flex flex-col gap-4 p-4 border-b border-border/40 bg-background/60 backdrop-blur-md z-10">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground/80">
            <Radio className="h-4 w-4 text-primary" />
            {t('http.receiver.title')}
          </h2>
          <div className="flex items-center gap-1">
            {/* <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" onClick={refreshMessages} className="text-muted-foreground hover:text-primary">
                        <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('http.receiver.refresh')}</TooltipContent>
                </Tooltip> */}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-primary"
                  onClick={handleOpenStorage}
                >
                  <Folder className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('http.receiver.openStorage')}</TooltipContent>
            </Tooltip>

            <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs gap-2 text-muted-foreground hover:text-primary"
                >
                  <History className="h-4 w-4" />
                  <Badge
                    variant="secondary"
                    className="h-5 px-1.5 min-w-[1.25rem] justify-center bg-primary/10 text-primary border-transparent"
                  >
                    {messages?.length || 0}
                  </Badge>
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-0 gap-0">
                <SheetHeader className="p-4 border-b border-border/40 bg-muted/30">
                  <SheetTitle className="text-base flex items-center gap-2">
                    <History className="h-4 w-4" /> {t('http.receiver.messageHistory')}
                  </SheetTitle>
                  <SheetDescription>{t('http.receiver.historyDesc')}</SheetDescription>
                </SheetHeader>
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-4 flex flex-col">
                    {messages?.map((msg) => (
                      <DisplayCard
                        key={msg.id}
                        title={t('http.receiver.requestPrefix', { id: msg.request_id })}
                        typeLabel={msg.content_type || t('http.receiver.unknownType')}
                        timestamp={msg.created_at}
                        onDelete={() => handleDeleteMessage(msg.id)}
                        className="mb-0"
                      >
                        {renderMessageContent(msg)}
                      </DisplayCard>
                    ))}
                    {messages?.length === 0 && (
                      <div className="text-center py-12 text-muted-foreground text-sm">
                        {t('http.receiver.noHistory')}
                      </div>
                    )}
                  </div>
                </ScrollArea>
                <div className="p-3 border-t border-border/40 bg-muted/10 flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    {t('http.receiver.total')}: {messages?.length || 0}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={refreshMessages}
                    className="h-7 text-xs gap-1.5"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Refresh
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Server Controls */}
        <div className="grid grid-cols-[1fr,auto] gap-3 items-end bg-card/40 p-3 rounded-xl border border-border/50">
          <div className="space-y-1.5">
            <Label
              htmlFor="inspector-port"
              className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold ml-1"
            >
              Port
            </Label>
            <div className="relative">
              <div className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                <span className="text-xs font-mono">::</span>
              </div>
              <Input
                id="inspector-port"
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value) || 9527)}
                disabled={isRunning}
                min={1024}
                max={65535}
                className="h-9 pl-6 font-mono text-sm bg-background border-border/60 shadow-sm rounded-lg"
              />
            </div>
          </div>
          {isRunning ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-9 gap-2 shadow-sm"
              onClick={handleStopHttpServer}
              disabled={stopServer.isPending}
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              {t('http.receiver.stop')}
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              className="h-9 gap-2 shadow-sm"
              onClick={handleStartHttpServer}
              disabled={startServer.isPending}
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              {t('http.receiver.start')}
            </Button>
          )}
        </div>

        {/* Endpoints Info */}
        {isRunning && (
          <div className="space-y-3 pt-1">
            {/* Network IP */}
            {localIp && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 font-semibold">
                    <Smartphone className="h-3 w-3" /> Network
                  </Label>
                  <Collapsible open={isAndroidConfigOpen} onOpenChange={setIsAndroidConfigOpen}>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px] text-amber-600 hover:text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/20 gap-1 rounded-full"
                      >
                        {t('http.receiver.configRequired')}
                        <ChevronDown
                          className={`h-3 w-3 transition-transform duration-200 ${isAndroidConfigOpen ? 'rotate-180' : ''}`}
                        />
                      </Button>
                    </CollapsibleTrigger>
                  </Collapsible>
                </div>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={`http://${localIp}:${currentServerPort}/webhook/agent`}
                    className="h-8 font-mono text-xs bg-primary/5 border-primary/20 text-primary selection:bg-primary/20"
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `http://${localIp}:${currentServerPort}/webhook/agent`
                      );
                      toast.success(t('http.receiver.networkEndpointCopied'));
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Collapsible open={isAndroidConfigOpen}>
                  <CollapsibleContent className="mt-2 animate-slide-down">
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 space-y-2">
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Add to{' '}
                        <code className="bg-background px-1 py-0.5 rounded border border-border/50">
                          AndroidManifest.xml
                        </code>
                        :
                      </p>
                      <div className="bg-background/50 p-2 rounded-md border border-border/30 overflow-x-auto">
                        <pre className="text-[9px] font-mono whitespace-pre text-foreground/80">
                          {`<application
  android:networkSecurityConfig="@xml/network_security_config"
  ...>
</application>`}
                        </pre>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-2">
                        Create{' '}
                        <code className="bg-background px-1 py-0.5 rounded border border-border/50">
                          res/xml/network_security_config.xml
                        </code>
                        :
                      </p>
                      <div className="bg-background/50 p-2 rounded-md border border-border/30 overflow-x-auto">
                        <pre className="text-[9px] font-mono whitespace-pre text-foreground/80">
                          {`<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">${localIp}</domain>
  </domain-config>
</network-security-config>`}
                        </pre>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}

            {/* Localhost */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 font-semibold px-1">
                <Monitor className="h-3 w-3" /> Localhost
              </Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={`http://127.0.0.1:${currentServerPort}/webhook/agent`}
                  className="h-8 font-mono text-xs text-muted-foreground bg-muted/20"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 border border-border/50"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `http://127.0.0.1:${currentServerPort}/webhook/agent`
                    );
                    toast.success(t('http.receiver.localhostEndpointCopied'));
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content - Latest Message Only */}
      <ScrollArea className="flex-1 bg-muted/5">
        <div className="p-4 flex flex-col gap-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">{t('http.receiver.loading')}</p>
            </div>
          ) : latestMessage ? (
            <div className="space-y-2 animate-in fade-in duration-300">
              <div className="flex items-center justify-between px-1">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('http.receiver.recentActivity')}
                </Label>
              </div>

              <DisplayCard
                title={t('http.receiver.requestPrefix', { id: latestMessage.request_id })}
                typeLabel={latestMessage.content_type || t('http.receiver.unknownType')}
                timestamp={latestMessage.created_at}
                onDelete={() => handleDeleteMessage(latestMessage.id)}
                className="mb-0 border-primary/20 shadow-lg shadow-primary/5"
                isLatest={true}
              >
                {renderMessageContent(latestMessage)}
              </DisplayCard>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/50 border-2 border-dashed border-border/40 rounded-xl m-1 bg-card/20">
              <div className="bg-muted/30 p-4 rounded-full mb-3">
                <Radio className="h-8 w-8 text-muted-foreground/70" />
              </div>
              <p className="text-sm font-medium">{t('http.receiver.noMessages')}</p>
              {isRunning && (
                <p className="text-xs mt-1 text-center max-w-[200px] opacity-70">
                  {t('http.receiver.sendPostHint')}
                </p>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 border-none bg-transparent shadow-2xl">
          <div className="relative flex-1 overflow-auto flex items-center justify-center bg-black/80 rounded-lg backdrop-blur-sm">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 text-white/70 hover:text-white hover:bg-white/20 rounded-full"
              onClick={() => setPreviewImage(null)}
            >
              <Square className="h-5 w-5 rotate-45 scale-75" /> {/* Close icon lookalike */}
            </Button>
            {previewImage && (
              <img
                src={previewImage.url}
                alt={previewImage.name}
                className="max-w-full max-h-[85vh] object-contain"
              />
            )}
            <div className="absolute bottom-4 left-0 right-0 text-center">
              <span className="bg-black/50 text-white px-3 py-1 rounded-full text-xs font-mono">
                {previewImage?.name}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

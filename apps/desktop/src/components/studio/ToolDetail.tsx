import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn, truncateBase64InObject } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ArrowLeft, Play, Code, Clock, Wrench, FileJson, Copy, Info, History } from 'lucide-react';
import { toast } from 'sonner';
import {
  useMcpTools,
  useMcpCallHistory,
  type McpTool,
  type McpToolCallResult,
  type McpCallHistory,
} from '@/hooks/useMcpTools';
import { useAppStore } from '@/lib/store';
import { SchemaForm } from './SchemaForm';

interface ToolDetailProps {
  tool: McpTool;
  onBack: () => void;
}

interface DisplayCardProps {
  title: string;
  typeLabel?: string;
  children: React.ReactNode;
}

const DisplayCard = ({ title, typeLabel, children }: DisplayCardProps) => (
  <Card className="w-full min-w-0 overflow-hidden bg-card border-border/60">
    <CardHeader className="py-2 px-4 bg-muted/30 border-b border-border/40">
      <div className="flex items-center justify-between">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </CardTitle>
        {typeLabel && (
          <Badge variant="outline" className="text-[10px] h-5 font-normal bg-background/50">
            {typeLabel}
          </Badge>
        )}
      </div>
    </CardHeader>
    <CardContent className="p-4 min-w-0">{children}</CardContent>
  </Card>
);

const resolveImageSource = (content: any): string => {
  if (!content?.data || typeof content.data !== 'string') {
    return '';
  }
  if (
    content.data.startsWith('http://') ||
    content.data.startsWith('https://') ||
    content.data.startsWith('data:')
  ) {
    return content.data;
  }
  if (content.mimeType) {
    return `data:${content.mimeType};base64,${content.data}`;
  }
  return content.data;
};

const extractContentItems = (result: McpToolCallResult | null): any[] => {
  if (!result) return [];

  const direct = (result.result as any)?.content;
  if (Array.isArray(direct)) {
    return direct;
  }

  const root = result.result as any;
  if (Array.isArray(root)) {
    return root;
  }

  const nestedContent = root?.result?.content;
  if (Array.isArray(nestedContent)) {
    return nestedContent;
  }

  try {
    const parsed = JSON.parse(result.raw_response);
    if (Array.isArray(parsed?.content)) {
      return parsed.content;
    }
    if (Array.isArray(parsed?.result?.content)) {
      return parsed.result.content;
    }
  } catch {
    // ignore parse errors, fallback to empty array
  }

  return [];
};

interface ExtendedToolCallResult extends McpToolCallResult {
  created_at?: string;
}

export function ToolDetail({ tool, onBack }: ToolDetailProps) {
  const { t } = useTranslation();
  const { activeServerId } = useAppStore();
  const { callTool } = useMcpTools(activeServerId);
  const { history: fullHistory } = useMcpCallHistory(activeServerId ?? undefined);

  const [inputParams, setInputParams] = useState('{}');
  const [paramMode, setParamMode] = useState<'form' | 'json'>('form');
  const [result, setResult] = useState<ExtendedToolCallResult | null>(null);

  const toolHistory = React.useMemo(() => {
    if (!fullHistory) return [];
    return fullHistory.filter((h) => h.tool_name === tool.name);
  }, [fullHistory, tool.name]);

  const restoreHistory = (item: McpCallHistory) => {
    if (item.input_params) {
      try {
        const parsed = JSON.parse(item.input_params);
        setInputParams(JSON.stringify(parsed, null, 2));
      } catch {
        setInputParams(item.input_params);
      }
    }

    // Safely parse output_result
    let parsedResult = null;
    if (item.output_result) {
      try {
        parsedResult = JSON.parse(item.output_result);
      } catch {
        // If parsing fails, use raw string
        parsedResult = item.output_result;
      }
    }

    setResult({
      success: item.status === 'success',
      raw_response: item.output_result || '',
      result: parsedResult,
      error: item.error_message,
      duration_ms: item.duration_ms || 0,
      created_at: item.created_at,
    });

    toast.info(t('tool.historyRestored'));
  };

  // Pre-fill default values based on schema or saved history
  useEffect(() => {
    const storageKey = activeServerId ? `mcp_tool_params_${activeServerId}_${tool.name}` : null;
    let savedParams: string | null = null;
    try {
      savedParams = storageKey ? localStorage.getItem(storageKey) : null;
    } catch {
      // localStorage not available
    }

    if (savedParams) {
      setInputParams(savedParams);
    } else if (tool?.input_schema) {
      try {
        const schema = JSON.parse(tool.input_schema);
        const example: Record<string, unknown> = {};
        if (schema.properties) {
          Object.keys(schema.properties).forEach((key) => {
            const prop = schema.properties[key];
            if ('default' in prop) {
              example[key] = prop.default;
            } else {
              switch (prop.type) {
                case 'string':
                  example[key] = prop.description ? `Sample ${prop.description}` : 'sample text';
                  break;
                case 'number':
                case 'integer':
                  example[key] = 0;
                  break;
                case 'boolean':
                  example[key] = false;
                  break;
                case 'object':
                  example[key] = {};
                  break;
                case 'array':
                  example[key] = [];
                  break;
                default:
                  example[key] = null;
              }
            }
          });
        }
        if (Object.keys(example).length > 0) {
          setInputParams(JSON.stringify(example, null, 2));
        } else {
          setInputParams('{}');
        }
      } catch {
        setInputParams('{}');
      }
    } else {
      setInputParams('{}');
    }
    setResult(null);
  }, [tool, activeServerId]);

  const handleCall = async () => {
    if (!activeServerId) return;

    // Save params to local storage for future use
    try {
      localStorage.setItem(`mcp_tool_params_${activeServerId}_${tool.name}`, inputParams);
    } catch {
      // localStorage not available
    }

    let params: Record<string, unknown> = {};
    if (inputParams.trim()) {
      try {
        params = JSON.parse(inputParams);
      } catch {
        toast.error(t('mcp.playground.invalidJson'));
        return;
      }
    }

    try {
      const callResult = await callTool.mutateAsync({
        serverId: activeServerId,
        toolName: tool.name,
        params,
      });
      setResult({ ...callResult, created_at: new Date().toISOString() });
      if (callResult.success) {
        toast.success(t('mcp.playground.callSuccess', { duration: callResult.duration_ms }));
      } else {
        toast.error(t('mcp.playground.callFailed', { error: callResult.error }));
      }
    } catch (error) {
      toast.error(t('mcp.playground.callError', { message: String(error) }));
      setResult({
        success: false,
        raw_response: JSON.stringify({ error: String(error) }, null, 2),
        result: null,
        error: String(error),
        duration_ms: 0,
        created_at: new Date().toISOString(),
      });
    }
  };

  // Helper to generate the display JSON for the raw response tab
  const getDisplayResponseJson = () => {
    if (!result) return '';

    // Try to parse the raw response first
    try {
      const parsed = JSON.parse(result.raw_response);
      // Truncate base64 in the parsed object
      const truncated = truncateBase64InObject(parsed);
      return JSON.stringify(truncated, null, 2);
    } catch {
      // If parsing fails, return raw string (we can't easily truncate safely)
      return result.raw_response;
    }
  };

  const getDisplayDefinition = () => {
    try {
      const definition: any = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.input_schema ? JSON.parse(tool.input_schema) : {},
      };

      if (tool.output_schema) {
        try {
          definition.outputSchema = JSON.parse(tool.output_schema);
        } catch {
          // Ignore JSON parse errors for output schema
        }
      }

      if (tool.extra) {
        try {
          Object.assign(definition, JSON.parse(tool.extra));
        } catch {
          // Ignore JSON parse errors for extra fields
        }
      }

      return JSON.stringify(definition, null, 2);
    } catch {
      return JSON.stringify(tool, null, 2);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background/50 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 border-b border-border/40 bg-card/30 backdrop-blur-sm shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={onBack} className="hover:bg-primary/10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10 text-primary">
            <Wrench className="h-5 w-5" />
          </div>
          <div className="flex items-center gap-2">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{tool.name}</h2>
              {tool.description && (
                <p className="text-xs text-muted-foreground line-clamp-1">{tool.description}</p>
              )}
            </div>

            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Info className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileJson className="h-5 w-5 text-primary" />
                    {t('tool.definitionAndSchema')}
                  </DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-hidden relative border rounded-md bg-muted/50 mt-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-2 top-2 z-10 hover:bg-background/80"
                    onClick={() => {
                      navigator.clipboard.writeText(getDisplayDefinition());
                      toast.success(t('tool.copiedToClipboard'));
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <ScrollArea className="h-[60vh]">
                    <div className="p-4 font-mono text-xs">
                      <pre className="whitespace-pre-wrap">{getDisplayDefinition()}</pre>
                    </div>
                  </ScrollArea>
                </div>
              </DialogContent>
            </Dialog>

            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <History className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[400px] sm:w-[540px]">
                <SheetHeader>
                  <SheetTitle>{t('tool.callHistory')}</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-100px)] mt-4 pr-4">
                  <div className="space-y-4">
                    {toolHistory.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        {t('tool.noHistoryForTool')}
                      </div>
                    ) : (
                      toolHistory.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-col gap-2 p-4 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                          onClick={() => restoreHistory(item)}
                        >
                          <div className="flex items-center justify-between">
                            <Badge variant={item.status === 'success' ? 'default' : 'destructive'}>
                              {item.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(item.created_at + 'Z').toLocaleString()}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {item.duration_ms}ms
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="text-xs font-medium">{t('tool.input')}:</div>
                            <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-[100px] whitespace-pre-wrap break-all">
                              {item.input_params}
                            </pre>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-w-0">
        <ResizablePanelGroup direction="horizontal" className="flex-1 min-w-0">
          {/* Left Panel: Input */}
          <ResizablePanel
            defaultSize={40}
            minSize={30}
            maxSize={70}
            className="flex flex-col bg-background/30 min-w-0"
          >
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                {/* Input Header & Tabs */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium flex items-center gap-2 text-foreground/80">
                      <Code className="h-4 w-4 text-primary" />
                      {t('tool.inputParams')}
                    </h3>
                    <Tabs
                      value={paramMode}
                      onValueChange={(v) => setParamMode(v as 'form' | 'json')}
                      className="w-auto"
                    >
                      <TabsList className="h-7 bg-muted/50">
                        <TabsTrigger value="form" className="h-5 text-xs">
                          {t('tool.form')}
                        </TabsTrigger>
                        <TabsTrigger value="json" className="h-5 text-xs">
                          JSON
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  <div className="min-h-[200px]">
                    {paramMode === 'form' ? (
                      <div className="border rounded-lg p-4 bg-card/50 shadow-sm">
                        <SchemaForm
                          schema={tool.input_schema}
                          value={inputParams}
                          onChange={setInputParams}
                        />
                      </div>
                    ) : (
                      <Textarea
                        className="font-mono text-xs min-h-[300px] resize-none bg-card/50 leading-relaxed"
                        placeholder="{}"
                        value={inputParams}
                        onChange={(e) => setInputParams(e.target.value)}
                      />
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>

            {/* Execute Button Footer */}
            <div className="p-4 border-t border-border/40 bg-card/30 backdrop-blur-sm">
              <Button
                variant="default"
                size="lg"
                className="w-full gap-2 font-semibold"
                onClick={handleCall}
                disabled={callTool.isPending}
              >
                <Play
                  className={cn('h-5 w-5 fill-current', callTool.isPending && 'animate-spin')}
                />
                {callTool.isPending ? t('tool.executing') : t('tool.execute')}
              </Button>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Panel: Result */}
          <ResizablePanel defaultSize={60} className="bg-muted/10 flex flex-col min-w-0">
            <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between bg-card/30">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileJson className="h-4 w-4 text-primary" />
                {t('tool.result')}
              </h3>
              {result && (
                <div className="flex items-center gap-2">
                  <Badge variant={result.success ? 'default' : 'destructive'} className="h-5">
                    {result.success ? t('tool.success') : t('tool.failed')}
                  </Badge>
                  <Badge variant="outline" className="h-5 gap-1 text-[11px]">
                    <Clock className="h-3 w-3" />
                    {result.duration_ms}ms
                  </Badge>
                  {result.created_at && (
                    <Badge
                      variant="outline"
                      className="h-5 gap-1 text-[11px] text-muted-foreground"
                    >
                      {new Date(
                        result.created_at + (result.created_at.endsWith('Z') ? '' : 'Z')
                      ).toLocaleString()}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <ScrollArea className="flex-1 min-w-0 w-full">
              <div className="p-6 space-y-6 min-w-0 w-full">
                {result ? (
                  <>
                    {/* Content Display */}
                    <div className="space-y-4 w-full min-w-0">
                      {(() => {
                        const contentItems = extractContentItems(result);
                        if (contentItems.length === 0) {
                          return (
                            <div className="text-sm text-muted-foreground italic pl-1">
                              {t('tool.noContentItems')}
                            </div>
                          );
                        }

                        return contentItems.map((item: any, index: number) => {
                          const title = t('tool.displayCard', { index: index + 1 });

                          if (item?.type === 'text' && typeof item.text === 'string') {
                            return (
                              <DisplayCard
                                key={`display-text-${index}`}
                                title={title}
                                typeLabel={t('tool.type.text')}
                              >
                                <div className="bg-card/60 rounded-md border border-border/50 w-full overflow-x-auto">
                                  <pre className="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words break-all text-foreground/90">
                                    {item.text}
                                  </pre>
                                </div>
                              </DisplayCard>
                            );
                          }

                          if (item?.type === 'image' && typeof item.data === 'string') {
                            const src = resolveImageSource(item);
                            if (!src) return null;

                            return (
                              <DisplayCard
                                key={`display-image-${index}`}
                                title={title}
                                typeLabel={t('tool.type.image')}
                              >
                                <div className="flex flex-col items-center gap-2">
                                  <div className="border rounded-lg p-2 bg-muted/30 inline-block max-w-full">
                                    <img
                                      src={src}
                                      alt={`Tool result ${index + 1}`}
                                      className="max-w-full h-auto rounded shadow-sm"
                                      style={{ maxHeight: '500px' }}
                                    />
                                  </div>
                                  {item.mimeType && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {item.mimeType}
                                    </span>
                                  )}
                                </div>
                              </DisplayCard>
                            );
                          }

                          return (
                            <DisplayCard
                              key={`display-raw-${index}`}
                              title={title}
                              typeLabel={item?.type || t('tool.type.data')}
                            >
                              <div className="bg-card/60 rounded-md border border-border/50 w-full overflow-x-auto">
                                <pre className="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words break-all text-foreground/90">
                                  {JSON.stringify(item, null, 2)}
                                </pre>
                              </div>
                            </DisplayCard>
                          );
                        });
                      })()}
                    </div>

                    {/* Raw Response JSON */}
                    <Card className="w-full min-w-0 overflow-hidden border-border/60">
                      <CardHeader className="py-2 px-4 bg-muted/30 border-b border-border/40">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <FileJson className="h-3 w-3" />
                            {t('tool.fullResponse')}
                          </CardTitle>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 gap-1.5 text-[10px] px-2"
                            onClick={() => {
                              navigator.clipboard.writeText(result.raw_response);
                              toast.success(t('tool.copiedToClipboard'));
                            }}
                          >
                            <Copy className="h-3 w-3" />
                            {t('tool.copy')}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-0 min-w-0">
                        <div className="bg-card/40 w-full overflow-x-auto">
                          <pre className="p-4 font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground min-w-0">
                            {getDisplayResponseJson()}
                          </pre>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center min-h-[200px] text-muted-foreground border-2 border-dashed border-border/40 rounded-xl bg-muted/5 my-8">
                    <div className="p-3 bg-muted/20 rounded-full mb-3">
                      <Play className="h-6 w-6 opacity-20" />
                    </div>
                    <p className="text-sm font-medium">{t('tool.readyToExecute')}</p>
                    <p className="text-xs opacity-60 mt-1 max-w-[200px] text-center">
                      {t('tool.executeHint')}
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

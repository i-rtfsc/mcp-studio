import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMcpTools, type BatchTestProgress, type BatchTestResult } from '@/hooks/useMcpTools';
import { useAppStore } from '@/lib/store';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Play,
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  FileJson,
  Clock,
  TestTube,
  CheckCheck,
} from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

const STORAGE_KEY = 'mcp_batch_test_input';
const STORAGE_KEY_DELAY = 'mcp_batch_test_delay';

// Helper to truncate base64 data (same as ToolDetail.tsx)
const truncateBase64InObject = (obj: any): any => {
  if (!obj) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(truncateBase64InObject);
  }

  const newObj = { ...obj };

  // Check if this object looks like an image content block
  if (newObj.type === 'image' && typeof newObj.data === 'string' && newObj.data.length > 100) {
    newObj.data = `... (${Math.round(newObj.data.length / 1024)} KB base64 data) ...`;
  } else {
    // Recursively process other fields
    for (const key in newObj) {
      if (Object.prototype.hasOwnProperty.call(newObj, key)) {
        newObj[key] = truncateBase64InObject(newObj[key]);
      }
    }
  }

  return newObj;
};

export function BatchTester() {
  const { t, i18n } = useTranslation();
  const { activeServerId } = useAppStore();
  const { callTool } = useMcpTools(activeServerId);

  // Load from localStorage on mount
  const [toolNamesInput, setToolNamesInput] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  // Load delay from localStorage (default 0ms)
  const [delayMs, setDelayMs] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DELAY);
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });

  const [progress, setProgress] = useState<BatchTestProgress>({
    total: 0,
    completed: 0,
    succeeded: 0,
    failed: 0,
    isRunning: false,
    results: [],
  });

  // Save to localStorage when input changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, toolNamesInput);
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  }, [toolNamesInput]);

  // Save delay to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DELAY, delayMs.toString());
    } catch (error) {
      console.error('Failed to save delay to localStorage:', error);
    }
  }, [delayMs]);

  const parseToolNames = (input: string): string[] | null => {
    try {
      const trimmed = input.trim();
      if (!trimmed) return null;

      // Try to parse as JSON array
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
        return parsed;
      }
      toast.error(t('batchTester.invalidFormat'));
      return null;
    } catch {
      toast.error(t('batchTester.invalidJson'));
      return null;
    }
  };

  const formatToolNames = () => {
    const input = toolNamesInput.trim();
    if (!input) {
      toast.error(t('batchTester.formatEmpty'));
      return;
    }

    // Use regex to match all com_ prefixed tool names
    // Match: com_ followed by word characters (letters, digits, underscores), but must end with alphanumeric
    // This ensures we get complete tool names as they appear in the text
    const regex = /com_[a-zA-Z0-9_]+/g;
    const matches = input.match(regex) || [];

    // Filter to only keep valid tool names that end with alphanumeric (not underscore)
    const tools = matches.filter(tool => {
      return tool.length > 4 && /[a-zA-Z0-9]$/.test(tool);
    });

    if (tools.length === 0) {
      toast.error(t('batchTester.formatEmpty'));
      return;
    }

    // Remove duplicates and sort
    const uniqueTools = [...new Set(tools)].sort();

    // Format as pretty JSON array (each element on a new line)
    const formattedJson = JSON.stringify(uniqueTools, null, 2);

    setToolNamesInput(formattedJson);
    toast.success(t('batchTester.formatSuccess', { count: uniqueTools.length }));
  };

  // Parse and count current tools in input
  const getCurrentToolCount = (): number => {
    try {
      const trimmed = toolNamesInput.trim();
      if (!trimmed) return 0;
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.length;
      }
    } catch {
      // Not valid JSON, ignore
    }
    return 0;
  };

  const currentToolCount = getCurrentToolCount();

  const runBatchTest = async () => {
    if (!activeServerId) {
      toast.error(t('batchTester.noServer'));
      return;
    }

    const toolNames = parseToolNames(toolNamesInput);
    if (!toolNames || toolNames.length === 0) return;

    setProgress({
      total: toolNames.length,
      completed: 0,
      succeeded: 0,
      failed: 0,
      isRunning: true,
      results: [],
    });

    const results: BatchTestResult[] = [];

    for (let i = 0; i < toolNames.length; i++) {
      const toolName = toolNames[i];
      const timestamp = new Date().toISOString();
      try {
        const result = await callTool.mutateAsync({
          serverId: activeServerId,
          toolName,
          params: {}, // Call with empty params
        });

        const testResult: BatchTestResult = {
          toolName,
          success: result.success,
          duration_ms: result.duration_ms,
          result: result.result,
          error: result.error || undefined,
          timestamp,
        };

        results.push(testResult);

        setProgress((prev) => ({
          ...prev,
          completed: prev.completed + 1,
          succeeded: prev.succeeded + (result.success ? 1 : 0),
          failed: prev.failed + (result.success ? 0 : 1),
          results: [...results],
        }));
      } catch (error) {
        const testResult: BatchTestResult = {
          toolName,
          success: false,
          duration_ms: 0,
          error: String(error),
          timestamp,
        };

        results.push(testResult);

        setProgress((prev) => ({
          ...prev,
          completed: prev.completed + 1,
          failed: prev.failed + 1,
          results: [...results],
        }));
      }

      // Add delay between calls (except after the last one)
      if (i < toolNames.length - 1 && delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    setProgress((prev) => ({ ...prev, isRunning: false }));
    toast.success(
      t('batchTester.completed', {
        total: toolNames.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      })
    );
  };

  const exportToCsv = async () => {
    if (progress.results.length === 0) {
      toast.error(t('batchTester.noResults'));
      return;
    }

    // Format timestamp to human-readable format
    const formatTimestamp = (timestamp: string): string => {
      const date = new Date(timestamp);
      return date.toLocaleString(i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US');
    };

    // Generate CSV content with i18n support
    const headers = [
      t('batchTester.csv.toolName'),
      t('batchTester.csv.status'),
      t('batchTester.csv.duration'),
      t('batchTester.csv.result'),
      t('batchTester.csv.timestamp'),
    ];

    const rows = progress.results.map((result) => {
      // Format result or error for CSV - show result regardless of success/failure
      let resultContent = '';
      if (result.result !== undefined && result.result !== null) {
        // Show the actual result (could be error details or success data)
        resultContent = JSON.stringify(truncateBase64InObject(result.result));
      } else if (result.error) {
        // Fallback to error string if no result object
        resultContent = result.error;
      }

      return [
        result.toolName,
        result.success ? t('batchTester.success') : t('batchTester.failed'),
        result.duration_ms.toString(),
        resultContent,
        formatTimestamp(result.timestamp),
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${cell.toString().replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    // Generate filename with current date/time
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const filename = `batch-test-${dateStr}_${timeStr}.csv`;

    try {
      const filePath = await save({
        filters: [
          {
            name: 'CSV',
            extensions: ['csv'],
          },
        ],
        defaultPath: filename,
      });

      if (filePath) {
        await writeTextFile(filePath, csvContent);
        toast.success(t('batchTester.exportSuccess'));
      }
    } catch (error) {
      toast.error(t('batchTester.exportError', { error: String(error) }));
    }
  };

  const exampleJson = `[
  "tool_name_1",
  "tool_name_2",
  "tool_name_3"
]`;

  // Helper function to format result for display (truncate base64)
  const formatResultForDisplay = (result: unknown): string => {
    try {
      const truncated = truncateBase64InObject(result);
      return JSON.stringify(truncated, null, 2);
    } catch {
      return String(result);
    }
  };

  // Helper function to format timestamp
  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString(i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className="flex flex-col h-full p-6 gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0 pt-[2px]">
        {/* Input Section */}
        <Card className="flex flex-col min-h-0">
          <CardHeader className="border-b border-border/40 shrink-0">
            <CardTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5" />
              {t('batchTester.inputTitle')}
            </CardTitle>
            <CardDescription>{t('batchTester.inputDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto pt-4">
            <div className="space-y-4 pb-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">{t('batchTester.toolNamesLabel')}</label>
                  {currentToolCount > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {currentToolCount} {t('batchTester.tools')}
                    </Badge>
                  )}
                </div>
                <Textarea
                  placeholder={exampleJson}
                  value={toolNamesInput}
                  onChange={(e) => setToolNamesInput(e.target.value)}
                  className="font-mono text-xs h-[200px] resize-none"
                  disabled={progress.isRunning}
                />
                <div className="flex items-start gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={formatToolNames}
                    disabled={progress.isRunning || !toolNamesInput.trim()}
                    className="shrink-0"
                  >
                    <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
                    {t('batchTester.format')}
                  </Button>
                  <p className="text-xs text-muted-foreground leading-relaxed pt-1.5">
                    {t('batchTester.formatHint')}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('batchTester.delayLabel')}</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    value={delayMs}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDelayMs(Math.max(0, parseInt(e.target.value) || 0))}
                    className="flex-1"
                    disabled={progress.isRunning}
                    placeholder="0"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">ms</span>
                </div>
                <p className="text-xs text-muted-foreground">{t('batchTester.delayHint')}</p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={runBatchTest}
                  disabled={progress.isRunning || !activeServerId}
                  className="flex-1"
                >
                  {progress.isRunning ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('batchTester.running')}
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      {t('batchTester.start')}
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={exportToCsv}
                  disabled={progress.results.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {t('batchTester.exportCsv')}
                </Button>
              </div>

              {/* Progress */}
              {progress.total > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-sm">
                    <span>
                      {t('batchTester.progress')}: {progress.completed} / {progress.total}
                    </span>
                    <span className="text-muted-foreground">
                      {Math.round((progress.completed / progress.total) * 100)}%
                    </span>
                  </div>
                  <Progress value={(progress.completed / progress.total) * 100} />
                  <div className="flex gap-4 text-xs">
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="h-3 w-3" />
                      {progress.succeeded}
                    </span>
                    <span className="flex items-center gap-1 text-red-600">
                      <XCircle className="h-3 w-3" />
                      {progress.failed}
                    </span>
                  </div>

                  {/* Success Rate - Show only when completed */}
                  {!progress.isRunning && progress.completed === progress.total && (
                    <div className="pt-2 border-t border-border/40">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{t('batchTester.successRate')}</span>
                        <span className={`font-semibold ${
                          progress.succeeded / progress.total >= 0.8
                            ? 'text-green-600'
                            : progress.succeeded / progress.total >= 0.5
                              ? 'text-yellow-600'
                              : 'text-red-600'
                        }`}>
                          {((progress.succeeded / progress.total) * 100).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        <Card className="flex flex-col min-h-0">
          <CardHeader className="border-b border-border/40 shrink-0">
            <CardTitle>{t('batchTester.resultsTitle')}</CardTitle>
            <CardDescription>
              {progress.results.length > 0
                ? t('batchTester.resultsCount', { count: progress.results.length })
                : t('batchTester.noResults')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0 pt-4">
            <ScrollArea className="h-full px-6 pb-6">
              {progress.results.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                  <TestTube className="h-12 w-12 mb-3 opacity-20" />
                  <p className="text-sm">{t('batchTester.runTestsHint')}</p>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  {progress.results.map((result, index) => (
                    <div
                      key={index}
                      className="p-4 rounded-lg border border-border bg-card hover:bg-accent/50 hover:border-border/60 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {result.success ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                          )}
                          <span className="font-medium text-sm">{result.toolName}</span>
                        </div>
                        <Badge variant={result.success ? 'default' : 'destructive'} className="text-xs">
                          {result.success ? t('batchTester.success') : t('batchTester.failed')}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {result.duration_ms}ms
                        </div>
                        <div className="text-right text-[10px]">
                          {formatTimestamp(result.timestamp)}
                        </div>
                      </div>

                      {result.error && (
                        <div className="mt-2 p-2 rounded bg-destructive/10 text-xs text-destructive font-mono break-all">
                          {result.error}
                        </div>
                      )}

                      {result.result !== undefined && result.result !== null && (
                        <pre className="mt-2 p-2 rounded bg-muted text-xs font-mono overflow-auto max-h-[200px] whitespace-pre-wrap break-all">
                          {formatResultForDisplay(result.result)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

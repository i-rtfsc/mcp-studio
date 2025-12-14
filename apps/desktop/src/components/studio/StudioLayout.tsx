import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ServerDock } from './ServerDock';
import { Workspace } from './Workspace';
import { WebhookPanel } from './WebhookPanel';
import { useAppStore } from '@/lib/store';

export function StudioLayout() {
  const { isInspectorOpen } = useAppStore();

  return (
    <ResizablePanelGroup direction="horizontal" className="h-screen items-stretch">
      {/* Server Dock */}
      <ResizablePanel defaultSize={7} minSize={6} maxSize={10} className="bg-muted/30 min-w-[70px]">
        <ServerDock />
      </ResizablePanel>

      <ResizableHandle className="hover:bg-primary/20 transition-colors duration-200" />

      <ResizablePanel defaultSize={70} className="min-w-0">
        <Workspace />
      </ResizablePanel>

      <ResizableHandle withHandle className="hover:bg-primary/20 transition-colors duration-200" />

      {/* Inspector (Webhook Panel) */}
      {isInspectorOpen && (
        <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
          <WebhookPanel />
        </ResizablePanel>
      )}
    </ResizablePanelGroup>
  );
}

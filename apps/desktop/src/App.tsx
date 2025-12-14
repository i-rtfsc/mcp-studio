import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { ThemeProvider } from './hooks/useTheme';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { StudioLayout } from './components/studio/StudioLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getCurrentWindow } from '@tauri-apps/api/window';

function App() {
  useEffect(() => {
    const setEmptyTitle = async () => {
      try {
        await getCurrentWindow().setTitle('');
      } catch (e) {
        console.error('Failed to set window title', e);
      }
    };
    setEmptyTitle();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider delayDuration={0}>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<StudioLayout />} />
              </Routes>
              <Toaster />
            </BrowserRouter>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;

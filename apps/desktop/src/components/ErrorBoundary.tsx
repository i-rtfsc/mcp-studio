import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center min-h-screen bg-background p-4">
          <Card className="max-w-2xl w-full p-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>
                An unexpected error occurred. Please try reloading the page or contact support if
                the problem persists.
              </AlertDescription>
            </Alert>

            <div className="mt-6 space-y-4">
              <div className="flex gap-2">
                <Button onClick={this.handleReset} variant="outline">
                  Try Again
                </Button>
                <Button onClick={this.handleReload} variant="default">
                  Reload Page
                </Button>
              </div>

              {this.state.error && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                    Error Details
                  </summary>
                  <div className="mt-2 space-y-2">
                    <pre className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-60">
                      <code>{this.state.error.toString()}</code>
                    </pre>
                    {this.state.errorInfo && (
                      <pre className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-60">
                        <code>{this.state.errorInfo.componentStack}</code>
                      </pre>
                    )}
                  </div>
                </details>
              )}
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

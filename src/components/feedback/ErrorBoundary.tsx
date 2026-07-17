import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackMessage?: string;
  showDetails?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center">
            <AlertTriangle size={40} className="text-red-400" />
          </div>

          <h2 className="text-xl font-bold text-foreground">
            {this.props.fallbackMessage || "Algo deu errado."}
          </h2>

          <p className="text-sm text-muted-foreground max-w-md">
            Ocorreu um erro inesperado nesta seção. Tente novamente ou recarregue a página.
          </p>

          {this.props.showDetails && this.state.error && (
            <div className="w-full max-w-lg rounded-lg border border-border bg-secondary/40 p-3 text-left">
              <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
                {this.state.error.message}
              </pre>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 mt-2">
            <Button variant="outline" onClick={this.handleReset}>
              Tentar novamente
            </Button>
            <Button onClick={this.handleReload} className="gap-2">
              <RefreshCw size={16} />
              Recarregar página
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

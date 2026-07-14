import React, { Component, ErrorInfo, ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in component:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <Card className="rounded-3xl p-6 shadow-card flex flex-col items-center justify-center text-center space-y-4">
          <div className="size-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
            <AlertTriangle className="size-6" />
          </div>
          <div>
            <h3 className="font-semibold">Não foi possível carregar este item</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {this.state.error?.message || "Ocorreu um erro inesperado."}
            </p>
          </div>
          <Button 
            variant="outline" 
            className="rounded-xl w-full"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Tentar novamente
          </Button>
        </Card>
      );
    }

    return this.props.children;
  }
}

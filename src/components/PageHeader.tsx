import { ReactNode } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  fallbackRoute: string;
  children?: ReactNode;
}

export function PageHeader({ title, subtitle, fallbackRoute, children }: PageHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    // Check if there is a previous history entry within the app
    // Browsers often start at history.length = 1, so > 1 means we navigated inside the site or from elsewhere
    // If it fails to go back meaningfully, a fallback is safer. But TanStack router history API is better.
    // Usually window.history.length > 2 means there is definitely an app history (1 is new tab, 2 is first nav).
    if (window.history.length > 2) {
      window.history.back();
    } else {
      navigate({ to: fallbackRoute as any, replace: true });
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border">
      <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
        <button
          onClick={handleBack}
          className="size-9 rounded-full hover:bg-accent flex items-center justify-center -ml-2 text-foreground"
          title="Voltar"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-base truncate">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {children && <div className="flex items-center gap-1">{children}</div>}
      </div>
    </header>
  );
}

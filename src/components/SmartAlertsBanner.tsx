import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  AlertTriangle,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Target,
  CreditCard,
  ChevronRight,
  ChevronDown,
  X,
  ShieldAlert,
} from "lucide-react";
import type { SmartAlert } from "@/lib/smart-alerts";

interface SmartAlertsBannerProps {
  alerts: SmartAlert[];
  isLoading?: boolean;
  onDismiss?: (dedupeKey: string) => void;
  className?: string;
  defaultExpanded?: boolean;
}

export function SmartAlertsBanner({
  alerts,
  isLoading = false,
  onDismiss,
  className = "",
  defaultExpanded = true,
}: SmartAlertsBannerProps) {
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const visibleAlerts = alerts.filter((a) => !dismissedKeys.has(a.dedupeKey));

  if (isLoading || visibleAlerts.length === 0) {
    return null;
  }

  function handleDismiss(e: React.MouseEvent, dedupeKey: string) {
    e.stopPropagation();
    setDismissedKeys((prev) => new Set([...prev, dedupeKey]));
    if (onDismiss) onDismiss(dedupeKey);
  }

  const criticalCount = visibleAlerts.filter((a) => a.severity === "critical").length;
  const warningCount = visibleAlerts.filter((a) => a.severity === "warning").length;

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* Header bar com contadores e botão de colapso */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Sparkles className="size-3.5" />
          </div>
          <span className="font-semibold text-xs tracking-tight">
            Alertas Financeiros Inteligentes
          </span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
            {visibleAlerts.length}
          </span>
          {criticalCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive">
              {criticalCount} urgente{criticalCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? (
            <span className="flex items-center gap-1">
              Ocultar <ChevronDown className="size-3.5" />
            </span>
          ) : (
            <span className="flex items-center gap-1">
              Ver alertas <ChevronRight className="size-3.5" />
            </span>
          )}
        </Button>
      </div>

      {isExpanded && (
        <div className="space-y-2">
          {visibleAlerts.map((alert) => {
            const isCritical = alert.severity === "critical";
            const isWarning = alert.severity === "warning";
            const isInfo = alert.severity === "info";
            const isSuccess = alert.severity === "success";

            const containerStyle = isCritical
              ? "bg-destructive/5 border-destructive/30 hover:border-destructive/50"
              : isWarning
              ? "bg-amber-500/5 border-amber-500/30 hover:border-amber-500/50"
              : isInfo
              ? "bg-blue-500/5 border-blue-500/30 hover:border-blue-500/50"
              : "bg-success/5 border-success/30 hover:border-success/50";

            const iconBadge = isCritical ? (
              <div className="size-8 rounded-xl bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
                <AlertTriangle className="size-4" />
              </div>
            ) : isWarning ? (
              <div className="size-8 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
                <AlertCircle className="size-4" />
              </div>
            ) : isInfo ? (
              <div className="size-8 rounded-xl bg-blue-500/15 text-blue-600 flex items-center justify-center shrink-0">
                {alert.type === "goal_pacing" ? <Target className="size-4" /> : <Sparkles className="size-4" />}
              </div>
            ) : (
              <div className="size-8 rounded-xl bg-success/15 text-success flex items-center justify-center shrink-0">
                <Sparkles className="size-4" />
              </div>
            );

            return (
              <Card
                key={alert.id}
                className={`relative rounded-2xl p-3.5 border transition-all duration-200 shadow-sm ${containerStyle}`}
              >
                <div className="flex items-start gap-3">
                  {iconBadge}

                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-semibold text-xs sm:text-sm text-foreground tracking-tight">
                        {alert.title}
                      </h4>
                      <Badge
                        variant="outline"
                        className="text-[9px] py-0 px-1.5 font-medium border-border/60"
                      >
                        Inteligente
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {alert.body}
                    </p>

                    <div className="mt-2.5 flex items-center gap-2">
                      <Link to={alert.link as any}>
                        <Button
                          size="sm"
                          variant={isCritical ? "destructive" : "secondary"}
                          className="h-7 text-xs px-2.5 rounded-lg gap-1 font-medium shadow-none"
                        >
                          <span>{alert.actionLabel || "Acessar"}</span>
                          <ChevronRight className="size-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDismiss(e, alert.dedupeKey)}
                    className="absolute top-2.5 right-2.5 size-6 rounded-md hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition"
                    title="Dispensar alerta"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

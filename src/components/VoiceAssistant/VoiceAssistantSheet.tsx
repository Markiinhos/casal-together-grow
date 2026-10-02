import { useState, useEffect, useRef } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Mic,
  Send,
  X,
  Loader2,
  Check,
  Sparkles,
  TrendingDown,
  Target,
  Calendar,
  CreditCard,
  ShoppingCart,
  ShieldCheck,
  ArrowRight,
  RotateCcw,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import {
  parseCopilotCommand,
  resolveCopilotQuery,
  prepareCopilotActionPreview,
  executeCopilotAction,
  type ParsedCopilotCommand,
  type CopilotQueryResult,
  type ActionPreview,
} from "@/lib/ai-copilot";
import { logVoiceCommand } from "@/lib/voice-executor";
import { getStoredGeminiKey } from "@/lib/ocr";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace } from "@/lib/space";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type CopilotState =
  | "idle"
  | "listening"
  | "processing"
  | "query_answer"
  | "action_preview"
  | "success"
  | "error";

interface VoiceAssistantSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const QUICK_PROMPTS = [
  { icon: TrendingDown, text: "Quanto gastamos este mês?", category: "Gastos" },
  { icon: Sparkles, text: "Quanto ainda podemos gastar?", category: "Orçamento" },
  { icon: Target, text: "Quanto falta para a meta?", category: "Metas" },
  { icon: Calendar, text: "Quanto temos para pagar até sexta?", category: "Contas" },
  { icon: CreditCard, text: "Qual cartão tem mais limite?", category: "Cartões" },
  { icon: TrendingDown, text: "Adicionar R$ 80 de combustível", category: "Ação" },
  { icon: ShoppingCart, text: "Adicionar pão e leite na lista", category: "Ação" },
  { icon: Target, text: "Adicionar R$ 300 à meta da viagem", category: "Ação" },
];

export function VoiceAssistantSheet({ open, onOpenChange }: VoiceAssistantSheetProps) {
  const [state, setState] = useState<CopilotState>("idle");
  const [manualText, setManualText] = useState("");
  const [activePromptText, setActivePromptText] = useState("");
  const [parsedCommand, setParsedCommand] = useState<ParsedCopilotCommand | null>(null);
  const [queryResult, setQueryResult] = useState<CopilotQueryResult | null>(null);
  const [actionPreview, setActionPreview] = useState<ActionPreview | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [lastError, setLastError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [micHelpOpen, setMicHelpOpen] = useState(false);

  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { space } = useSpace();
  const qc = useQueryClient();
  const coupleId = profile?.couple_id ?? null;
  const hasGeminiKey = Boolean(getStoredGeminiKey());

  const {
    isListening,
    transcript,
    error: speechError,
    microphoneState,
    isNative,
    isAvailable,
    startListening,
    stopListening,
    reset,
    checkPermissionState,
  } = useSpeechRecognition();

  // Re-verifica o estado das permissões sempre que a sheet for aberta
  useEffect(() => {
    if (open) {
      checkPermissionState();
    }
  }, [open, checkPermissionState]);

  // Reset state when opening or closing
  const handleClose = () => {
    stopListening();
    reset();
    setState("idle");
    setManualText("");
    setActivePromptText("");
    setParsedCommand(null);
    setQueryResult(null);
    setActionPreview(null);
    setLastError(null);
    onOpenChange(false);
  };

  const handleResetToIdle = () => {
    stopListening();
    reset();
    setState("idle");
    setManualText("");
    setActivePromptText("");
    setParsedCommand(null);
    setQueryResult(null);
    setActionPreview(null);
    setLastError(null);
  };

  // Handle Speech Error: não bloqueia a tela inteira, apenas avisa e volta para idle
  useEffect(() => {
    if (speechError) {
      if (state === "listening") {
        setState("idle");
      }
      toast.error(speechError, {
        description: "Você pode tocar nos atalhos rápidos ou digitar sua pergunta abaixo.",
        duration: 5000,
      });
    }
  }, [speechError, state]);

  // Se o reconhecimento parar automaticamente (fim de fala / silêncio detectado pelo sistema nativo)
  useEffect(() => {
    if (state === "listening" && !isListening) {
      if (transcript.trim()) {
        setManualText(transcript);
        processInput(transcript);
      } else {
        setState("idle");
      }
    }
  }, [isListening, state, transcript]);

  // Handle speech end manual (botão Concluir Fala)
  const handleStopListening = () => {
    stopListening();
    if (transcript.trim()) {
      setManualText(transcript);
      processInput(transcript);
    } else {
      setState("idle");
    }
  };

  // Process text or speech through Copilot
  const processInput = async (inputText: string) => {
    const textToProcess = inputText.trim();
    if (!textToProcess) return;

    setActivePromptText(textToProcess);
    setState("processing");
    setLastError(null);

    const filterOpts = {
      space,
      userId: user!.id,
      coupleId,
    };

    try {
      // 1. Interpretar com IA (whitelist rígida)
      const parsed = await parseCopilotCommand(textToProcess);
      setParsedCommand(parsed);

      if (parsed.intent === "unknown") {
        setQueryResult({
          text: parsed.reply_summary || "Não compreendi o comando. Tente perguntar sobre seus gastos, contas, metas ou limites de cartão.",
          intent: "unknown",
        });
        setState("query_answer");
        return;
      }

      // 2. Se for consulta (perguntas sobre gastos, orçamento, metas, contas, cartões)
      if (parsed.intent.startsWith("query_")) {
        const queryRes = await resolveCopilotQuery(parsed, filterOpts);
        setQueryResult(queryRes);
        setState("query_answer");
        await logVoiceCommand(user!.id, coupleId, space, textToProcess, parsed as any, "executed");
        return;
      }

      // 3. Se for ação (Adicionar despesa, aporte em meta, lista de compras)
      // FLUXO OBRIGATÓRIO: Interpretar -> Mostrar Prévia -> Confirmar -> Executar
      if (parsed.intent.startsWith("action_")) {
        const preview = await prepareCopilotActionPreview(parsed, filterOpts);
        setActionPreview(preview);
        setState("action_preview");
        await logVoiceCommand(user!.id, coupleId, space, textToProcess, parsed as any, "processing");
        return;
      }

      throw new Error("Intenção não suportada pelo Copiloto.");
    } catch (e: any) {
      console.error("Erro no processamento do Copiloto:", e);
      setLastError(e.message || "Erro desconhecido ao processar sua solicitação.");
      setState("error");
      if (user?.id) {
        await logVoiceCommand(user.id, coupleId, space, textToProcess, null, "failed", e.message);
      }
    }
  };

  // Confirmar e Executar a Ação Financeira
  const handleConfirmAction = async () => {
    if (!actionPreview) return;

    try {
      setIsExecuting(true);
      const res = await executeCopilotAction(actionPreview);
      setSuccessMessage(res.message);
      setState("success");

      // Invalida caches centrais de acordo com a ação
      if (actionPreview.type === "expense") {
        qc.invalidateQueries({ queryKey: ["home-monthly-summary"] });
        qc.invalidateQueries({ queryKey: ["fin-expenses"] });
        qc.invalidateQueries({ queryKey: ["fin-accounts-total"] });
        qc.invalidateQueries({ queryKey: ["recent-txs"] });
        qc.invalidateQueries({ queryKey: ["spending-power"] });
        qc.invalidateQueries({ queryKey: ["financial-snapshot"] });
        qc.invalidateQueries({ queryKey: ["financial-actuals"] });
      } else if (actionPreview.type === "goal_contribution") {
        qc.invalidateQueries({ queryKey: ["goals"] });
        qc.invalidateQueries({ queryKey: ["spending-power"] });
        qc.invalidateQueries({ queryKey: ["financial-snapshot"] });
      } else if (actionPreview.type === "shopping_items") {
        qc.invalidateQueries({ queryKey: ["shopping"] });
        qc.invalidateQueries({ queryKey: ["shopping-items"] });
      }

      toast.success("Ação confirmada e executada!");
      if (user?.id) {
        await logVoiceCommand(
          user.id,
          coupleId,
          space,
          activePromptText,
          parsedCommand as any,
          "executed"
        );
      }
    } catch (e: any) {
      console.error("Erro ao executar ação confirmada:", e);
      setLastError(e.message || "Não foi possível concluir a ação.");
      setState("error");
    } finally {
      setIsExecuting(false);
    }
  };

  // Render do conteúdo dinâmico
  const renderContent = () => {
    // 1. OUVINDO FALA
    if (state === "listening") {
      return (
        <div className="flex flex-col items-center justify-center py-10 px-4 space-y-6">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
            <div className="size-20 bg-primary text-primary-foreground rounded-full flex items-center justify-center relative z-10 shadow-lg">
              <Mic className="size-10" />
            </div>
          </div>
          <div className="text-center space-y-1">
            <p className="text-base font-semibold text-foreground animate-pulse">Ouvindo você...</p>
            <p className="text-xs text-muted-foreground">Fale claramente sua pergunta ou ação financeira</p>
          </div>
          <div className="w-full max-w-sm min-h-[56px] p-3 rounded-2xl bg-muted/60 border border-border/60 text-center text-sm font-medium text-foreground italic flex items-center justify-center">
            {transcript || "Fale agora: 'Quanto gastamos este mês?' ou 'Adicionar R$ 80 de combustível'"}
          </div>
          <Button variant="outline" className="rounded-full h-10 px-6 text-xs font-semibold" onClick={handleStopListening}>
            Concluir Fala
          </Button>
        </div>
      );
    }

    // 2. PROCESSANDO COM IA
    if (state === "processing") {
      return (
        <div className="flex flex-col items-center justify-center py-12 px-4 space-y-4">
          <div className="size-14 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Loader2 className="size-8 animate-spin" />
          </div>
          <div className="text-center space-y-1">
            <p className="font-semibold text-base text-foreground">Interpretando com IA...</p>
            <p className="text-xs text-muted-foreground">Consultando motor financeiro central</p>
          </div>
          <p className="text-xs text-muted-foreground italic max-w-xs text-center px-4 py-2 bg-muted/40 rounded-xl border border-border/40">
            "{activePromptText}"
          </p>
        </div>
      );
    }

    // 3. PRÉVIA DE AÇÃO FINANCEIRA (INTERPRETAR -> PRÉVIA -> CONFIRMAR)
    if (state === "action_preview" && actionPreview) {
      const { details } = actionPreview;

      return (
        <div className="flex flex-col px-4 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Card de Segurança e Confirmação */}
          <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <Badge className="bg-primary/20 text-primary border-primary/30 text-xs px-2.5 py-0.5 font-semibold">
                {actionPreview.badgeLabel}
              </Badge>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                <ShieldCheck className="size-3.5 text-primary" />
                <span>Confirmação Necessária</span>
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-lg text-foreground">{actionPreview.title}</h3>
              <p className="text-xs text-muted-foreground">{actionPreview.summary}</p>
            </div>

            {/* Detalhes de Despesa */}
            {actionPreview.type === "expense" && (
              <div className="rounded-xl bg-card border border-border/80 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground">Valor a lançar:</span>
                  <span className="text-xl font-bold text-destructive">{details.amountFormatted}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Descrição:</span>
                    <span className="font-semibold text-foreground">{details.description}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Categoria:</span>
                    <span className="font-semibold text-foreground">{details.categoryName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Data:</span>
                    <span className="font-medium text-foreground">{details.dateFormatted}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Espaço:</span>
                    <span className="font-medium text-foreground">{details.spaceLabel}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Detalhes de Aporte em Meta */}
            {actionPreview.type === "goal_contribution" && (
              <div className="rounded-xl bg-card border border-border/80 p-3.5 space-y-3">
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground">Valor do Aporte:</span>
                  <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    +{details.amountFormatted}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-foreground">{details.goalName}</span>
                    <span className="text-muted-foreground">
                      Novo progresso: <strong className="text-foreground">{details.newProgressPct}%</strong>
                    </span>
                  </div>
                  <Progress value={details.newProgressPct || 0} className="h-2" />
                  <div className="flex justify-between text-[11px] text-muted-foreground pt-0.5">
                    <span>Atual: {details.currentAmountFormatted}</span>
                    <span>Alvo: {details.targetAmountFormatted}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Detalhes de Compras */}
            {actionPreview.type === "shopping_items" && (
              <div className="rounded-xl bg-card border border-border/80 p-3 space-y-2">
                <span className="text-xs text-muted-foreground block">Itens para adicionar:</span>
                <ul className="space-y-1 pl-1">
                  {details.items?.map((item, idx) => (
                    <li key={idx} className="text-xs font-semibold text-foreground flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-primary" />
                      <span>{item.name}</span>
                      {item.quantity ? <span className="text-muted-foreground font-normal">({item.quantity} {item.unit || ""})</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Botões de Ação */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl h-11 text-xs font-medium"
              onClick={handleResetToIdle}
              disabled={isExecuting}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 rounded-xl h-11 text-xs font-semibold bg-primary text-primary-foreground gap-1.5 shadow-sm"
              onClick={handleConfirmAction}
              disabled={isExecuting}
            >
              {isExecuting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  <span>Confirmar e Salvar</span>
                </>
              )}
            </Button>
          </div>
        </div>
      );
    }

    // 4. RESPOSTA DE CONSULTA FINANCEIRA (CONSUMINDO MOTOR CENTRAL)
    if (state === "query_answer" && queryResult) {
      const card = queryResult.cardData;

      return (
        <div className="flex flex-col px-4 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Fala original */}
          <div className="text-xs text-muted-foreground italic px-3 py-1.5 rounded-lg bg-muted/40 border border-border/40">
            "{activePromptText}"
          </div>

          {/* Resposta conversacional acolhedora */}
          <div className="rounded-2xl bg-card border border-border p-4 space-y-3 shadow-xs">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs">
              <Sparkles className="size-4" />
              <span>Resposta do Copiloto</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed">
              {queryResult.text}
            </p>
          </div>

          {/* Card de Métricas do Motor Financeiro Central */}
          {card && (
            <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-muted/30 p-4 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">{card.title}</span>
                {card.badge && (
                  <Badge variant={card.badge.variant as any} className="text-[11px] font-semibold">
                    {card.badge.label}
                  </Badge>
                )}
              </div>

              <div className="space-y-0.5">
                <div className="text-2xl font-black text-foreground">{card.primaryMetric}</div>
                {card.secondaryMetric && (
                  <div className="text-xs text-muted-foreground font-medium">{card.secondaryMetric}</div>
                )}
              </div>

              {card.progressPct !== undefined && (
                <div className="space-y-1">
                  <Progress value={card.progressPct} className="h-2" />
                </div>
              )}

              {card.itemsList && card.itemsList.length > 0 && (
                <div className="pt-2 border-t border-border/60 space-y-1.5">
                  {card.itemsList.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                      <span className="text-muted-foreground">{item.label}</span>
                      <div className="text-right">
                        <span className="font-semibold text-foreground">{item.value}</span>
                        {item.extra && <span className="block text-[10px] text-muted-foreground">{item.extra}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Botão de continuação */}
          <Button
            variant="outline"
            className="w-full rounded-xl h-10 text-xs font-semibold gap-1.5 mt-2"
            onClick={handleResetToIdle}
          >
            <RotateCcw className="size-3.5" />
            <span>Fazer outra pergunta ou ação</span>
          </Button>
        </div>
      );
    }

    // 5. SUCESSO DE EXECUÇÃO
    if (state === "success") {
      return (
        <div className="flex flex-col items-center justify-center py-10 px-4 space-y-4">
          <div className="size-16 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center shadow-xs">
            <Check className="size-8" />
          </div>
          <div className="text-center space-y-1">
            <p className="font-bold text-lg text-foreground">Ação Realizada com Sucesso!</p>
            <p className="text-xs text-muted-foreground max-w-xs text-center">
              {successMessage || "Dados gravados e consolidados no motor financeiro."}
            </p>
          </div>
          <div className="flex gap-2 pt-2 w-full max-w-xs">
            <Button variant="outline" className="flex-1 rounded-xl h-10 text-xs" onClick={handleResetToIdle}>
              Novo Comando
            </Button>
            <Button className="flex-1 rounded-xl h-10 text-xs font-semibold bg-primary text-primary-foreground" onClick={handleClose}>
              Concluir
            </Button>
          </div>
        </div>
      );
    }

    // 6. ERRO
    if (state === "error") {
      return (
        <div className="flex flex-col items-center justify-center py-10 px-4 space-y-4">
          <div className="size-14 bg-destructive/10 text-destructive rounded-full flex items-center justify-center">
            <AlertTriangle className="size-7" />
          </div>
          <div className="text-center space-y-1">
            <p className="font-bold text-base text-foreground">Não foi possível processar</p>
            <p className="text-xs text-muted-foreground max-w-xs text-center px-2">
              {lastError || "Ocorreu uma instabilidade na conexão com o Copiloto."}
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="rounded-xl h-10 text-xs px-4" onClick={handleResetToIdle}>
              Voltar
            </Button>
            <Button
              className="rounded-xl h-10 text-xs px-4 bg-primary text-primary-foreground font-semibold"
              onClick={() => {
                if (activePromptText) {
                  processInput(activePromptText);
                } else {
                  handleResetToIdle();
                }
              }}
            >
              Tentar Novamente
            </Button>
          </div>
        </div>
      );
    }

    // 7. ESTADO IDLE (MENU PRINCIPAL COM ATALHOS E ENTRADA DE VOZ / TEXTO)
    return (
      <div className="flex flex-col px-4 py-4 space-y-5 max-h-[80vh] overflow-y-auto">
        {/* Sugestões Rápidas Obrigatórias da Etapa 13 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" />
              <span>Perguntas e Ações Rápidas</span>
            </span>
            <span className="text-[11px] text-muted-foreground">Toque para executar</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {QUICK_PROMPTS.map((prompt, idx) => {
              const Icon = prompt.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setManualText(prompt.text);
                    processInput(prompt.text);
                  }}
                  className="flex items-center justify-between text-left p-2.5 rounded-xl border border-border/70 bg-card hover:bg-muted/50 hover:border-primary/50 transition-all text-xs font-medium text-foreground group active:scale-[0.98]"
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <Icon className="size-3.5" />
                    </div>
                    <span className="truncate">{prompt.text}</span>
                  </div>
                  <ChevronRight className="size-3.5 text-muted-foreground/60 shrink-0 group-hover:text-primary transition-colors" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Aviso de microfone negado nas permissões do Android */}
        {microphoneState === "denied" && (
          <div
            role="button"
            onClick={() => setMicHelpOpen(true)}
            className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between cursor-pointer hover:bg-amber-500/15 transition-colors"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Microfone desativado nas permissões do celular. Toque para ver como liberar.</span>
            </div>
            <ChevronRight className="size-3.5 shrink-0" />
          </div>
        )}

        {/* Aviso de indisponibilidade de voz no dispositivo */}
        {microphoneState === "unavailable" && (
          <div className="p-3 rounded-xl bg-muted/60 border border-border/60 text-muted-foreground text-xs flex items-center gap-2">
            <HelpCircle className="size-4 shrink-0 text-muted-foreground" />
            <span>O reconhecimento de voz não está disponível neste dispositivo. Você pode digitar sua pergunta abaixo.</span>
          </div>
        )}

        {/* Microfone Central para Comando de Voz */}
        <div className="flex flex-col items-center justify-center py-2 space-y-2">
          <button
            type="button"
            onClick={async () => {
              if (microphoneState === "unavailable") {
                toast.info("O reconhecimento de voz não está disponível neste dispositivo. Você pode digitar sua pergunta abaixo.");
                return;
              }
              if (microphoneState === "denied") {
                setMicHelpOpen(true);
                return;
              }
              setState("listening");
              await startListening();
            }}
            className="size-16 rounded-full bg-primary text-primary-foreground shadow-md hover:scale-105 active:scale-95 transition-all flex items-center justify-center relative group"
          >
            <Mic className="size-8" />
            <span className="absolute -bottom-5 text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
              Toque para falar
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMicHelpOpen(true)}
            className="pt-6 text-[11px] text-muted-foreground/80 hover:text-foreground underline flex items-center gap-1 transition-colors"
          >
            <HelpCircle className="size-3" />
            <span>Como liberar o microfone no celular?</span>
          </button>
        </div>

        {/* Campo de Texto para Digitação com Envio Imediato */}
        <div className="pt-2">
          <div className="flex items-center gap-2">
            <Input
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Digite sua dúvida ou comando financeiro..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && manualText.trim()) {
                  processInput(manualText);
                }
              }}
              className="rounded-xl h-11 text-xs"
            />
            <Button
              size="icon"
              className="shrink-0 size-11 rounded-xl bg-primary text-primary-foreground shadow-xs"
              onClick={() => processInput(manualText)}
              disabled={!manualText.trim()}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="outline-none max-w-lg mx-auto">
          <DrawerHeader className="text-left border-b border-border/50 pb-2.5 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Sparkles className="size-4.5" />
                </div>
                <div>
                  <DrawerTitle className="text-sm font-bold text-foreground">
                    Copiloto Financeiro com IA
                  </DrawerTitle>
                  <p className="text-[11px] text-muted-foreground">
                    Perguntas e ações integradas ao motor financeiro
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 h-6">
                  {space === "shared" ? "Espaço Casal" : "Espaço Meu"}
                </Badge>
                {hasGeminiKey && (
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" title="IA Própria Ativa" />
                )}
              </div>
            </div>
          </DrawerHeader>

          {renderContent()}
        </DrawerContent>
      </Drawer>

      {/* Modal explicativo de como liberar o microfone no celular */}
      <Dialog open={micHelpOpen} onOpenChange={setMicHelpOpen}>
        <DialogContent className="max-w-sm rounded-2xl p-5 space-y-3">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Mic className="size-4 text-primary" />
              Como liberar o microfone no celular
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isNative
                ? "Configuração de permissão para o aplicativo instalado no Android (APK)."
                : "Configuração de permissão para o navegador Web / PWA."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 text-xs text-foreground">
            {isNative ? (
              <div className="p-3 bg-muted/50 rounded-xl space-y-1.5 border border-border/60">
                <p className="font-semibold text-primary">No Aplicativo Casal (Android)</p>
                <ol className="list-decimal pl-4 space-y-1 text-muted-foreground text-[11px]">
                  <li>Abra as <strong>Configurações do Android</strong> &gt; <strong>Apps</strong> (ou Aplicativos).</li>
                  <li>Localize e selecione o aplicativo <strong>Casal</strong>.</li>
                  <li>Toque em <strong>Permissões</strong> &gt; <strong>Microfone</strong>.</li>
                  <li>Escolha <strong>Permitir durante o uso do app</strong>.</li>
                  <li>Ao voltar para o app, a permissão será atualizada imediatamente sem precisar reiniciar!</li>
                </ol>
              </div>
            ) : (
              <div className="p-3 bg-muted/50 rounded-xl space-y-1.5 border border-border/60">
                <p className="font-semibold text-primary">Pelo navegador Chrome</p>
                <ol className="list-decimal pl-4 space-y-1 text-muted-foreground text-[11px]">
                  <li>Toque no ícone de <strong>cadeado (🔒)</strong> ou <strong>três pontinhos (⋮)</strong> ao lado do endereço.</li>
                  <li>Toque em <strong>Permissões</strong> &gt; <strong>Microfone</strong> e escolha <strong>Permitir</strong>.</li>
                </ol>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground italic bg-primary/5 p-2.5 rounded-lg border border-primary/20">
              💡 Você pode usar todas as funções do Copiloto digitando na caixinha ou tocando nos botões de atalho rápidos!
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={() => setMicHelpOpen(false)}
              className="w-full rounded-xl h-10 text-xs font-semibold bg-primary text-primary-foreground"
            >
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChevronRight(props: any) {
  return <ArrowRight {...props} />;
}

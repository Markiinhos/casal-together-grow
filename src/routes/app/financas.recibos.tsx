import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace } from "@/lib/space";
import { SpaceToggle } from "@/components/SpaceToggle";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Camera,
  FileText,
  Upload,
  Sparkles,
  Receipt,
  Check,
  Pencil,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  Building2,
  Calendar as CalendarIcon,
  Tag,
  CreditCard,
  Wallet,
  CheckCircle2,
  Image as ImageIcon,
  Key,
  ExternalLink,
} from "lucide-react";
import {
  processReceiptDocument,
  type ExtractedReceiptData,
  formatCurrencyBRL,
  getStoredGeminiKey,
  setStoredGeminiKey,
} from "@/lib/ocr";
import { formatDateOnly, getLocalISODate } from "@/lib/date-utils";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/app/financas/recibos")({
  head: () => ({
    meta: [
      { title: "Leitor de Recibos com IA — CASAL" },
      { name: "description", content: "Fotografe ou envie recibos, cupons e boletos com leitura automática por IA." },
    ],
  }),
  component: ReceiptsOcrPage,
});

function ReceiptsOcrPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const { space } = useSpace();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Inputs ocultos para os 4 modos de captura/envio
  const receiptCameraInputRef = useRef<HTMLInputElement>(null);
  const invoiceCameraInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const pdfFileInputRef = useRef<HTMLInputElement>(null);

  // Estados de processamento e dados extraídos
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [extractedData, setExtractedData] = useState<ExtractedReceiptData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Estados para chave de API do Gemini
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => getStoredGeminiKey());
  const [activeGeminiKey, setActiveGeminiKey] = useState(() => getStoredGeminiKey());

  function handleSaveApiKey() {
    setStoredGeminiKey(apiKeyInput);
    setActiveGeminiKey(apiKeyInput.trim());
    setApiKeyDialogOpen(false);
    if (apiKeyInput.trim()) {
      toast.success("Chave do Google Gemini salva com sucesso! Visão de IA ativada.");
    } else {
      toast.info("Chave removida. Usando provedor padrão do sistema.");
    }
  }

  // Campos de edição
  const [editMerchant, setEditMerchant] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("Cartão de Crédito");
  const [editCategoryId, setEditCategoryId] = useState<string>("");
  const [editAccountId, setEditAccountId] = useState<string>("");
  const [editCreditCardId, setEditCreditCardId] = useState<string>("");
  const [editDescription, setEditDescription] = useState("");

  // Buscar categorias do usuário/casal para despesas
  const { data: categories = [] } = useQuery({
    queryKey: ["receipt-categories", space, coupleId, user?.id],
    queryFn: async () => {
      let q = supabase
        .from("categories")
        .select("*")
        .in("type", ["expense", "other"])
        .eq("is_archived", false)
        .order("name");

      if (space === "private") {
        q = q.eq("user_id", user!.id);
      } else if (coupleId) {
        q = q.or(`couple_id.eq.${coupleId},user_id.eq.${user!.id}`);
      } else {
        q = q.eq("user_id", user!.id);
      }

      const { data } = await q;
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  // Buscar contas bancárias
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["receipt-bank-accounts", space, coupleId, user?.id],
    queryFn: async () => {
      let q = supabase.from("bank_accounts").select("*").eq("hidden", false);
      if (space === "private") {
        q = q.eq("visibility", "private").eq("user_id", user!.id);
      } else if (coupleId) {
        q = q.eq("visibility", "shared").eq("couple_id", coupleId);
      } else {
        q = q.eq("visibility", "shared").eq("user_id", user!.id);
      }
      const { data } = await q.order("name");
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  // Buscar cartões de crédito
  const { data: creditCards = [] } = useQuery({
    queryKey: ["receipt-credit-cards", space, coupleId, user?.id],
    queryFn: async () => {
      let q = supabase.from("credit_cards").select("*");
      if (space === "private") {
        q = q.eq("visibility", "private").eq("user_id", user!.id);
      } else if (coupleId) {
        q = q.eq("visibility", "shared").eq("couple_id", coupleId);
      } else {
        q = q.eq("visibility", "shared").eq("user_id", user!.id);
      }
      const { data } = await q.order("name");
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  // Mapeia categoria sugerida pela IA para uma categoria existente no banco
  function matchSuggestedCategory(suggestion: string): string {
    if (!suggestion || categories.length === 0) return "";
    const cleanSugg = suggestion.toLowerCase().trim();

    // 1. Busca exata por nome
    const exact = categories.find((c) => c.name.toLowerCase() === cleanSugg);
    if (exact) return exact.id;

    // 2. Busca parcial (ex: "Alimentação" bate em "Alimentação e Mercado")
    const partial = categories.find((c) =>
      c.name.toLowerCase().includes(cleanSugg) || cleanSugg.includes(c.name.toLowerCase())
    );
    if (partial) return partial.id;

    // 3. Sinonímia comum
    if (cleanSugg.includes("mercado") || cleanSugg.includes("comida")) {
      const food = categories.find((c) => c.name.toLowerCase().includes("aliment") || c.name.toLowerCase().includes("mercado"));
      if (food) return food.id;
    }
    if (cleanSugg.includes("gasolina") || cleanSugg.includes("posto")) {
      const fuel = categories.find((c) => c.name.toLowerCase().includes("transporte") || c.name.toLowerCase().includes("combust"));
      if (fuel) return fuel.id;
    }
    if (cleanSugg.includes("farmacia") || cleanSugg.includes("remedio")) {
      const health = categories.find((c) => c.name.toLowerCase().includes("saúde") || c.name.toLowerCase().includes("farm"));
      if (health) return health.id;
    }

    return categories[0]?.id || "";
  }

  // Handler de processamento do arquivo
  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reseta o input para permitir selecionar o mesmo arquivo novamente se quiser
    e.target.value = "";

    try {
      setIsProcessing(true);
      setProcessingStatus("Digitalizando documento com IA...");

      const result = await processReceiptDocument(file);
      setExtractedData(result);

      // Preenche os campos do formulário para permitir edição imediata
      setEditMerchant(result.merchant);
      setEditAmount(result.amount > 0 ? String(result.amount) : "");
      setEditDate(result.date || getLocalISODate());
      setEditPaymentMethod(result.payment_method || "Cartão de Crédito");
      setEditDescription(result.description);

      const matchedCat = matchSuggestedCategory(result.category_suggestion);
      setEditCategoryId(matchedCat);

      // Se método for cartão e tiver cartões, sugere o primeiro
      if (result.payment_method.toLowerCase().includes("cartão") && creditCards.length > 0) {
        setEditCreditCardId(creditCards[0].id);
      } else if (bankAccounts.length > 0) {
        setEditAccountId(bankAccounts[0].id);
      }

      setIsEditing(false);
      toast.success("Documento lido com sucesso! Revise os dados abaixo.");
    } catch (err: any) {
      console.error("Erro ao ler documento:", err);
      toast.error(
        err.message ||
          "Não foi possível ler o documento com IA. Você pode configurar uma chave gratuita do Gemini no topo da tela ou preencher os campos manualmente."
      );
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  }

  // Handler para salvar despesa confirmada
  async function handleSaveExpense() {
    if (!user) {
      toast.error("Você precisa estar autenticado.");
      return;
    }

    const parsedAmount = parseFloat(
      editAmount.toString().replace("R$", "").trim().replace(/\./g, "").replace(",", ".")
    );

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Informe um valor válido maior que zero.");
      return;
    }

    const finalDate = editDate || getLocalISODate();

    setIsSaving(true);
    try {
      const descriptionToSave = editMerchant
        ? `${editMerchant} - ${editDescription || "Despesa"}`
        : editDescription || "Despesa lida por IA";

      const insertPayload: any = {
        user_id: user.id,
        couple_id: space === "shared" ? coupleId : null,
        visibility: space,
        type: "expense",
        amount: parsedAmount,
        description: descriptionToSave,
        date: finalDate,
        category_id: editCategoryId || null,
        account_id: editAccountId || null,
        credit_card_id: editCreditCardId || null,
      };

      const { error } = await supabase.from("transactions").insert(insertPayload);

      if (error) {
        throw error;
      }

      toast.success("Despesa adicionada com sucesso!");

      // Invalida caches para atualizar resumos financeiros
      qc.invalidateQueries({ queryKey: ["home-monthly-summary"] });
      qc.invalidateQueries({ queryKey: ["fin-expenses"] });
      qc.invalidateQueries({ queryKey: ["fin-accounts-total"] });
      qc.invalidateQueries({ queryKey: ["recent-txs"] });
      qc.invalidateQueries({ queryKey: ["spending-power"] });
      qc.invalidateQueries({ queryKey: ["card-aggregates"] });

      // Limpa dados atuais
      setExtractedData(null);
      setIsEditing(false);

      // Redireciona para o financeiro
      navigate({ to: "/app/financas" });
    } catch (err: any) {
      console.error("Erro ao salvar despesa do recibo:", err);
      toast.error(err.message || "Erro ao salvar despesa.");
    } finally {
      setIsSaving(false);
    }
  }

  // Categoria atualmente selecionada para exibição no card de confirmação
  const selectedCategoryName = useMemo(() => {
    if (editCategoryId) {
      const found = categories.find((c) => c.id === editCategoryId);
      if (found) return found.name;
    }
    return extractedData?.category_suggestion || "Alimentação";
  }, [editCategoryId, categories, extractedData]);

  return (
    <ErrorBoundary>
      <AppHeader
        title="Leitor de Recibos com IA"
        subtitle="Fotografe ou envie recibos, notas e boletos"
      />

      <div className="px-4 py-4 space-y-5 pb-24 max-w-2xl mx-auto">
        {/* Toggle de Espaço, Atalho de Retorno e Configuração de IA */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground">
            <Link to="/app/financas">
              <ArrowLeft className="size-4" />
              <span>Voltar ao Financeiro</span>
            </Link>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setApiKeyInput(getStoredGeminiKey());
                setApiKeyDialogOpen(true);
              }}
              className="gap-1.5 h-8 text-xs rounded-full border-border/80 shadow-xs"
            >
              <Key className="size-3.5 text-primary" />
              <span>{activeGeminiKey ? "Chave IA Ativa" : "Configurar IA"}</span>
              <span className={`size-2 rounded-full ${activeGeminiKey ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
            </Button>
            <SpaceToggle />
          </div>
        </div>

        {/* Inputs de arquivo ocultos acionados pelos botões da interface */}
        {/* 1. Fotografar recibo via câmera do dispositivo */}
        <input
          type="file"
          ref={receiptCameraInputRef}
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileSelected}
        />
        {/* 2. Fotografar nota/cupom via câmera do dispositivo */}
        <input
          type="file"
          ref={invoiceCameraInputRef}
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileSelected}
        />
        {/* 3. Enviar imagem da galeria/arquivo */}
        <input
          type="file"
          ref={imageFileInputRef}
          accept="image/png,image/jpeg,image/webp,image/heic,image/bmp"
          className="hidden"
          onChange={handleFileSelected}
        />
        {/* 4. Enviar PDF de boleto ou nota fiscal */}
        <input
          type="file"
          ref={pdfFileInputRef}
          accept="application/pdf"
          className="hidden"
          onChange={handleFileSelected}
        />

        {/* Card informativo de recursos */}
        {!extractedData && !isProcessing && (
          <Card className="rounded-3xl p-5 shadow-card border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Sparkles className="size-4" />
              </div>
              <h2 className="font-semibold text-sm">Extração Automática com IA</h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              O sistema lê automaticamente o <strong>estabelecimento</strong>, <strong>valor</strong>, <strong>data</strong>,{" "}
              <strong>forma de pagamento</strong> e sugere a <strong>categoria</strong>. Você sempre terá uma prévia para conferir e editar antes de salvar.
            </p>
          </Card>
        )}

        {/* Grade de 4 opções de captura/upload */}
        {!extractedData && !isProcessing && (
          <div className="space-y-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Como deseja registrar?
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Opção 1: Fotografar recibo */}
              <button
                type="button"
                onClick={() => receiptCameraInputRef.current?.click()}
                className="rounded-3xl p-4 bg-card border border-border hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98] transition-all flex flex-col items-center text-center gap-2.5 shadow-xs group"
              >
                <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Camera className="size-6" />
                </div>
                <div>
                  <div className="font-semibold text-sm">Fotografar recibo</div>
                  <div className="text-[11px] text-muted-foreground">Câmera para comprovantes</div>
                </div>
              </button>

              {/* Opção 2: Fotografar nota fiscal */}
              <button
                type="button"
                onClick={() => invoiceCameraInputRef.current?.click()}
                className="rounded-3xl p-4 bg-card border border-border hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98] transition-all flex flex-col items-center text-center gap-2.5 shadow-xs group"
              >
                <div className="size-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Receipt className="size-6" />
                </div>
                <div>
                  <div className="font-semibold text-sm">Fotografar nota</div>
                  <div className="text-[11px] text-muted-foreground">Cupom fiscal NFC-e ou SAT</div>
                </div>
              </button>

              {/* Opção 3: Enviar imagem */}
              <button
                type="button"
                onClick={() => imageFileInputRef.current?.click()}
                className="rounded-3xl p-4 bg-card border border-border hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98] transition-all flex flex-col items-center text-center gap-2.5 shadow-xs group"
              >
                <div className="size-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ImageIcon className="size-6" />
                </div>
                <div>
                  <div className="font-semibold text-sm">Enviar imagem</div>
                  <div className="text-[11px] text-muted-foreground">Galeria (JPG, PNG, WEBP)</div>
                </div>
              </button>

              {/* Opção 4: Enviar PDF */}
              <button
                type="button"
                onClick={() => pdfFileInputRef.current?.click()}
                className="rounded-3xl p-4 bg-card border border-border hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98] transition-all flex flex-col items-center text-center gap-2.5 shadow-xs group"
              >
                <div className="size-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileText className="size-6" />
                </div>
                <div>
                  <div className="font-semibold text-sm">Enviar PDF</div>
                  <div className="text-[11px] text-muted-foreground">Boletos e notas em PDF</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Estado de Leitura / Processamento em andamento */}
        {isProcessing && (
          <Card className="rounded-3xl p-8 shadow-card text-center space-y-4 border-primary/30 animate-pulse">
            <div className="size-16 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
              <RefreshCw className="size-8 animate-spin" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Lendo documento com IA</h3>
              <p className="text-xs text-muted-foreground mt-1">{processingStatus}</p>
            </div>
            <p className="text-[11px] text-muted-foreground/80">
              Identificando valor total, estabelecimento, data e itens do comprovante...
            </p>
          </Card>
        )}

        {/* ESTRUTURA DE CONFIRMAÇÃO EXATA DO PROMPT DO USUÁRIO */}
        {extractedData && (
          <div className="space-y-4">
            {/* Visualizador do documento ou preview */}
            {extractedData.previewUrl && (
              <div className="rounded-2xl overflow-hidden border border-border bg-black/5 dark:bg-white/5 p-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {extractedData.fileType?.includes("pdf") ? (
                    <div className="size-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center">
                      <FileText className="size-5" />
                    </div>
                  ) : (
                    <img
                      src={extractedData.previewUrl}
                      alt="Recibo"
                      className="size-12 rounded-lg object-cover border"
                    />
                  )}
                  <div className="text-xs">
                    <p className="font-medium truncate max-w-[200px]">{extractedData.fileName || "Documento"}</p>
                    <p className="text-muted-foreground text-[11px]">
                      {extractedData.confidence >= 0.8 ? "Leitura nítida" : "Verifique os detalhes"}
                    </p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setExtractedData(null);
                    setIsEditing(false);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Trocar arquivo
                </Button>
              </div>
            )}

            {/* CARD DE CONFIRMAÇÃO FORMATADO CONFORME ESPECIFICADO:
                Encontrei:
                Mercado
                R$ 187,42
                30/09/2026
                Alimentação

                Adicionar despesa?
            */}
            {!isEditing ? (
              <Card className="rounded-3xl p-6 shadow-card border-primary/30 bg-card space-y-5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                    <Sparkles className="size-3.5" />
                    <span>Encontrei:</span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {extractedData.sourceEngine && (
                      <Badge variant="secondary" className="text-[10px] font-normal bg-primary/10 text-primary border-primary/20">
                        {extractedData.sourceEngine}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[11px] font-normal">
                      {editPaymentMethod}
                    </Badge>
                  </div>
                </div>

                {/* Bloco de dados destacados */}
                <div className="space-y-2 py-1">
                  <div className="text-2xl font-bold tracking-tight text-foreground">
                    {editMerchant || "Estabelecimento"}
                  </div>
                  <div className="text-3xl font-extrabold text-primary">
                    {formatCurrencyBRL(parseFloat(editAmount) || extractedData.amount)}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <CalendarIcon className="size-4" />
                      <span>{formatDateOnly(editDate || extractedData.date)}</span>
                    </div>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <Tag className="size-4" />
                      <span className="font-medium text-foreground">{selectedCategoryName}</span>
                    </div>
                  </div>
                </div>

                {editDescription && (
                  <p className="text-xs text-muted-foreground bg-muted/50 p-2.5 rounded-xl border border-border/50">
                    {editDescription}
                  </p>
                )}

                {/* Pergunta de confirmação e ações */}
                <div className="pt-2 border-t border-border/60 space-y-3">
                  <p className="text-sm font-semibold text-center text-foreground">
                    Adicionar despesa?
                  </p>

                  <div className="grid grid-cols-2 gap-2.5">
                    <Button
                      type="button"
                      onClick={handleSaveExpense}
                      disabled={isSaving}
                      className="rounded-2xl h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md gap-2"
                    >
                      {isSaving ? (
                        <RefreshCw className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      <span>Sim, adicionar</span>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditing(true)}
                      className="rounded-2xl h-12 font-medium gap-2 border-border"
                    >
                      <Pencil className="size-4" />
                      <span>Editar campos</span>
                    </Button>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setExtractedData(null);
                      setIsEditing(false);
                    }}
                    className="w-full text-xs text-muted-foreground hover:text-foreground"
                  >
                    Escanear outro documento
                  </Button>
                </div>
              </Card>
            ) : (
              /* Formulário de Edição Completa quando o usuário clica em 'Editar campos' */
              <Card className="rounded-3xl p-5 shadow-card space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <Pencil className="size-4 text-primary" />
                    <h3 className="font-semibold text-sm">Editar detalhes da despesa</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(false)}
                    className="text-xs text-muted-foreground"
                  >
                    Cancelar edição
                  </Button>
                </div>

                <div className="space-y-3 text-xs">
                  {/* Estabelecimento */}
                  <div className="space-y-1">
                    <Label htmlFor="merchant" className="text-xs font-medium flex items-center gap-1.5">
                      <Building2 className="size-3.5 text-muted-foreground" />
                      <span>Estabelecimento</span>
                    </Label>
                    <Input
                      id="merchant"
                      value={editMerchant}
                      onChange={(e) => setEditMerchant(e.target.value)}
                      placeholder="Ex: Mercado Pão de Açúcar, Posto Shell..."
                      className="rounded-xl h-10"
                    />
                  </div>

                  {/* Valor e Data */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="amount" className="text-xs font-medium flex items-center gap-1.5">
                        <Wallet className="size-3.5 text-muted-foreground" />
                        <span>Valor (R$)</span>
                      </Label>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        placeholder="0,00"
                        className="rounded-xl h-10 font-semibold"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="date" className="text-xs font-medium flex items-center gap-1.5">
                        <CalendarIcon className="size-3.5 text-muted-foreground" />
                        <span>Data</span>
                      </Label>
                      <Input
                        id="date"
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="rounded-xl h-10"
                      />
                    </div>
                  </div>

                  {/* Forma de Pagamento */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <CreditCard className="size-3.5 text-muted-foreground" />
                      <span>Forma de Pagamento</span>
                    </Label>
                    <Select
                      value={editPaymentMethod || "Cartão de Crédito"}
                      onValueChange={(val) => setEditPaymentMethod(val)}
                    >
                      <SelectTrigger className="rounded-xl h-10">
                        <SelectValue placeholder="Selecione a forma" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
                        <SelectItem value="Pix">Pix</SelectItem>
                        <SelectItem value="Débito">Cartão de Débito</SelectItem>
                        <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="Boleto">Boleto Bancário</SelectItem>
                        <SelectItem value="Outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Categoria */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Tag className="size-3.5 text-muted-foreground" />
                      <span>Categoria</span>
                    </Label>
                    <Select
                      value={editCategoryId || undefined}
                      onValueChange={(val) => setEditCategoryId(val)}
                    >
                      <SelectTrigger className="rounded-xl h-10">
                        <SelectValue placeholder="Selecione a categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.filter((cat) => Boolean(cat?.id)).map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Conta bancária ou Cartão */}
                  {editPaymentMethod === "Cartão de Crédito" && creditCards.length > 0 ? (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <CreditCard className="size-3.5 text-muted-foreground" />
                        <span>Cartão de Crédito</span>
                      </Label>
                      <Select
                        value={editCreditCardId || undefined}
                        onValueChange={(val) => setEditCreditCardId(val)}
                      >
                        <SelectTrigger className="rounded-xl h-10">
                          <SelectValue placeholder="Selecione o cartão" />
                        </SelectTrigger>
                        <SelectContent>
                          {creditCards.filter((card) => Boolean(card?.id)).map((card) => (
                            <SelectItem key={card.id} value={card.id}>
                              {card.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : bankAccounts.length > 0 ? (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <Wallet className="size-3.5 text-muted-foreground" />
                        <span>Conta Bancária</span>
                      </Label>
                      <Select
                        value={editAccountId || undefined}
                        onValueChange={(val) => setEditAccountId(val)}
                      >
                        <SelectTrigger className="rounded-xl h-10">
                          <SelectValue placeholder="Selecione a conta" />
                        </SelectTrigger>
                        <SelectContent>
                          {bankAccounts.filter((acc) => Boolean(acc?.id)).map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              {acc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}

                  {/* Descrição / Itens */}
                  <div className="space-y-1">
                    <Label htmlFor="desc" className="text-xs font-medium">
                      Descrição / Itens do comprovante
                    </Label>
                    <Textarea
                      id="desc"
                      rows={2}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Ex: Compras da semana, almoço de domingo..."
                      className="rounded-xl resize-none"
                    />
                  </div>
                </div>

                <div className="pt-2 flex gap-2">
                  <Button
                    type="button"
                    onClick={handleSaveExpense}
                    disabled={isSaving}
                    className="flex-1 rounded-xl bg-primary text-primary-foreground font-semibold h-11"
                  >
                    {isSaving ? <RefreshCw className="size-4 animate-spin mr-2" /> : <Check className="size-4 mr-2" />}
                    Salvar despesa
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                    className="rounded-xl h-11"
                  >
                    Ver prévia
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Dicas de digitalização */}
        <div className="rounded-2xl bg-muted/40 p-4 border border-border/50 space-y-1.5 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-primary" />
            <span>Dicas para melhor leitura:</span>
          </p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Posicione o recibo sobre uma superfície plana e bem iluminada.</li>
            <li>Certifique-se de que o valor total e o nome do local estão visíveis.</li>
            <li>Para boletos e notas fiscais eletrônicas, envie o arquivo PDF direto.</li>
          </ul>
        </div>

        {/* Modal de Configuração de Chave de IA */}
        <Dialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen}>
          <DialogContent className="max-w-md rounded-3xl p-6">
            <DialogHeader>
              <div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-2">
                <Key className="size-5" />
              </div>
              <DialogTitle className="text-base font-bold">Chave de IA (Visão Computacional)</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
                Para ter leitura 100% precisa e instantânea de comprovantes e fotos, você pode usar uma chave gratuita do <strong>Google Gemini (1.5 Flash Vision)</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div className="rounded-2xl bg-muted/50 p-3.5 border border-border/60 space-y-2">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-amber-500" />
                  <span>Como obter gratuitamente (1 minuto):</span>
                </div>
                <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
                  <li>Acesse o Google AI Studio com sua conta Google.</li>
                  <li>Clique em <strong>Get API key</strong> e crie uma nova chave.</li>
                  <li>Cole a chave no campo abaixo. É 100% gratuito (1.500 requisições/dia).</li>
                </ol>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary font-semibold hover:underline pt-1"
                >
                  <span>Abrir Google AI Studio</span>
                  <ExternalLink className="size-3" />
                </a>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="gemini-key" className="text-xs font-medium">Chave de API do Gemini</Label>
                <Input
                  id="gemini-key"
                  type="password"
                  placeholder="AIzaSy..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="rounded-xl h-10 font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  A chave fica armazenada com segurança apenas no seu navegador.
                </p>
              </div>
            </div>

            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setApiKeyInput("");
                  setStoredGeminiKey("");
                  setActiveGeminiKey("");
                  setApiKeyDialogOpen(false);
                  toast.info("Chave removida.");
                }}
                className="rounded-xl h-10 text-xs"
              >
                Limpar
              </Button>
              <Button
                type="button"
                onClick={handleSaveApiKey}
                className="flex-1 rounded-xl h-10 text-xs font-semibold bg-primary text-primary-foreground"
              >
                Salvar Chave
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ErrorBoundary>
  );
}

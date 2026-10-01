import { supabase } from "@/integrations/supabase/client";
import type { OCRDocumentResult } from "./ocr.functions";
import { formatDateOnly, getLocalISODate, toDatabaseDate } from "./date-utils";

export interface ExtractedReceiptData {
  merchant: string;
  amount: number;
  amountFormatted: string; // "R$ 187,42"
  date: string; // YYYY-MM-DD
  dateFormatted: string; // DD/MM/AAAA
  payment_method: string; // "Cartão de Crédito" | "Pix" | "Débito" | "Dinheiro" | "Boleto" | "Outro"
  description: string;
  category_suggestion: string;
  confidence: number;
  needs_confirmation: boolean;
  previewUrl?: string;
  fileName?: string;
  fileType?: string;
  sourceEngine?: string;
  rawText?: string;
}

const OCR_SYSTEM_PROMPT = `
Você é um especialista em OCR e auditoria fiscal do Brasil.
Sua missão é extrair com precisão absoluta os dados de documentos financeiros brasileiros:
- Cupons fiscais (NFC-e, SAT, ECF, extratos de supermercado/farmácia/posto)
- Notas Fiscais (DANFE)
- Comprovantes de maquininha de cartão (Stone, Cielo, Rede, PagBank)
- Comprovantes de PIX ou transferência bancária
- Boletos bancários e faturas de consumo (luz, água, internet, gás)

Responda EXCLUSIVAMENTE em formato JSON com o seguinte schema:
{
  "merchant": "Nome do Estabelecimento / Favorecido (ex: Mercado Pão de Açúcar, Droga Raia, Posto Ipiranga)",
  "amount": 187.42,
  "date": "YYYY-MM-DD",
  "payment_method": "Cartão de Crédito",
  "description": "Breve resumo dos itens ou serviço",
  "category_suggestion": "Alimentação",
  "confidence": 0.95,
  "needs_confirmation": true
}

Regras:
1. "merchant": Identifique o nome comercial ou razão social principal.
2. "amount": Deve ser o valor TOTAL FINAL líquido pago/cobrado (float com ponto). Nunca inclua símbolo "R$".
3. "date": Data no formato AAAA-MM-DD. Se a imagem tiver "30/09/2026", retorne "2026-09-30".
4. "payment_method": Escolha uma opção: "Cartão de Crédito", "Pix", "Débito", "Dinheiro", "Boleto", "Outro".
5. "category_suggestion": Categoria compatível em português (ex: "Alimentação", "Mercado", "Combustível", "Transporte", "Saúde", "Moradia", "Lazer", "Contas", "Outros").
6. Não adicione nenhum comentário ou texto fora do JSON.
`;

const LOCAL_STORAGE_GEMINI_KEY = "casal_gemini_api_key";

/**
 * Obtém a chave Gemini configurada pelo usuário no navegador ou no ambiente
 */
export function getStoredGeminiKey(): string {
  try {
    const fromStorage = localStorage.getItem(LOCAL_STORAGE_GEMINI_KEY);
    if (fromStorage && fromStorage.trim().length > 10) return fromStorage.trim();
  } catch {
    // ignore
  }
  const fromEnv = (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (fromEnv && fromEnv.trim().length > 10) return fromEnv.trim();
  return "";
}

/**
 * Salva a chave Gemini do usuário no navegador de forma privada
 */
export function setStoredGeminiKey(key: string) {
  try {
    if (!key || !key.trim()) {
      localStorage.removeItem(LOCAL_STORAGE_GEMINI_KEY);
    } else {
      localStorage.setItem(LOCAL_STORAGE_GEMINI_KEY, key.trim());
    }
  } catch {
    // ignore
  }
}

/**
 * Comprime e redimensiona imagem no navegador antes de enviar.
 * Evita lentidão, timeout de rede e estouro de memória em fotos de celulares modernos.
 */
export async function compressAndPrepareFile(
  file: File,
  maxDimension = 1600,
  quality = 0.85
): Promise<{ base64Data: string; mimeType: string }> {
  // Se for PDF, converte direto para base64 pura
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const match = result.match(/^data:(.+?);base64,(.+)$/);
        resolve({
          mimeType: "application/pdf",
          base64Data: match ? match[2] : result,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Se for imagem, redimensiona via HTML Canvas
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          // Fallback caso canvas 2D falhe
          const result = reader.result as string;
          const match = result.match(/^data:(.+?);base64,(.+)$/);
          resolve({
            mimeType: file.type || "image/jpeg",
            base64Data: match ? match[2] : result,
          });
          return;
        }

        // Fundo branco para garantir nitidez de recibos transparentes/PNG
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
        resolve({
          mimeType: "image/jpeg",
          base64Data: match ? match[2] : dataUrl,
        });
      };
      img.onerror = () => {
        // Fallback se não conseguir carregar como imagem
        const result = reader.result as string;
        const match = result.match(/^data:(.+?);base64,(.+)$/);
        resolve({
          mimeType: file.type || "image/jpeg",
          base64Data: match ? match[2] : result,
        });
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Formata número float para moeda brasileira BRL: "R$ 187,42"
 */
export function formatCurrencyBRL(value: number): string {
  if (isNaN(value)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/**
 * Descobre modelos disponíveis no Google AI Studio para a chave informada
 */
async function getGeminiCandidateModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (res.ok) {
      const data = await res.json();
      const modelsList: Array<{ name: string; supportedGenerationMethods?: string[] }> =
        data.models || [];
      const supported = modelsList
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""));

      if (supported.length > 0) {
        const preferredPriority = [
          "gemini-1.5-flash",
          "gemini-1.5-flash-001",
          "gemini-1.5-flash-002",
          "gemini-1.5-flash-8b",
          "gemini-2.0-flash",
          "gemini-2.0-flash-exp",
          "gemini-2.5-flash",
          "gemini-1.5-pro",
          "gemini-1.5-pro-001",
          "gemini-1.5-pro-002",
        ];

        const sorted: string[] = [];
        for (const p of preferredPriority) {
          if (supported.includes(p)) sorted.push(p);
        }
        for (const m of supported) {
          if (!sorted.includes(m)) sorted.push(m);
        }
        return sorted;
      }
    } else {
      const errJson = await res.json().catch(() => null);
      const errMsg = errJson?.error?.message || `Status ${res.status}`;
      if (errMsg.includes("API key not valid") || errMsg.includes("API_KEY_INVALID")) {
        throw new Error(
          "Chave do Google Gemini inválida. Por favor, revise a chave inserida no botão 'Configurar IA'."
        );
      }
    }
  } catch (err: any) {
    if (err.message?.includes("Chave do Google Gemini inválida")) {
      throw err;
    }
    console.warn("Aviso ao listar modelos dinamicamente:", err);
  }

  // Fallback padrão se não conseguir listar
  return [
    "gemini-1.5-flash",
    "gemini-1.5-flash-001",
    "gemini-1.5-flash-002",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
  ];
}

/**
 * Chama o Google Gemini Vision direto via API Key (mais rápido e 100% gratuito)
 */
async function callGeminiVisionDirect(
  apiKey: string,
  base64Data: string,
  mimeType: string
): Promise<{ result: OCRDocumentResult; modelName: string }> {
  const cleanKey = apiKey.trim();
  const cleanBase64 = base64Data.replace(/^data:.+?;base64,/, "").trim();
  const cleanMimeType = mimeType || "image/jpeg";

  const candidateModels = await getGeminiCandidateModels(cleanKey);
  const errors: string[] = [];

  for (const model of candidateModels) {
    // Tenta primeiro com inline_data (REST canônico v1beta) e depois inlineData
    const payloadVariants = [
      {
        contents: [
          {
            role: "user",
            parts: [
              { text: OCR_SYSTEM_PROMPT },
              {
                inline_data: {
                  mime_type: cleanMimeType,
                  data: cleanBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      },
      {
        contents: [
          {
            role: "user",
            parts: [
              { text: OCR_SYSTEM_PROMPT },
              {
                inlineData: {
                  mimeType: cleanMimeType,
                  data: cleanBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      },
      {
        contents: [
          {
            role: "user",
            parts: [
              { text: OCR_SYSTEM_PROMPT },
              {
                inline_data: {
                  mime_type: cleanMimeType,
                  data: cleanBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
        },
      },
    ];

    for (const bodyPayload of payloadVariants) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyPayload),
          }
        );

        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          const errMsg = errJson?.error?.message || `Status ${res.status}`;

          if (errMsg.includes("API key not valid") || errMsg.includes("API_KEY_INVALID")) {
            throw new Error(
              "Chave do Google Gemini inválida. Por favor, revise a chave inserida no botão 'Configurar IA'."
            );
          }

          if (
            errMsg.includes("Unknown name") ||
            errMsg.includes("Cannot find field") ||
            errMsg.includes("responseMimeType")
          ) {
            continue;
          }

          throw new Error(`Google Gemini (${model}): ${errMsg}`);
        }

        const json = await res.json();
        const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) {
          throw new Error(`Gemini (${model}) não retornou conteúdo textual.`);
        }

        const clean = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(clean);
        return { result: parsed, modelName: model };
      } catch (err: any) {
        if (err.message?.includes("Chave do Google Gemini inválida")) {
          throw err;
        }
        if (
          err.message?.includes("Unknown name") ||
          err.message?.includes("Cannot find field") ||
          err.message?.includes("responseMimeType")
        ) {
          continue;
        }
        errors.push(`${model}: ${err.message || String(err)}`);
        break;
      }
    }
  }

  throw new Error(
    errors.length > 0
      ? errors.slice(0, 2).join(" | ")
      : "Falha ao comunicar com os modelos disponíveis do Google Gemini."
  );
}

/**
 * Chama a Edge Function parse-receipt no Supabase
 */
async function callSupabaseEdgeFunction(
  base64Data: string,
  mimeType: string
): Promise<OCRDocumentResult> {
  const { data, error } = await supabase.functions.invoke("parse-receipt", {
    body: { base64Data, mimeType },
  });

  if (error) {
    throw error;
  }

  if (data?.result) {
    return data.result;
  }

  throw new Error(data?.error || "Edge function não retornou resultado");
}

/**
 * Processa documento com prioridade em IA Real:
 * 1. Chave Gemini direta (se configurada pelo usuário ou no ambiente)
 * 2. Edge Function Supabase parse-receipt (usando gateway da Lovable)
 * 3. Server Function TanStack Start parseReceiptDocumentFn
 */
export async function processReceiptDocument(file: File): Promise<ExtractedReceiptData> {
  const previewUrl = URL.createObjectURL(file);
  const fileType = file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg");

  // 1. Comprime a imagem para transmissão leve e rápida
  const { base64Data, mimeType } = await compressAndPrepareFile(file);

  let parsedResult: OCRDocumentResult | null = null;
  let sourceEngine = "Desconhecido";
  let lastError: Error | null = null;

  // Tentativa 1: Google Gemini Vision direto se houver chave configurada
  const geminiKey = getStoredGeminiKey();
  if (geminiKey) {
    try {
      const { result, modelName } = await callGeminiVisionDirect(geminiKey, base64Data, mimeType);
      parsedResult = result;
      sourceEngine = `Google Gemini (${modelName})`;
    } catch (err: any) {
      console.error("Falha no Gemini direto:", err);
      throw err;
    }
  }

  // Tentativa 2: Edge Function parse-receipt no Supabase (Lovable AI Gateway)
  if (!parsedResult) {
    try {
      parsedResult = await callSupabaseEdgeFunction(base64Data, mimeType);
      sourceEngine = "Lovable AI Gateway (parse-receipt)";
    } catch (err: any) {
      console.warn("Falha na Edge Function parse-receipt:", err);
      lastError = err;
    }
  }

  // Tentativa 3: Server function TanStack Start
  if (!parsedResult) {
    try {
      const { parseReceiptDocumentFn } = await import("./ocr.functions");
      parsedResult = await parseReceiptDocumentFn({
        data: {
          base64Data,
          mimeType,
          fileName: file.name,
        },
      });
      sourceEngine = "Servidor Local (parseReceiptDocumentFn)";
    } catch (err: any) {
      console.warn("Falha no parseReceiptDocumentFn:", err);
      lastError = err;
    }
  }

  // Se todas as IAs falharem (nenhuma chave configurada no servidor ou Lovable gateway sem cota)
  if (!parsedResult) {
    throw new Error(
      lastError?.message ||
        "Não foi possível conectar à IA de visão. Configure sua chave gratuita do Google Gemini para ter leitura 100% funcional."
    );
  }

  // Normalização de dados recebidos da IA
  let dateStr = parsedResult.date;
  if (dateStr && dateStr.includes("/")) {
    dateStr = toDatabaseDate(dateStr);
  }
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    dateStr = getLocalISODate();
  }

  const dateFormatted = formatDateOnly(dateStr);
  const amountVal = Number(parsedResult.amount) || 0;
  const amountFormatted = formatCurrencyBRL(amountVal);

  return {
    merchant: parsedResult.merchant || "Estabelecimento",
    amount: amountVal,
    amountFormatted,
    date: dateStr,
    dateFormatted,
    payment_method: parsedResult.payment_method || "Cartão de Crédito",
    description: parsedResult.description || `Despesa em ${parsedResult.merchant || "estabelecimento"}`,
    category_suggestion: parsedResult.category_suggestion || "Alimentação",
    confidence: parsedResult.confidence ?? 0.9,
    needs_confirmation: parsedResult.needs_confirmation ?? true,
    previewUrl,
    fileName: file.name,
    fileType,
    sourceEngine,
  };
}

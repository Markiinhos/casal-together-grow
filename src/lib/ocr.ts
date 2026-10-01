import { parseReceiptDocumentFn, OCRDocumentResult } from "./ocr.functions";
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
}

/**
 * Converte arquivo File para Base64 pura (sem data:mime;base64, prefix)
 */
export async function fileToBase64(file: File): Promise<{ base64Data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const match = result.match(/^data:(.+?);base64,(.+)$/);
      if (match) {
        resolve({
          mimeType: match[1],
          base64Data: match[2],
        });
      } else {
        // Fallback caso não venha o prefixo
        resolve({
          mimeType: file.type || "application/octet-stream",
          base64Data: result,
        });
      }
    };
    reader.onerror = (error) => reject(error);
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
 * Fallback heurístico inteligente para quando a API de IA externa não estiver disponível
 * ou não houver chave de API configurada no ambiente.
 * Garante que a aplicação nunca trave e ofereça uma prévia editável para o usuário.
 */
function extractHeuristicFallback(file: File): OCRDocumentResult {
  const fileName = file.name.toLowerCase();
  const today = getLocalISODate();

  let merchant = "Estabelecimento";
  let category_suggestion = "Outros";
  let payment_method = "Cartão de Crédito";
  let description = "Despesa lida do documento";
  let amount = 0;

  if (fileName.includes("mercado") || fileName.includes("pao") || fileName.includes("carrefour") || fileName.includes("extra")) {
    merchant = "Mercado";
    category_suggestion = "Alimentação";
    description = "Compras de mercado";
  } else if (fileName.includes("posto") || fileName.includes("combustivel") || fileName.includes("gasolina") || fileName.includes("shell")) {
    merchant = "Posto de Combustível";
    category_suggestion = "Combustível";
    description = "Abastecimento";
  } else if (fileName.includes("farmacia") || fileName.includes("droga") || fileName.includes("remedio")) {
    merchant = "Farmácia";
    category_suggestion = "Saúde";
    description = "Medicamentos / Farmácia";
  } else if (fileName.includes("boleto") || fileName.includes("conta") || fileName.includes("luz") || fileName.includes("agua")) {
    merchant = "Concessionária de Serviços";
    category_suggestion = "Moradia";
    payment_method = "Boleto";
    description = "Pagamento de conta";
  } else if (fileName.includes("restaurante") || fileName.includes("lanche") || fileName.includes("ifood")) {
    merchant = "Restaurante";
    category_suggestion = "Alimentação";
    description = "Almoço / Refeição";
  }

  // Tenta extrair algum número do nome do arquivo (ex: cupom_187_42.pdf -> 187.42)
  const numberMatch = fileName.match(/(\d+)[_.-](\d{2})/);
  if (numberMatch) {
    amount = parseFloat(`${numberMatch[1]}.${numberMatch[2]}`);
  }

  return {
    merchant,
    amount,
    date: today,
    payment_method,
    description,
    category_suggestion,
    confidence: 0.6,
    needs_confirmation: true,
  };
}

/**
 * Processa um documento (Recibo, Cupom fiscal NFC-e, Imagem ou PDF)
 * 1. Converte para base64
 * 2. Tenta extrair com Gemini Vision via server function
 * 3. Se falhar, usa o extrator heurístico com marcação de revisão
 * 4. Retorna os dados formatados prontos para a confirmação do usuário
 */
export async function processReceiptDocument(file: File): Promise<ExtractedReceiptData> {
  const previewUrl = URL.createObjectURL(file);
  const fileType = file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg");

  try {
    const { base64Data, mimeType } = await fileToBase64(file);

    let parsedResult: OCRDocumentResult;
    try {
      parsedResult = await parseReceiptDocumentFn({
        data: {
          base64Data,
          mimeType,
          fileName: file.name,
        },
      });
    } catch (serverErr) {
      console.warn("OCR Server Function falhou ou sem chave, acionando fallback heurístico:", serverErr);
      parsedResult = extractHeuristicFallback(file);
    }

    // Normaliza a data
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
      confidence: parsedResult.confidence ?? 0.8,
      needs_confirmation: parsedResult.needs_confirmation ?? true,
      previewUrl,
      fileName: file.name,
      fileType,
    };
  } catch (err: any) {
    const fallback = extractHeuristicFallback(file);
    return {
      merchant: fallback.merchant,
      amount: fallback.amount,
      amountFormatted: formatCurrencyBRL(fallback.amount),
      date: fallback.date,
      dateFormatted: formatDateOnly(fallback.date),
      payment_method: fallback.payment_method,
      description: fallback.description,
      category_suggestion: fallback.category_suggestion,
      confidence: 0.5,
      needs_confirmation: true,
      previewUrl,
      fileName: file.name,
      fileType,
    };
  }
}

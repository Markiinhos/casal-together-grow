import { createServerFn } from "@tanstack/react-start";

export interface OCRDocumentInput {
  base64Data: string;
  mimeType: string;
  fileName?: string;
}

export interface OCRDocumentResult {
  merchant: string;
  amount: number;
  date: string; // YYYY-MM-DD
  payment_method: string; // "Cartão de Crédito" | "Pix" | "Débito" | "Dinheiro" | "Boleto" | "Outro"
  description: string;
  category_suggestion: string;
  confidence: number;
  needs_confirmation: boolean;
  notes?: string;
}

const OCR_SYSTEM_PROMPT = `
Você é um sistema especialista em leitura e extração de dados fiscais e financeiros do Brasil (NFC-e, DANFE, SAT, cupons de supermercado, faturas, boletos bancários e comprovantes de pagamento).

Sua tarefa é analisar o documento (imagem ou PDF fornecido) e extrair os dados financeiros com a mais alta precisão possível.

Responda EXCLUSIVAMENTE em formato JSON com o seguinte schema:
{
  "merchant": "Nome do Estabelecimento / Loja / Beneficiário (ex: Mercado Pão de Açúcar, Posto Shell, Droga Raia)",
  "amount": 187.42, // valor total numérico float em Reais (BRL). Não inclua o símbolo R$, apenas o número decimal com ponto.
  "date": "YYYY-MM-DD", // data da emissão ou vencimento no formato AAAA-MM-DD (ex: 2026-09-30)
  "payment_method": "Cartão de Crédito", // opções: "Cartão de Crédito", "Pix", "Débito", "Dinheiro", "Boleto", "Outro"
  "description": "Breve descrição dos itens ou serviços (ex: Compras de mercado, Abastecimento gasolina comum, Medicamentos)",
  "category_suggestion": "Alimentação", // opções comuns: "Alimentação", "Mercado", "Combustível", "Transporte", "Saúde", "Moradia", "Lazer", "Contas", "Outros"
  "confidence": 0.95, // número de 0 a 1 indicando a confiança na leitura
  "needs_confirmation": true // true se houver qualquer dúvida, ilegibilidade ou rasura
}

Regras obrigatórias:
1. "merchant": Identifique a Razão Social ou Nome Fantasia principal. Se for supermercado, priorize o nome comum (ex: "Mercado Pão de Açúcar" ou "Mercado").
2. "amount": Deve ser o valor TOTAL FINAL a pagar.
3. "date": Se a data estiver no formato DD/MM/AAAA, converta para YYYY-MM-DD. Se o ano estiver ausente, use o ano corrente.
4. "category_suggestion": Sugira uma categoria pertinente em português (ex: Mercado -> "Alimentação" ou "Mercado", Posto -> "Combustível").
5. "needs_confirmation": Sempre defina como true quando o documento tiver pouca nitidez ou quando não tiver certeza do valor total.
6. Não retorne nenhum texto antes ou depois do JSON.
`;

export const parseReceiptDocumentFn = createServerFn({ method: "POST" })
  .inputValidator((data: OCRDocumentInput) => data)
  .handler(async ({ data }) => {
    const apiKey =
      process.env.VITE_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.LOVABLE_API_KEY;

    if (!apiKey) {
      // Se não houver chave no ambiente, lança erro para acionar o extrator inteligente resiliente no cliente
      throw new Error("API de IA não configurada no servidor.");
    }

    try {
      const isPdf = data.mimeType === "application/pdf";
      const mimeType = isPdf ? "application/pdf" : data.mimeType || "image/jpeg";

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: OCR_SYSTEM_PROMPT },
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: data.base64Data,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
            },
          }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        console.warn("Aviso na chamada do Gemini OCR:", res.status, errText);
        throw new Error(`Erro na API do Gemini: ${res.status}`);
      }

      const json = await res.json();
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error("Nenhum dado retornado pelo modelo de visão.");
      }

      const parsed: OCRDocumentResult = JSON.parse(rawText);
      return parsed;
    } catch (err: any) {
      console.warn("Falha no servidor OCR:", err?.message);
      throw err;
    }
  });

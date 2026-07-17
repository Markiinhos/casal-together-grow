import { createServerFn } from "@tanstack/react-start";

const GEMINI_SYSTEM_PROMPT = `
Você é uma assistente de voz financeira e de organização pessoal.
Sua tarefa é extrair a intenção e as entidades da fala do usuário.
Responda EXCLUSIVAMENTE em formato JSON.

Intenções suportadas no momento:
- "add_shopping_items" (para adicionar itens à lista de compras/mercado)
- "unknown" (se não for possível identificar a intenção)

Se a intenção for "add_shopping_items", o JSON deve ter o seguinte formato:
{
  "intent": "add_shopping_items",
  "confidence": 0.95,
  "entities": {
    "list": "mercado", // pode ser "mercado", "casa", "privada", "nossa" etc.
    "items": [
      {
        "name": "Nome do Produto Capitalizado (ex: Leite)",
        "quantity": 2, // número
        "unit": "caixas" // ou "litros", "unidades", "kg", null se não informado
      }
    ]
  }
}

Regras:
1. Normalize o nome dos produtos (primeira letra maiúscula).
2. Se a quantidade não for falada, assuma 1.
3. Se a unidade não for falada, use null.
4. Identifique o tipo de lista mencionado (mercado, casa, casal, nossa, minha). Se não mencionar, retorne null em "list".
5. Não retorne NADA além do JSON puro.
`;

export const parseVoiceCommandFn = createServerFn({ method: "POST" })
  .inputValidator((data: { transcript: string }) => data)
  .handler(async ({ data }) => {
    const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY não configurada no servidor.");
    }

    const prompt = `${GEMINI_SYSTEM_PROMPT}\n\nComando do usuário: "${data.transcript}"`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
            },
          }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        console.error("Gemini API error:", errText);
        throw new Error("Falha ao comunicar com a IA.");
      }

      const jsonRes = await res.json();
      const textResponse = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!textResponse) {
        throw new Error("Resposta vazia da IA.");
      }

      const cleanText = textResponse.replace(/^```json/m, '').replace(/```$/m, '').trim();
      
      return JSON.parse(cleanText) as {
        intent: string;
        confidence: number;
        entities: any;
      };
    } catch (e: any) {
      console.error("Erro no parseVoiceCommandFn:", e);
      throw new Error(e.message || "Erro desconhecido ao processar comando.");
    }
  });

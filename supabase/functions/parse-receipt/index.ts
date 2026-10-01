import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OCR_PROMPT = `
Você é um sistema especialista em extração e leitura de dados fiscais brasileiros:
- Cupons fiscais (NFC-e, SAT, ECF)
- Notas Fiscais (DANFE)
- Comprovantes de pagamento de cartão de crédito/débito (maquininhas Stone, Cielo, Rede, PagBank)
- Comprovantes de PIX e transferências bancárias
- Boletos bancários e faturas de serviços (luz, água, internet, gás)

Analise a imagem com máxima precisão e extraia as informações financeiras.

Responda EXCLUSIVAMENTE em formato JSON com o seguinte schema:
{
  "merchant": "Nome do Estabelecimento / Razão Social / Favorecido (ex: Supermercado Pão de Açúcar, Posto Ipiranga, Droga Raia)",
  "amount": 187.42,
  "date": "YYYY-MM-DD",
  "payment_method": "Cartão de Crédito",
  "description": "Breve resumo dos itens ou serviços",
  "category_suggestion": "Alimentação",
  "confidence": 0.95,
  "needs_confirmation": true
}

Regras:
1. "merchant": Use o Nome Fantasia mais reconhecível. Se não houver, use a Razão Social.
2. "amount": Deve ser o valor TOTAL FINAL efetivamente pago ou cobrado em Reais (BRL) como número decimal com ponto. Não inclua R$.
3. "date": Data de emissão ou da transação no formato AAAA-MM-DD (ex: 2026-09-30). Se tiver apenas DD/MM/AAAA, converta. Se o ano não estiver legível, use o ano corrente.
4. "payment_method": Uma das opções: "Cartão de Crédito", "Pix", "Débito", "Dinheiro", "Boleto", "Outro".
5. "description": Breve descrição (ex: "Compras de supermercado", "Combustível", "Medicamentos").
6. "category_suggestion": Sugira a categoria mais adequada (ex: "Alimentação", "Mercado", "Combustível", "Transporte", "Saúde", "Moradia", "Lazer", "Contas").
7. Responda APENAS o JSON puro, sem markdown antes ou depois.
`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { base64Data, mimeType = "image/jpeg" } = await req.json();
    if (!base64Data) {
      return json({ error: "base64Data is required" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("VITE_GEMINI_API_KEY");

    // Formata o data URL
    const imageUrl = base64Data.startsWith("data:")
      ? base64Data
      : `data:${mimeType};base64,${base64Data}`;

    // Tentativa 1: Google Gemini direto se houver GEMINI_API_KEY
    if (GEMINI_API_KEY) {
      try {
        const rawBase64 = base64Data.replace(/^data:.+?;base64,/, "");
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: OCR_PROMPT },
                    {
                      inline_data: {
                        mime_type: mimeType,
                        data: rawBase64,
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

        if (geminiRes.ok) {
          const gemData = await geminiRes.json();
          const rawText = gemData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const parsed = JSON.parse(rawText.replace(/```json/g, "").replace(/```/g, "").trim());
            return json({ success: true, result: parsed, source: "gemini_direct" });
          }
        }
      } catch (gemErr) {
        console.warn("Falha no Gemini direto, tentando Lovable Gateway:", gemErr);
      }
    }

    // Tentativa 2: Lovable AI Gateway multimodal
    if (LOVABLE_API_KEY) {
      const models = ["google/gemini-2.5-flash", "google/gemini-1.5-flash", "openai/gpt-4o-mini"];

      for (const model of models) {
        try {
          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: OCR_PROMPT },
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: "Extraia os dados deste recibo, nota fiscal ou boleto brasileiro.",
                    },
                    {
                      type: "image_url",
                      image_url: { url: imageUrl },
                    },
                  ],
                },
              ],
              temperature: 0.1,
            }),
          });

          if (aiRes.ok) {
            const data = await aiRes.json();
            const content = data.choices?.[0]?.message?.content;
            if (content) {
              const clean = content.replace(/```json/g, "").replace(/```/g, "").trim();
              const parsed = JSON.parse(clean);
              return json({ success: true, result: parsed, source: `lovable_${model}` });
            }
          } else {
            console.warn(`Tentativa com ${model} retornou status ${aiRes.status}`);
          }
        } catch (modelErr) {
          console.warn(`Erro no modelo ${model}:`, modelErr);
        }
      }
    }

    return json({ error: "Nenhum provedor de visão conseguiu processar a imagem." }, 502);
  } catch (err: any) {
    console.error("Erro na Edge Function parse-receipt:", err);
    return json({ error: err.message || "Erro interno" }, 500);
  }
});

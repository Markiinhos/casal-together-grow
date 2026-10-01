import { createServerFn } from "@tanstack/react-start";
import { COPILOT_SYSTEM_PROMPT, WHITELIST_INTENTS, type ParsedCopilotCommand } from "./ai-copilot";

export const parseVoiceCommandFn = createServerFn({ method: "POST" })
  .inputValidator((data: { transcript: string }) => data)
  .handler(async ({ data }): Promise<ParsedCopilotCommand> => {
    const apiKey =
      process.env.VITE_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY não configurada no servidor.");
    }

    const prompt = `${COPILOT_SYSTEM_PROMPT}\n\nComando do usuário: "${data.transcript}"`;

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
        throw new Error("Falha ao comunicar com a IA do Copiloto.");
      }

      const jsonRes = await res.json();
      const textResponse = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textResponse) {
        throw new Error("Resposta vazia da IA.");
      }

      const cleanText = textResponse.replace(/^```json/m, "").replace(/```$/m, "").trim();
      const parsed = JSON.parse(cleanText);

      // Validação estrita com a Whitelist
      const intent = WHITELIST_INTENTS.includes(parsed.intent) ? parsed.intent : "unknown";

      return {
        intent,
        confidence: Number(parsed.confidence) || 0.8,
        entities: parsed.entities || {},
        reply_summary: parsed.reply_summary || "Comando interpretado.",
      };
    } catch (e: any) {
      console.error("Erro no parseVoiceCommandFn:", e);
      throw new Error(e.message || "Erro desconhecido ao processar comando de voz.");
    }
  });

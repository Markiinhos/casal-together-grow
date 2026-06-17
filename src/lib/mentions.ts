import { supabase } from "@/integrations/supabase/client";

export const MENTION_REGEX = /@parceir[oa]\b/i;

export function hasPartnerMention(text: string | null | undefined): boolean {
  if (!text) return false;
  return MENTION_REGEX.test(text);
}

/**
 * Creates an in-app notification for the partner when @parceiro is mentioned.
 * Safe no-op if there's no partner or no mention.
 */
export async function notifyPartnerMention(opts: {
  text: string | null | undefined;
  partnerId: string | null | undefined;
  fromName: string | null | undefined;
  context: string; // e.g. "tarefa", "transação", "memória"
  link?: string;
}) {
  if (!opts.partnerId) return;
  if (!hasPartnerMention(opts.text)) return;
  const title = `${opts.fromName || "Seu parceiro"} mencionou você`;
  const body = `Em ${opts.context}: "${(opts.text || "").slice(0, 140)}"`;
  try {
    await supabase.from("notifications").insert({
      user_id: opts.partnerId,
      title,
      body,
      type: "mention",
      link: opts.link ?? null,
    });
  } catch (e) {
    console.warn("[mention] notification insert failed", e);
  }
}

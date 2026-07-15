import { supabase } from "@/integrations/supabase/client";

export type VoiceIntent = {
  intent: string;
  confidence: number;
  entities: any;
};

export type ExecutionResult = {
  success: boolean;
  message: string;
  needsConfirmation?: boolean;
  conflictData?: any;
};

export async function executeVoiceCommand(
  parsed: VoiceIntent,
  userId: string,
  coupleId: string | null,
  activeSpace: "private" | "shared"
): Promise<ExecutionResult> {
  if (parsed.intent !== "add_shopping_items") {
    return { success: false, message: "Ainda não consigo executar esse tipo de pedido." };
  }

  const { list, items } = parsed.entities;
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { success: false, message: "Não encontrei produtos na sua frase." };
  }

  // Define visibility and couple_id based on the mentioned list or active space
  let visibility = activeSpace;
  let targetCoupleId = activeSpace === "shared" ? coupleId : null;
  
  const listLower = list?.toLowerCase() || "";
  if (listLower.includes("minha") || listLower.includes("privada")) {
    visibility = "private";
    targetCoupleId = null;
  } else if (listLower.includes("nossa") || listLower.includes("casal") || listLower.includes("casa")) {
    visibility = "shared";
    targetCoupleId = coupleId;
  }

  if (visibility === "shared" && !targetCoupleId) {
    return { success: false, message: "Vincule seu parceiro antes de adicionar itens à lista compartilhada." };
  }

  try {
    // 1. Fetch current uncompleted items for duplicate check
    let q = supabase
      .from("shopping_items")
      .select("id, name, quantity")
      .eq("checked", false);
      
    if (visibility === "private") {
      q = q.eq("user_id", userId).is("couple_id", null);
    } else {
      q = q.eq("couple_id", targetCoupleId);
    }
    
    const { data: existingItems, error: fetchError } = await q;
    
    if (fetchError) {
      console.error(fetchError);
      return { success: false, message: "Erro ao verificar a lista atual." };
    }

    // 2. Identify exact duplicates (case insensitive)
    const toInsert = [];
    const conflicts = [];

    for (const item of items) {
      const normalizedName = item.name.trim().toLowerCase();
      const existing = existingItems?.find(e => e.name.trim().toLowerCase() === normalizedName);
      
      const quantityStr = [item.quantity, item.unit].filter(Boolean).join(" ").trim() || null;
      
      if (existing) {
        conflicts.push({
          existing,
          newItem: item,
          newQuantityStr: quantityStr
        });
      } else {
        toInsert.push({
          name: item.name,
          category: "mercado", // Default category, could be AI-mapped later
          quantity: quantityStr,
          user_id: userId,
          couple_id: targetCoupleId,
          visibility,
          source_type: "voice_assistant"
        });
      }
    }

    // 3. If there are conflicts and we haven't confirmed yet, return them
    // (In a real MVP, we could skip asking and just append, but the user wants duplicate prevention)
    // To make this fully functional, we can return conflicts for the UI to handle, or just auto-add if UI doesn't handle it yet.
    // The user requested: "O sistema pode mostrar: Leite já está na lista. Deseja atualizar a quantidade para 3?".
    if (conflicts.length > 0) {
      return {
        success: true,
        message: "Alguns itens já estão na lista. Confirme o que deseja fazer.",
        needsConfirmation: true,
        conflictData: { toInsert, conflicts }
      };
    }

    // 4. Batch insert
    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("shopping_items")
        .insert(toInsert);
        
      if (insertError) {
        console.error(insertError);
        return { success: false, message: "Entendi o comando, mas não consegui atualizar a lista." };
      }
    }

    return { 
      success: true, 
      message: `${toInsert.length} ${toInsert.length === 1 ? 'item foi adicionado' : 'itens foram adicionados'}.` 
    };

  } catch (error) {
    console.error(error);
    return { success: false, message: "Entendi o comando, mas não consegui atualizar a lista. Tente novamente." };
  }
}

export async function logVoiceCommand(
  userId: string,
  coupleId: string | null,
  activeSpace: "private" | "shared",
  transcript: string,
  parsed: VoiceIntent | null,
  status: "processing" | "confirmed" | "executed" | "failed" | "cancelled",
  errorMessage: string | null = null
) {
  try {
    const { error } = await supabase
      .from("voice_assistant_commands")
      .insert({
        user_id: userId,
        couple_id: activeSpace === "shared" ? coupleId : null,
        visibility: activeSpace,
        transcript,
        intent: parsed?.intent,
        entities: parsed?.entities,
        status,
        error_message: errorMessage,
        executed_at: status === "executed" ? new Date().toISOString() : null
      });
      
    if (error) {
      console.warn("Failed to log voice command:", error);
    }
  } catch (e) {
    console.warn("Failed to log voice command:", e);
  }
}

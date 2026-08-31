import { supabase } from "@/integrations/supabase/client";

export { formatBRL } from "./finance";

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  couple_id: string | null;
}

export interface Couple {
  id: string;
  name: string | null;
  start_date: string | null;
  invite_code: string;
  created_by: string;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data as Profile | null;
}

export async function getCouple(coupleId: string): Promise<Couple | null> {
  const { data } = await supabase.from("couples").select("*").eq("id", coupleId).maybeSingle();
  return data as Couple | null;
}

export async function getPartner(coupleId: string, selfId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("couple_id", coupleId)
    .neq("id", selfId)
    .maybeSingle();
  return data as Profile | null;
}

export async function createCouple(name: string | null, userId: string): Promise<Couple> {
  const { data, error } = await supabase
    .from("couples")
    .insert({ name, created_by: userId })
    .select()
    .single();
  if (error) throw error;
  await supabase.from("profiles").update({ couple_id: data.id }).eq("id", userId);
  return data as Couple;
}

export async function joinCoupleByCode(code: string, _userId: string): Promise<Couple> {
  const normalized = code.trim().toLowerCase();
  console.log("[invite] accepting code", normalized);
  const { data: coupleId, error: rpcError } = await supabase.rpc("join_couple_by_code", { _code: normalized });
  if (rpcError) {
    console.error("[invite] rpc error", rpcError);
    throw new Error(rpcError.message || "Não foi possível aceitar o convite");
  }
  console.log("[invite] joined couple", coupleId);
  const { data: couple, error } = await supabase
    .from("couples")
    .select("*")
    .eq("id", coupleId as unknown as string)
    .maybeSingle();
  if (error || !couple) throw new Error("Vínculo criado, mas não foi possível carregar o casal");
  return couple as Couple;
}


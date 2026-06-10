import { supabase } from "@/integrations/supabase/client";

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

export async function joinCoupleByCode(code: string, userId: string): Promise<Couple> {
  const { data: couple, error } = await supabase
    .from("couples")
    .select("*")
    .eq("invite_code", code.trim().toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!couple) throw new Error("Código de convite inválido");
  await supabase.from("profiles").update({ couple_id: couple.id }).eq("id", userId);
  return couple as Couple;
}

export function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

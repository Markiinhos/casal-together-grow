import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth";
import { getCouple, getPartner, getProfile } from "./couple";

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => (user ? getProfile(user.id) : null),
    enabled: !!user,
  });
}

export function useCouple() {
  const { data: profile } = useProfile();
  return useQuery({
    queryKey: ["couple", profile?.couple_id],
    queryFn: () => (profile?.couple_id ? getCouple(profile.couple_id) : null),
    enabled: !!profile?.couple_id,
  });
}

export function usePartner() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  return useQuery({
    queryKey: ["partner", profile?.couple_id, user?.id],
    queryFn: () => (profile?.couple_id && user ? getPartner(profile.couple_id, user.id) : null),
    enabled: !!profile?.couple_id && !!user,
  });
}

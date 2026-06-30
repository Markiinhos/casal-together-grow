import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Space = "private" | "shared";

interface SpaceCtx {
  space: Space;
  setSpace: (s: Space) => void;
  toggle: () => void;
}

const Ctx = createContext<SpaceCtx>({ space: "shared", setSpace: () => {}, toggle: () => {} });

const KEY = "casal.space";

export function SpaceProvider({ children }: { children: ReactNode }) {
  const [space, setSpaceState] = useState<Space>(() => {
    if (typeof window === "undefined") return "shared";
    const s = window.localStorage.getItem(KEY);
    return s === "private" ? "private" : "shared";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, space);
    } catch {}
  }, [space]);

  const setSpace = (s: Space) => setSpaceState(s);
  const toggle = () => setSpaceState((s) => (s === "private" ? "shared" : "private"));

  return <Ctx.Provider value={{ space, setSpace, toggle }}>{children}</Ctx.Provider>;
}

export const useSpace = () => useContext(Ctx);

/**
 * Apply the current space filter to a Supabase query builder.
 * - private: rows owned by the user and marked private
 * - shared:  rows of the couple marked shared (falls back to user solo when no couple)
 */
export function applySpaceFilter<T extends { eq: (col: string, val: any) => T; is: (col: string, val: any) => T }>(
  q: T,
  opts: { space: Space; userId: string; coupleId: string | null },
): T {
  if (opts.space === "private") {
    return q.eq("visibility", "private").eq("user_id", opts.userId);
  }
  // shared
  if (opts.coupleId) {
    return q.eq("visibility", "shared").eq("couple_id", opts.coupleId);
  }
  return q.eq("visibility", "shared").eq("user_id", opts.userId);
}

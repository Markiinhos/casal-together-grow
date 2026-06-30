import { Link, useLocation } from "@tanstack/react-router";
import { Home, User, Plus, Heart, MoreHorizontal } from "lucide-react";

type NavItem = { to: string; icon: typeof Home; label: string; exact?: boolean; primary?: boolean };
const items: NavItem[] = [
  { to: "/app", icon: Home, label: "Início", exact: true },
  { to: "/app/meu", icon: User, label: "Meu" },
  { to: "/app/adicionar", icon: Plus, label: "Adicionar", primary: true },
  { to: "/app/nosso", icon: Heart, label: "Nosso" },
  { to: "/app/mais", icon: MoreHorizontal, label: "Mais" },
];

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-md mx-auto grid grid-cols-5 px-2 py-2">
        {items.map(({ to, icon: Icon, label, primary, exact }) => {
          const active = exact ? pathname === to : pathname.startsWith(to);
          if (primary) {
            return (
              <Link key={to} to={to} className="flex items-center justify-center">
                <div className="-mt-6 size-14 rounded-full gradient-coral shadow-soft flex items-center justify-center text-white">
                  <Icon className="size-7" strokeWidth={2.5} />
                </div>
              </Link>
            );
          }
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

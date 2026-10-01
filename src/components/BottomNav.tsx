import { Link, useLocation } from "@tanstack/react-router";
import { Home, ArrowRightLeft, Plus, Target, MoreHorizontal, TrendingUp, TrendingDown, CreditCard, ArrowLeftRight, Mic, Receipt } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useState } from "react";
import { VoiceAssistantSheet } from "./VoiceAssistant/VoiceAssistantSheet";

type NavItem = { to: string; icon: any; label: string; exact?: boolean; primary?: boolean };

const items: NavItem[] = [
  { to: "/app", icon: Home, label: "Principal", exact: true },
  { to: "/app/financas", icon: ArrowRightLeft, label: "Transações" },
  { to: "#", icon: Plus, label: "", primary: true },
  { to: "/app/financas/planejamento", icon: Target, label: "Planejamento" },
  { to: "/app/mais", icon: MoreHorizontal, label: "Mais" },
];

/** Smarter active-state: longer paths win (so /app/financas/planejamento beats /app/financas) */
function useActiveTab(pathname: string) {
  let bestMatch = -1;
  let bestLen = 0;
  items.forEach((item, idx) => {
    if (item.primary) return;
    if (item.exact && pathname === item.to) { bestMatch = idx; bestLen = Infinity; return; }
    if (!item.exact && pathname.startsWith(item.to) && item.to.length > bestLen) {
      bestMatch = idx;
      bestLen = item.to.length;
    }
  });
  return bestMatch;
}

export function BottomNav() {
  const { pathname } = useLocation();
  const activeIdx = useActiveTab(pathname);
  const [open, setOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  return (
    <>
      <VoiceAssistantSheet open={voiceOpen} onOpenChange={setVoiceOpen} />
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border pb-[env(safe-area-inset-bottom)] rounded-t-2xl shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        <div className="max-w-md mx-auto grid grid-cols-5 px-1 py-1 relative">
          {items.map((item) => {
            const { to, icon: Icon, label, primary } = item;
            const idx = items.indexOf(item);
            const active = idx === activeIdx;
            
            if (primary) {
              return (
                <Drawer key="primary-action" open={open} onOpenChange={setOpen}>
                  <DrawerTrigger asChild>
                    <button className="flex flex-col items-center justify-center relative outline-none focus:outline-none">
                      <div className="absolute -top-7 size-14 rounded-full gradient-coral shadow-lg flex items-center justify-center text-white active:scale-95 transition-transform">
                        <Icon className="size-8" strokeWidth={2.5} />
                      </div>
                    </button>
                  </DrawerTrigger>

                  <DrawerContent className="max-w-md mx-auto outline-none">
                    <DrawerHeader>
                      <DrawerTitle>Ações Rápidas</DrawerTitle>
                    </DrawerHeader>
                    <div className="p-4 grid grid-cols-3 sm:grid-cols-6 gap-4 pb-12">
                      <Link 
                        to="/app/adicionar" 
                        onClick={() => setOpen(false)}
                        className="flex flex-col items-center gap-2"
                      >
                        <div className="size-12 rounded-full bg-success/10 text-success flex items-center justify-center">
                          <TrendingUp className="size-6" />
                        </div>
                        <span className="text-[11px] font-medium text-center">Receita</span>
                      </Link>

                      <Link 
                        to="/app/adicionar" 
                        onClick={() => setOpen(false)}
                        className="flex flex-col items-center gap-2"
                      >
                        <div className="size-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
                          <TrendingDown className="size-6" />
                        </div>
                        <span className="text-[11px] font-medium text-center">Despesa</span>
                      </Link>

                      <Link 
                        to="/app/financas/recibos" 
                        onClick={() => setOpen(false)}
                        className="flex flex-col items-center gap-2"
                      >
                        <div className="size-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center relative">
                          <Receipt className="size-6" />
                          <span className="absolute -top-1 -right-1 text-[9px] font-bold bg-primary text-primary-foreground rounded-full px-1 shadow-xs">IA</span>
                        </div>
                        <span className="text-[11px] font-medium text-center">Ler Recibo</span>
                      </Link>

                      <Link 
                        to="/app/adicionar" 
                        onClick={() => setOpen(false)}
                        className="flex flex-col items-center gap-2"
                      >
                        <div className="size-12 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center">
                          <ArrowLeftRight className="size-6" />
                        </div>
                        <span className="text-[11px] font-medium text-center">Transferência</span>
                      </Link>

                      <Link 
                        to="/app/adicionar" 
                        onClick={() => setOpen(false)}
                        className="flex flex-col items-center gap-2"
                      >
                        <div className="size-12 rounded-full bg-accent-purple/10 text-accent-purple flex items-center justify-center">
                          <CreditCard className="size-6" />
                        </div>
                        <span className="text-[11px] font-medium text-center">Fatura</span>
                      </Link>

                      <button 
                        onClick={() => { setOpen(false); setVoiceOpen(true); }}
                        className="flex flex-col items-center gap-2 outline-none focus:outline-none"
                      >
                        <div className="size-12 rounded-full gradient-coral text-white flex items-center justify-center">
                          <Mic className="size-6" />
                        </div>
                        <span className="text-[11px] font-medium text-center">Assistente</span>
                      </button>
                    </div>
                  </DrawerContent>
                </Drawer>
              );
            }
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-colors active:bg-accent/50 ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <div className={`transition-all duration-300 ${active ? "opacity-100 scale-110" : "opacity-80 scale-100"}`}>
                   <Icon className="size-6" strokeWidth={active ? 2.5 : 2} />
                </div>
                <span className={`text-[10px] sm:text-[11px] max-w-full truncate px-1 transition-all duration-300 ${active ? "font-bold" : "font-medium"}`}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

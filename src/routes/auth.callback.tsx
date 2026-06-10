import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({ meta: [{ title: "Confirmando — Casal" }] }),
  component: CallbackPage,
});

function CallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Supabase v2 auto-parses the hash and sets the session.
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setError(error.message);
        return;
      }
      if (data.session?.user.email_confirmed_at) {
        navigate({ to: "/app" });
      } else {
        // Wait briefly for hash processing
        setTimeout(async () => {
          const { data: d2 } = await supabase.auth.getSession();
          if (d2.session?.user.email_confirmed_at) navigate({ to: "/app" });
          else setError("Não foi possível confirmar sua conta. Tente novamente.");
        }, 800);
      }
    })();
  }, [navigate]);

  return (
    <div className="min-h-svh flex flex-col items-center justify-center px-4 py-8 bg-gradient-to-b from-background to-accent/40">
      <Logo size={72} withText />
      <Card className="w-full max-w-sm p-6 mt-8 shadow-elevated rounded-3xl text-center space-y-4">
        {error ? (
          <>
            <h2 className="text-lg font-semibold">Erro de confirmação</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => navigate({ to: "/auth" })} className="w-full rounded-xl gradient-coral text-white border-0">
              Voltar para login
            </Button>
          </>
        ) : (
          <>
            <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Confirmando sua conta...</p>
          </>
        )}
      </Card>
    </div>
  );
}

import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { joinCoupleByCode } from "@/lib/couple";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/convite/$code")({
  ssr: false,
  component: ConvitePage,
});

function ConvitePage() {
  const { code } = useParams({ from: "/convite/$code" });
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  async function accept() {
    if (!session) {
      sessionStorage.setItem("pending_invite", code);
      navigate({ to: "/auth" });
      return;
    }
    setLoading(true);
    try {
      await joinCoupleByCode(code, session.user.id);
      toast.success("Vinculado ao casal!");
      navigate({ to: "/app" });
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center px-4 py-8">
      <Logo size={72} withText />
      <Card className="w-full max-w-sm p-6 mt-8 rounded-3xl text-center shadow-elevated">
        <h2 className="text-lg font-bold mb-2">Convite para um casal 💛</h2>
        <p className="text-sm text-muted-foreground mb-4">Você foi convidado(a) a fazer parte de um casal no CASAL.</p>
        <div className="bg-accent rounded-2xl p-3 mb-4">
          <div className="text-xs text-muted-foreground">Código</div>
          <div className="font-mono font-bold tracking-wider">{code}</div>
        </div>
        <Button onClick={accept} disabled={loading} className="w-full rounded-xl gradient-coral text-white border-0 h-11">
          {session ? (loading ? "Vinculando..." : "Aceitar convite") : "Entrar e aceitar"}
        </Button>
        <Link to="/app" className="block mt-3 text-xs text-muted-foreground">Voltar</Link>
      </Card>
    </div>
  );
}

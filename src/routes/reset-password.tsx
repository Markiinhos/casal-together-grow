import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (!hash.includes("type=recovery") && !hash.includes("access_token")) {
      // ok, might already have a session
    }
  }, []);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Senha atualizada!");
      navigate({ to: "/app" });
    }
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center px-4 py-8">
      <Logo size={64} withText />
      <Card className="w-full max-w-sm p-6 mt-8 rounded-3xl">
        <h2 className="text-lg font-bold mb-4">Definir nova senha</h2>
        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="np">Nova senha</Label>
            <Input id="np" type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" disabled={loading} className="w-full h-11 rounded-xl gradient-coral text-white border-0">
            {loading ? "Salvando..." : "Salvar senha"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

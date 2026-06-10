import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — Casal" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" && s) navigate({ to: "/app" });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  function translateError(msg: string) {
    const m = msg.toLowerCase();
    if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
    if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
    if (m.includes("already registered") || m.includes("user already")) return "E-mail já cadastrado. Faça login.";
    if (m.includes("invalid email") || m.includes("invalid format")) return "E-mail inválido.";
    if (m.includes("weak") || m.includes("pwned")) return "Senha muito fraca ou vazada. Escolha outra.";
    if (m.includes("password") && m.includes("6")) return "A senha precisa ter pelo menos 6 caracteres.";
    if (m.includes("network") || m.includes("failed to fetch")) return "Falha de conexão. Tente novamente.";
    if (m.includes("rate")) return "Muitas tentativas. Aguarde alguns instantes.";
    return msg;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    console.log("[auth] signIn", email);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      console.error("[auth] signIn error", error);
      toast.error(translateError(error.message));
      return;
    }
    console.log("[auth] signIn ok", data.user?.id);
    navigate({ to: "/app" });
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    console.log("[auth] signUp", email);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        data: { full_name: name },
      },
    });
    setLoading(false);
    if (error) {
      console.error("[auth] signUp error", error);
      toast.error(translateError(error.message));
      return;
    }
    console.log("[auth] signUp ok", data.user?.id, "session?", !!data.session);
    if (data.session) {
      toast.success("Conta criada!");
      navigate({ to: "/app" });
    } else {
      toast.success("Conta criada! Verifique seu e-mail para confirmar.");
    }
  }

  async function handleReset() {
    if (!email) return toast.error("Digite seu e-mail primeiro");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(translateError(error.message));
    else toast.success("E-mail de recuperação enviado!");
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center px-4 py-8 bg-gradient-to-b from-background to-accent/40">
      <Logo size={72} withText />
      <p className="text-sm text-muted-foreground mt-2 mb-8">Organize a vida a dois</p>

      <Card className="w-full max-w-sm p-6 shadow-elevated rounded-3xl">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "signup")}>
          <TabsList className="grid grid-cols-2 mb-6 w-full">
            <TabsTrigger value="login">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Criar conta</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="le">E-mail</Label>
                <Input id="le" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lp">Senha</Label>
                <Input id="lp" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11 rounded-xl gradient-coral text-white border-0">
                {loading ? "Entrando..." : "Entrar"}
              </Button>
              <button type="button" onClick={handleReset} className="text-xs text-muted-foreground hover:text-primary w-full text-center">
                Esqueci minha senha
              </button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="sn">Nome</Label>
                <Input id="sn" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="se">E-mail</Label>
                <Input id="se" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sp">Senha</Label>
                <Input id="sp" type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11 rounded-xl gradient-coral text-white border-0">
                {loading ? "Criando..." : "Criar conta"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

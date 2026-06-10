import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — Casal" }] }),
  component: AuthPage,
});

function checkPassword(p: string) {
  return {
    length: p.length >= 8,
    upper: /[A-Z]/.test(p),
    lower: /[a-z]/.test(p),
    number: /\d/.test(p),
    special: /[^A-Za-z0-9]/.test(p),
  };
}

function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user.email_confirmed_at) navigate({ to: "/app" });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" && s?.user.email_confirmed_at) navigate({ to: "/app" });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const pw = useMemo(() => checkPassword(password), [password]);
  const pwValid = pw.length && pw.upper && pw.lower && pw.number && pw.special;
  const confirmValid = confirm.length > 0 && confirm === password;

  function translateError(msg: string) {
    const m = msg.toLowerCase();
    if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
    if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
    if (m.includes("already registered") || m.includes("user already")) return "E-mail já cadastrado. Faça login.";
    if (m.includes("invalid email") || m.includes("invalid format")) return "E-mail inválido.";
    if (m.includes("weak") || m.includes("pwned") || m.includes("breach")) return "Senha vazada em um vazamento público. Escolha outra.";
    if (m.includes("password")) return "Senha não atende aos requisitos.";
    if (m.includes("network") || m.includes("failed to fetch")) return "Falha de conexão. Tente novamente.";
    if (m.includes("rate")) return "Muitas tentativas. Aguarde alguns instantes.";
    if (m.includes("send") && m.includes("email")) return "Falha ao enviar e-mail. Tente novamente.";
    return msg;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(translateError(error.message));
      return;
    }
    if (!data.user?.email_confirmed_at) {
      await supabase.auth.signOut();
      setAwaitingConfirm(email);
      toast.error("Confirme seu e-mail antes de entrar.");
      return;
    }
    navigate({ to: "/app" });
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!pwValid) return toast.error("A senha não atende a todos os requisitos.");
    if (!confirmValid) return toast.error("As senhas não conferem.");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { full_name: name },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(translateError(error.message));
      return;
    }
    if (data.session) {
      toast.success("Conta criada!");
      navigate({ to: "/app" });
    } else {
      setAwaitingConfirm(email);
      toast.success("Enviamos um link de confirmação para seu e-mail.");
    }
  }

  async function handleResend() {
    if (!awaitingConfirm) return;
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: awaitingConfirm,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) toast.error(translateError(error.message));
    else toast.success("E-mail de confirmação reenviado!");
  }

  async function handleReset() {
    if (!email) return toast.error("Digite seu e-mail primeiro");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(translateError(error.message));
    else toast.success("E-mail de recuperação enviado!");
  }

  if (awaitingConfirm) {
    return (
      <div className="min-h-svh flex flex-col items-center justify-center px-4 py-8 bg-gradient-to-b from-background to-accent/40">
        <Logo size={72} withText />
        <Card className="w-full max-w-sm p-6 mt-8 shadow-elevated rounded-3xl text-center space-y-4">
          <h2 className="text-lg font-semibold">Verifique seu e-mail</h2>
          <p className="text-sm text-muted-foreground">
            Enviamos um link de confirmação para <strong>{awaitingConfirm}</strong>. Clique no link para ativar sua conta.
          </p>
          <Button onClick={handleResend} variant="outline" className="w-full rounded-xl">
            Reenviar e-mail de confirmação
          </Button>
          <button
            type="button"
            onClick={() => { setAwaitingConfirm(null); setTab("login"); }}
            className="text-xs text-muted-foreground hover:text-primary w-full"
          >
            Voltar
          </button>
        </Card>
      </div>
    );
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
                <Input id="sp" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>

              <div className="rounded-xl bg-muted/50 p-3 text-xs space-y-1">
                <p className="font-medium text-foreground mb-1">Sua senha deve conter:</p>
                <Req ok={pw.length} label="Pelo menos 8 caracteres" />
                <Req ok={pw.upper} label="1 letra maiúscula" />
                <Req ok={pw.lower} label="1 letra minúscula" />
                <Req ok={pw.number} label="1 número" />
                <Req ok={pw.special} label="1 caractere especial (@, #, $, %, &...)" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sc">Confirmar senha</Label>
                <Input id="sc" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                {confirm.length > 0 && !confirmValid && (
                  <p className="text-xs text-destructive">As senhas não conferem.</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading || !pwValid || !confirmValid}
                className="w-full h-11 rounded-xl gradient-coral text-white border-0"
              >
                {loading ? "Criando..." : "Criar conta"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

function Req({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 ${ok ? "text-green-600" : "text-muted-foreground"}`}>
      {ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
      <span>{label}</span>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { AlertCircle, Check, X } from "lucide-react";

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
  const [loginError, setLoginError] = useState<string | null>(null);
  const [signupError, setSignupError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

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

  function translateError(msg: string, status?: number) {
    const m = (msg || "").toLowerCase();
    if (m.includes("invalid login") || m.includes("invalid_credentials") || m.includes("invalid credentials"))
      return "E-mail ou senha incorretos. Verifique os dados e tente novamente.";
    if (m.includes("email not confirmed") || m.includes("not confirmed"))
      return "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.";
    if (m.includes("already registered") || m.includes("user already")) return "E-mail já cadastrado. Faça login.";
    if (m.includes("invalid email") || m.includes("invalid format")) return "Digite um e-mail válido.";
    if (m.includes("weak") || m.includes("pwned") || m.includes("breach")) return "Senha vazada em um vazamento público. Escolha outra.";
    if (m.includes("password")) return "Senha não atende aos requisitos.";
    if (m.includes("rate") || status === 429) return "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.";
    if (m.includes("network") || m.includes("failed to fetch") || m.includes("fetch"))
      return "Não foi possível conectar. Verifique sua internet e tente novamente.";
    if (m.includes("send") && m.includes("email")) return "Falha ao enviar e-mail. Tente novamente.";
    return "Não foi possível entrar agora. Tente novamente.";
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    if (!email.trim()) { setLoginError("Informe seu e-mail."); emailRef.current?.focus(); return; }
    if (!password) { setLoginError("Informe sua senha."); passwordRef.current?.focus(); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { setLoginError("Digite um e-mail válido."); emailRef.current?.focus(); return; }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        const msg = translateError(error.message, (error as any).status);
        setLoginError(msg);
        toast.error(msg);
        passwordRef.current?.focus();
        passwordRef.current?.select();
        return;
      }
      if (!data.user?.email_confirmed_at) {
        await supabase.auth.signOut();
        setAwaitingConfirm(email);
        const msg = "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.";
        setLoginError(msg);
        toast.error(msg);
        return;
      }
      navigate({ to: "/app" });
    } catch (err: any) {
      const msg = translateError(err?.message ?? "", err?.status);
      setLoginError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setSignupError(null);
    if (!pwValid) { setSignupError("A senha não atende a todos os requisitos."); return; }
    if (!confirmValid) { setSignupError("As senhas não conferem."); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { full_name: name },
        },
      });
      if (error) {
        const msg = translateError(error.message, (error as any).status);
        setSignupError(msg);
        toast.error(msg);
        return;
      }
      if (data.session) {
        toast.success("Conta criada!");
        navigate({ to: "/app" });
      } else {
        setAwaitingConfirm(email);
        toast.success("Enviamos um link de confirmação para seu e-mail.");
      }
    } catch (err: any) {
      const msg = translateError(err?.message ?? "", err?.status);
      setSignupError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!awaitingConfirm) return;
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: awaitingConfirm,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) toast.error(translateError(error.message, (error as any).status));
    else toast.success("E-mail de confirmação reenviado!");
  }

  async function handleReset() {
    if (!email) { setLoginError("Digite seu e-mail primeiro."); emailRef.current?.focus(); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) { const m = translateError(error.message, (error as any).status); setLoginError(m); toast.error(m); }
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
        <Tabs value={tab} onValueChange={(v) => { setTab(v as "login" | "signup"); setLoginError(null); setSignupError(null); }}>
          <TabsList className="grid grid-cols-2 mb-6 w-full">
            <TabsTrigger value="login">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Criar conta</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={handleLogin} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="le">E-mail</Label>
                <Input id="le" ref={emailRef} type="email" autoComplete="email" required value={email}
                  onChange={(e) => { setEmail(e.target.value); if (loginError) setLoginError(null); }}
                  aria-invalid={!!loginError} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lp">Senha</Label>
                <Input id="lp" ref={passwordRef} type="password" autoComplete="current-password" required value={password}
                  onChange={(e) => { setPassword(e.target.value); if (loginError) setLoginError(null); }}
                  aria-invalid={!!loginError} />
              </div>

              {loginError && (
                <div role="alert" aria-live="assertive"
                  className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="size-4 mt-0.5 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full h-11 rounded-xl gradient-coral text-white border-0">
                {loading ? "Entrando..." : "Entrar"}
              </Button>
              <button type="button" onClick={handleReset} className="text-xs text-muted-foreground hover:text-primary w-full text-center">
                Esqueci minha senha
              </button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignup} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="sn">Nome</Label>
                <Input id="sn" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="se">E-mail</Label>
                <Input id="se" type="email" autoComplete="email" required value={email}
                  onChange={(e) => { setEmail(e.target.value); if (signupError) setSignupError(null); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sp">Senha</Label>
                <Input id="sp" type="password" autoComplete="new-password" required value={password}
                  onChange={(e) => { setPassword(e.target.value); if (signupError) setSignupError(null); }} />
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
                <Input id="sc" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                {confirm.length > 0 && !confirmValid && (
                  <p className="text-xs text-destructive">As senhas não conferem.</p>
                )}
              </div>

              {signupError && (
                <div role="alert" aria-live="assertive"
                  className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="size-4 mt-0.5 shrink-0" />
                  <span>{signupError}</span>
                </div>
              )}

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

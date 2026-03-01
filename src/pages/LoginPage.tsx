import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Boxes, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";

interface LoginPageProps {
  onLogin: (tipoUsuario?: string) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId) throw new Error("Usuário não encontrado.");

      // Validate usuario record
      const { data: usuario, error: userError } = await (supabase as any)
        .from("usuario")
        .select("id, tenant_id, empresa_id, armazem_id, ativo, nome, tipo_usuario")
        .eq("id", userId)
        .single();

      if (userError || !usuario) {
        await supabase.auth.signOut();
        throw new Error("Usuário não cadastrado no sistema. Contate o administrador.");
      }

      if (!usuario.ativo) {
        await supabase.auth.signOut();
        throw new Error("Usuário inativo. Contate o administrador.");
      }

      // Store user context
      localStorage.setItem("core_tenant_id", usuario.tenant_id);
      localStorage.setItem("core_empresa_id", usuario.empresa_id);
      localStorage.setItem("core_armazem_id", usuario.armazem_id);
      localStorage.setItem("core_usuario_id", usuario.id);
      localStorage.setItem("core_usuario_nome", usuario.nome);
      localStorage.setItem("core_tipo_usuario", usuario.tipo_usuario || "");

      toast.success(`Bem-vindo, ${usuario.nome}!`);

      // If OPERADOR, redirect to collector home
      if (usuario.tipo_usuario === "OPERADOR") {
        // Create session log for collector
        const { data: sessao } = await (supabase as any).from("log_sessao_usuario").insert({
          tenant_id: usuario.tenant_id,
          usuario_id: usuario.id,
          inicio_sessao: new Date().toISOString(),
          ultimo_heartbeat: new Date().toISOString(),
        }).select("id").single();
        if (sessao?.id) localStorage.setItem("coletor_session_id", sessao.id);
        onLogin("OPERADOR");
      } else {
        onLogin();
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="card-surface p-8 max-w-sm w-full">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center">
            <Boxes size={28} className="text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">
              CORE <span className="text-primary">LogiTrack</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1">Sistema de Gestão de Armazém</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary transition-colors"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || !email.trim() || !password.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}

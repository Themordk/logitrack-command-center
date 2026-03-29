import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Boxes, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { ForcePasswordChangeModal } from "@/components/ForcePasswordChangeModal";

interface LoginPageProps {
  onLogin: () => void;
  onNavigateColetor: () => void;
}

export function LoginPage({ onLogin, onNavigateColetor }: LoginPageProps) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forceChange, setForceChange] = useState(false);
  const [pendingUsuario, setPendingUsuario] = useState<any>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password.trim()) return;
    setLoading(true);
    try {
      const { data: email, error: lookupError } = await supabase.rpc("fn_buscar_email_por_login", { p_login: login.trim() });
      if (lookupError || !email) throw new Error("Usuário não encontrado.");

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId) throw new Error("Usuário não encontrado.");

      const { data: usuario, error: userError } = await (supabase as any)
        .from("usuario")
        .select("id, tenant_id, empresa_id, armazem_id, ativo, nome, tipo_usuario, deve_trocar_senha")
        .eq("auth_user_id", userId)
        .single();

      if (userError || !usuario) {
        await supabase.auth.signOut();
        throw new Error("Usuário não cadastrado no sistema. Contate o administrador.");
      }

      if (!usuario.ativo) {
        await supabase.auth.signOut();
        throw new Error("Usuário inativo. Contate o administrador.");
      }

      // Check if password change is required
      if (usuario.deve_trocar_senha) {
        setPendingUsuario(usuario);
        setForceChange(true);
        setLoading(false);
        return;
      }

      completeLogin(usuario);
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer login.");
    } finally {
      setLoading(false);
    }
  };

  const completeLogin = (usuario: any) => {
    localStorage.setItem("core_tenant_id", usuario.tenant_id);
    localStorage.setItem("core_empresa_id", usuario.empresa_id);
    localStorage.setItem("core_armazem_id", usuario.armazem_id);
    localStorage.setItem("core_usuario_id", usuario.id);
    localStorage.setItem("core_usuario_nome", usuario.nome);
    localStorage.setItem("core_tipo_usuario", usuario.tipo_usuario || "");

    toast.success(`Bem-vindo, ${usuario.nome}!`);
    onLogin();
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
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Login</label>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="Seu login"
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
            disabled={loading || !login.trim() || !password.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
            Entrar
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={onNavigateColetor}
            className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
          >
            Acessar Coletor de Dados
          </button>
        </div>
      </div>

      <ForcePasswordChangeModal
        open={forceChange}
        usuarioId={pendingUsuario?.id || ""}
        variant="admin"
        onSuccess={() => {
          setForceChange(false);
          if (pendingUsuario) completeLogin(pendingUsuario);
        }}
      />
    </div>
  );
}

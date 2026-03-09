import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Boxes, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { nowBrasilia } from "@/lib/dateUtils";
import { ActionButton } from "@/components/coletor/ActionButton";

interface Props { onNavigate: (path: string) => void; }

export function ColetorLoginPage({ onNavigate }: Props) {
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

      const { data: usuario, error: userError } = await (supabase as any)
        .from("usuario")
        .select("id, tenant_id, empresa_id, armazem_id, ativo, nome, tipo_usuario")
        .eq("id", userId)
        .single();

      if (userError || !usuario) {
        await supabase.auth.signOut();
        throw new Error("Usuário não cadastrado no sistema.");
      }
      if (!usuario.ativo) {
        await supabase.auth.signOut();
        throw new Error("Usuário inativo.");
      }

      // Store context
      localStorage.setItem("core_tenant_id", usuario.tenant_id);
      localStorage.setItem("core_empresa_id", usuario.empresa_id);
      localStorage.setItem("core_armazem_id", usuario.armazem_id);
      localStorage.setItem("core_usuario_id", usuario.id);
      localStorage.setItem("core_usuario_nome", usuario.nome);

      // Create session log
      const { data: sessao } = await (supabase as any).from("log_sessao_usuario").insert({
        tenant_id: usuario.tenant_id,
        usuario_id: usuario.id,
        inicio_sessao: nowBrasilia(),
        ultimo_heartbeat: nowBrasilia(),
      }).select("id").single();

      if (sessao?.id) localStorage.setItem("coletor_session_id", sessao.id);

      toast.success(`Bem-vindo, ${usuario.nome}!`);
      onNavigate("/coletor/home");
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-[hsl(217,91%,50%)] flex items-center justify-center">
            <Boxes size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">CORE <span className="text-[hsl(217,91%,60%)]">Coletor</span></h1>
          <p className="text-sm text-[hsl(213,31%,55%)]">WMS – Login do Operador</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[hsl(213,31%,65%)] mb-1.5 uppercase">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full h-14 px-4 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] text-lg text-white outline-none focus:border-[hsl(217,91%,50%)] transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[hsl(213,31%,65%)] mb-1.5 uppercase">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-14 px-4 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] text-lg text-white outline-none focus:border-[hsl(217,91%,50%)] transition-colors"
              required
            />
          </div>
          <ActionButton type="submit" loading={loading} disabled={!email.trim() || !password.trim()}>
            Entrar
          </ActionButton>
        </form>

        <button
          type="button"
          onClick={() => onNavigate("/")}
          className="w-full text-center text-sm text-[hsl(213,31%,55%)] hover:text-[hsl(217,91%,60%)] transition-colors"
        >
          Acessar Painel Administrativo
        </button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Boxes, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { nowBrasilia } from "@/lib/dateUtils";
import { ActionButton } from "@/components/coletor/ActionButton";
import { ForcePasswordChangeModal } from "@/components/ForcePasswordChangeModal";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantBoot } from "@/contexts/TenantBootContext";

interface Props { onNavigate: (path: string) => void; }

export function ColetorLoginPage({ onNavigate }: Props) {
  const { login: syncTenantSession } = useTenant();
  const { tenant: bootTenant } = useTenantBoot();
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
      // Trava por subdomínio quando aplicável
      const rpcArgs: { p_login: string; p_tenant_id?: string } = { p_login: login.trim() };
      if (bootTenant) rpcArgs.p_tenant_id = bootTenant.id;

      const { data: email, error: lookupError } = await supabase.rpc(
        "fn_buscar_email_por_login",
        rpcArgs as any
      );
      if (lookupError || !email) {
        throw new Error(
          bootTenant ? "Usuário não encontrado neste cliente." : "Usuário não encontrado."
        );
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId) throw new Error("Usuário não encontrado.");

      // Defesa em profundidade pós-auth
      if (bootTenant) {
        const { data: belongs, error: belongsErr } = await supabase.rpc(
          "fn_user_belongs_to_tenant",
          { p_tenant_id: bootTenant.id }
        );
        if (belongsErr || belongs !== true) {
          await supabase.auth.signOut();
          throw new Error("Este usuário não pertence ao cliente acessado.");
        }
      }

      const usuarioQuery = (supabase as any)
        .from("usuario")
        .select("id, tenant_id, empresa_id, armazem_id, ativo, nome, tipo_usuario, deve_trocar_senha")
        .eq("auth_user_id", userId);
      if (bootTenant) usuarioQuery.eq("tenant_id", bootTenant.id);

      const { data: usuario, error: userError } = await usuarioQuery.single();

      if (userError || !usuario) {
        await supabase.auth.signOut();
        throw new Error("Usuário não cadastrado no sistema.");
      }
      if (!usuario.ativo) {
        await supabase.auth.signOut();
        throw new Error("Usuário inativo.");
      }

      // Check if password change is required
      if (usuario.deve_trocar_senha) {
        setPendingUsuario(usuario);
        setForceChange(true);
        setLoading(false);
        return;
      }

      await completeLogin(usuario);
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer login.");
    } finally {
      setLoading(false);
    }
  };

  const completeLogin = async (usuario: any) => {
    localStorage.setItem("core_tenant_id", usuario.tenant_id);
    localStorage.setItem("core_empresa_id", usuario.empresa_id);
    localStorage.setItem("core_armazem_id", usuario.armazem_id);
    localStorage.setItem("core_usuario_id", usuario.id);
    localStorage.setItem("core_usuario_nome", usuario.nome);
    syncTenantSession(usuario.tipo_usuario || "");

    const { data: sessao } = await (supabase as any).from("log_sessao_usuario").insert({
      tenant_id: usuario.tenant_id,
      usuario_id: usuario.id,
      inicio_sessao: nowBrasilia(),
      ultimo_heartbeat: nowBrasilia(),
    }).select("id").single();

    if (sessao?.id) localStorage.setItem("coletor_session_id", sessao.id);

    toast.success(`Bem-vindo, ${usuario.nome}!`);
    onNavigate("/coletor/home");
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
          {bootTenant && (
            <div className="mt-1 px-3 py-1 rounded-full bg-[hsl(217,91%,50%)]/15 border border-[hsl(217,91%,50%)]/30">
              <span className="text-[11px] uppercase tracking-wide text-[hsl(217,91%,70%)] font-semibold">
                Cliente: {bootTenant.nome}
              </span>
            </div>
          )}
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[hsl(213,31%,65%)] mb-1.5 uppercase">Login</label>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="Seu login"
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
          <ActionButton type="submit" loading={loading} disabled={!login.trim() || !password.trim()}>
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

      <ForcePasswordChangeModal
        open={forceChange}
        usuarioId={pendingUsuario?.id || ""}
        variant="coletor"
        onSuccess={() => {
          setForceChange(false);
          if (pendingUsuario) completeLogin(pendingUsuario);
        }}
      />
    </div>
  );
}

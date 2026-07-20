import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Boxes, Loader2, User, Lock } from "lucide-react";
import { WarehouseCanvas } from "@/components/login/WarehouseCanvas";
import { toast } from "sonner";
import { parseError } from "@/lib/errorMapper";

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
    } catch (err: unknown) {
      const parsed = parseError(err, "login-coletor");
      const fallbackToRaw = !parsed.errorCode && parsed.title === "Ocorreu um erro inesperado.";
      const message = fallbackToRaw && err instanceof Error ? err.message : parsed.title;
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const completeLogin = async (usuario: any) => {
    localStorage.setItem("core_tenant_id", usuario.tenant_id);
    if (usuario.empresa_id) {
      localStorage.setItem("core_empresa_id", usuario.empresa_id);
    } else {
      localStorage.removeItem("core_empresa_id");
    }
    if (usuario.armazem_id) {
      localStorage.setItem("core_armazem_id", usuario.armazem_id);
    } else {
      localStorage.removeItem("core_armazem_id");
    }
    localStorage.setItem("core_usuario_id", usuario.id);
    localStorage.setItem("core_usuario_nome", usuario.nome);
    syncTenantSession(usuario.tipo_usuario || "");

    const { data: sessao } = await (supabase as any).from("log_sessao_usuario").insert({
      tenant_id: usuario.tenant_id,
      usuario_id: usuario.id,
      inicio_sessao: new Date().toISOString(),
      ultimo_heartbeat: new Date().toISOString(),
    }).select("id").single();

    if (sessao?.id) localStorage.setItem("coletor_session_id", sessao.id);

    toast.success(`Bem-vindo, ${usuario.nome}!`);
    onNavigate("/coletor/home");
  };

  return (
    <div
      className="relative h-screen overflow-hidden flex items-center justify-center px-4 py-2"
      style={{
        background: "#020c1b",
        fontFamily: "'Syne', sans-serif",
        paddingTop: "max(0.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <style>{`
        @keyframes wi-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes wi-dot-pulse { 0%,100% { transform: scale(0.7); opacity: 0.5; } 50% { transform: scale(1); opacity: 1; } }
        @keyframes wi-shimmer { 0% { transform: translateX(-120%); } 100% { transform: translateX(220%); } }
        @keyframes wi-card-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .wi-orbit { animation: wi-orbit 3s linear infinite; }
        .wi-dot { animation: wi-dot-pulse 2s ease-in-out infinite; }
        .wi-card { animation: wi-card-in 0.5s ease-out both; }
        .wi-shimmer-band { animation: wi-shimmer 3s ease-in-out infinite; }
        .wi-input:focus { border-color: hsl(217 91% 60%); box-shadow: 0 0 0 4px rgba(59,130,246,0.15); }
        .wi-mono { font-family: 'JetBrains Mono', monospace; letter-spacing: 0.08em; }
      `}</style>

      <WarehouseCanvas />

      {/* radial vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(800px circle at 15% 10%, rgba(59,130,246,0.18), transparent 60%), radial-gradient(700px circle at 90% 100%, rgba(96,165,250,0.10), transparent 65%)",
        }}
      />

      <main className="relative z-10 w-full max-w-[360px] wi-card">
        {/* Header */}
        <div className="flex flex-col items-center gap-2 mb-3">
          <div className="relative w-14 h-14 flex items-center justify-center">
            <div
              aria-hidden
              className="wi-orbit absolute inset-0 rounded-full"
              style={{
                border: "1.5px solid rgba(96,165,250,0.35)",
                borderTopColor: "hsl(217 91% 60%)",
                borderRightColor: "transparent",
              }}
            />
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, hsl(217 91% 55%), hsl(217 91% 40%))",
                boxShadow: "0 10px 30px -10px rgba(59,130,246,0.6), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}
            >
              <Boxes size={20} className="text-white" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-white tracking-tight">
            CORE <span style={{ color: "hsl(217 91% 65%)" }}>Coletor</span>
          </h1>

          <p className="hidden short:block wi-mono text-[10px] uppercase" style={{ color: "hsl(213 31% 60%)" }}>
            WMS · LOGIN DO OPERADOR
          </p>

          {bootTenant && (
            <div
              className="px-2.5 py-0.5 rounded-full"
              style={{
                background: "rgba(59,130,246,0.12)",
                border: "1px solid rgba(96,165,250,0.35)",
              }}
            >
              <span className="wi-mono text-[9px] uppercase font-semibold" style={{ color: "hsl(217 91% 75%)" }}>
                Cliente · {bootTenant.nome}
              </span>
            </div>
          )}
        </div>

        {/* Glass card */}
        <div
          className="rounded-2xl p-4"
          style={{
            background: "rgba(10,22,40,0.6)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            border: "1px solid rgba(96,165,250,0.18)",
            boxShadow: "0 20px 60px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="wi-mono block text-[10px] font-semibold mb-1 uppercase" style={{ color: "hsl(213 31% 65%)" }}>
                Login
              </label>
              <div className="relative">
                <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "hsl(213 31% 50%)" }} />
                <input
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="Seu login"
                  className="wi-input w-full h-12 pl-11 pr-4 rounded-xl text-base text-white outline-none transition-all"
                  style={{
                    background: "rgba(2,12,27,0.6)",
                    border: "1px solid rgba(96,165,250,0.2)",
                    fontFamily: "'Syne', sans-serif",
                  }}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="wi-mono block text-[10px] font-semibold mb-1 uppercase" style={{ color: "hsl(213 31% 65%)" }}>
                Senha
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "hsl(213 31% 50%)" }} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="wi-input w-full h-12 pl-11 pr-4 rounded-xl text-base text-white outline-none transition-all"
                  style={{
                    background: "rgba(2,12,27,0.6)",
                    border: "1px solid rgba(96,165,250,0.2)",
                    fontFamily: "'Syne', sans-serif",
                  }}
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            <div className="relative overflow-hidden rounded-xl">
              <ActionButton type="submit" loading={loading} disabled={!login.trim() || !password.trim()}>
                Entrar
              </ActionButton>
              {!loading && (
                <div
                  aria-hidden
                  className="wi-shimmer-band pointer-events-none absolute inset-y-0 w-1/3"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)",
                  }}
                />
              )}
            </div>
          </form>
        </div>

        <button
          type="button"
          onClick={() => onNavigate("/")}
          className="wi-mono mt-3 w-full text-center text-[10px] uppercase transition-colors"
          style={{ color: "hsl(213 31% 50%)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(217 91% 65%)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "hsl(213 31% 50%)")}
        >
          Acessar Painel Administrativo
        </button>
      </main>

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

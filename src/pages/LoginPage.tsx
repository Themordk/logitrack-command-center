import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Boxes, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { ForcePasswordChangeModal } from "@/components/ForcePasswordChangeModal";
import { useTenantBoot } from "@/contexts/TenantBootContext";
import { WarehouseCanvas } from "@/components/login/WarehouseCanvas";
import { parseError } from "@/lib/errorMapper";

interface LoginPageProps {
  onLogin: () => void;
  onNavigateColetor: () => void;
  mode?: "tenant" | "support";
  onBackToPicker?: () => void;
}

const SYNE = "'Syne', sans-serif";
const MONO = "'JetBrains Mono', monospace";

export function LoginPage({ onLogin, onNavigateColetor, mode = "tenant", onBackToPicker }: LoginPageProps) {
  const { tenant: bootTenant, status: bootStatus } = useTenantBoot();
  const isSupportMode = mode === "support";
  const [login, setLogin] = useState(isSupportMode ? "suporte.corelogitrack@gmail.com" : "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forceChange, setForceChange] = useState(false);
  const [pendingUsuario, setPendingUsuario] = useState<any>(null);
  const [redirectingSupport, setRedirectingSupport] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password.trim()) return;
    setLoading(true);
    try {
      const loginInput = login.trim();
      const isSupportEmail = loginInput.toLowerCase() === "suporte.corelogitrack@gmail.com";

      if (isSupportEmail) {
        if (bootTenant) {
          throw new Error(
            `O suporte da plataforma não acessa pelo subdomínio "${bootTenant.slug}". Use o portal principal.`
          );
        }
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: loginInput,
          password,
        });
        if (authError) throw authError;
        if (!authData.user?.id) throw new Error("Falha de autenticação.");

        const { data: who, error: whoErr } = await supabase.functions.invoke("support-whoami");
        if (whoErr || !who?.success) {
          await supabase.auth.signOut();
          throw new Error("Conta não autorizada para o painel de suporte.");
        }

        localStorage.setItem("core_is_platform_support", "1");
        localStorage.setItem("core_usuario_nome", who.nome || "Suporte");
        sessionStorage.removeItem("core_rbac_permissions");
        Object.keys(sessionStorage)
          .filter((k) => k.startsWith("core_is_admin_"))
          .forEach((k) => sessionStorage.removeItem(k));
        if (window.location.hash.replace("#", "") !== "/suporte/tenants") {
          window.location.hash = "/suporte/tenants";
        }
        setRedirectingSupport(true);
        toast.success(`Bem-vindo, ${who.nome || "Suporte"}!`);
        onLogin();
        return;
      }

      if (bootStatus === "ready" && !bootTenant) {
        throw new Error("Tenant não identificado. Recarregue a página.");
      }

      const rpcArgs: { p_login: string; p_tenant_id?: string } = { p_login: loginInput };
      if (bootTenant) rpcArgs.p_tenant_id = bootTenant.id;

      const { data: email, error: lookupError } = await supabase.rpc(
        "fn_buscar_email_por_login",
        rpcArgs as any
      );
      if (lookupError || !email) {
        throw new Error(
          bootTenant
            ? "Usuário não encontrado neste cliente ou cliente inativo."
            : "Usuário não encontrado ou tenant inativo."
        );
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId) throw new Error("Usuário não encontrado.");

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
        throw new Error("Usuário não cadastrado no sistema. Contate o administrador.");
      }
      if (!usuario.ativo) {
        await supabase.auth.signOut();
        throw new Error("Usuário inativo. Contate o administrador.");
      }
      if (usuario.deve_trocar_senha) {
        setPendingUsuario(usuario);
        setForceChange(true);
        setLoading(false);
        return;
      }
      completeLogin(usuario);
    } catch (err: unknown) {
      const parsed = parseError(err, "login");
      // Preserva mensagens de negócio já bem escritas (throw new Error) quando o parser cai no fallback genérico
      const fallbackToRaw = !parsed.errorCode && parsed.title === "Ocorreu um erro inesperado.";
      const message = fallbackToRaw && err instanceof Error ? err.message : parsed.title;
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const completeLogin = (usuario: any) => {
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
    localStorage.setItem("core_tipo_usuario", usuario.tipo_usuario || "");
    toast.success(`Bem-vindo, ${usuario.nome}!`);
    onLogin();
  };

  if (redirectingSupport) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 relative" style={{ background: "#05101f" }}>
        <WarehouseCanvas />
        <div className="relative z-10 flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#1d4ed8,#3b82f6)" }}>
            <Boxes size={28} className="text-white" />
          </div>
          <Loader2 className="animate-spin" size={24} style={{ color: "#60a5fa" }} />
          <div className="text-sm" style={{ color: "#4b6fa8", fontFamily: MONO }}>Acessando painel de suporte…</div>
        </div>
      </div>
    );
  }

  const badgeText = isSupportMode
    ? "ACESSO: SUPORTE DA PLATAFORMA"
    : bootTenant
    ? `ACESSO: ${bootTenant.nome.toUpperCase()}`
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden" style={{ background: "#05101f" }}>
      <style>{`
        @keyframes wi-orbit { to { transform: rotate(360deg); } }
        @keyframes wi-dot-pulse {
          0%,100% { transform: scale(0.7); opacity: 0.5; }
          50%     { transform: scale(1);   opacity: 1; }
        }
        @keyframes wi-card-enter {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes wi-shimmer {
          0%   { transform: translateX(-120%); }
          60%  { transform: translateX(220%); }
          100% { transform: translateX(220%); }
        }
        .wi-input::placeholder { color: #3a577f; }
        .wi-input:focus {
          border-color: rgba(96,165,250,0.6) !important;
          background: rgba(59,130,246,0.06) !important;
        }
        .wi-btn:hover .wi-shimmer { animation: wi-shimmer 3s ease-in-out infinite; }
      `}</style>

      <WarehouseCanvas />

      <div
        className="relative z-10"
        style={{
          width: 360,
          padding: 40,
          background: "rgba(8, 20, 40, 0.82)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(59,130,246,0.25)",
          borderRadius: 16,
          boxShadow: "0 0 60px rgba(59,130,246,0.08), inset 0 1px 0 rgba(255,255,255,0.06)",
          animation: "wi-card-enter 0.5s ease-out both",
        }}
      >
        {/* Logo + título */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="relative" style={{ width: 62, height: 62 }}>
            <div
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                border: "2px solid transparent",
                borderTopColor: "#60a5fa",
                animation: "wi-orbit 3s linear infinite",
              }}
            />
            <div
              className="absolute flex items-center justify-center"
              style={{
                inset: 8,
                borderRadius: 12,
                background: "linear-gradient(135deg,#1d4ed8,#3b82f6)",
                boxShadow: "0 8px 24px rgba(29,78,216,0.45)",
              }}
            >
              <Boxes size={24} className="text-white" />
            </div>
          </div>

          <div className="text-center">
            <h1 style={{ fontFamily: SYNE, fontWeight: 700, fontSize: 18, color: "#e2e8f0", letterSpacing: "0.01em" }}>
              CORE <span style={{ color: "#60a5fa" }}>LogiTrack</span>
            </h1>
            <p
              className="mt-1"
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#4b6fa8",
              }}
            >
              {isSupportMode ? "Painel de Suporte" : "Sistema de Gestão de Armazém"}
            </p>
          </div>

          {badgeText && (
            <div
              className="flex items-center gap-2 mt-1"
              style={{
                background: isSupportMode ? "rgba(245,158,11,0.10)" : "rgba(59,130,246,0.10)",
                border: `1px solid ${isSupportMode ? "rgba(245,158,11,0.35)" : "rgba(59,130,246,0.30)"}`,
                borderRadius: 20,
                padding: "4px 10px",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: isSupportMode ? "#f59e0b" : "#22c55e",
                  display: "inline-block",
                  animation: "wi-dot-pulse 2s ease-in-out infinite",
                  boxShadow: isSupportMode
                    ? "0 0 8px rgba(245,158,11,0.7)"
                    : "0 0 8px rgba(34,197,94,0.7)",
                }}
              />
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  color: isSupportMode ? "#fcd34d" : "#93c5fd",
                  fontWeight: 500,
                }}
              >
                {badgeText}
              </span>
            </div>
          )}
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label
              className="block mb-1.5"
              style={{
                fontFamily: MONO,
                fontSize: 9,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#4b6fa8",
                fontWeight: 500,
              }}
            >
              {isSupportMode ? "E-mail" : "Login"}
            </label>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder={isSupportMode ? "suporte.corelogitrack@gmail.com" : "seu login"}
              required
              className="wi-input w-full outline-none transition-colors"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(59,130,246,0.20)",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 13,
                color: "#cbd5e1",
                fontFamily: MONO,
              }}
            />
          </div>

          <div>
            <label
              className="block mb-1.5"
              style={{
                fontFamily: MONO,
                fontSize: 9,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#4b6fa8",
                fontWeight: 500,
              }}
            >
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="wi-input w-full outline-none transition-colors"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(59,130,246,0.20)",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 13,
                color: "#cbd5e1",
                fontFamily: MONO,
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !login.trim() || !password.trim()}
            className="wi-btn w-full relative overflow-hidden flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-transform active:scale-[0.99]"
            style={{
              padding: "12px",
              borderRadius: 8,
              background: "linear-gradient(90deg,#1d4ed8,#3b82f6)",
              color: "#fff",
              fontFamily: SYNE,
              fontWeight: 600,
              fontSize: 14,
              letterSpacing: "0.03em",
              boxShadow: "0 8px 24px rgba(29,78,216,0.35)",
            }}
          >
            <span
              aria-hidden
              className="wi-shimmer pointer-events-none absolute top-0 left-0 h-full"
              style={{
                width: "40%",
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)",
                transform: "translateX(-120%)",
              }}
            />
            {loading ? <Loader2 size={16} className="animate-spin relative z-10" /> : <LogIn size={16} className="relative z-10" />}
            <span className="relative z-10">Entrar</span>
          </button>
        </form>

        <div className="mt-6 text-center">
          {isSupportMode ? (
            <button
              type="button"
              onClick={() => onBackToPicker?.()}
              className="transition-colors hover:opacity-80"
              style={{ fontSize: 11, color: "#4b6fa8", textDecoration: "underline", textUnderlineOffset: 3, fontFamily: MONO }}
            >
              ← Voltar à identificação do cliente
            </button>
          ) : (
            <button
              type="button"
              onClick={onNavigateColetor}
              className="transition-colors hover:opacity-80"
              style={{ fontSize: 11, color: "#4b6fa8", textDecoration: "underline", textUnderlineOffset: 3, fontFamily: MONO }}
            >
              Acessar Coletor de Dados
            </button>
          )}
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

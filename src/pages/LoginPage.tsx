import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Boxes, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { ForcePasswordChangeModal } from "@/components/ForcePasswordChangeModal";
import { useTenantBoot } from "@/contexts/TenantBootContext";

interface LoginPageProps {
  onLogin: () => void;
  onNavigateColetor: () => void;
  mode?: "tenant" | "support";
  onBackToPicker?: () => void;
}

export function LoginPage({ onLogin, onNavigateColetor, mode = "tenant", onBackToPicker }: LoginPageProps) {
  const { tenant: bootTenant, status: bootStatus } = useTenantBoot();
  const isSupportMode = mode === "support";
  const [login, setLogin] = useState(isSupportMode ? "suporte.corelogitrack@gmail.com" : "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forceChange, setForceChange] = useState(false);
  const [pendingUsuario, setPendingUsuario] = useState<any>(null);
  // Overlay anti-flash exibido enquanto o redirect pós-login do suporte é aplicado
  const [redirectingSupport, setRedirectingSupport] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password.trim()) return;
    setLoading(true);
    try {
      const loginInput = login.trim();
      const isSupportEmail = loginInput.toLowerCase() === "suporte.corelogitrack@gmail.com";

      // ===== Fluxo SUPORTE DA PLATAFORMA =====
      if (isSupportEmail) {
        // Suporte só pode logar em domínio neutro (sem subdomínio de tenant)
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

        // === Redirecionamento limpo (sem reload) — define hash ANTES de notificar o app ===
        // 1) Marca a flag de suporte ANTES de qualquer render para o guard anti-flash do AppContent.
        localStorage.setItem("core_is_platform_support", "1");
        localStorage.setItem("core_usuario_nome", who.nome || "Suporte");
        // 2) Limpa caches que pertencem ao fluxo de tenant comum.
        sessionStorage.removeItem("core_rbac_permissions");
        Object.keys(sessionStorage)
          .filter((k) => k.startsWith("core_is_admin_"))
          .forEach((k) => sessionStorage.removeItem(k));
        // 3) Garante que o destino correto já está no hash antes do React reagir.
        if (window.location.hash.replace("#", "") !== "/suporte/tenants") {
          window.location.hash = "/suporte/tenants";
        }
        // 4) Mostra overlay anti-flash enquanto o AppContent reage e renderiza SupportRoute.
        setRedirectingSupport(true);
        toast.success(`Bem-vindo, ${who.nome || "Suporte"}!`);
        // 5) Notifica o TenantContext (sem reload da página).
        onLogin();
        return;
      }

      // ===== Fluxo NORMAL =====
      // Em produção (com subdomínio), o tenant DEVE estar resolvido
      if (bootStatus === "ready" && !bootTenant) {
        throw new Error("Tenant não identificado. Recarregue a página.");
      }

      // Trava por tenant: passa p_tenant_id quando há subdomínio resolvido
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

      // Defesa em profundidade: confirma que usuário pertence ao tenant do subdomínio
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

      // Filtro extra por tenant_id quando subdomínio presente
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
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer login.");
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

  // Overlay anti-flash: cobre toda a tela enquanto o AppContent reage ao login do suporte
  // e renderiza a área protegida /suporte/tenants. Sem isso, o usuário vê 1-2 frames de
  // TenantPicker ou Dashboard antes do destino correto.
  if (redirectingSupport) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center">
            <Boxes size={28} className="text-primary-foreground" />
          </div>
          <Loader2 className="text-primary animate-spin" size={24} />
          <div className="text-sm text-muted-foreground">Acessando painel de suporte…</div>
        </div>
      </div>
    );
  }

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
            <p className="text-xs text-muted-foreground mt-1">
              {isSupportMode ? "Painel de Suporte" : "Sistema de Gestão de Armazém"}
            </p>
          </div>
          {isSupportMode ? (
            <div className="mt-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30">
              <span className="text-[11px] uppercase tracking-wide text-amber-500 font-semibold">
                Acesso: Suporte da Plataforma
              </span>
            </div>
          ) : bootTenant ? (
            <div className="mt-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
              <span className="text-[11px] uppercase tracking-wide text-primary font-semibold">
                Acesso: {bootTenant.nome}
              </span>
            </div>
          ) : null}
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">
              {isSupportMode ? "E-mail" : "Login"}
            </label>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder={isSupportMode ? "suporte.corelogitrack@gmail.com" : "Seu login"}
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
          {isSupportMode ? (
            <button
              type="button"
              onClick={() => onBackToPicker?.()}
              className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
            >
              ← Voltar à identificação do cliente
            </button>
          ) : (
            <button
              type="button"
              onClick={onNavigateColetor}
              className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
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

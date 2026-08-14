import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Bell, AlertTriangle, ShieldAlert, Check, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { tempoRelativo } from "@/lib/ocorrenciaConstants";

interface Notificacao {
  id: string;
  titulo: string;
  descricao: string | null;
  icone: string | null;
  cor: string | null;
  tipo: string | null;
  referencia_rota: string | null;
  criado_em: string;
  lida: boolean;
}

interface NotificacoesDropdownProps {
  onNavigate: (path: string) => void;
}

const COR_CLASS: Record<string, string> = {
  red: "text-red-400",
  orange: "text-orange-400",
  yellow: "text-yellow-400",
  green: "text-green-400",
  blue: "text-blue-400",
  purple: "text-purple-400",
  gray: "text-gray-400",
};

export function NotificacoesDropdown({ onNavigate }: NotificacoesDropdownProps) {
  const { tenantId, empresaId, usuarioId } = useTenant();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  const fetchNotificacoes = useCallback(async () => {
    if (!tenantId) return;
    try {
      let q = (supabase as any)
        .from("notificacao_painel")
        .select("id, titulo, descricao, icone, cor, tipo, referencia_rota, criado_em, lida")
        .eq("tenant_id", tenantId)
        .eq("lida", false);
      if (usuarioId) q = q.or(`usuario_id.is.null,usuario_id.eq.${usuarioId}`);
      else q = q.is("usuario_id", null);
      const { data, error } = await q.order("criado_em", { ascending: false }).limit(20);
      if (error) throw error;
      setNotificacoes(data || []);
    } catch (err) {
      console.error("Erro ao buscar notificações:", err);
    }
  }, [tenantId, usuarioId]);

  // Fetch inicial + polling a cada 30s
  useEffect(() => {
    fetchNotificacoes();
    const interval = window.setInterval(fetchNotificacoes, 30000);
    return () => window.clearInterval(interval);
  }, [fetchNotificacoes, empresaId]);

  // Fecha ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const marcarComoLida = async (notificacaoId: string) => {
    if (!tenantId || !usuarioId) return;
    setNotificacoes((prev) => prev.filter((n) => n.id !== notificacaoId));
    await (supabase as any).rpc("fn_marcar_notificacoes_lidas", {
      p_tenant_id: tenantId,
      p_usuario_id: usuarioId,
      p_notificacao_ids: [notificacaoId],
    });
  };

  const limparTodas = async () => {
    if (!tenantId || !usuarioId) return;
    setLoading(true);
    try {
      await (supabase as any).rpc("fn_marcar_notificacoes_lidas", {
        p_tenant_id: tenantId,
        p_usuario_id: usuarioId,
        p_notificacao_ids: null,
      });
      setNotificacoes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = async (notificacao: Notificacao) => {
    await marcarComoLida(notificacao.id);
    setIsOpen(false);
    if (notificacao.referencia_rota) onNavigate(notificacao.referencia_rota);
  };

  const getIcone = (icone: string | null, cor: string | null) => {
    const corClass = COR_CLASS[cor || ""] || "text-muted-foreground";
    switch (icone) {
      case "AlertTriangle":
        return <AlertTriangle size={15} className={corClass} />;
      case "ShieldAlert":
        return <ShieldAlert size={15} className={corClass} />;
      default:
        return <Info size={15} className={corClass} />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center justify-center w-8 h-8 rounded-md hover:bg-secondary transition-colors"
        aria-label={`Notificações${naoLidas > 0 ? ` (${naoLidas} não lidas)` : ""}`}
        title="Notificações"
      >
        <Bell size={15} className="text-muted-foreground" />
        {naoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-[3px] rounded-full bg-destructive border border-card text-[9px] font-bold text-destructive-foreground flex items-center justify-center">
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-[340px] rounded-lg border border-border bg-card shadow-elevated animate-fade-in z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell size={13} className="text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">Notificações</span>
              {naoLidas > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive text-[10px] font-semibold">
                  {naoLidas}
                </span>
              )}
            </div>
            {naoLidas > 0 && (
              <button
                onClick={limparTodas}
                disabled={loading}
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
              >
                <Check size={11} /> Limpar todas
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="max-h-[360px] overflow-y-auto">
            {notificacoes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Bell size={24} className="text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">Nenhuma notificação pendente</p>
              </div>
            ) : (
              notificacoes.map((n) => {
                const tempo = tempoRelativo(n.criado_em);
                return (
                  <div
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className="group flex items-start gap-2 px-3 py-2.5 border-b border-border/60 last:border-b-0 hover:bg-secondary/50 cursor-pointer transition-colors"
                  >
                    <div className="mt-0.5 shrink-0">{getIcone(n.icone, n.cor)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{n.titulo}</p>
                      {n.descricao && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{n.descricao}</p>
                      )}
                      <p className={cn("text-[10px] mt-1", tempo.cor)}>há {tempo.texto}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        marcarComoLida(n.id);
                      }}
                      className="mt-0.5 p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Marcar como lida"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notificacoes.length > 0 && (
            <div className="px-3 py-2 border-t border-border">
              <button
                onClick={() => {
                  setIsOpen(false);
                  onNavigate("/atividades/ocorrencias");
                }}
                className="text-[11px] text-primary hover:underline w-full text-center"
              >
                Ver todas as ocorrências →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

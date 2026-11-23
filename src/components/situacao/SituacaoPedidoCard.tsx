import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, MapPinned, RotateCcw, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { parseError } from "@/lib/errorMapper";
import { obterSituacaoPedido, situacaoPedidoKeys } from "@/lib/situacaoPedidoService";
import { EntregaPedidoBadge, EtapaPedidoBadge } from "./SituacaoPedidoBadges";
import { IntegracaoDocumentoStatus } from "@/components/integracao/IntegracaoDocumentoStatus";

const fmt = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" }) : "—";

const STATUS_CARGA: Record<string, string> = {
  EM_MONTAGEM: "Em montagem", LIBERADA: "Liberada", EM_CARREGAMENTO: "Em carregamento", FECHADA: "Fechada", CANCELADA: "Cancelada",
};
const STATUS_ENTREGA: Record<string, string> = {
  AGUARDANDO_ACEITE: "Aguardando aceite", EM_ROTA: "Em rota", CONCLUIDA: "Concluída", CANCELADA: "Cancelada",
};

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</span>
      <span className="text-sm text-foreground truncate">{children}</span>
    </div>
  );
}

/**
 * Situação do pedido (plano de status · S2): etapa, entrega e integração, com a onda, a carga,
 * a entrega e as tentativas. Vem só de rpc_pedido_situacao; o card não calcula nada.
 */
export function SituacaoPedidoCard({ documentoId }: { documentoId: string }) {
  const q = useQuery({
    queryKey: situacaoPedidoKeys.pedido(documentoId),
    queryFn: () => obterSituacaoPedido(documentoId),
    staleTime: 0,
    refetchInterval: 30_000,
  });

  if (q.isLoading) return <Skeleton className="h-28 w-full" />;
  if (q.isError) {
    const e = parseError(q.error, "pedido-situacao");
    return <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-300">{e.title}</div>;
  }
  const s = q.data;
  if (!s) return null;
  const transportadora = s.carga?.modalidade === "TERCEIRO";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex flex-wrap items-center gap-2">
          <MapPinned size={16} className="text-primary" aria-hidden />
          Situação do pedido
          <EtapaPedidoBadge etapa={s.etapa} />
          <EntregaPedidoBadge entrega={s.entrega_status} motivo={s.entrega_motivo} />
          {s.integracao && <IntegracaoDocumentoStatus integracao={s.integracao} />}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {s.entrega_motivo && (s.entrega_status === "nao_entregue" || s.entrega_status === "entrega_nao_gerada") && (
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            {s.entrega_status === "nao_entregue" ? "Não entregue: " : "Entrega não gerada: "}{s.entrega_motivo}
          </p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Item rotulo="Etapa desde">{fmt(s.etapa_em)}</Item>
          <Item rotulo="Onda">{s.onda ? `#${s.onda.numero}` : "—"}</Item>
          <Item rotulo="Carga">
            {s.carga ? `#${s.carga.numero} · ${STATUS_CARGA[s.carga.status] ?? s.carga.status}${s.carga.ativo ? "" : " (retirado)"}` : "—"}
          </Item>
          <Item rotulo={transportadora ? "Transportadora" : "Veículo / motorista"}>
            {s.carga
              ? transportadora
                ? s.carga.transportadora ?? "—"
                : [s.carga.placa, s.carga.motorista].filter(Boolean).join(" · ") || "—"
              : "—"}
          </Item>
          <Item rotulo="Embarcado em">{fmt(s.carga?.embarcado_em)}</Item>
          <Item rotulo="Carga fechada em">{fmt(s.carga?.fechada_em)}</Item>
          <Item rotulo="Entregador">{s.entrega?.entregador ?? "—"}</Item>
          <Item rotulo="Entrega">
            {s.entrega ? `${STATUS_ENTREGA[s.entrega.status] ?? s.entrega.status}${s.entrega.parada_sequencia ? ` · parada ${s.entrega.parada_sequencia}` : ""}` : "—"}
          </Item>
        </div>
        {s.tentativas.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Tentativas de entrega</span>
            <ul className="flex flex-col gap-1">
              {s.tentativas.map((t) => {
                const estornada = !!t.estornada_em;
                const Icone = estornada ? RotateCcw : t.resultado === "ENTREGUE" ? CheckCircle2 : XCircle;
                return (
                  <li key={t.id} className={`flex flex-wrap items-center gap-2 text-xs ${estornada ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    <Icone size={13} aria-hidden className={estornada ? "" : t.resultado === "ENTREGUE" ? "text-emerald-500" : "text-rose-500"} />
                    <span className="font-medium">{t.numero}ª · {t.resultado === "ENTREGUE" ? "Entregue" : "Não entregue"}</span>
                    <span>{fmt(t.registrada_em)}</span>
                    {t.entregador && <span>· {t.entregador}</span>}
                    {t.motivo && <span>· {t.motivo}</span>}
                    {t.recebedor_nome && <span>· recebido por {t.recebedor_nome}</span>}
                    {estornada && <span className="no-underline">(estornada{t.motivo_estorno ? `: ${t.motivo_estorno}` : ""})</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

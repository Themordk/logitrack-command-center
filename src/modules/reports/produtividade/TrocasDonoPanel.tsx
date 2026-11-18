import type { TrocasDono } from "./produtividade.service";
import { formatarPct, formatarTempo } from "./produtividadeCalculo";

const ROTULO_MOTIVO: Record<string, string> = {
  REATRIBUICAO: "Reatribuído pelo gestor", DEVOLUCAO_FILA: "Devolvido à fila", SAIR_ETAPA: "Saiu da etapa",
  EXPIRACAO_RESERVA: "Reserva expirada", CANCELAMENTO: "Cancelamento", SEM_MOTIVO: "Sem motivo",
};

/** Fase 5.5 · troca de dono (plano 12.7). Só exibe o que rpc_lms_trocas_dono devolve. */
export function TrocasDonoPanel({ dados }: { dados: TrocasDono }) {
  const t = dados.total;
  const trocas = dados.troca_de_dono;
  const cartoes = [
    { titulo: "Tempo perdido em interrupções", valor: formatarTempo(t.segundos_interrompidos), detalhe: `${t.interrupcoes} interrupção(ões)` },
    { titulo: "Reatribuições por movimento", valor: t.reatribuicoes_por_movimento != null ? t.reatribuicoes_por_movimento.toFixed(2).replace(".", ",") : "—",
      detalhe: `${t.reatribuicoes_gestor} pelo gestor em ${t.movimentos_trabalhados} movimento(s)` },
    { titulo: "Taxa de Sair da etapa", valor: formatarPct(t.taxa_saida_pct), detalhe: `${t.saidas_etapa} de ${t.etapas_assumidas} etapa(s) assumida(s)` },
    { titulo: "Tempo de troca de dono", valor: trocas?.mediana_seg != null ? formatarTempo(trocas.mediana_seg) : "—",
      detalhe: trocas?.trocas ? `mediana · ${trocas.trocas_com_inicio} de ${trocas.trocas} com novo início` : "sem trocas no período" },
    { titulo: "Liberações sem motivo", valor: String(t.liberacoes_sem_motivo), detalhe: "meta 0", alerta: t.liberacoes_sem_motivo > 0 },
  ];
  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {cartoes.map((c) => (
          <div key={c.titulo} className={`rounded-lg border p-3 ${c.alerta ? "border-amber-500/40 bg-amber-500/5" : "border-border"}`}>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{c.titulo}</div>
            <div className="text-xl font-bold font-mono mt-1 text-foreground">{c.valor}</div>
            <div className="text-[11px] text-muted-foreground">{c.detalhe}</div>
          </div>
        ))}
      </div>

      {dados.por_operador.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="px-3 py-2 text-left font-medium">Operador</th>
                <th className="px-3 py-2 text-right font-medium" title="Tempo de tarefas iniciadas e não concluídas: indireto, não conta na performance">Tempo interrompido</th>
                <th className="px-3 py-2 text-center font-medium">Interrupções</th>
                <th className="px-3 py-2 text-center font-medium">Saiu da etapa</th>
                <th className="px-3 py-2 text-center font-medium">Taxa de saída</th>
                <th className="px-3 py-2 text-center font-medium">Perdeu p/ gestor</th>
                <th className="px-3 py-2 text-center font-medium">Recebeu do gestor</th>
              </tr>
            </thead>
            <tbody>
              {dados.por_operador.map((o) => (
                <tr key={o.usuario_id} className="border-b border-border">
                  <td className="px-3 py-2 text-foreground">{o.nome}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatarTempo(o.segundos_interrompidos)}</td>
                  <td className="px-3 py-2 text-center font-mono">{o.interrupcoes}</td>
                  <td className="px-3 py-2 text-center font-mono">{o.saidas_etapa}</td>
                  <td className="px-3 py-2 text-center font-mono">{formatarPct(o.taxa_saida_pct)}</td>
                  <td className="px-3 py-2 text-center font-mono">{o.reatribuicoes_perdidas}</td>
                  <td className="px-3 py-2 text-center font-mono">{o.reatribuicoes_recebidas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dados.por_motivo.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Interrupções por motivo:</span>
          {dados.por_motivo.map((m) => (
            <span key={m.motivo}>{ROTULO_MOTIVO[m.motivo] ?? m.motivo}: {m.interrupcoes} · {formatarTempo(m.segundos)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

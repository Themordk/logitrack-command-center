import { useState } from "react";
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import type { QualidadeDado } from "./produtividade.service";
import { formatarPct, formatarTempo } from "./produtividadeCalculo";
import { formatDateTime } from "@/utils/dateTime";

const ROTULO_ORIGEM: Record<string, string> = {
  REAL: "Real (bipe)", DISPOSITIVO: "Real (offline)", CICLO: "Entre bipes", ATRIBUICAO: "Atribuição",
  SEM_REGISTRO: "Sem registro", LEGADO: "Antes da captura",
};

/** Painel de qualidade do dado (plano 12.6). Só exibe o que rpc_lms_qualidade_dado devolve. */
export function QualidadeDadoPanel({ dados }: { dados: QualidadeDado }) {
  const [verCasos, setVerCasos] = useState(false);
  const m = dados.metas;
  const t = dados.total;

  const cartoes = [
    {
      titulo: "Início real", valor: formatarPct(t.pct_inicio_real), meta: `meta ≥ ${m.pct_inicio_real_min}%`,
      ok: (t.pct_inicio_real ?? 0) >= m.pct_inicio_real_min, detalhe: `${t.inicio_real} de ${t.execucoes} execuções`,
    },
    {
      titulo: "Tempos fora de ordem", valor: String(t.fora_de_ordem), meta: "meta 0",
      ok: t.fora_de_ordem <= m.fora_de_ordem_max, detalhe: "atribuído > início ou início > fim",
    },
    {
      titulo: "Duração fora do padrão", valor: formatarPct(t.pct_fora_padrao), meta: `meta < ${m.pct_fora_padrao_max}%`,
      ok: (t.pct_fora_padrao ?? 0) < m.pct_fora_padrao_max, detalhe: `${t.duracao_fora_padrao} acima de ${m.multiplo_set}× SET ou 4 h`,
    },
    {
      titulo: "Atribuições esquecidas", valor: String(dados.atribuicoes_abertas.total), meta: "meta 0",
      ok: dados.atribuicoes_abertas.total <= m.atribuicoes_abertas_max, detalhe: "abertas sem evento há mais de 12 h",
    },
    {
      titulo: "Liberações sem motivo", valor: String(dados.liberacoes.sem_motivo), meta: "meta 0",
      ok: dados.liberacoes.sem_motivo === 0, detalhe: `${dados.liberacoes.total} liberações no período`,
    },
    {
      titulo: "Pré-início expirado", valor: formatarPct(dados.contextos_pre_inicio.pct_expirados), meta: "monitorar",
      ok: (dados.contextos_pre_inicio.pct_expirados ?? 0) < 10,
      detalhe: `${dados.contextos_pre_inicio.expirados} de ${dados.contextos_pre_inicio.criados} bipes de origem`,
    },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cartoes.map((c) => (
          <div key={c.titulo} className={`rounded-lg border p-3 ${c.ok ? "border-border" : "border-amber-500/40 bg-amber-500/5"}`}>
            <div className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              {c.ok ? <CheckCircle2 size={12} className="text-green-400" aria-label="Dentro da meta" />
                : <AlertTriangle size={12} className="text-amber-400" aria-label="Fora da meta" />}
              {c.titulo}
            </div>
            <div className="text-xl font-bold font-mono mt-1 text-foreground">{c.valor}</div>
            <div className="text-[11px] text-muted-foreground">{c.meta} · {c.detalhe}</div>
          </div>
        ))}
      </div>

      {dados.por_tipo.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="px-3 py-2 text-left font-medium">Atividade</th>
                <th className="px-3 py-2 text-center font-medium">Execuções</th>
                <th className="px-3 py-2 text-center font-medium">Início real</th>
                <th className="px-3 py-2 text-left font-medium">De onde veio o início</th>
                <th className="px-3 py-2 text-center font-medium">Fora de ordem</th>
                <th className="px-3 py-2 text-center font-medium">Fora do padrão</th>
                <th className="px-3 py-2 text-center font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {dados.por_tipo.map((q) => (
                <tr key={q.tipo_tarefa_id} className="border-b border-border">
                  <td className="px-3 py-2 text-foreground"><span className="font-mono text-xs text-muted-foreground mr-1">{q.codigo}</span>{q.descricao}</td>
                  <td className="px-3 py-2 text-center font-mono">{q.execucoes}</td>
                  <td className={`px-3 py-2 text-center font-mono ${q.pct_inicio_real >= m.pct_inicio_real_min ? "text-green-400" : "text-amber-400"}`}>{formatarPct(q.pct_inicio_real)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {Object.entries(q.por_origem || {}).sort((a, b) => b[1] - a[1])
                      .map(([o, n]) => `${ROTULO_ORIGEM[o] ?? o}: ${n}`).join(" · ")}
                  </td>
                  <td className={`px-3 py-2 text-center font-mono ${q.fora_de_ordem > 0 ? "text-red-400" : ""}`}>{q.fora_de_ordem}</td>
                  <td className={`px-3 py-2 text-center font-mono ${q.pct_fora_padrao >= m.pct_fora_padrao_max ? "text-amber-400" : ""}`}>{q.duracao_fora_padrao}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${q.ok ? "bg-green-500/15 text-green-400" : "bg-amber-500/15 text-amber-400"}`}>
                      {q.ok ? "Confiável" : "Revisar"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dados.casos.length > 0 && (
        <div>
          <button onClick={() => setVerCasos(!verCasos)} aria-expanded={verCasos}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            {verCasos ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {verCasos ? "Ocultar" : "Ver"} {dados.casos.length} execuções para auditar
          </button>
          {verCasos && (
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground uppercase tracking-wider">
                    <th className="px-2 py-1.5 text-left">Concluída</th><th className="px-2 py-1.5 text-left">Operador</th>
                    <th className="px-2 py-1.5 text-left">Tipo</th><th className="px-2 py-1.5 text-right">Duração</th>
                    <th className="px-2 py-1.5 text-right">SET</th><th className="px-2 py-1.5 text-left">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.casos.map((c) => (
                    <tr key={c.execucao_id} className="border-t border-border">
                      <td className="px-2 py-1.5">{c.concluido_em ? formatDateTime(c.concluido_em) : "—"}</td>
                      <td className="px-2 py-1.5">{c.operador || "—"}</td>
                      <td className="px-2 py-1.5 font-mono">{c.tipo}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{formatarTempo(c.duracao_seg)}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{c.set_seg ? `${Math.round(c.set_seg)} s` : "—"}</td>
                      <td className="px-2 py-1.5">{c.motivo === "FORA_DE_ORDEM" ? "Tempos fora de ordem" : "Duração fora do padrão"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { Award, CalendarCheck, Flame, Lock, ScanLine, Star, Users } from "lucide-react";
import { formatarValorMeta, type UnidadeMetrica } from "@/modules/lms/metas/metas.service";
import { formatDate } from "@/utils/dateTime";

/**
 * Fase 10.29 · Engajamento no coletor (só com a gamificação ligada).
 * Sequência que volta um degrau, selos e desafio da equipe vêm prontos de
 * fn_coletor_metas_operador.engajamento; a tela só mostra. Placar individual não existe aqui (D5).
 */
export interface Selo { codigo: string; nome: string; descricao: string; conquistado: boolean; quando: string | null }
export interface DesafioEquipe {
  meta_id: string; nome: string; objetivo: string | null; equipe: string | null; unidade: UnidadeMetrica; menor_melhor: boolean;
  alvo: number; resultado: { realizado: number | null; atingimento_pct: number | null; faixa: string; parcial: boolean; participantes: number } | null;
}
export interface Engajamento {
  liberado: boolean; codigo?: string; motivo?: string;
  sequencia?: { atual: number; melhor: number; degrau: number; proximo_marco: number | null; regra: string };
  selos?: Selo[];
  desafios_equipe?: DesafioEquipe[];
}

const ICONE_SELO: Record<string, typeof Award> = { PRIMEIRO_DIA: Star, CINCO_SEGUIDOS: Flame, MELHOR_SEMANA: CalendarCheck, INICIO_100: ScanLine };
const caixa = "rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-3";
const apagado = "text-[hsl(213,31%,55%)]";

export function MetasEngajamento({ engajamento }: { engajamento: Engajamento }) {
  if (!engajamento.liberado) {
    return (
      <p className={`flex items-start gap-2 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,10%)] p-3 text-[11px] ${apagado}`} data-testid="engajamento-bloqueado">
        <Lock size={13} className="mt-0.5 shrink-0" /> {engajamento.motivo}
      </p>
    );
  }
  const s = engajamento.sequencia;
  const faltam = s?.proximo_marco ? s.proximo_marco - s.atual : null;
  return (
    <div className="space-y-2" data-testid="engajamento">
      {s && (
        <section className={`${caixa} flex items-center gap-3 border-orange-500/25 bg-orange-500/10`} aria-label="Sequência na meta">
          <Flame size={22} className="shrink-0 text-orange-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold tabular-nums text-orange-300">{s.atual} {s.atual === 1 ? "dia" : "dias"} na meta</p>
            <p className="text-[10px] text-orange-200/70">
              {faltam ? `Faltam ${faltam} para o degrau de ${s.proximo_marco} dias` : "Você chegou ao último degrau"} · melhor: {s.melhor}
            </p>
            <p className="mt-0.5 text-[10px] text-orange-200/60">{s.regra}</p>
          </div>
        </section>
      )}

      {engajamento.selos && engajamento.selos.length > 0 && (
        <section className={caixa} aria-label="Selos">
          <p className={`mb-2 text-[11px] font-semibold ${apagado}`}>Selos</p>
          <div className="grid grid-cols-2 gap-2">
            {engajamento.selos.map((selo) => {
              const Icone = ICONE_SELO[selo.codigo] ?? Award;
              return (
                <div key={selo.codigo} className={`flex items-start gap-2 rounded-xl border p-2 ${selo.conquistado ? "border-amber-400/40 bg-amber-400/10" : "border-[hsl(222,35%,20%)] opacity-60"}`}
                  aria-label={`${selo.nome}${selo.conquistado ? " (conquistado)" : ""}`}>
                  <Icone size={16} className={selo.conquistado ? "mt-0.5 shrink-0 text-amber-300" : `mt-0.5 shrink-0 ${apagado}`} />
                  <div className="min-w-0">
                    <p className={`text-[11px] font-semibold ${selo.conquistado ? "text-white" : apagado}`}>{selo.nome}</p>
                    <p className={`text-[10px] leading-tight ${apagado}`}>{selo.conquistado && selo.quando ? formatDate(selo.quando) : selo.descricao}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {engajamento.desafios_equipe?.map((d) => {
        const pct = d.resultado?.atingimento_pct ?? null;
        const barra = pct === null ? 0 : Math.max(0, Math.min(100, pct));
        return (
          <section key={d.meta_id} className={caixa} aria-label={`Desafio da equipe ${d.equipe ?? ""}`}>
            <div className="flex items-center gap-2">
              <Users size={15} className="shrink-0 text-blue-300" />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">Desafio da equipe{d.equipe ? ` · ${d.equipe}` : ""}</p>
            </div>
            <p className={`mt-0.5 text-[11px] ${apagado}`}>
              {d.objetivo ?? d.nome}: {d.menor_melhor ? "até" : "chegar a"} {formatarValorMeta(d.alvo, d.unidade)} juntos
            </p>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="tabular-nums text-white">Equipe: {formatarValorMeta(d.resultado?.realizado ?? null, d.unidade)}</span>
              <span className={apagado}>{pct !== null ? `${Math.round(pct)}% do alvo` : "sem resultado ainda"}{d.resultado?.parcial ? " · em andamento" : ""}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[hsl(222,35%,18%)]" role="progressbar" aria-valuenow={Math.round(barra)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${barra}%` }} />
            </div>
          </section>
        );
      })}
    </div>
  );
}

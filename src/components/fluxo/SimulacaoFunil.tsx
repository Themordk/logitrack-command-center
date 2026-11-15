/**
 * Fluxo de Expedição · F7 — funil da simulação (roteiro_saida_simular, somente leitura).
 * Atualiza a cada mudança da configuração, antes de salvar.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Loader2 } from "lucide-react";
import { parseError } from "@/lib/errorMapper";
import { descreverAmostra, fluxoExpedicaoService, type ConfigFluxo } from "@/lib/fluxoExpedicao";

interface Props { tenantId: string; empresaId: string; config: ConfigFluxo }

function Etapa({ rotulo, valor, nota, largura }: { rotulo: string; valor: string; nota?: string; largura: number }) {
  return (
    <li className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{rotulo}</span>
        <span className="text-sm font-bold text-foreground font-mono">{valor}</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden" aria-hidden="true">
        <div className="h-full bg-primary/70 rounded-full" style={{ width: `${largura <= 0 ? 0 : Math.max(4, Math.min(100, largura))}%` }} />
      </div>
      {nota && <p className="text-[10px] text-muted-foreground">{nota}</p>}
    </li>
  );
}

export function SimulacaoFunil({ tenantId, empresaId, config }: Props) {
  const [dias, setDias] = useState(7);
  const [cfg, setCfg] = useState(config);
  // espera o usuário parar de mexer para não simular a cada clique
  useEffect(() => { const t = setTimeout(() => setCfg(config), 400); return () => clearTimeout(t); }, [config]);

  const q = useQuery({
    queryKey: ["fluxo-simulacao", tenantId, empresaId, JSON.stringify(cfg), dias],
    queryFn: () => fluxoExpedicaoService.simular(tenantId, empresaId, cfg, dias),
    placeholderData: (anterior) => anterior,
    staleTime: 60_000,
  });
  const s = q.data;
  const base = Math.max(1, s?.pedidos ?? 1);
  const pct = (n: number) => (n / Math.max(base, n)) * 100;

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <BarChart3 size={14} /> Simulação {q.isFetching && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
        </h2>
        {s?.origem === "PERIODO" && (
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Período da simulação"
            className="h-7 px-2 rounded border border-border bg-background text-[11px] text-foreground outline-none">
            {[7, 15, 30].map((d) => <option key={d} value={d}>Últimos {d} dias</option>)}
          </select>
        )}
      </div>

      {q.isError ? (
        <p className="text-xs text-red-300">{parseError(q.error, "fluxo-simulacao").title}</p>
      ) : !s ? (
        <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      ) : s.pedidos === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum pedido pendente nem dos últimos {s.dias} dias para simular.</p>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">Com a configuração da tela (ainda não salva) sobre {descreverAmostra(s)}:</p>
          <ol className="space-y-2">
            <Etapa rotulo="Pedidos" valor={String(s.pedidos)} largura={100} nota={`${s.skus} SKU(s) em ${s.itens} item(ns)`} />
            <Etapa rotulo="Movimentos de saída" valor={String(s.movimentos)} largura={pct(s.movimentos)} />
            <Etapa rotulo="Grupos de separação" valor={String(s.grupos_separacao)} largura={pct(s.grupos_separacao)} />
            <Etapa rotulo="Unidades de conferência" largura={pct(s.unidades_conferencia)}
              valor={s.conferencia_por_hu ? `${s.unidades_conferencia}+` : String(s.unidades_conferencia)}
              nota={s.conferencia_por_hu ? "Por HU/volume: o número real depende das HUs usadas na coleta." :
                s.movimentos_conferidos < s.movimentos ? `${s.movimentos - s.movimentos_conferidos} movimento(s) de tipos sem conferência.` : undefined} />
            <Etapa rotulo="Cargas sugeridas" largura={s.cargas_sugeridas == null ? 0 : pct(s.cargas_sugeridas)}
              valor={s.cargas_sugeridas == null ? "—" : String(s.cargas_sugeridas)}
              nota={s.movimentos_com_embarque === 0 ? "Nenhum movimento de tipo com embarque."
                : s.cargas_sugeridas == null ? `${s.movimentos_com_embarque} movimento(s) com embarque; sem critério no N5, a sugestão depende do veículo e box da onda.`
                : `De ${s.movimentos_com_embarque} movimento(s) com embarque.`} />
          </ol>
          {s.por_tipo.length > 1 && (
            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer select-none">Por tipo de saída</summary>
              <table className="w-full mt-1">
                <thead><tr className="text-left"><th className="font-medium py-0.5">Tipo</th><th className="font-medium text-right">Ped.</th><th className="font-medium text-right">Mov.</th><th className="font-medium text-right">Grupos</th><th className="font-medium text-right">Conf.</th></tr></thead>
                <tbody>
                  {s.por_tipo.map((t) => (
                    <tr key={t.tipo} className="border-t border-border/50">
                      <td className="py-0.5 truncate max-w-[110px]" title={t.tipo}>{t.tipo}</td>
                      <td className="text-right font-mono">{t.pedidos}</td><td className="text-right font-mono">{t.movimentos}</td>
                      <td className="text-right font-mono">{t.grupos_separacao}</td><td className="text-right font-mono">{t.unidades_conferencia}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          <p className="text-[10px] text-muted-foreground">Estimativa pelo endereço de picking de cada produto; não grava nada.</p>
        </>
      )}
    </section>
  );
}

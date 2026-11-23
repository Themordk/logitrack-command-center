import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Circle, CircleDashed, ListChecks, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { obterSaudeConfig, type PassoConfig, type SaudeConfig, type SituacaoPasso } from "./lmsConfig.service";

/**
 * Fase 10.20 (P9): roteiro de primeiros passos com a saúde da configuração.
 * A situação de cada passo vem do banco (rpc_lms_saude_config); a tela só mostra
 * e leva para onde corrigir. Fica aberto enquanto houver passo pendente.
 */

const SITUACAO: Record<SituacaoPasso, { rotulo: string; icone: JSX.Element; classe: string }> = {
  OK: { rotulo: "Pronto", icone: <CheckCircle2 size={16} />, classe: "text-emerald-600 dark:text-emerald-400" },
  PENDENTE: { rotulo: "Falta fazer", icone: <Circle size={16} />, classe: "text-destructive" },
  ATENCAO: { rotulo: "Revisar", icone: <AlertTriangle size={16} />, classe: "text-amber-600 dark:text-amber-400" },
  OPCIONAL: { rotulo: "Opcional", icone: <CircleDashed size={16} />, classe: "text-muted-foreground" },
};

export function resumoSaude(s: SaudeConfig): string {
  const pend = s.passos.filter((p) => p.situacao === "PENDENTE").length;
  const rev = s.passos.filter((p) => p.situacao === "ATENCAO").length;
  if (pend > 0) return `${pend} passo(s) por fazer${rev ? ` e ${rev} para revisar` : ""}: os números ainda não são confiáveis.`;
  if (rev > 0) return `Configuração pronta para uso, com ${rev} ponto(s) para revisar.`;
  return "Configuração completa.";
}

interface Props {
  tenantId: string;
  empresaId: string;
  armazemId: string | null;
  /** muda quando a página salva algo, para recalcular */
  versao?: number;
  onNavigate?: (path: string) => void;
}

export function PrimeirosPassosPanel({ tenantId, empresaId, armazemId, versao = 0, onNavigate }: Props) {
  const [saude, setSaude] = useState<SaudeConfig | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState<boolean | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setSaude(await obterSaudeConfig(tenantId, empresaId, armazemId)); }
    catch { setSaude(null); }
    finally { setCarregando(false); }
  }, [tenantId, empresaId, armazemId]);

  useEffect(() => { carregar(); }, [carregar, versao]);

  if (!saude) return null;
  const expandido = aberto ?? saude.passos.some((p) => p.situacao === "PENDENTE" || p.situacao === "ATENCAO");

  function ir(p: PassoConfig) {
    if (p.destino.startsWith("#")) {
      document.getElementById(p.destino.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      onNavigate?.(p.destino);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card" data-testid="lms-primeiros-passos">
      <header className="flex flex-wrap items-center justify-between gap-3 p-4">
        <button type="button" className="flex items-start gap-2 text-left" onClick={() => setAberto(!expandido)} aria-expanded={expandido}>
          <ListChecks size={18} className="mt-0.5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Configuração do LMS · primeiros passos</h2>
            <p className={cn("text-xs", saude.pronto ? "text-muted-foreground" : "text-destructive")}>{resumoSaude(saude)}</p>
          </div>
          <ChevronDown size={16} className={cn("mt-0.5 text-muted-foreground transition-transform", expandido && "rotate-180")} />
        </button>
        <Button variant="ghost" size="sm" onClick={carregar} disabled={carregando} aria-label="Conferir de novo">
          <RefreshCw size={14} className={cn(carregando && "animate-spin")} />
        </Button>
      </header>
      {expandido && (
        <ol className="border-t border-border">
          {saude.passos.map((p) => {
            const s = SITUACAO[p.situacao];
            return (
              <li key={p.codigo} className="flex flex-wrap items-start gap-3 border-b border-border px-4 py-3 last:border-0" data-testid={`passo-${p.codigo}`}>
                <span className={cn("mt-0.5", s.classe)} aria-label={s.rotulo} title={s.rotulo}>{s.icone}</span>
                <div className="min-w-[240px] flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {p.ordem}. {p.titulo} <span className={cn("ml-1 text-[11px] font-normal", s.classe)}>{s.rotulo}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{p.descricao}</p>
                  <p className="mt-0.5 text-xs text-foreground">{p.detalhe}</p>
                </div>
                {(p.situacao !== "OK" || p.destino.startsWith("#")) && (
                  <Button size="sm" variant={p.situacao === "PENDENTE" ? "default" : "outline"} onClick={() => ir(p)}
                    disabled={!p.destino.startsWith("#") && !onNavigate}>
                    {p.acao}
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

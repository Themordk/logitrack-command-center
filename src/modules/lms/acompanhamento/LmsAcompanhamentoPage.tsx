import { useEffect, useMemo, useState } from "react";
import { Building2, Gauge, Target } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { cn } from "@/lib/utils";
import { dataLocalISO } from "@/lib/dateUtils";
import { listarArmazens, listarEmpresas } from "@/modules/lms/configuracao/lmsConfig.service";
import { AtingimentoView } from "./AtingimentoView";
import { PainelTurnoView } from "./PainelTurnoView";
import { VisaoEmpresaView } from "./VisaoEmpresaView";

type Aba = "painel" | "atingimento" | "empresa";
type Periodo = "7" | "30" | "mes";

const ABAS: Array<{ id: Aba; rotulo: string; icone: JSX.Element }> = [
  { id: "painel", rotulo: "Painel do turno", icone: <Gauge size={14} /> },
  { id: "atingimento", rotulo: "Atingimento das metas", icone: <Target size={14} /> },
  { id: "empresa", rotulo: "Visão da empresa", icone: <Building2 size={14} /> },
];

function periodo(p: Periodo): { ini: string; fim: string } {
  const hoje = new Date();
  const fim = dataLocalISO(hoje);
  if (p === "mes") return { ini: dataLocalISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), fim };
  const ini = new Date(hoje);
  ini.setDate(ini.getDate() - (Number(p) - 1));
  return { ini: dataLocalISO(ini), fim };
}

/** Fase 10 · Acompanhamento do LMS (supervisor e gerente). */
export function LmsAcompanhamentoPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { tenantId, empresaId: empresaSessao, armazemId: armazemSessao } = useTenant();
  const [aba, setAba] = useState<Aba>("painel");
  const [empresas, setEmpresas] = useState<Array<{ id: string; nome: string }>>([]);
  const [empresaId, setEmpresaId] = useState<string | null>(empresaSessao);
  const [armazens, setArmazens] = useState<Array<{ id: string; nome: string }>>([]);
  const [armazemId, setArmazemId] = useState<string | null>(armazemSessao);
  const [per, setPer] = useState<Periodo>("7");
  const { ini, fim } = useMemo(() => periodo(per), [per]);

  useEffect(() => { if (!empresaId && empresaSessao) setEmpresaId(empresaSessao); }, [empresaSessao, empresaId]);
  useEffect(() => { if (tenantId) listarEmpresas(tenantId).then(setEmpresas); }, [tenantId]);
  useEffect(() => {
    if (!tenantId || !empresaId) return;
    listarArmazens(tenantId, empresaId).then((l) => {
      setArmazens(l);
      setArmazemId((atual) => (atual && l.some((a) => a.id === atual) ? atual : l[0]?.id ?? null));
    });
  }, [tenantId, empresaId]);

  if (!tenantId) return null;

  return (
    <div className="space-y-4" data-testid="lms-acompanhamento">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        <div className="space-y-1">
          <label htmlFor="acomp-empresa" className="text-xs text-muted-foreground">Empresa</label>
          <select id="acomp-empresa" className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={empresaId ?? ""} onChange={(e) => setEmpresaId(e.target.value || null)}>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>
        {aba === "painel" && (
          <div className="space-y-1">
            <label htmlFor="acomp-armazem" className="text-xs text-muted-foreground">Armazém</label>
            <select id="acomp-armazem" className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={armazemId ?? ""} onChange={(e) => setArmazemId(e.target.value || null)}>
              {armazens.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>
        )}
        {aba !== "painel" && (
          <div className="space-y-1">
            <span className="block text-xs text-muted-foreground">Período</span>
            <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Período">
              {([["7", "7 dias"], ["30", "30 dias"], ["mes", "Mês atual"]] as Array<[Periodo, string]>).map(([id, r]) => (
                <button key={id} type="button" aria-pressed={per === id} onClick={() => setPer(id)}
                  className={cn("h-7 rounded px-2.5 text-xs", per === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-border" role="tablist">
        {ABAS.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
            className={cn("flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm -mb-px",
              aba === a.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {a.icone}{a.rotulo}
          </button>
        ))}
      </div>

      {aba === "painel" && (armazemId
        ? <PainelTurnoView key={armazemId} tenantId={tenantId} armazemId={armazemId} onNavigate={onNavigate} />
        : <p className="text-sm text-muted-foreground">Escolha o armazém.</p>)}
      {aba === "atingimento" && empresaId && (
        <AtingimentoView tenantId={tenantId} empresaId={empresaId} armazens={armazens} dataIni={ini} dataFim={fim} onNavigate={onNavigate} />
      )}
      {aba === "empresa" && empresaId && <VisaoEmpresaView tenantId={tenantId} empresaId={empresaId} dataIni={ini} dataFim={fim} />}
    </div>
  );
}

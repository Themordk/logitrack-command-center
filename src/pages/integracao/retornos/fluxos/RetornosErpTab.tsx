import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, Plus, Workflow } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusRetornoBadge } from "../components/StatusRetornoBadge";
import { retornosKeys } from "../retornosKeys";
import { listarFluxos } from "../retornosService";
import { usePermissaoRetorno } from "../useRetornos";

interface Props { erpProvedorId: string; onNavigate: (path: string) => void }

/** Painel compacto, usado na página do provedor ERP, com os fluxos de retorno ligados a ele. */
export function RetornosErpTab(props: Props) {
  const { podeVer } = usePermissaoRetorno();
  if (!podeVer) return null;
  return <Painel {...props} />;
}

function Painel({ erpProvedorId, onNavigate }: Props) {
  const { tenantId, empresaId, empresaVersion } = useTenant();
  const q = useQuery({
    queryKey: [...retornosKeys.fluxos(tenantId, empresaId, false), empresaVersion],
    queryFn: () => listarFluxos(tenantId as string, empresaId as string, false),
    enabled: !!tenantId && !!empresaId,
  });
  const fluxos = (q.data ?? []).filter((f) => f.erp_provedor_id === erpProvedorId);
  const abrir = () => onNavigate("/config/integracao/retornos");

  return (
    <div className="card-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-secondary/30 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Fluxos de retorno deste ERP</h3>
        <Button size="sm" variant="outline" onClick={abrir}><ExternalLink size={14} /> Abrir Retornos ao ERP</Button>
      </div>
      {!empresaId ? (
        <p className="p-4 text-sm text-muted-foreground">Selecione uma empresa para continuar.</p>
      ) : q.isLoading ? (
        <div className="p-4 flex flex-col gap-2">{[0, 1].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : q.isError ? (
        <div className="m-4 rounded-lg border border-destructive/40 px-3 py-2 flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-2 text-destructive"><AlertTriangle size={13} /> Não foi possível carregar os fluxos.</span>
          <Button size="sm" variant="outline" onClick={() => q.refetch()}>Tentar novamente</Button>
        </div>
      ) : fluxos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Workflow size={15} className="text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">Nenhum fluxo ligado a este ERP.</p>
          <Button size="sm" onClick={abrir}><Plus size={14} /> Criar fluxo</Button>
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead className="bg-secondary/40 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Nome</th>
              <th className="px-3 py-2 font-medium">Situação</th>
              <th className="px-3 py-2 font-medium">Evento</th>
              <th className="px-3 py-2 font-medium text-right">Erros 24 h</th>
            </tr>
          </thead>
          <tbody>
            {fluxos.map((f) => {
              const erros = f.execucoes_24h?.erro ?? 0;
              return (
                <tr key={f.id} onClick={() => onNavigate(`/config/integracao/retornos/fluxo/${f.id}`)}
                  className="border-t border-border/40 hover:bg-secondary/30 cursor-pointer">
                  <td className="px-3 py-2 text-foreground font-medium">{f.nome}</td>
                  <td className="px-3 py-2"><StatusRetornoBadge tipo="fluxo" status={f.status} /></td>
                  <td className="px-3 py-2 text-muted-foreground">{f.evento_nome ?? "—"}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${erros > 0 ? "text-rose-400" : "text-muted-foreground"}`}>
                    {erros.toLocaleString("pt-BR")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

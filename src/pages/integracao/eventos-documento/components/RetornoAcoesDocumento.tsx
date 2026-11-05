import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTenant } from "@/contexts/TenantContext";
import { parseError } from "@/lib/errorMapper";
import type { EntidadeDocumento } from "../../retornos/retornos.types";
import { executar, invokeDispatcher, listarFluxos } from "../../retornos/retornosService";
import { useCatalogoRetorno, usePermissaoRetorno } from "../../retornos/useRetornos";
import { reprocessarEExecutar } from "../../retornos/execucoes/AcoesExecucaoDialogs";
import { retornosKeys } from "../../retornos/retornosKeys";

interface Props {
  entidade: EntidadeDocumento;
  documentoId: string;
  numeroDoc: string | number | null | undefined;
  ultimoRetornoComErroId: string | null;
  onAposAcao: () => void;
}

const irPara = (path: string) => { window.location.hash = path; };

/** Botões Ver todas / Reenviar / Enviar ao ERP (extraídos do antigo card de retornos). */
export function RetornoAcoesDocumento(props: Props) {
  const { podeVer } = usePermissaoRetorno();
  const { tenantId, empresaId } = useTenant();
  if (!podeVer || !tenantId || !empresaId) return null;
  return <Acoes {...props} tenantId={tenantId} empresaId={empresaId} />;
}

function Acoes({ entidade, documentoId, numeroDoc, ultimoRetornoComErroId, onAposAcao, tenantId, empresaId }: Props & { tenantId: string; empresaId: string }) {
  const { podeEditar } = usePermissaoRetorno();
  const { data: catalogo } = useCatalogoRetorno();
  const [popAberto, setPopAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [reenviando, setReenviando] = useState(false);

  const fluxos = useQuery({
    queryKey: retornosKeys.fluxos(tenantId, empresaId, false),
    queryFn: () => listarFluxos(tenantId, empresaId, false),
    enabled: podeEditar,
  });

  const fluxosServem = useMemo(() => {
    const evEntidade = new Map((catalogo?.eventos ?? []).map((e) => [e.codigo, e.entidade]));
    return (fluxos.data ?? []).filter((f) => f.ativo && f.versao_publicada != null && f.evento && evEntidade.get(f.evento) === entidade);
  }, [fluxos.data, catalogo, entidade]);

  async function enviar(fluxoId: string) {
    setEnviando(true);
    try {
      const r = await executar(fluxoId, documentoId, "manual", false);
      if (r.status === "filtrado") { toast.warning("Documento barrado pelos filtros do fluxo."); return; }
      const d = await invokeDispatcher({ acao: "executar", execucao_id: r.execucao_id });
      if (d.status === "sucesso") toast.success("Enviado ao ERP.");
      else if (d.status === "erro") toast.error(d.erro || "O envio falhou.");
      else toast.info("Envio em processamento.");
      setPopAberto(false);
    } catch (e) {
      toast.error(parseError(e, "retorno-enviar").title);
    } finally {
      setEnviando(false);
      onAposAcao();
    }
  }

  async function reenviar(id: string) {
    setReenviando(true);
    try { await reprocessarEExecutar(id, null); toast.success("Reenvio solicitado."); }
    catch (e) { toast.error(parseError(e, "retorno-reprocessar").title); }
    finally { setReenviando(false); onAposAcao(); }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="ghost" onClick={() => irPara(`/config/integracao/retornos?${new URLSearchParams({ aba: "execucoes", ...(numeroDoc != null ? { busca: String(numeroDoc) } : {}) }).toString()}`)}>Ver todas</Button>
      {ultimoRetornoComErroId && (
        <Button size="sm" variant="outline" disabled={!podeEditar || reenviando} onClick={() => reenviar(ultimoRetornoComErroId)}>
          {reenviando ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Reenviar
        </Button>
      )}
      <Popover open={popAberto} onOpenChange={setPopAberto}>
        <PopoverTrigger asChild>
          <Button size="sm" disabled={!podeEditar || enviando}>
            {enviando ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Enviar ao ERP
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-2">
          {fluxos.isLoading ? (
            <div className="text-xs text-muted-foreground p-2 flex gap-2"><Loader2 size={13} className="animate-spin" /> Carregando…</div>
          ) : fluxosServem.length === 0 ? (
            <div className="p-2 space-y-2 text-xs text-muted-foreground">
              <p>Nenhum fluxo publicado para este tipo de documento.</p>
              <Button size="sm" variant="link" className="px-0 h-auto" onClick={() => irPara("/config/integracao/retornos?aba=fluxos")}>Abrir Retornos ao ERP</Button>
            </div>
          ) : (
            <div className="flex flex-col">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground px-2 py-1">Escolha o fluxo</p>
              {fluxosServem.map((f) => (
                <button key={f.id} disabled={enviando} onClick={() => enviar(f.id)}
                  className="text-left text-xs px-2 py-1.5 rounded hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-foreground">
                  {f.nome} <span className="text-muted-foreground">v{f.versao_publicada}</span>
                </button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

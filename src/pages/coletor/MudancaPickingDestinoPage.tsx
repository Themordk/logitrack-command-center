import { useEffect, useMemo, useRef, useState } from "react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { OnlineOnlyNotice, useOnlineOnlyBlocked } from "@/components/coletor/OnlineOnlyNotice";
import { ScanField } from "@/components/coletor/ScanField";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { Loader2 } from "lucide-react";
import {
  MUDPICK_KEYS,
  buscarEnderecoPorCodigo,
  executarMudanca,
  lerDecisoes,
  lerPreview,
} from "@/modules/coletor/mudanca-picking/mudancaPicking.service";

interface Props { onNavigate: (path: string) => void; }

export function MudancaPickingDestinoPage({ onNavigate }: Props) {
  const offlineBlocked = useOnlineOnlyBlocked();
  const tenantId = localStorage.getItem("core_tenant_id") || "";
  const usuarioId = localStorage.getItem("core_usuario_id") || "";
  const origemId = sessionStorage.getItem(MUDPICK_KEYS.origemId) || "";

  const preview = useMemo(() => lerPreview(), []);
  const decisoes = useMemo(() => lerDecisoes(), []);

  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState("");
  const submitting = useRef(false);
  const result = useResultDialog({ coletorMode: true });

  useEffect(() => {
    if (!preview) onNavigate("/coletor/movimentos/mudanca-picking/origem");
  }, [preview, onNavigate]);

  if (!preview) return null;

  const { totais, produtos } = preview;
  const pickingsTransferir =
    produtos
      .filter((p) => p.situacao === "MAPEADO_ORIGEM")
      .reduce((acc, p) => acc + p.mapeamentos_origem.length, 0) +
    produtos.filter((p) => {
      if (!p.requer_decisao) return false;
      const d = decisoes[p.produto_id];
      return d?.acao === "MIGRAR_PICKING_EXISTENTE" || d?.acao === "CRIAR_PICKING";
    }).length;

  const handleScan = async (code: string) => {
    if (submitting.current) return;
    setScanned(code);
    setLoading(true);
    submitting.current = true;
    try {
      const destino = await buscarEnderecoPorCodigo(tenantId, code);
      if (!destino) {
        result.showWarning("Endereço destino não encontrado.");
        return;
      }
      if (destino.id === origemId) {
        result.showWarning("Endereço destino igual ao origem.");
        return;
      }

      if (!usuarioId) {
        result.showWarning("Sessão sem usuário identificado. Faça login novamente no coletor.");
        return;
      }

      const decisoesEnviar = produtos
        .filter((p) => p.requer_decisao)
        .map((p) => decisoes[p.produto_id])
        .filter(Boolean);

      const res = await executarMudanca({
        tenantId,
        origemId,
        destinoId: destino.id,
        usuarioId,
        decisoes: decisoesEnviar,
      });

      if (res.tipo === "sucesso") {
        sessionStorage.setItem(MUDPICK_KEYS.resultado, JSON.stringify(res.dados));
        onNavigate("/coletor/movimentos/mudanca-picking/concluido");
        return;
      }

      if (res.tipo === "negocio") {
        const e = res.erro;
        if (e.codigo === "ORIGEM_COM_SKUS_SEM_PICKING") {
          result.showWarning("Mudança de picking não permitida", { details: e.mensagem });
        } else if (e.codigo === "VALIDACAO_REPROVADA" && e.erros?.length) {
          result.showWarning("Validação reprovada", {
            details: e.erros.map((x) => `• ${x}`).join("\n") + "\n\nNenhuma alteração foi gravada.",
          });
        } else if (e.codigo === "PENDENCIAS_ABERTAS" && e.pendencias?.length) {
          result.showWarning("Pendências abertas", {
            details:
              e.pendencias.map((p) => `• ${p.tipo_tarefa} · ${p.status} · ${p.endereco}`).join("\n") +
              "\n\nNenhuma alteração foi gravada.",
          });
        } else {
          result.showWarning(e.mensagem, { details: "Nenhuma alteração foi gravada." });
        }
        return;
      }

      // Erro técnico
      if (res.mensagemJson) {
        result.showWarning(res.mensagemJson.mensagem, { details: "Nenhuma alteração foi gravada." });
      } else {
        result.showError(res.erroOriginal, { context: "mudanca-picking" });
      }
    } catch (err) {
      result.showError(err, { context: "mudanca-picking" });
    } finally {
      setLoading(false);
      submitting.current = false;
    }
  };

  return (
    <ColetorLayout title="Mudança de Picking - Destino" onNavigate={onNavigate} showBack backPath="/coletor/movimentos/mudanca-picking/lista">
      <OnlineOnlyNotice flow="Mudança de Picking" />
      <ResultDialog {...result.dialogProps} />

      <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 mb-2">
        <span className="text-xs text-[hsl(213,31%,55%)]">Passo 3 de 3</span>
        <p className="text-sm font-bold text-white">Escanear o endereço de DESTINO</p>
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Origem</span><p className="text-xs font-mono text-white">{preview.origem.descricao}</p></div>
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Itens</span><p className="text-xs font-bold text-white">{totais.qtd_itens}</p></div>
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Qtd. Total</span><p className="text-xs font-bold text-white">{totais.qtd_total}</p></div>
          {totais.qtd_bloqueada > 0 && (
            <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Bloqueado</span><p className="text-xs font-bold text-amber-400">{totais.qtd_bloqueada}</p></div>
          )}
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Pickings a transferir</span><p className="text-xs font-bold text-white">{pickingsTransferir}</p></div>
        </div>
      </div>

      <ScanField label="Escanear Endereço Destino" onScan={handleScan} lastScanned={scanned} disabled={loading || offlineBlocked} />
      {loading && (
        <div className="flex flex-col items-center py-4 gap-2">
          <Loader2 className="animate-spin text-[hsl(280,80%,60%)]" size={28} />
          <span className="text-xs text-[hsl(213,31%,55%)]">Transferindo saldo e picking...</span>
        </div>
      )}
    </ColetorLayout>
  );
}

/**
 * Consulta de HU no coletor (Plano HU — H8). Os dados vêm de rpc_coletor_hu_consulta (huService.consultaColetor),
 * com cache para consulta sem sinal. "Verificar local" lê o endereço onde a HU está de fato e registra o evento
 * VERIFICADA (confere ou divergência) por rpc_coletor_hu_verificar_local — precisa de conexão.
 */
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { useFeedback } from "@/hooks/useFeedback";
import { Loader2, Archive, Package, Database, MapPin, CircleCheck, AlertTriangle } from "lucide-react";
import { formatDateTime, formatDate as fmtDateUtil } from "@/utils/dateTime";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { useOffline } from "@/contexts/OfflineContext";
import { huService, HuRpcError, normalizarCodigoHU, type ConsultaHUColetor } from "@/lib/huService";
import { EVENTO_HU_LABEL, STATUS_HU, motivoDivergencia, textoConteudo } from "@/lib/huExibicao";

interface Props { onNavigate: (path: string) => void; }

const num = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const dataPura = (d: string | null) => (!d || d === "1900-01-01" ? "—" : fmtDateUtil(d));

export function ConsultaHUPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id");
  const [scanned, setScanned] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [mostrarVerificar, setMostrarVerificar] = useState(false);
  const [ultimoEndereco, setUltimoEndereco] = useState("");
  const { isOnline } = useOffline();
  const result = useResultDialog({ coletorMode: true });
  const feedback = useFeedback();

  const fetchConsulta = useCallback(() => huService.consultaColetor(scanned), [scanned]);
  const { data, loading, isFromCache, error, refetch } = useOfflineCache<ConsultaHUColetor>(
    `consulta_hu_v2_${scanned}`, fetchConsulta, 60, !!scanned,
  );

  const hu = data?.hu ?? null;
  const st = hu ? STATUS_HU[hu.status] ?? { label: hu.status, cls: "" } : null;
  const divergencia = hu ? motivoDivergencia(hu) : null;

  const handleScan = (code: string) => {
    setMostrarVerificar(false);
    setScanned(normalizarCodigoHU(code));
  };

  const verificar = async (code: string) => {
    if (!hu) return;
    setUltimoEndereco(code);
    const numero = Number(String(code).trim());
    if (!Number.isFinite(numero)) { feedback.error(); result.showWarning("Leia a etiqueta do endereço"); return; }
    setVerificando(true);
    try {
      const { data: ends, error: e } = await supabase.from("endereco").select("id, descricao")
        .eq("codigo_endereco", numero).eq("tenant_id", tenantId ?? "").limit(1);
      if (e) throw e;
      const end = ends?.[0];
      if (!end) { feedback.error(); result.showWarning("Endereço não encontrado"); return; }
      const r = await huService.verificarLocal(hu.id, end.id);
      if (r.confere) { feedback.success(); result.showSuccess(r.mensagem || "HU confere no endereço."); }
      else { feedback.error(); result.showWarning(r.mensagem || "Divergência registrada."); }
      setMostrarVerificar(false);
      void refetch();
    } catch (err) {
      feedback.error();
      if (err instanceof HuRpcError) result.showWarning(err.message);
      else result.showError(err, { context: "hu-verificar-local" });
    } finally { setVerificando(false); }
  };

  const semConexaoESemCache = !!scanned && !loading && !data && !isOnline;
  const naoEncontrada = !!error && /não encontrada/i.test(String(error));

  return (
    <ColetorLayout title="Consulta HU" onNavigate={onNavigate} showBack backPath="/coletor/consulta">
      <ResultDialog {...result.dialogProps} />
      <ScanField label="Escanear Código HU" onScan={handleScan} lastScanned={scanned} />

      {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[hsl(217,91%,60%)]" size={32} /></div>}

      {!loading && semConexaoESemCache && (
        <div className="text-center text-sm text-[hsl(213,31%,55%)] py-8">Sem conexão e sem dados em cache para esta consulta.</div>
      )}
      {!loading && !data && error && !semConexaoESemCache && (
        <div className="text-center text-sm text-red-400 py-6">{naoEncontrada ? "HU não encontrada." : String(error)}</div>
      )}

      {!loading && hu && (
        <div className="flex flex-col gap-3 pb-4">
          {isFromCache && (
            <div className="flex items-center gap-1.5 text-xs text-yellow-400"><Database size={12} /> Dados do cache (sem conexão)</div>
          )}
          <div className="rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-3 text-white">
            <div className="flex items-center gap-2">
              <Archive size={18} className="text-[hsl(217,91%,60%)]" />
              <span className="font-mono text-lg font-bold break-all">{hu.codigo_hu}</span>
              {st && <span className={`ml-auto px-2 py-0.5 rounded border text-xs font-bold ${st.cls}`}>{st.label}</span>}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div><div className="text-[11px] uppercase text-[hsl(213,31%,55%)]">Tipo</div>{[hu.tipo_hu, hu.tamanho].filter(Boolean).join(" ") || "—"}</div>
              <div><div className="text-[11px] uppercase text-[hsl(213,31%,55%)]">Conteúdo</div>{textoConteudo(hu)}</div>
              <div><div className="text-[11px] uppercase text-[hsl(213,31%,55%)]">Endereço</div><span className="font-mono">{hu.endereco ?? "—"}</span></div>
              <div><div className="text-[11px] uppercase text-[hsl(213,31%,55%)]">Recebimento</div>{hu.numero_movimento ?? "—"}{hu.nfs ? ` · NF ${hu.nfs}` : ""}</div>
              <div className="col-span-2"><div className="text-[11px] uppercase text-[hsl(213,31%,55%)]">Último evento</div>
                {hu.ultimo_evento ? `${EVENTO_HU_LABEL[hu.ultimo_evento] ?? hu.ultimo_evento} · ${formatDateTime(hu.ultimo_evento_em)}` : "—"}</div>
            </div>
          </div>

          {divergencia && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {divergencia}
            </div>
          )}

          {data.ultima_verificacao && (
            <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${data.ultima_verificacao.confere ? "border-green-500/30 bg-green-500/10 text-green-300" : "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"}`}>
              {data.ultima_verificacao.confere ? <CircleCheck size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
              Última verificação: {data.ultima_verificacao.confere ? "conferiu" : "não conferiu"} em {data.ultima_verificacao.endereco ?? "—"}
              {" · "}{formatDateTime(data.ultima_verificacao.created_at)}{data.ultima_verificacao.usuario ? ` · ${data.ultima_verificacao.usuario}` : ""}
            </div>
          )}

          <div className="rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-3">
            <div className="flex items-center gap-2 text-white text-sm font-bold mb-2"><Package size={16} /> Itens da HU ({data.itens.length})</div>
            {data.itens.length === 0 ? <p className="text-sm text-[hsl(213,31%,55%)]">A HU não tem itens.</p> : (
              <ul className="divide-y divide-[hsl(222,35%,18%)]">
                {data.itens.map((i, n) => (
                  <li key={`${i.sku}-${n}`} className="flex items-start gap-2 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-white">{i.descricao}</div>
                      <div className="text-[hsl(213,31%,65%)]">SKU {i.sku}{i.lote ? ` · Lote ${i.lote}` : ""}{i.validade ? ` · Val. ${dataPura(i.validade)}` : ""}</div>
                    </div>
                    <span className="font-mono text-base font-bold text-white">{num(i.quantidade)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-3">
            <div className="flex items-center gap-2 text-white text-sm font-bold mb-2"><MapPin size={16} /> Estoque da HU ({data.estoque.length})</div>
            {data.estoque.length === 0 ? (
              <p className="text-sm text-[hsl(213,31%,55%)]">{hu.status === "ARMAZENADA" ? "Sem saldo com esta HU." : "Ainda não armazenada."}</p>
            ) : (
              <ul className="divide-y divide-[hsl(222,35%,18%)]">
                {data.estoque.map((e, n) => (
                  <li key={`${e.endereco}-${e.sku}-${n}`} className="flex items-start gap-2 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-white">{e.endereco ?? "—"}</div>
                      <div className="text-[hsl(213,31%,65%)] truncate">{e.sku} · {e.descricao}{e.lote ? ` · Lote ${e.lote}` : ""}</div>
                    </div>
                    <span className="font-mono text-base font-bold text-white">{num(e.quantidade)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!mostrarVerificar ? (
            <ActionButton variant="secondary" onClick={() => setMostrarVerificar(true)} disabled={!isOnline || isFromCache}>
              <MapPin size={18} /> VERIFICAR LOCAL DA HU
            </ActionButton>
          ) : (
            <div className="flex flex-col gap-2">
              <ScanField label="Leia o endereço onde a HU está" onScan={verificar} lastScanned={ultimoEndereco} disabled={verificando} />
              {verificando && <div className="flex justify-center"><Loader2 className="animate-spin text-white" /></div>}
              <ActionButton variant="secondary" onClick={() => setMostrarVerificar(false)}>CANCELAR</ActionButton>
            </div>
          )}
        </div>
      )}
    </ColetorLayout>
  );
}

import { useState, useEffect } from "react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MapPin, SkipForward, MoreVertical, ListOrdered, XCircle, Loader2 } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

interface Tarefa {
  id: string;
  endereco?: string;
  endereco_id?: string;
  setor?: string;
  armazem?: string;
  ordem_tarefa: number;
  sku?: string;
  produto?: string;
  descricao?: string;
  referencia?: string;
  id_local_origem?: string;
  [key: string]: any;
}

export function InventarioEnderecoPage({ onNavigate }: Props) {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [lastScanned, setLastScanned] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [showEnderecoList, setShowEnderecoList] = useState(false);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);
  const [loadingEnderecos, setLoadingEnderecos] = useState(true);

  const numero = sessionStorage.getItem("coletor_inventario_numero") || "";

  useEffect(() => {
    const loadTarefas = async () => {
      const raw = sessionStorage.getItem("coletor_inventario_tarefas");
      const idx = Number(sessionStorage.getItem("coletor_inventario_tarefa_idx") || "0");
      if (!raw) { setLoadingEnderecos(false); return; }

      const parsed = JSON.parse(raw) as Tarefa[];
      parsed.sort((a, b) => (a.ordem_tarefa || 0) - (b.ordem_tarefa || 0));

      // Resolve endereco details from id_local_origem
      const enderecoIds = [...new Set(parsed.map(t => t.id_local_origem).filter(Boolean))];
      let enderecoMap: Record<string, { descricao: string; armazem: string; setor: string }> = {};

      if (enderecoIds.length > 0) {
        const { data: enderecos } = await (supabase as any)
          .from("endereco")
          .select("id, descricao, armazem:armazem(descricao), setor:setor(descricao)")
          .in("id", enderecoIds);

        (enderecos || []).forEach((e: any) => {
          enderecoMap[e.id] = {
            descricao: e.descricao || "—",
            armazem: e.armazem?.descricao || "—",
            setor: e.setor?.descricao || "—",
          };
        });
      }

      const enriched = parsed.map(t => {
        const info = t.id_local_origem ? enderecoMap[t.id_local_origem] : null;
        return {
          ...t,
          endereco: info?.descricao || t.endereco || "—",
          armazem: info?.armazem || t.armazem || "—",
          setor: info?.setor || t.setor || "—",
          endereco_id: t.id_local_origem || t.endereco_id,
        };
      });

      setTarefas(enriched);
      setCurrentIdx(idx);
      // Update sessionStorage with enriched data
      sessionStorage.setItem("coletor_inventario_tarefas", JSON.stringify(enriched));
      setLoadingEnderecos(false);
    };
    loadTarefas();
  }, []);

  const tarefa = tarefas[currentIdx];

  const handleScan = (code: string) => {
    if (!tarefa) return;
    setLastScanned(code);

    // Validate scanned code against expected address
    const expectedDesc = (tarefa.endereco || "").toUpperCase().trim();
    const scannedCode = code.toUpperCase().trim();

    if (scannedCode !== expectedDesc) {
      setErrorDialog("Endereço incorreto! Escaneie o endereço informado.");
      return;
    }

    // Save current task and navigate to product screen
    sessionStorage.setItem("coletor_inventario_tarefa_idx", String(currentIdx));
    sessionStorage.setItem("coletor_inventario_tarefa_atual", JSON.stringify(tarefa));
    toast.success("Endereço confirmado!");
    onNavigate("/coletor/inventario/produto");
  };

  const handlePular = () => {
    if (!tarefas.length) return;
    const nextIdx = currentIdx + 1;
    if (nextIdx >= tarefas.length) {
      toast.info("Todos os endereços foram percorridos.");
      return;
    }
    setCurrentIdx(nextIdx);
    sessionStorage.setItem("coletor_inventario_tarefa_idx", String(nextIdx));
    setLastScanned("");
  };

  const handleReorder = (fromIdx: number, toIdx: number) => {
    const newTarefas = [...tarefas];
    const [moved] = newTarefas.splice(fromIdx, 1);
    newTarefas.splice(toIdx, 0, moved);
    setTarefas(newTarefas);
    sessionStorage.setItem("coletor_inventario_tarefas", JSON.stringify(newTarefas));
    // Adjust currentIdx if needed
    if (fromIdx === currentIdx) {
      setCurrentIdx(toIdx);
      sessionStorage.setItem("coletor_inventario_tarefa_idx", String(toIdx));
    }
  };

  if (loadingEnderecos) {
    return (
      <ColetorLayout title={`Inventário #${numero}`} onNavigate={onNavigate} showBack backPath="/coletor/inventario">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[hsl(217,91%,60%)]" />
        </div>
      </ColetorLayout>
    );
  }

  if (!tarefa) {
    return (
      <ColetorLayout title={`Inventário #${numero}`} onNavigate={onNavigate} showBack backPath="/coletor/inventario">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-sm text-[hsl(213,31%,55%)]">Nenhuma tarefa pendente.</p>
          <ActionButton onClick={() => onNavigate("/coletor/inventario")}>Voltar</ActionButton>
        </div>
      </ColetorLayout>
    );
  }

  const progress = `${currentIdx + 1}/${tarefas.length}`;

  return (
    <ColetorLayout title={`Inventário #${numero}`} onNavigate={onNavigate} showBack backPath="/coletor/inventario">
      <div className="flex flex-col gap-3 flex-1">
        {/* Progress */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[hsl(213,31%,55%)]">Endereço {progress}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
            Ordem: {tarefa.ordem_tarefa}
          </span>
        </div>

        {/* Address info */}
        <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-[hsl(217,91%,60%)]" />
              <span className="text-sm font-bold text-white">Endereço para Contagem</span>
            </div>
            <div className="relative">
              <button
                onClick={() => setShowOptions(!showOptions)}
                className="p-2 rounded-lg hover:bg-[hsl(222,35%,20%)] transition-colors"
              >
                <MoreVertical size={18} className="text-[hsl(213,31%,55%)]" />
              </button>
              {showOptions && (
                <div className="absolute right-0 top-full mt-1 bg-[hsl(222,40%,14%)] border border-[hsl(222,35%,22%)] rounded-xl shadow-lg z-10 min-w-[220px]">
                  <button
                    onClick={() => { setShowEnderecoList(true); setShowOptions(false); }}
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm text-white hover:bg-[hsl(222,35%,20%)] rounded-xl transition-colors"
                  >
                    <ListOrdered size={16} className="text-[hsl(217,91%,60%)]" />
                    Endereços do Inventário
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="text-xs text-[hsl(213,31%,55%)]">Armazém: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.armazem || "—"}</span></div>
          <div className="text-xs text-[hsl(213,31%,55%)]">Setor: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.setor || "—"}</span></div>
          <div className="mt-2 py-3 px-4 bg-[hsl(217,91%,50%)]/10 rounded-xl border border-[hsl(217,91%,50%)]/30 text-center">
            <p className="text-2xl font-black text-white tracking-wide font-mono">{tarefa.endereco || "—"}</p>
          </div>
        </div>

        {/* Scan field */}
        <ScanField
          label="Confirmar Endereço"
          lastScanned={lastScanned}
          onScan={handleScan}
          placeholder="Escaneie o endereço para confirmar"
        />

        {/* Skip button */}
        <ActionButton onClick={handlePular} variant="secondary">
          <SkipForward size={18} /> Pular Endereço
        </ActionButton>
      </div>

      {/* Error Dialog */}
      {errorDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] rounded-2xl p-6 space-y-4">
            <div className="flex flex-col items-center gap-3">
              <XCircle size={48} className="text-[#E02424]" />
              <h3 className="text-base font-bold text-white text-center">Endereço Incorreto</h3>
              <p className="text-sm text-[hsl(213,31%,75%)] text-center">{errorDialog}</p>
            </div>
            <ActionButton onClick={() => { setErrorDialog(null); setLastScanned(""); }} variant="primary">
              Fechar
            </ActionButton>
          </div>
        </div>
      )}

      {/* Endereços do Inventário Modal */}
      {showEnderecoList && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
          <div className="w-full max-w-md bg-[hsl(222,40%,10%)] border-t border-[hsl(222,35%,22%)] rounded-t-3xl p-6 space-y-4 max-h-[80vh] flex flex-col">
            <h3 className="text-base font-bold text-white">Endereços do Inventário</h3>
            <p className="text-xs text-[hsl(213,31%,55%)]">Toque em um endereço para ir diretamente a ele</p>
            <div className="flex flex-col gap-2 overflow-auto flex-1">
              {tarefas.map((t, idx) => (
                <button
                  key={t.tarefa_id}
                  onClick={() => {
                    setCurrentIdx(idx);
                    sessionStorage.setItem("coletor_inventario_tarefa_idx", String(idx));
                    setShowEnderecoList(false);
                    setLastScanned("");
                  }}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all text-left ${
                    idx === currentIdx
                      ? "bg-[hsl(217,91%,50%)]/10 border-[hsl(217,91%,50%)]"
                      : "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]"
                  }`}
                >
                  <div>
                    <span className="text-sm font-bold text-white font-mono">{t.endereco || "—"}</span>
                    <p className="text-[10px] text-[hsl(213,31%,55%)]">Ordem: {t.ordem_tarefa}</p>
                  </div>
                  {idx === currentIdx && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">Atual</span>
                  )}
                </button>
              ))}
            </div>
            <ActionButton onClick={() => setShowEnderecoList(false)} variant="secondary">
              Fechar
            </ActionButton>
          </div>
        </div>
      )}
    </ColetorLayout>
  );
}

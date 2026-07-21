import { useState } from "react";
import { Archive, Plus, RefreshCw, X } from "lucide-react";
import { HUSelectorModal } from "./HUSelectorModal";

interface HUActiveBarProps {
  onHUChange: (huId: string | null, codigoHU: string | null) => void;
  movimentoEntradaId?: string | null;
}

interface HuAtiva {
  id: string;
  codigo: string;
  tipo?: string;
  tamanho?: string;
}

export function HUActiveBar({ onHUChange, movimentoEntradaId }: HUActiveBarProps) {
  const [hu, setHu] = useState<HuAtiva | null>(() => {
    const id = sessionStorage.getItem("coletor_hu_id");
    const codigo = sessionStorage.getItem("coletor_hu_codigo");
    if (!id || !codigo) return null;
    return {
      id,
      codigo,
      tipo: sessionStorage.getItem("coletor_hu_tipo") || undefined,
      tamanho: sessionStorage.getItem("coletor_hu_tamanho") || undefined,
    };
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"scan" | "create">("scan");

  const openModal = (mode: "scan" | "create") => {
    setModalMode(mode);
    setModalOpen(true);
  };

  const handleSelect = (id: string, codigo: string, tipoHU: string, tamanho: string) => {
    const next: HuAtiva = { id, codigo, tipo: tipoHU, tamanho };
    setHu(next);
    sessionStorage.setItem("coletor_hu_id", id);
    sessionStorage.setItem("coletor_hu_codigo", codigo);
    sessionStorage.setItem("coletor_hu_tipo", tipoHU || "");
    sessionStorage.setItem("coletor_hu_tamanho", tamanho || "");
    onHUChange(id, codigo);
  };

  const handleDetach = () => {
    setHu(null);
    sessionStorage.removeItem("coletor_hu_id");
    sessionStorage.removeItem("coletor_hu_codigo");
    sessionStorage.removeItem("coletor_hu_tipo");
    sessionStorage.removeItem("coletor_hu_tamanho");
    onHUChange(null, null);
  };

  return (
    <>
      {hu ? (
        <div className="rounded-xl border border-[hsl(142,71%,45%)]/30 bg-[hsl(142,71%,45%)]/10 px-3 py-2 flex items-center gap-2">
          <Archive size={15} className="text-[hsl(142,71%,45%)] shrink-0" />
          <span className="font-mono font-bold text-white text-sm truncate">{hu.codigo}</span>
          {(hu.tipo || hu.tamanho) && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(142,71%,45%)]/20 text-[hsl(142,71%,55%)] font-bold uppercase tracking-wider">
              {[hu.tipo, hu.tamanho].filter(Boolean).join(" ")}
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={() => openModal("scan")}
            className="h-7 px-2 rounded-lg border border-[hsl(217,91%,50%)]/40 text-[hsl(217,91%,60%)] text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 hover:bg-[hsl(217,91%,50%)]/10"
          >
            <RefreshCw size={11} /> Trocar
          </button>
          <button
            onClick={handleDetach}
            className="w-7 h-7 rounded-lg text-red-400 hover:bg-red-400/10 flex items-center justify-center"
            title="Desvincular HU"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] px-3 py-2 flex items-center gap-2">
          <Archive size={15} className="text-[hsl(213,31%,55%)] shrink-0" />
          <span className="text-xs text-[hsl(213,31%,55%)]">Sem HU vinculada</span>
          <div className="flex-1" />
          <button
            onClick={() => openModal("scan")}
            className="h-7 px-2 rounded-lg border border-[hsl(217,91%,50%)]/40 text-[hsl(217,91%,60%)] text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 hover:bg-[hsl(217,91%,50%)]/10"
          >
            <Archive size={11} /> Vincular HU
          </button>
          <button
            onClick={() => openModal("create")}
            className="h-7 px-2 rounded-lg border border-[hsl(142,71%,45%)]/40 text-[hsl(142,71%,45%)] text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 hover:bg-[hsl(142,71%,45%)]/10"
          >
            <Plus size={11} /> Nova HU
          </button>
        </div>
      )}

      <HUSelectorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={handleSelect}
        initialMode={modalMode}
        movimentoEntradaId={movimentoEntradaId}
      />
    </>
  );
}

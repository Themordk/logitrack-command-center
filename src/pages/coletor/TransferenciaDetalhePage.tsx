import { useState } from "react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { Package, Box as BoxIcon } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

export function TransferenciaDetalhePage({ onNavigate }: Props) {
  const origemDesc = sessionStorage.getItem("transf_origem_desc") || "";
  const sku = sessionStorage.getItem("transf_produto_sku") || "";
  const desc = sessionStorage.getItem("transf_produto_desc") || "";
  const saldoUN = Number(sessionStorage.getItem("transf_saldo_disponivel") || "0");
  const lote = sessionStorage.getItem("transf_lote") || "";
  const huCodigo = sessionStorage.getItem("transf_hu_codigo") || "";
  const fator = Number(sessionStorage.getItem("transf_fator") || "1");
  const embalagem = sessionStorage.getItem("transf_embalagem") || "UN";

  const [quantidade, setQuantidade] = useState("");
  const [error, setError] = useState("");

  const saldoNaEmb = fator > 1 ? Math.floor(saldoUN / fator) : saldoUN;
  const saldoResto = fator > 1 ? saldoUN % fator : 0;

  const qtyNum = parseFloat(quantidade) || 0;
  const qtyUN = qtyNum * fator;

  const handleConfirm = () => {
    if (!qtyNum || qtyNum <= 0) {
      setError("Informe uma quantidade válida.");
      return;
    }
    if (qtyUN > saldoUN) {
      setError(`Excede o saldo disponível (${saldoUN} UN).`);
      return;
    }
    setError("");
    // grava sempre em UN — próximas etapas esperam UN
    sessionStorage.setItem("transf_quantidade", String(qtyUN));
    onNavigate("/coletor/movimentos/transferencia/destino");
  };

  return (
    <ColetorLayout title="Transferência - Detalhes" onNavigate={onNavigate} showBack backPath="/coletor/movimentos/transferencia/produto">
      <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 mb-2">
        <span className="text-xs text-[hsl(213,31%,55%)]">Passo 3 de 4</span>
        <p className="text-sm font-bold text-white">Informar quantidade a transferir</p>
      </div>

      {/* Card do produto */}
      <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <Package size={24} className="text-[hsl(217,91%,60%)]" />
          <div className="min-w-0">
            <p className="text-xs font-mono text-[hsl(217,91%,60%)]">{sku}</p>
            <p className="text-sm text-white">{desc}</p>
          </div>
        </div>

        {/* Embalagem escaneada — sempre visível */}
        <div className="rounded-lg bg-[hsl(222,35%,16%)] border border-[hsl(222,35%,22%)] p-2 mb-3">
          <div className="flex items-center gap-2">
            <BoxIcon size={16} className="text-[hsl(217,91%,60%)]" />
            <span className="text-[11px] text-[hsl(213,31%,65%)]">Embalagem escaneada</span>
            <span className={`ml-auto text-[11px] font-bold px-2 py-0.5 rounded ${
              fator > 1
                ? "bg-[hsl(217,91%,50%)]/20 text-[hsl(217,91%,70%)] border border-[hsl(217,91%,50%)]/40"
                : "bg-[hsl(142,76%,36%)]/20 text-[hsl(142,76%,50%)] border border-[hsl(142,76%,36%)]/40"
            }`}>
              {embalagem}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[hsl(213,31%,65%)]">
            Fator: <b className="text-white">{fator}</b> UN por {embalagem}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-[hsl(222,35%,16%)] rounded-lg p-2">
            <span className="text-[10px] text-[hsl(213,31%,55%)]">Endereço Origem</span>
            <p className="text-xs font-mono text-white">{origemDesc}</p>
          </div>
          <div className="bg-[hsl(222,35%,16%)] rounded-lg p-2">
            <span className="text-[10px] text-[hsl(213,31%,55%)]">Saldo Disponível</span>
            <p className="text-lg font-bold text-white leading-tight">
              {saldoNaEmb} {embalagem}
              {saldoResto > 0 && <span className="text-xs text-[hsl(213,31%,65%)]"> + {saldoResto} UN</span>}
            </p>
            {fator > 1 && (
              <p className="text-[11px] text-[hsl(217,91%,70%)]">= {saldoUN} UN</p>
            )}
          </div>
          {lote && (
            <div className="bg-[hsl(222,35%,16%)] rounded-lg p-2 col-span-2">
              <span className="text-[10px] text-[hsl(213,31%,55%)]">Lote</span>
              <p className="text-xs text-white">{lote}</p>
            </div>
          )}
          {huCodigo && (
            <div className="bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/30 rounded-lg p-2 col-span-2 flex items-center gap-1.5">
              <span className="text-[11px] font-mono font-bold text-[hsl(45,93%,80%)]">HU: {huCodigo}</span>
            </div>
          )}
        </div>

        {/* Input com label dinâmico */}
        <label className="text-xs text-[hsl(213,31%,75%)] font-semibold mb-1 block">
          Quantidade em {embalagem}
        </label>
        <input
          type="number"
          inputMode="numeric"
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
          className="w-full h-14 rounded-xl bg-[hsl(222,35%,16%)] border border-[hsl(222,35%,22%)] text-white text-center text-2xl font-bold focus:outline-none focus:border-[hsl(217,91%,50%)]"
          placeholder="0"
          autoFocus
        />
        {fator > 1 && qtyNum > 0 && (
          <p className="text-center text-xs text-[hsl(217,91%,70%)] mt-1">= {qtyUN} UN</p>
        )}
        {error && <p className="text-red-400 text-xs mt-1 text-center">{error}</p>}
      </div>

      <ActionButton onClick={handleConfirm} disabled={!quantidade}>Confirmar e Escanear Destino</ActionButton>
    </ColetorLayout>
  );
}

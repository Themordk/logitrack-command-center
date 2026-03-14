import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";

import { toast } from "sonner";
import { MapPin, SkipForward } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

interface Tarefa {
  tarefa_id: string;
  produto_id: string;
  sku?: string;
  descricao?: string;
  endereco_id: string;
  endereco_descricao?: string;
  setor_descricao?: string;
  armazem_descricao?: string;
  quantidade_requerida: number;
  ordem_tarefa: number;
  lote?: string;
  validade?: string;
  fabricacao?: string;
  tipo_controle?: string;
  [key: string]: any;
}

export function SeparacaoEnderecoPage({ onNavigate }: Props) {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [lastScanned, setLastScanned] = useState("");
  const numeroOnda = sessionStorage.getItem("coletor_separacao_numero_onda") || "";

  useEffect(() => {
    const raw = sessionStorage.getItem("coletor_separacao_tarefas");
    const idx = Number(sessionStorage.getItem("coletor_separacao_tarefa_idx") || "0");
    if (raw) {
      const parsed = JSON.parse(raw) as Tarefa[];
      // Sort by ordem_tarefa ascending
      parsed.sort((a, b) => (a.ordem_tarefa || 0) - (b.ordem_tarefa || 0));
      setTarefas(parsed);
      setCurrentIdx(idx);
    }
  }, []);

  const tarefa = tarefas[currentIdx];

  const handleScan = async (code: string) => {
    if (!tarefa) return;
    setLastScanned(code);

    try {
      const { data, error } = await supabase.rpc("separacao_confirmar_endereco" as any, {
        p_tarefa_id: tarefa.tarefa_id,
        p_endereco_lido: code,
      });
      if (error) throw error;

      // Parse result
      let result: any;
      if (typeof data === "string") {
        try { result = JSON.parse(data); } catch { result = { sucesso: true }; }
      } else {
        result = data || { sucesso: true };
      }

      if (result.sucesso === false) {
        toast.error(result.mensagem || "Endereço incorreto! Escaneie o endereço informado.");
        return;
      }

      // Save current tarefa and navigate to product details
      sessionStorage.setItem("coletor_separacao_tarefa_idx", String(currentIdx));
      sessionStorage.setItem("coletor_separacao_tarefa_atual", JSON.stringify(tarefa));
      toast.success("Endereço confirmado!");
      onNavigate("/coletor/separacao/produto");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handlePular = () => {
    if (!tarefas.length) return;
    const nextIdx = currentIdx + 1;
    if (nextIdx >= tarefas.length) {
      toast.info("Todos os endereços foram percorridos.");
      return;
    }
    setCurrentIdx(nextIdx);
    sessionStorage.setItem("coletor_separacao_tarefa_idx", String(nextIdx));
    setLastScanned("");
  };

  if (!tarefa) {
    return (
      <ColetorLayout title={`Separação #${numeroOnda}`} onNavigate={onNavigate} showBack backPath="/coletor/separacao/iniciar">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-sm text-[hsl(213,31%,55%)]">Nenhuma tarefa pendente.</p>
          <ActionButton onClick={() => onNavigate("/coletor/separacao/iniciar")}>
            Voltar
          </ActionButton>
        </div>
      </ColetorLayout>
    );
  }

  const progress = `${currentIdx + 1}/${tarefas.length}`;

  return (
    <ColetorLayout title={`Separação #${numeroOnda}`} onNavigate={onNavigate} showBack backPath="/coletor/separacao/iniciar">
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
          <div className="flex items-center gap-2 mb-2">
            <MapPin size={18} className="text-[hsl(217,91%,60%)]" />
            <span className="text-sm font-bold text-white">Endereço para Coleta</span>
          </div>
          <div className="text-xs text-[hsl(213,31%,55%)]">Armazém: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.armazem_descricao || "—"}</span></div>
          <div className="text-xs text-[hsl(213,31%,55%)]">Setor: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.setor_descricao || "—"}</span></div>
          <div className="text-xs text-[hsl(213,31%,55%)]">Endereço: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.endereco_descricao || "—"}</span></div>
        </div>

        {/* Product preview */}
        <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4 space-y-1">
          <p className="text-[10px] uppercase text-[hsl(213,31%,45%)]">Produto</p>
          <p className="text-sm font-bold text-white">{tarefa.sku} - {tarefa.descricao}</p>
          <p className="text-xs text-[hsl(213,31%,55%)]">Qtd Requerida: <span className="font-bold text-white">{tarefa.quantidade_requerida}</span></p>
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
    </ColetorLayout>
  );
}

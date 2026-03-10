import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props { onNavigate: (path: string) => void; }

interface SeparacaoResumo {
  id: string;
  numero_onda: number;
  parceiro: string;
  box: string;
  status: string;
}

export function SeparacaoIniciarPage({ onNavigate }: Props) {
  const [movimentos, setMovimentos] = useState<SeparacaoResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tenantId = localStorage.getItem("core_tenant_id");

  useEffect(() => {
    loadMovimentos();
  }, []);

  const loadMovimentos = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("v_separacao_iniciar")
        .select("*");
      if (error) throw error;
      setMovimentos(data || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleIniciar = () => {
    if (!selectedId) return;
    const mov = movimentos.find((m) => m.id === selectedId);
    if (!mov) return;
    sessionStorage.setItem("coletor_separacao_movimento_id", selectedId);
    sessionStorage.setItem("coletor_separacao_numero_onda", String(mov.numero_onda));
    toast.success(`Separação da Onda #${mov.numero_onda} iniciada!`);
    // Navigate to separation execution (placeholder for now)
    onNavigate("/coletor/separacao/execucao");
  };

  return (
    <ColetorLayout title="Separação" onNavigate={onNavigate} showBack backPath="/coletor/home">
      <div className="flex flex-col gap-3 flex-1">
        <p className="text-xs text-[hsl(213,31%,55%)]">Selecione um movimento para iniciar a separação</p>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-[hsl(217,91%,60%)]" />
          </div>
        ) : movimentos.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-[hsl(213,31%,55%)]">Nenhum movimento liberado para separação.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 flex-1 overflow-auto">
            {movimentos.map((mov) => (
              <button
                key={mov.id}
                onClick={() => setSelectedId(mov.id === selectedId ? null : mov.id)}
                className={`flex flex-col gap-1 p-4 rounded-2xl border transition-all ${
                  selectedId === mov.id
                    ? "bg-[hsl(217,91%,50%)]/10 border-[hsl(217,91%,50%)]"
                    : "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-white font-mono">Onda #{mov.numero_onda}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
                    {mov.status}
                  </span>
                </div>
                <p className="text-xs text-[hsl(213,31%,55%)] text-left truncate">{mov.parceiro}</p>
                <p className="text-xs text-[hsl(213,31%,45%)] text-left">Box: {mov.box}</p>
              </button>
            ))}
          </div>
        )}

        <ActionButton onClick={handleIniciar} disabled={!selectedId}>
          Iniciar Separação
        </ActionButton>
      </div>
    </ColetorLayout>
  );
}

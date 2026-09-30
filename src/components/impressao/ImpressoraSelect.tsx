import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface ImpressoraDisponivel {
  id: string;
  nome: string;
  codigo: string | null;
  setor_uso: string | null;
  largura_mm: number | null;
  altura_mm: number | null;
  dpi: number | null;
  linguagem: string | null;
  status_conexao: string | null;
  agent_id: string | null;
  agent_nome: string | null;
  agent_hostname: string | null;
  agent_ultimo_heartbeat: string | null;
  elegivel: boolean;
}

export type TipoEtiquetaImpressora = "PRODUTO" | "HU" | "VOLUME" | "ENDERECO";

interface ImpressoraSelectProps {
  armazemId: string | null;
  tipoEtiqueta: TipoEtiquetaImpressora;
  value: string | null;
  onChange: (id: string | null, impressora?: ImpressoraDisponivel) => void;
  templateLarguraMm?: number;
  templateAlturaMm?: number;
  onDisponibilidadeChange?: (temImpressoraOnline: boolean) => void;
  /** Quando false, não restaura/grava a escolha no localStorage (ex.: pré-seleção vinda de um job). */
  lembrarEscolha?: boolean;
}

export function ImpressoraSelect({
  armazemId, tipoEtiqueta, value, onChange,
  templateLarguraMm, templateAlturaMm, onDisponibilidadeChange, lembrarEscolha = true,
}: ImpressoraSelectProps) {
  const storageKey = `core_impressora_${tipoEtiqueta}`;
  const restoredRef = useRef(false);
  const [loaded, setLoaded] = useState(false);

  const { data: impressoras = [], isFetched } = useQuery({
    queryKey: ["impressoras-disponiveis", armazemId],
    enabled: !!armazemId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("listar_impressoras_disponiveis", { p_armazem_id: armazemId });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha ao listar impressoras");
      return (data.impressoras || []) as ImpressoraDisponivel[];
    },
  });

  useEffect(() => { if (isFetched) setLoaded(true); }, [isFetched]);

  // Restaurar escolha ao montar
  useEffect(() => {
    if (!loaded || restoredRef.current) return;
    restoredRef.current = true;
    if (!lembrarEscolha || value) return;
    const saved = localStorage.getItem(storageKey);
    const imp = saved ? impressoras.find((i) => i.id === saved && i.elegivel) : undefined;
    if (imp) onChange(imp.id, imp);
  }, [loaded, impressoras, lembrarEscolha, value, storageKey, onChange]);

  // Selecionada ficou inelegível
  useEffect(() => {
    if (!loaded || !value) return;
    const imp = impressoras.find((i) => i.id === value);
    if (!imp || !imp.elegivel) {
      onChange(null);
      toast.warning("Impressora selecionada ficou offline — usando Automático");
    }
  }, [impressoras, loaded, value, onChange]);

  const temOnline = impressoras.some((i) => i.elegivel);
  useEffect(() => {
    if (loaded) onDisponibilidadeChange?.(temOnline);
  }, [loaded, temOnline, onDisponibilidadeChange]);

  const selected = value ? impressoras.find((i) => i.id === value) : undefined;
  const tl = templateLarguraMm != null ? Math.round(templateLarguraMm) : null;
  const ta = templateAlturaMm != null ? Math.round(templateAlturaMm) : null;
  const tamanhoDiverge = !!selected && tl != null && ta != null &&
    (Number(selected.largura_mm) !== tl || Number(selected.altura_mm) !== ta);

  const label = (i: ImpressoraDisponivel) => {
    const cod = i.codigo ? ` (${i.codigo})` : "";
    const tam = `${i.largura_mm ?? "?"}×${i.altura_mm ?? "?"}mm`;
    return i.elegivel
      ? `🟢 ${i.nome}${cod} — ${tam} — ${i.agent_nome || "sem agente"}`
      : `🔴 ${i.nome}${cod} — ${tam} — agente offline`;
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <select
          value={value || ""}
          onChange={(e) => {
            const id = e.target.value || null;
            const imp = id ? impressoras.find((i) => i.id === id) : undefined;
            if (lembrarEscolha) {
              if (id) localStorage.setItem(storageKey, id);
              else localStorage.removeItem(storageKey);
            }
            onChange(id, imp);
          }}
          className="w-full h-10 px-3 pr-8 appearance-none rounded-lg bg-secondary border border-border text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
        >
          <option value="">Automático (por setor)</option>
          {impressoras.map((i) => (
            <option key={i.id} value={i.id} disabled={!i.elegivel}>{label(i)}</option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </div>

      {loaded && !temOnline && (
        <div className="flex gap-2 p-2.5 rounded-lg border border-destructive/40 bg-destructive/10 text-xs text-destructive">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div>
            Nenhuma impressora online neste armazém. Verifique se o LogiTrack Print Agent está rodando no PC da impressora.{" "}
            <a href="#/config/impressao" className="underline font-semibold">Configurações de impressão</a>
          </div>
        </div>
      )}

      {tamanhoDiverge && selected && (
        <div className="flex gap-2 p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-amber-400">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div>
            Template {tl}×{ta} mm diferente da mídia da impressora {selected.largura_mm}×{selected.altura_mm} mm — a etiqueta pode sair cortada ou deslocada.
          </div>
        </div>
      )}
    </div>
  );
}

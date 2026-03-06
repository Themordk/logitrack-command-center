import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { Loader2, Archive } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

export function ConsultaHUPage({ onNavigate }: Props) {
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState("");
  const [error, setError] = useState("");
  const [huInfo, setHuInfo] = useState<any>(null);
  const [estoqueInfo, setEstoqueInfo] = useState<any[]>([]);
  const [execInfo, setExecInfo] = useState<any[]>([]);

  const handleScan = async (code: string) => {
    setScanned(code);
    setError("");
    setHuInfo(null);
    setEstoqueInfo([]);
    setExecInfo([]);
    setLoading(true);
    try {
      // Find HU by codigo_hu
      const { data: hus } = await (supabase as any)
        .from("hu")
        .select("id, codigo_hu, tipo_hu, tamanho, disponibilidade, peso_bruto")
        .eq("codigo_hu", code)
        .limit(1);

      if (!hus || hus.length === 0) {
        setError("HU não encontrada.");
        setLoading(false);
        return;
      }

      const hu = hus[0];
      setHuInfo(hu);

      // Check stock (where is it stored)
      const { data: estoque } = await (supabase as any)
        .from("estoque_geral")
        .select("quantidade_disponivel, endereco:endereco_id(descricao, tipo_endereco), produto:produto_id(sku, descricao)")
        .eq("hu_id", hu.id)
        .gt("quantidade_disponivel", 0);

      setEstoqueInfo(estoque || []);

      // Check last tarefa_execucao
      const { data: execs } = await (supabase as any)
        .from("tarefa_execucao")
        .select("id, status, concluido_em, endereco_destino_id, endereco_origem_id, quantidade_executada")
        .eq("hu", hu.id)
        .order("concluido_em", { ascending: false })
        .limit(3);

      setExecInfo(execs || []);
    } catch {
      setError("Erro ao consultar.");
    } finally {
      setLoading(false);
    }
  };

  const dispLabel: Record<string, string> = {
    DISPONIVEL: "Disponível",
    OCUPADO: "Ocupado",
    BLOQUEADO: "Bloqueado",
  };

  const dispColor: Record<string, string> = {
    DISPONIVEL: "text-green-400",
    OCUPADO: "text-yellow-400",
    BLOQUEADO: "text-red-400",
  };

  return (
    <ColetorLayout title="Consulta HU" onNavigate={onNavigate} showBack backPath="/coletor/consulta">
      <ScanField label="Escanear Código HU" onScan={handleScan} lastScanned={scanned} />

      {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[hsl(217,91%,60%)]" size={32} /></div>}
      {error && <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 text-red-300 text-sm text-center">{error}</div>}

      {huInfo && !loading && (
        <div className="flex flex-col gap-3">
          {/* HU Details */}
          <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3">
            <div className="flex items-center gap-3 mb-2">
              <Archive size={24} className="text-[hsl(45,93%,47%)]" />
              <span className="text-base font-bold text-white">{huInfo.codigo_hu}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Tipo</span><p className="text-xs text-white">{huInfo.tipo_hu || "—"}</p></div>
              <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Tamanho</span><p className="text-xs text-white">{huInfo.tamanho || "—"}</p></div>
              <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Peso Bruto</span><p className="text-xs text-white">{huInfo.peso_bruto ?? "—"}</p></div>
              <div>
                <span className="text-[10px] text-[hsl(213,31%,55%)]">Disponibilidade</span>
                <p className={`text-xs font-bold ${dispColor[huInfo.disponibilidade] || "text-white"}`}>
                  {dispLabel[huInfo.disponibilidade] || huInfo.disponibilidade || "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Stock location */}
          {estoqueInfo.length > 0 && (
            <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-[hsl(222,35%,22%)]">
                <span className="text-sm font-bold text-white">Localização em Estoque</span>
              </div>
              {estoqueInfo.map((e: any, i: number) => (
                <div key={i} className="px-3 py-2 border-b border-[hsl(222,35%,18%)] last:border-0">
                  <div className="flex justify-between">
                    <div>
                      <p className="text-xs text-white">{e.produto?.sku} - {e.produto?.descricao}</p>
                      <p className="text-[10px] text-[hsl(213,31%,55%)]">{e.endereco?.descricao} ({e.endereco?.tipo_endereco})</p>
                    </div>
                    <span className="text-sm font-bold text-white">{e.quantidade_disponivel}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Last executions */}
          {execInfo.length > 0 && (
            <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-[hsl(222,35%,22%)]">
                <span className="text-sm font-bold text-white">Últimas Execuções</span>
              </div>
              {execInfo.map((e: any, i: number) => (
                <div key={i} className="px-3 py-2 border-b border-[hsl(222,35%,18%)] last:border-0 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-white">{e.status}</p>
                    <p className="text-[10px] text-[hsl(213,31%,55%)]">Qtd: {e.quantidade_executada ?? "—"}</p>
                  </div>
                  <span className="text-[10px] text-[hsl(213,31%,55%)]">{e.concluido_em ? new Date(e.concluido_em).toLocaleString("pt-BR") : "—"}</span>
                </div>
              ))}
            </div>
          )}

          {estoqueInfo.length === 0 && execInfo.length === 0 && (
            <div className="text-center text-sm text-[hsl(213,31%,55%)] py-4">Nenhum registro de estoque ou execução.</div>
          )}
        </div>
      )}
    </ColetorLayout>
  );
}

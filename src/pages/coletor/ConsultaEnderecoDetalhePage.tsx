import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props { onNavigate: (path: string) => void; }

type Tab = "info" | "config" | "cubagem";

interface EnderecoInfo {
  id: string;
  codigo_endereco: number | null;
  descricao: string;
  situacao: string;
  ativo: boolean;
  tipo_endereco: string | null;
  curva_acesso: string | null;
  total_pallet: number | null;
  lado: string | null;
  altura: number | null;
  largura: number | null;
  comprimento: number | null;
  m3: number | null;
}

export function ConsultaEnderecoDetalhePage({ onNavigate }: Props) {
  const enderecoId = sessionStorage.getItem("coletor_consulta_endereco_id") || "";
  const backPath = sessionStorage.getItem("coletor_consulta_endereco_back") || "/coletor/consulta/endereco";
  const [tab, setTab] = useState<Tab>("info");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [endereco, setEndereco] = useState<EnderecoInfo | null>(null);

  // Form states
  const [configForm, setConfigForm] = useState({ tipo_endereco: "", curva_acesso: "", total_pallet: "", lado: "" });
  const [cubForm, setCubForm] = useState({ altura: "", largura: "", comprimento: "", m3: "" });

  const load = useCallback(async () => {
    if (!enderecoId) return;
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from("endereco")
        .select("id, codigo_endereco, descricao, situacao, ativo, tipo_endereco, curva_acesso, total_pallet, lado, altura, largura, comprimento, m3")
        .eq("id", enderecoId)
        .single();
      if (data) {
        setEndereco(data);
        setConfigForm({
          tipo_endereco: data.tipo_endereco || "",
          curva_acesso: data.curva_acesso || "",
          total_pallet: data.total_pallet != null ? String(data.total_pallet) : "",
          lado: data.lado || "",
        });
        setCubForm({
          altura: data.altura != null ? String(data.altura) : "",
          largura: data.largura != null ? String(data.largura) : "",
          comprimento: data.comprimento != null ? String(data.comprimento) : "",
          m3: data.m3 != null ? String(data.m3) : "",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [enderecoId]);

  useEffect(() => { load(); }, [load]);

  const handleBack = (p: string) => {
    sessionStorage.removeItem("coletor_consulta_endereco_back");
    sessionStorage.removeItem("coletor_consulta_endereco_id");
    onNavigate(p);
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("endereco")
        .update({
          tipo_endereco: configForm.tipo_endereco || null,
          curva_acesso: configForm.curva_acesso || null,
          total_pallet: configForm.total_pallet ? Number(configForm.total_pallet) : null,
          lado: configForm.lado || null,
        })
        .eq("id", enderecoId);
      if (error) throw error;
      toast.success("Configurações salvas.");
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const saveCub = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("endereco")
        .update({
          altura: cubForm.altura ? Number(cubForm.altura) : null,
          largura: cubForm.largura ? Number(cubForm.largura) : null,
          comprimento: cubForm.comprimento ? Number(cubForm.comprimento) : null,
          m3: cubForm.m3 ? Number(cubForm.m3) : null,
        })
        .eq("id", enderecoId);
      if (error) throw error;
      toast.success("Cubagem salva.");
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const cardClass = "bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3";
  const labelClass = "text-[10px] text-[hsl(213,31%,55%)] uppercase";
  const valClass = "text-sm text-white font-medium";
  const inputClass = "w-full h-9 px-3 rounded-lg border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,10%)] text-sm text-white outline-none focus:border-[hsl(217,91%,50%)]";
  const btnPrimary = "w-full h-11 rounded-xl bg-[hsl(217,91%,50%)] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 transition-all";

  if (loading) {
    return (
      <ColetorLayout title="Detalhe Endereço" onNavigate={handleBack} showBack backPath={backPath}>
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[hsl(217,91%,60%)]" size={32} /></div>
      </ColetorLayout>
    );
  }

  if (!endereco) {
    return (
      <ColetorLayout title="Detalhe Endereço" onNavigate={handleBack} showBack backPath={backPath}>
        <p className="text-center text-sm text-[hsl(213,31%,55%)] py-8">Endereço não encontrado.</p>
      </ColetorLayout>
    );
  }

  return (
    <ColetorLayout title={endereco.descricao} onNavigate={handleBack} showBack backPath={backPath}>
      {/* Tab selector */}
      <div className="flex gap-1 p-1 rounded-xl bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)]">
        {(["info", "config", "cubagem"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${tab === t ? "bg-[hsl(217,91%,50%)] text-white" : "text-[hsl(213,31%,55%)]"}`}
          >
            {t === "info" ? "Informações" : t === "config" ? "Configurações" : "Cubagem"}
          </button>
        ))}
      </div>

      {/* INFO TAB */}
      {tab === "info" && (
        <div className="flex flex-col gap-3">
          <div className={cardClass}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={labelClass}>Código</span>
                <p className={valClass}>{endereco.codigo_endereco ?? "—"}</p>
              </div>
              <div>
                <span className={labelClass}>Ativo</span>
                <p className={valClass}>{endereco.ativo ? "Sim" : "Não"}</p>
              </div>
              <div className="col-span-2">
                <span className={labelClass}>Descrição</span>
                <p className={valClass}>{endereco.descricao}</p>
              </div>
              <div className="col-span-2">
                <span className={labelClass}>Situação</span>
                <div className="mt-1"><StatusBadge type="endereco-situacao" value={endereco.situacao} /></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIG TAB */}
      {tab === "config" && (
        <div className="flex flex-col gap-3">
          <div>
            <label className={`${labelClass} block mb-1`}>Tipo Endereço</label>
            <select value={configForm.tipo_endereco} onChange={(e) => setConfigForm({ ...configForm, tipo_endereco: e.target.value })} className={inputClass}>
              <option value="">—</option>
              <option value="PULMAO">PULMAO</option>
              <option value="PICKING">PICKING</option>
            </select>
          </div>
          <div>
            <label className={`${labelClass} block mb-1`}>Curva Acesso</label>
            <select value={configForm.curva_acesso} onChange={(e) => setConfigForm({ ...configForm, curva_acesso: e.target.value })} className={inputClass}>
              <option value="">—</option>
              {["A", "B", "C", "D"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={`${labelClass} block mb-1`}>Total Pallet</label>
            <input type="number" value={configForm.total_pallet} onChange={(e) => setConfigForm({ ...configForm, total_pallet: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={`${labelClass} block mb-1`}>Lado</label>
            <select value={configForm.lado} onChange={(e) => setConfigForm({ ...configForm, lado: e.target.value })} className={inputClass}>
              <option value="">—</option>
              <option value="PAR">PAR</option>
              <option value="IMPAR">IMPAR</option>
            </select>
          </div>
          <button onClick={saveConfig} disabled={saving} className={btnPrimary}>
            {saving && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </div>
      )}

      {/* CUBAGEM TAB */}
      {tab === "cubagem" && (
        <div className="flex flex-col gap-3">
          {[
            ["Altura", "altura"],
            ["Largura", "largura"],
            ["Comprimento", "comprimento"],
            ["M³", "m3"],
          ].map(([label, key]) => (
            <div key={key}>
              <label className={`${labelClass} block mb-1`}>{label}</label>
              <input
                type="number"
                step="0.01"
                value={(cubForm as any)[key]}
                onChange={(e) => setCubForm({ ...cubForm, [key]: e.target.value })}
                className={inputClass}
              />
            </div>
          ))}
          <button onClick={saveCub} disabled={saving} className={btnPrimary}>
            {saving && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </div>
      )}
    </ColetorLayout>
  );
}

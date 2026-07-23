import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { Loader2, Plus, Trash2, Edit2, MapPin } from "lucide-react";
import { ProdutoImagemThumb } from "@/components/produto/ProdutoImagemThumb";


interface Props {
  onNavigate: (path: string) => void;
}

type Tab = "info" | "embalagens" | "picking";

interface ProdutoInfo {
  id: string;
  sku: string;
  referencia: string;
  descricao: string;
  marca: string | null;
  parceiro_nome: string;
  grupo_nome: string;
  subgrupo_nome: string;
  curva_venda: string | null;
  curva_acesso: string | null;
  tipo_controle: string;
  lastro: number | null;
  camada: number | null;
  fator_caixa: number | null;
  peso_bruto: number | null;
  peso_liquido: number | null;
  url_imagem: string | null;
}

interface Embalagem {
  id: string;
  embalagem: string;
  ean: string;
  fator: number;
  peso_bruto: number | null;
  peso_liquido: number | null;
  comprimento: number | null;
  largura: number | null;
  altura: number | null;
  m3: number | null;
  ativo: boolean;
}

interface PickingItem {
  id: string;
  endereco_desc: string;
  endereco_id: string;
  est_minimo: number;
  est_maximo: number;
  tipo_picking: string;
  ativo: boolean;
}

export function ConsultaProdutoDetalhePage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id");
  const armazemId = localStorage.getItem("core_armazem_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const produtoId = sessionStorage.getItem("coletor_consulta_produto_id") || "";
  const customBackPath = sessionStorage.getItem("coletor_consulta_produto_back") || "/coletor/consulta/produto";
  const backPath = customBackPath;
  const [tab, setTab] = useState<Tab>("info");
  const [loading, setLoading] = useState(true);
  const [produto, setProduto] = useState<ProdutoInfo | null>(null);

  // Embalagens
  const [embalagens, setEmbalagens] = useState<Embalagem[]>([]);
  const [showEmbForm, setShowEmbForm] = useState(false);
  const [editEmb, setEditEmb] = useState<Embalagem | null>(null);
  const [embForm, setEmbForm] = useState({ embalagem: "", ean: "", fator: "1", peso_bruto: "", peso_liquido: "", comprimento: "", largura: "", altura: "", m3: "" });
  const [embSubmitting, setEmbSubmitting] = useState(false);

  // Picking
  const [pickings, setPickings] = useState<PickingItem[]>([]);
  const [showPickForm, setShowPickForm] = useState(false);
  const [editPick, setEditPick] = useState<PickingItem | null>(null);
  const [pickForm, setPickForm] = useState({ endereco_id: "", est_minimo: "", est_maximo: "", tipo_picking: "FRACIONADO" });
  const [pickSubmitting, setPickSubmitting] = useState(false);
  const [scannedEnderecoInfo, setScannedEnderecoInfo] = useState<{ id: string; descricao: string; armazem: string; setor: string } | null>(null);

  const loadProduto = useCallback(async () => {
    if (!produtoId) return;
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from("produto")
        .select("id, sku, referencia, descricao, marca, curva_venda, curva_acesso, tipo_controle, lastro, camada, fator_caixa, peso_bruto, peso_liquido, url_imagem, parceiro_id, grupo_id, subgrupo_id")
        .eq("id", produtoId)
        .single();
      if (!data) return;

      const [parcRes, grpRes, subRes] = await Promise.all([
        (supabase as any).from("parceiro").select("razaosocial").eq("id", data.parceiro_id).single(),
        data.grupo_id ? (supabase as any).from("grupo_produto").select("descricao").eq("id", data.grupo_id).single() : Promise.resolve({ data: null }),
        data.subgrupo_id ? (supabase as any).from("subgrupo_produto").select("descricao").eq("id", data.subgrupo_id).single() : Promise.resolve({ data: null }),
      ]);

      setProduto({
        ...data,
        parceiro_nome: parcRes.data?.razaosocial || "—",
        grupo_nome: grpRes.data?.descricao || "—",
        subgrupo_nome: subRes.data?.descricao || "—",
      });
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [produtoId]);

  const loadEmbalagens = useCallback(async () => {
    if (!produtoId) return;
    const { data } = await (supabase as any)
      .from("produto_embalagem")
      .select("*")
      .eq("produto_id", produtoId)
      .order("fator");
    setEmbalagens(data || []);
  }, [produtoId]);

  const loadPickings = useCallback(async () => {
    if (!produtoId) return;
    const { data } = await (supabase as any)
      .from("picking_produto")
      .select("id, endereco_id, est_minimo, est_maximo, tipo_picking, ativo, endereco:endereco_id(descricao)")
      .eq("produto_id", produtoId);
    setPickings((data || []).map((p: any) => ({ ...p, endereco_desc: p.endereco?.descricao || "—" })));
  }, [produtoId]);

  useEffect(() => { loadProduto(); }, [loadProduto]);
  useEffect(() => { if (tab === "embalagens") loadEmbalagens(); }, [tab, loadEmbalagens]);
  useEffect(() => { if (tab === "picking") loadPickings(); }, [tab, loadPickings]);

  // Scan endereco for picking form
  const handleScanEndereco = async (code: string) => {
    setScannedEnderecoInfo(null);
    try {
      const { data } = await (supabase as any).from("endereco")
        .select("id, descricao, armazem_id, setor_id")
        .eq("descricao", code)
        .eq("ativo", true)
        .limit(1);
      if (!data || data.length === 0) {
        // Try by codigo_endereco
        const { data: data2 } = await (supabase as any).from("endereco")
          .select("id, descricao, armazem_id, setor_id")
          .eq("codigo_endereco", Number(code) || -1)
          .eq("ativo", true)
          .limit(1);
        if (!data2 || data2.length === 0) return;
        const end = data2[0];
        await resolveEnderecoInfo(end);
        return;
      }
      await resolveEnderecoInfo(data[0]);
    } catch { /* ignore */ }
  };

  const resolveEnderecoInfo = async (end: any) => {
    let armazemDesc = "—", setorDesc = "—";
    const [armRes, setRes] = await Promise.all([
      end.armazem_id ? (supabase as any).from("armazem").select("descricao").eq("id", end.armazem_id).single() : Promise.resolve({ data: null }),
      end.setor_id ? (supabase as any).from("setor").select("descricao").eq("id", end.setor_id).single() : Promise.resolve({ data: null }),
    ]);
    armazemDesc = armRes.data?.descricao || "—";
    setorDesc = setRes.data?.descricao || "—";
    setScannedEnderecoInfo({ id: end.id, descricao: end.descricao, armazem: armazemDesc, setor: setorDesc });
    setPickForm(prev => ({ ...prev, endereco_id: end.id }));
  };

  // Embalagem CRUD
  const openEmbForm = (emb?: Embalagem) => {
    if (emb) {
      setEditEmb(emb);
      setEmbForm({
        embalagem: emb.embalagem, ean: emb.ean, fator: String(emb.fator),
        peso_bruto: String(emb.peso_bruto || ""), peso_liquido: String(emb.peso_liquido || ""),
        comprimento: String(emb.comprimento || ""), largura: String(emb.largura || ""),
        altura: String(emb.altura || ""), m3: String(emb.m3 || ""),
      });
    } else {
      setEditEmb(null);
      setEmbForm({ embalagem: "", ean: "", fator: "1", peso_bruto: "", peso_liquido: "", comprimento: "", largura: "", altura: "", m3: "" });
    }
    setShowEmbForm(true);
  };

  const saveEmbalagem = async () => {
    if (!embForm.embalagem || !embForm.ean) return;
    setEmbSubmitting(true);
    try {
      const payload = {
        produto_id: produtoId,
        empresa_id: empresaId,
        tenant_id: tenantId,
        embalagem: embForm.embalagem,
        ean: embForm.ean,
        fator: Number(embForm.fator) || 1,
        peso_bruto: embForm.peso_bruto ? Number(embForm.peso_bruto) : null,
        peso_liquido: embForm.peso_liquido ? Number(embForm.peso_liquido) : null,
        comprimento: embForm.comprimento ? Number(embForm.comprimento) : null,
        largura: embForm.largura ? Number(embForm.largura) : null,
        altura: embForm.altura ? Number(embForm.altura) : null,
        m3: embForm.m3 ? Number(embForm.m3) : null,
        ativo: true,
      };
      if (editEmb) {
        await (supabase as any).from("produto_embalagem").update(payload).eq("id", editEmb.id);
      } else {
        await (supabase as any).from("produto_embalagem").insert(payload);
      }
      setShowEmbForm(false);
      loadEmbalagens();
    } catch { /* ignore */ } finally {
      setEmbSubmitting(false);
    }
  };

  const deleteEmbalagem = async (id: string) => {
    await (supabase as any).from("produto_embalagem").delete().eq("id", id);
    loadEmbalagens();
  };

  // Picking CRUD
  const openPickForm = (pick?: PickingItem) => {
    setScannedEnderecoInfo(null);
    if (pick) {
      setEditPick(pick);
      setPickForm({ endereco_id: pick.endereco_id, est_minimo: String(pick.est_minimo), est_maximo: String(pick.est_maximo), tipo_picking: pick.tipo_picking });
    } else {
      setEditPick(null);
      setPickForm({ endereco_id: "", est_minimo: "", est_maximo: "", tipo_picking: "FRACIONADO" });
    }
    setShowPickForm(true);
  };

  const savePicking = async () => {
    if (!pickForm.endereco_id || !pickForm.est_minimo || !pickForm.est_maximo) return;
    setPickSubmitting(true);
    try {
      const payload = {
        produto_id: produtoId,
        armazem_id: armazemId,
        tenant_id: tenantId,
        endereco_id: pickForm.endereco_id,
        est_minimo: Number(pickForm.est_minimo),
        est_maximo: Number(pickForm.est_maximo),
        tipo_picking: pickForm.tipo_picking,
        ativo: true,
      };
      if (editPick) {
        await (supabase as any).from("picking_produto").update(payload).eq("id", editPick.id);
      } else {
        await (supabase as any).from("picking_produto").insert(payload);
      }
      setShowPickForm(false);
      loadPickings();
    } catch { /* ignore */ } finally {
      setPickSubmitting(false);
    }
  };

  const deletePicking = async (id: string) => {
    await (supabase as any).from("picking_produto").delete().eq("id", id);
    loadPickings();
  };

  const cardClass = "bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3";
  const labelClass = "text-[10px] text-[hsl(213,31%,55%)] uppercase";
  const valClass = "text-sm text-white font-medium";
  const inputClass = "w-full h-9 px-3 rounded-lg border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,10%)] text-sm text-white outline-none focus:border-[hsl(217,91%,50%)]";
  const btnPrimary = "w-full h-11 rounded-xl bg-[hsl(217,91%,50%)] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 transition-all";

  if (loading) {
    return (
      <ColetorLayout title="Detalhe Produto" onNavigate={(p) => { sessionStorage.removeItem("coletor_consulta_produto_back"); onNavigate(p); }} showBack backPath={backPath}>
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[hsl(217,91%,60%)]" size={32} /></div>
      </ColetorLayout>
    );
  }

  if (!produto) {
    return (
      <ColetorLayout title="Detalhe Produto" onNavigate={(p) => { sessionStorage.removeItem("coletor_consulta_produto_back"); onNavigate(p); }} showBack backPath={backPath}>
        <p className="text-center text-sm text-[hsl(213,31%,55%)] py-8">Produto não encontrado.</p>
      </ColetorLayout>
    );
  }

  return (
    <ColetorLayout title={produto.sku} onNavigate={(p) => { sessionStorage.removeItem("coletor_consulta_produto_back"); onNavigate(p); }} showBack backPath={backPath}>
      {/* Tab selector */}
      <div className="flex gap-1 p-1 rounded-xl bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)]">
        {(["info", "embalagens", "picking"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${tab === t ? "bg-[hsl(217,91%,50%)] text-white" : "text-[hsl(213,31%,55%)]"}`}
          >
            {t === "info" ? "Informações" : t === "embalagens" ? "Embalagens" : "Picking"}
          </button>
        ))}
      </div>


      {/* INFO TAB */}
      {tab === "info" && (
        <div className="flex flex-col gap-3">
          {produto.url_imagem && (
            <div className={cardClass}>
              <div className="flex items-center gap-3">
                <ProdutoImagemThumb
                  url={produto.url_imagem}
                  alt={produto.sku}
                  caption={`${produto.sku} — ${produto.descricao}`}
                  size={72}
                  variant="coletor"
                />
                <div className="flex flex-col min-w-0">
                  <span className={labelClass}>Imagem</span>
                  <p className="text-xs text-[hsl(213,31%,70%)]">Toque para ampliar</p>
                </div>
              </div>
            </div>
          )}
          <div className={cardClass}>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["SKU", produto.sku],
                ["Referência", produto.referencia],
                ["Marca", produto.marca || "—"],
                ["Parceiro", produto.parceiro_nome],
                ["Grupo", produto.grupo_nome],
                ["Subgrupo", produto.subgrupo_nome],
                ["Curva Venda", produto.curva_venda || "—"],
                ["Curva Acesso", produto.curva_acesso || "—"],
                ["Tipo Controle", produto.tipo_controle],
                ["Lastro", String(produto.lastro ?? "—")],
                ["Camada", String(produto.camada ?? "—")],
                ["Fator Caixa", String(produto.fator_caixa ?? "—")],
                ["Peso Bruto (kg)", String(produto.peso_bruto ?? "—")],
                ["Peso Líquido (kg)", String(produto.peso_liquido ?? "—")],
              ].map(([label, value]) => (
                <div key={label}>
                  <span className={labelClass}>{label}</span>
                  <p className={valClass}>{value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className={cardClass}>
            <span className={labelClass}>Descrição</span>
            <p className={valClass}>{produto.descricao}</p>
          </div>
        </div>
      )}

      {/* EMBALAGENS TAB */}
      {tab === "embalagens" && !showEmbForm && (
        <div className="flex flex-col gap-3">
          <button onClick={() => openEmbForm()} className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-[hsl(217,91%,50%)]/40 text-[hsl(217,91%,60%)] text-sm font-bold">
            <Plus size={16} /> Nova Embalagem
          </button>
          {embalagens.map((emb) => (
            <div key={emb.id} className={cardClass}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-bold text-white">{emb.embalagem}</p>
                  <p className="text-xs text-[hsl(213,31%,55%)] font-mono">{emb.ean}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEmbForm(emb)} className="p-1.5 rounded-lg bg-[hsl(222,35%,18%)]"><Edit2 size={14} className="text-[hsl(217,91%,60%)]" /></button>
                  <button onClick={() => deleteEmbalagem(emb.id)} className="p-1.5 rounded-lg bg-[hsl(222,35%,18%)]"><Trash2 size={14} className="text-red-400" /></button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-[hsl(222,35%,18%)]">
                <div><span className={labelClass}>Fator</span><p className="text-xs text-white">{emb.fator}</p></div>
                <div><span className={labelClass}>Peso Bruto</span><p className="text-xs text-white">{emb.peso_bruto ?? "—"}</p></div>
                <div><span className={labelClass}>M³</span><p className="text-xs text-white">{emb.m3 ?? "—"}</p></div>
              </div>
            </div>
          ))}
          {embalagens.length === 0 && <p className="text-center text-sm text-[hsl(213,31%,55%)] py-4">Nenhuma embalagem cadastrada.</p>}
        </div>
      )}

      {/* EMBALAGEM FORM */}
      {tab === "embalagens" && showEmbForm && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold text-white">{editEmb ? "Editar Embalagem" : "Nova Embalagem"}</h3>
          {[
            ["Embalagem *", "embalagem", "text"],
            ["EAN *", "ean", "text"],
            ["Fator *", "fator", "number"],
            ["Peso Bruto", "peso_bruto", "number"],
            ["Peso Líquido", "peso_liquido", "number"],
            ["Comprimento", "comprimento", "number"],
            ["Largura", "largura", "number"],
            ["Altura", "altura", "number"],
            ["M³", "m3", "number"],
          ].map(([label, key, type]) => (
            <div key={key}>
              <label className={`${labelClass} block mb-1`}>{label}</label>
              <input type={type} value={(embForm as any)[key]} onChange={(e) => setEmbForm({ ...embForm, [key]: e.target.value })} className={inputClass} />
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setShowEmbForm(false)} className="flex-1 h-11 rounded-xl border border-[hsl(222,35%,22%)] text-[hsl(213,31%,55%)] font-bold text-sm">Cancelar</button>
            <button onClick={saveEmbalagem} disabled={embSubmitting} className={`flex-1 ${btnPrimary}`}>
              {embSubmitting && <Loader2 size={14} className="animate-spin" />} Salvar
            </button>
          </div>
        </div>
      )}

      {/* PICKING TAB */}
      {tab === "picking" && !showPickForm && (
        <div className="flex flex-col gap-3">
          <button onClick={() => openPickForm()} className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-[hsl(142,76%,36%)]/40 text-[hsl(142,76%,36%)] text-sm font-bold">
            <Plus size={16} /> Novo Picking
          </button>
          {pickings.map((pick) => (
            <div key={pick.id} className={cardClass}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-bold text-white">{pick.endereco_desc}</p>
                  <p className="text-xs text-[hsl(213,31%,55%)]">{pick.tipo_picking}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openPickForm(pick)} className="p-1.5 rounded-lg bg-[hsl(222,35%,18%)]"><Edit2 size={14} className="text-[hsl(217,91%,60%)]" /></button>
                  <button onClick={() => deletePicking(pick.id)} className="p-1.5 rounded-lg bg-[hsl(222,35%,18%)]"><Trash2 size={14} className="text-red-400" /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-[hsl(222,35%,18%)]">
                <div><span className={labelClass}>Mínimo</span><p className="text-xs text-white">{pick.est_minimo}</p></div>
                <div><span className={labelClass}>Máximo</span><p className="text-xs text-white">{pick.est_maximo}</p></div>
              </div>
            </div>
          ))}
          {pickings.length === 0 && <p className="text-center text-sm text-[hsl(213,31%,55%)] py-4">Nenhum picking cadastrado.</p>}
        </div>
      )}

      {/* PICKING FORM */}
      {tab === "picking" && showPickForm && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold text-white">{editPick ? "Editar Picking" : "Novo Picking"}</h3>
          
          {/* Scan Endereço */}
          <ScanField
            label="Escanear Endereço"
            lastScanned={scannedEnderecoInfo?.descricao}
            onScan={handleScanEndereco}
            placeholder="Escaneie o código do endereço"
          />

          {/* Endereço Info */}
          {scannedEnderecoInfo && (
            <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 space-y-1">
              <div className="flex items-center gap-2 mb-1">
                <MapPin size={14} className="text-[hsl(217,91%,60%)]" />
                <span className="text-xs font-bold text-white">Endereço Selecionado</span>
              </div>
              <div className="text-xs text-[hsl(213,31%,55%)]">Armazém: <span className="font-bold text-white">{scannedEnderecoInfo.armazem}</span></div>
              <div className="text-xs text-[hsl(213,31%,55%)]">Setor: <span className="font-bold text-white">{scannedEnderecoInfo.setor}</span></div>
              <div className="text-xs text-[hsl(213,31%,55%)]">Endereço: <span className="font-bold text-white">{scannedEnderecoInfo.descricao}</span></div>
            </div>
          )}

          <div>
            <label className={`${labelClass} block mb-1`}>Estoque Mínimo *</label>
            <input type="number" value={pickForm.est_minimo} onChange={(e) => setPickForm({ ...pickForm, est_minimo: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={`${labelClass} block mb-1`}>Estoque Máximo *</label>
            <input type="number" value={pickForm.est_maximo} onChange={(e) => setPickForm({ ...pickForm, est_maximo: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={`${labelClass} block mb-1`}>Tipo de Picking *</label>
            <select value={pickForm.tipo_picking} onChange={(e) => setPickForm({ ...pickForm, tipo_picking: e.target.value })} className={inputClass}>
              <option value="FRACIONADO">Fracionado</option>
              <option value="FECHADO">Fechado</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowPickForm(false)} className="flex-1 h-11 rounded-xl border border-[hsl(222,35%,22%)] text-[hsl(213,31%,55%)] font-bold text-sm">Cancelar</button>
            <button onClick={savePicking} disabled={pickSubmitting} className={`flex-1 ${btnPrimary}`}>
              {pickSubmitting && <Loader2 size={14} className="animate-spin" />} Salvar
            </button>
          </div>
        </div>
      )}
    </ColetorLayout>
  );
}

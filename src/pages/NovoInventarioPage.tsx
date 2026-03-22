import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, X, Search, Package, MapPin, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const TIPO_OPTIONS = [
  { value: "GERAL", label: "Geral" },
  { value: "ENDERECO", label: "Por Endereço" },
  { value: "PRODUTO", label: "Por Produto" },
  { value: "ROTATIVO", label: "Rotativo" },
  { value: "ZONA", label: "Por Zona" },
];

interface EnderecoOption { id: string; descricao: string; tipo_endereco: string; rua: number; predio: number; }
interface ProdutoOption { id: string; sku: string; descricao: string; }
interface ZonaOption { id: string; descricao: string; }

interface Props { onNavigate: (path: string) => void; }

export function NovoInventarioPage({ onNavigate }: Props) {
  const { tenantId, empresaId, armazemId, usuarioId } = useTenant();

  // Step 1 - General
  const [tipo, setTipo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [dataPlanejada, setDataPlanejada] = useState("");
  const [bloquearMov, setBloquearMov] = useState(true);
  const [permitirParalela, setPermitirParalela] = useState(false);

  // GERAL scope
  const [incluirPicking, setIncluirPicking] = useState(true);
  const [incluirPulmao, setIncluirPulmao] = useState(true);
  const [incluirBloqueados, setIncluirBloqueados] = useState(false);
  const [estimativaEnderecos, setEstimativaEnderecos] = useState<number | null>(null);
  const [estimativaLoading, setEstimativaLoading] = useState(false);

  // ENDERECO scope
  const [enderecoSearch, setEnderecoSearch] = useState("");
  const [enderecoFilterRua, setEnderecoFilterRua] = useState("");
  const [enderecoFilterPredio, setEnderecoFilterPredio] = useState("");
  const [enderecoFilterTipo, setEnderecoFilterTipo] = useState("");
  const [enderecoResults, setEnderecoResults] = useState<EnderecoOption[]>([]);
  const [enderecoLoading, setEnderecoLoading] = useState(false);
  const [selectedEnderecos, setSelectedEnderecos] = useState<EnderecoOption[]>([]);

  // PRODUTO scope
  const [produtoSearch, setProdutoSearch] = useState("");
  const [produtoResults, setProdutoResults] = useState<ProdutoOption[]>([]);
  const [produtoLoading, setProdutoLoading] = useState(false);
  const [selectedProdutos, setSelectedProdutos] = useState<ProdutoOption[]>([]);
  const [produtoLocais, setProdutoLocais] = useState<number | null>(null);

  // ROTATIVO scope
  const [criterioRotativo, setCriterioRotativo] = useState("MAIOR_GIRO");
  const [maxEnderecosDia, setMaxEnderecosDia] = useState("50");
  const [prioPickingRotativo, setPrioPickingRotativo] = useState(true);

  // ZONA scope
  const [zonas, setZonas] = useState<ZonaOption[]>([]);
  const [selectedZona, setSelectedZona] = useState("");
  const [zonaLoading, setZonaLoading] = useState(false);

  // Summary
  const [summaryData, setSummaryData] = useState({ enderecos: 0, skus: 0, saldoEstimado: 0 });
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Saving
  const [saving, setSaving] = useState(false);

  const debounceRef = useRef<any>(null);

  // --- GERAL: estimate addresses ---
  useEffect(() => {
    if (tipo !== "GERAL" || !tenantId || !armazemId) return;
    setEstimativaLoading(true);
    const timer = setTimeout(async () => {
      try {
        const tiposEndereco: string[] = [];
        if (incluirPicking) tiposEndereco.push("PICKING");
        if (incluirPulmao) tiposEndereco.push("PULMAO");
        if (tiposEndereco.length === 0) { setEstimativaEnderecos(0); setEstimativaLoading(false); return; }

        let q = (supabase as any).from("endereco").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).eq("armazem_id", armazemId).eq("ativo", true)
          .in("tipo_endereco", tiposEndereco);
        if (!incluirBloqueados) q = q.eq("situacao", "LIVRE");

        const { count } = await q;
        setEstimativaEnderecos(count || 0);
      } catch { setEstimativaEnderecos(0); }
      setEstimativaLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [tipo, incluirPicking, incluirPulmao, incluirBloqueados, tenantId, armazemId]);

  // --- ENDERECO: search ---
  const searchEnderecos = useCallback(async () => {
    if (!tenantId || !armazemId) return;
    setEnderecoLoading(true);
    try {
      let q = (supabase as any).from("endereco").select("id, descricao, tipo_endereco, rua, predio")
        .eq("tenant_id", tenantId).eq("armazem_id", armazemId).eq("ativo", true)
        .order("descricao").limit(50);
      if (enderecoSearch) q = q.ilike("descricao", `%${enderecoSearch}%`);
      if (enderecoFilterRua) q = q.eq("rua", Number(enderecoFilterRua));
      if (enderecoFilterPredio) q = q.eq("predio", Number(enderecoFilterPredio));
      if (enderecoFilterTipo) q = q.eq("tipo_endereco", enderecoFilterTipo);

      const { data } = await q;
      setEnderecoResults((data || []).filter((e: EnderecoOption) => !selectedEnderecos.some(s => s.id === e.id)));
    } catch { setEnderecoResults([]); }
    setEnderecoLoading(false);
  }, [tenantId, armazemId, enderecoSearch, enderecoFilterRua, enderecoFilterPredio, enderecoFilterTipo, selectedEnderecos]);

  useEffect(() => {
    if (tipo !== "ENDERECO") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(searchEnderecos, 400);
    return () => clearTimeout(debounceRef.current);
  }, [tipo, searchEnderecos]);

  // --- PRODUTO: search ---
  const searchProdutos = useCallback(async () => {
    if (!tenantId || !produtoSearch || produtoSearch.length < 2) { setProdutoResults([]); return; }
    setProdutoLoading(true);
    try {
      const { data } = await (supabase as any).from("produto").select("id, sku, descricao")
        .eq("tenant_id", tenantId).eq("ativo", true)
        .or(`sku.ilike.%${produtoSearch}%,descricao.ilike.%${produtoSearch}%`)
        .limit(20);
      setProdutoResults((data || []).filter((p: ProdutoOption) => !selectedProdutos.some(s => s.id === p.id)));
    } catch { setProdutoResults([]); }
    setProdutoLoading(false);
  }, [tenantId, produtoSearch, selectedProdutos]);

  useEffect(() => {
    if (tipo !== "PRODUTO") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(searchProdutos, 400);
    return () => clearTimeout(debounceRef.current);
  }, [tipo, searchProdutos]);

  // --- PRODUTO: count locations ---
  useEffect(() => {
    if (tipo !== "PRODUTO" || selectedProdutos.length === 0 || !tenantId) { setProdutoLocais(null); return; }
    const run = async () => {
      const ids = selectedProdutos.map(p => p.id);
      const { count } = await (supabase as any).from("estoque_geral").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).in("produto_id", ids).gt("quantidade_total", 0);
      setProdutoLocais(count || 0);
    };
    run();
  }, [tipo, selectedProdutos, tenantId]);

  // --- ZONA: load zones ---
  useEffect(() => {
    if (tipo !== "ZONA" || !tenantId || !armazemId) return;
    setZonaLoading(true);
    (async () => {
      const { data } = await (supabase as any).from("zona_atividade").select("id, descricao")
        .eq("tenant_id", tenantId).eq("armazem_id", armazemId).eq("ativo", true).order("descricao");
      setZonas(data || []);
      setZonaLoading(false);
    })();
  }, [tipo, tenantId, armazemId]);

  // --- Summary card ---
  useEffect(() => {
    if (!tipo || !tenantId) return;
    setSummaryLoading(true);
    const timer = setTimeout(async () => {
      try {
        let endCount = 0, skuCount = 0, saldoEst = 0;

        if (tipo === "GERAL") {
          endCount = estimativaEnderecos || 0;
          const { count: sc } = await (supabase as any).from("estoque_geral").select("produto_id", { count: "exact", head: true })
            .eq("tenant_id", tenantId).gt("quantidade_total", 0);
          skuCount = sc || 0;
        } else if (tipo === "ENDERECO") {
          endCount = selectedEnderecos.length;
          if (selectedEnderecos.length > 0) {
            const ids = selectedEnderecos.map(e => e.id);
            const { data } = await (supabase as any).from("estoque_geral").select("produto_id, quantidade_total")
              .eq("tenant_id", tenantId).in("endereco_id", ids).gt("quantidade_total", 0);
            const prodSet = new Set((data || []).map((d: any) => d.produto_id));
            skuCount = prodSet.size;
            saldoEst = (data || []).reduce((s: number, d: any) => s + Number(d.quantidade_total || 0), 0);
          }
        } else if (tipo === "PRODUTO") {
          skuCount = selectedProdutos.length;
          endCount = produtoLocais || 0;
        } else if (tipo === "ZONA") {
          if (selectedZona) {
            const { count } = await (supabase as any).from("endereco_zona_atividade").select("id", { count: "exact", head: true })
              .eq("tenant_id", tenantId).eq("zona_atividade_id", selectedZona);
            endCount = count || 0;
          }
        } else if (tipo === "ROTATIVO") {
          endCount = Number(maxEnderecosDia) || 0;
        }

        setSummaryData({ enderecos: endCount, skus: skuCount, saldoEstimado: saldoEst });
      } catch { /* ignore */ }
      setSummaryLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [tipo, estimativaEnderecos, selectedEnderecos, selectedProdutos, produtoLocais, selectedZona, maxEnderecosDia, tenantId]);

  // --- SAVE ---
  const handleSave = async () => {
    if (!tipo) { toast.error("Selecione o tipo de inventário."); return; }
    if (!tenantId || !empresaId || !armazemId) { toast.error("Contexto não carregado."); return; }
    setSaving(true);
    try {
      const payload: any = {
        tenant_id: tenantId,
        empresa_id: empresaId,
        armazem_id: armazemId,
        tipo_inventario: tipo,
        descricao: descricao || null,
        bloquear_movimentacao: bloquearMov,
        criado_por: usuarioId,
        status: "CRIADO",
      };

      if (tipo === "ZONA" && selectedZona) payload.zona_atividade_id = selectedZona;
      if (tipo === "ENDERECO" && selectedEnderecos.length === 1) payload.endereco_id = selectedEnderecos[0].id;
      if (tipo === "PRODUTO" && selectedProdutos.length === 1) payload.produto_id = selectedProdutos[0].id;

      const { error } = await (supabase as any).from("inventario").insert(payload);
      if (error) throw error;
      toast.success("Inventário criado com sucesso!");
      onNavigate("/atividades/inventario");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "h-9 px-3 rounded-md border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary w-full";
  const labelClass = "block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider";

  const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div className={cn("w-10 h-5 rounded-full transition-colors relative", checked ? "bg-primary" : "bg-secondary")} onClick={() => onChange(!checked)}>
        <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
      </div>
      <span className="text-sm text-foreground group-hover:text-primary transition-colors">{label}</span>
    </label>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 animate-fade-in">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">Novo Inventário</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => onNavigate("/atividades/inventario")} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !tipo} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Criar Inventário
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="flex gap-4 min-h-full">
          {/* Main form */}
          <div className="flex-1 flex flex-col gap-4">
            {/* Step 1 */}
            <div className="card-surface p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Dados Gerais</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Tipo Inventário *</label>
                  <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputClass}>
                    <option value="">Selecione...</option>
                    {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Data Planejada</label>
                  <input type="date" value={dataPlanejada} onChange={(e) => setDataPlanejada(e.target.value)} className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Descrição</label>
                  <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição do inventário" className={inputClass} />
                </div>
                <div className="col-span-2 flex gap-8">
                  <Toggle checked={bloquearMov} onChange={setBloquearMov} label="Bloquear Movimentações" />
                  <Toggle checked={permitirParalela} onChange={setPermitirParalela} label="Permitir Execução Paralela" />
                </div>
              </div>
            </div>

            {/* Step 2 - Dynamic scope */}
            {tipo && (
              <div className="card-surface p-5">
                <h2 className="text-sm font-semibold text-foreground mb-4">Escopo do Inventário</h2>

                {/* GERAL */}
                {tipo === "GERAL" && (
                  <div className="flex flex-col gap-4">
                    <div className="flex gap-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={incluirPicking} onChange={(e) => setIncluirPicking(e.target.checked)} className="w-4 h-4 rounded border-border accent-primary" />
                        <span className="text-sm text-foreground">Incluir Picking</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={incluirPulmao} onChange={(e) => setIncluirPulmao(e.target.checked)} className="w-4 h-4 rounded border-border accent-primary" />
                        <span className="text-sm text-foreground">Incluir Pulmão</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={incluirBloqueados} onChange={(e) => setIncluirBloqueados(e.target.checked)} className="w-4 h-4 rounded border-border accent-primary" />
                        <span className="text-sm text-foreground">Incluir Bloqueados</span>
                      </label>
                    </div>
                    <div className="p-3 rounded-lg bg-secondary/30 border border-border">
                      {estimativaLoading ? (
                        <div className="flex items-center gap-2"><Loader2 size={14} className="animate-spin text-muted-foreground" /><span className="text-xs text-muted-foreground">Calculando...</span></div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <MapPin size={14} className="text-primary" />
                          <span className="text-sm text-foreground font-medium">{estimativaEnderecos ?? 0} endereços serão inventariados</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ENDERECO */}
                {tipo === "ENDERECO" && (
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2 flex-wrap">
                      <div className="flex-1 min-w-[150px]">
                        <label className={labelClass}>Buscar Endereço</label>
                        <div className="flex items-center gap-2 bg-secondary/40 rounded-md border border-border px-3">
                          <Search size={12} className="text-muted-foreground" />
                          <input type="text" value={enderecoSearch} onChange={(e) => setEnderecoSearch(e.target.value)} placeholder="Descrição..." className="bg-transparent h-9 text-sm text-foreground outline-none flex-1" />
                        </div>
                      </div>
                      <div className="w-20">
                        <label className={labelClass}>Rua</label>
                        <input type="number" value={enderecoFilterRua} onChange={(e) => setEnderecoFilterRua(e.target.value)} className={inputClass} />
                      </div>
                      <div className="w-20">
                        <label className={labelClass}>Prédio</label>
                        <input type="number" value={enderecoFilterPredio} onChange={(e) => setEnderecoFilterPredio(e.target.value)} className={inputClass} />
                      </div>
                      <div className="w-32">
                        <label className={labelClass}>Tipo</label>
                        <select value={enderecoFilterTipo} onChange={(e) => setEnderecoFilterTipo(e.target.value)} className={inputClass}>
                          <option value="">Todos</option>
                          <option value="PICKING">Picking</option>
                          <option value="PULMAO">Pulmão</option>
                        </select>
                      </div>
                    </div>

                    {/* Results */}
                    <div className="border border-border rounded-lg max-h-40 overflow-auto">
                      {enderecoLoading ? (
                        <div className="flex items-center justify-center py-4"><Loader2 size={14} className="animate-spin text-muted-foreground" /></div>
                      ) : enderecoResults.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">Nenhum endereço encontrado.</p>
                      ) : (
                        enderecoResults.map(e => (
                          <button key={e.id} onClick={() => { setSelectedEnderecos(prev => [...prev, e]); setEnderecoResults(prev => prev.filter(r => r.id !== e.id)); }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-secondary/50 border-b border-border/30 last:border-0 transition-colors">
                            <span className="font-mono font-semibold text-primary">{e.descricao}</span>
                            <span className="ml-2 text-muted-foreground">{e.tipo_endereco}</span>
                          </button>
                        ))
                      )}
                    </div>

                    {/* Selected */}
                    {selectedEnderecos.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground mb-1 block">{selectedEnderecos.length} endereços selecionados</span>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedEnderecos.map(e => (
                            <span key={e.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-xs text-primary">
                              {e.descricao}
                              <button onClick={() => setSelectedEnderecos(prev => prev.filter(s => s.id !== e.id))} className="hover:text-destructive"><X size={10} /></button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* PRODUTO */}
                {tipo === "PRODUTO" && (
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className={labelClass}>Buscar Produto (SKU ou Descrição)</label>
                      <div className="flex items-center gap-2 bg-secondary/40 rounded-md border border-border px-3">
                        <Search size={12} className="text-muted-foreground" />
                        <input type="text" value={produtoSearch} onChange={(e) => setProdutoSearch(e.target.value)} placeholder="Digite ao menos 2 caracteres..." className="bg-transparent h-9 text-sm text-foreground outline-none flex-1" />
                      </div>
                    </div>

                    <div className="border border-border rounded-lg max-h-40 overflow-auto">
                      {produtoLoading ? (
                        <div className="flex items-center justify-center py-4"><Loader2 size={14} className="animate-spin text-muted-foreground" /></div>
                      ) : produtoResults.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">{produtoSearch.length < 2 ? "Digite para buscar..." : "Nenhum produto encontrado."}</p>
                      ) : (
                        produtoResults.map(p => (
                          <button key={p.id} onClick={() => { setSelectedProdutos(prev => [...prev, p]); setProdutoResults(prev => prev.filter(r => r.id !== p.id)); }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-secondary/50 border-b border-border/30 last:border-0 transition-colors">
                            <span className="font-mono font-semibold text-primary">{p.sku}</span>
                            <span className="ml-2 text-muted-foreground">{p.descricao}</span>
                          </button>
                        ))
                      )}
                    </div>

                    {selectedProdutos.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground mb-1 block">{selectedProdutos.length} produtos selecionados</span>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedProdutos.map(p => (
                            <span key={p.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-xs text-primary">
                              {p.sku}
                              <button onClick={() => setSelectedProdutos(prev => prev.filter(s => s.id !== p.id))} className="hover:text-destructive"><X size={10} /></button>
                            </span>
                          ))}
                        </div>
                        {produtoLocais != null && (
                          <div className="mt-2 p-3 rounded-lg bg-secondary/30 border border-border flex items-center gap-2">
                            <Package size={14} className="text-primary" />
                            <span className="text-sm text-foreground font-medium">{produtoLocais} locais com saldo encontrados</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ROTATIVO */}
                {tipo === "ROTATIVO" && (
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className={labelClass}>Critério de Seleção</label>
                      <div className="flex flex-col gap-2 mt-1">
                        {[
                          { value: "MAIOR_GIRO", label: "Maior giro" },
                          { value: "MAIOR_DIVERGENCIA", label: "Maior divergência" },
                          { value: "TEMPO_SEM_CONTAGEM", label: "Tempo sem contagem" },
                        ].map(c => (
                          <label key={c.value} className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="criterio" value={c.value} checked={criterioRotativo === c.value} onChange={(e) => setCriterioRotativo(e.target.value)} className="w-4 h-4 accent-primary" />
                            <span className="text-sm text-foreground">{c.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="w-48">
                      <label className={labelClass}>Máx. Endereços/Dia</label>
                      <input type="number" value={maxEnderecosDia} onChange={(e) => setMaxEnderecosDia(e.target.value)} className={inputClass} />
                    </div>
                    <Toggle checked={prioPickingRotativo} onChange={setPrioPickingRotativo} label="Priorizar Picking" />
                    <div className="p-3 rounded-lg bg-secondary/30 border border-border flex items-center gap-2">
                      <BarChart3 size={14} className="text-primary" />
                      <span className="text-sm text-foreground font-medium">Estimativa diária: {maxEnderecosDia || 0} endereços/dia</span>
                    </div>
                  </div>
                )}

                {/* ZONA */}
                {tipo === "ZONA" && (
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className={labelClass}>Zona de Atividade</label>
                      {zonaLoading ? (
                        <div className="flex items-center gap-2 py-2"><Loader2 size={14} className="animate-spin text-muted-foreground" /><span className="text-xs text-muted-foreground">Carregando...</span></div>
                      ) : (
                        <select value={selectedZona} onChange={(e) => setSelectedZona(e.target.value)} className={inputClass}>
                          <option value="">Selecione...</option>
                          {zonas.map(z => <option key={z.id} value={z.id}>{z.descricao}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar summary */}
          <div className="w-72 shrink-0">
            <div className="card-surface p-5 sticky top-0">
              <h2 className="text-sm font-semibold text-foreground mb-4">Resumo</h2>
              {!tipo ? (
                <p className="text-xs text-muted-foreground">Selecione o tipo de inventário para ver o resumo.</p>
              ) : summaryLoading ? (
                <div className="flex items-center gap-2 py-4"><Loader2 size={14} className="animate-spin text-muted-foreground" /><span className="text-xs text-muted-foreground">Calculando...</span></div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                    <span className="text-xs text-muted-foreground">Tipo</span>
                    <span className="text-xs font-semibold text-foreground">{TIPO_OPTIONS.find(t => t.value === tipo)?.label}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                    <span className="text-xs text-muted-foreground">Total Endereços</span>
                    <span className="text-sm font-bold text-primary">{summaryData.enderecos.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                    <span className="text-xs text-muted-foreground">Total SKUs</span>
                    <span className="text-sm font-bold text-primary">{summaryData.skus.toLocaleString("pt-BR")}</span>
                  </div>
                  {summaryData.saldoEstimado > 0 && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                      <span className="text-xs text-muted-foreground">Saldo Estimado</span>
                      <span className="text-sm font-bold text-primary">{summaryData.saldoEstimado.toLocaleString("pt-BR")}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

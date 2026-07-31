import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, Info, BarChart3, Search, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseError } from "@/lib/errorMapper";

const TIPO_OPTIONS = [
  { value: "GERAL", label: "Geral" },
  { value: "ROTATIVO", label: "Rotativo" },
  { value: "ZONA", label: "Por Zona" },
  { value: "ENDERECO", label: "Por Endereço" },
  { value: "PRODUTO", label: "Por Produto" },
  { value: "GRUPO_PRODUTO", label: "Por Grupo de Produto" },
] as const;
type Tipo = typeof TIPO_OPTIONS[number]["value"] | "";

const CRITERIO_OPTIONS = [
  { value: "CURVA_VENDAS", label: "Curva de Vendas" },
  { value: "CURVA_ACESSO", label: "Curva de Acesso" },
  { value: "CORTES", label: "Cortes" },
  { value: "ESTORNOS", label: "Estornos" },
] as const;

const PERIODO_OPTIONS = [
  { value: "HOJE", label: "Data atual" },
  { value: "ONTEM", label: "Dia anterior" },
  { value: "7D", label: "Última semana" },
  { value: "15D", label: "Últimos 15 dias" },
  { value: "30D", label: "Último mês" },
] as const;
type PeriodoOpt = typeof PERIODO_OPTIONS[number]["value"];

// Retorna { inicio, fim } em ISO YYYY-MM-DD no fuso America/Fortaleza.
function todayFortaleza(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const d = parts.find(p => p.type === "day")!.value;
  return new Date(`${y}-${m}-${d}T00:00:00-03:00`);
}
function toISODate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
function resolvePeriodo(opt: PeriodoOpt): { inicio: string; fim: string } {
  const fim = todayFortaleza();
  const inicio = new Date(fim);
  switch (opt) {
    case "HOJE":  break;
    case "ONTEM": inicio.setDate(inicio.getDate() - 1); fim.setDate(fim.getDate() - 1); break;
    case "7D":    inicio.setDate(inicio.getDate() - 6); break;
    case "15D":   inicio.setDate(inicio.getDate() - 14); break;
    case "30D":   inicio.setDate(inicio.getDate() - 29); break;
  }
  return { inicio: toISODate(inicio), fim: toISODate(fim) };
}

const ERROR_MAP: Record<string, string> = {
  TIPO_TAREFA_NAO_CONFIGURADO: "Tipo de execução não configurado. Acesse Configurações > Inventário.",
  ESCOPO_ZONA_OBRIGATORIO: "Selecione uma zona de atividade.",
  ESCOPO_ENDERECO_OBRIGATORIO: "Selecione um endereço.",
  ESCOPO_PRODUTO_OBRIGATORIO: "Selecione um produto.",
  ESCOPO_GRUPO_OBRIGATORIO: "Selecione um grupo de produto.",
  CRITERIO_ROTATIVO_OBRIGATORIO: "Selecione o critério do inventário rotativo.",
  CURVA_OBRIGATORIA: "Selecione a curva (A, B, C ou D).",
  ARMAZEM_OBRIGATORIO: "Armazém não identificado. Recarregue a página.",
  TENANT_OBRIGATORIO: "Empresa não identificada. Recarregue a página.",
  INVENTARIO_NAO_ENCONTRADO: "Inventário não encontrado.",
  INVENTARIO_STATUS_INVALIDO: "Inventário em status inválido para gerar tarefas.",
  LOOP_SEM_PROGRESSO: "Geração de tarefas não avançou. Verifique os filtros e tente novamente.",
  PERIODO_OBRIGATORIO: "Selecione o período de análise.",
  ERRO_DESCONHECIDO: "Ocorreu um erro inesperado.",
};

// RPCs retornam { sucesso: boolean, codigo?: string, ... } — converte falha em throw.
const unwrap = (data: any) => {
  const j = Array.isArray(data) ? data[0] : data;
  if (j && j.sucesso === false) throw new Error(j.codigo || "ERRO_DESCONHECIDO");
  return j;
};

interface Option { id: string; label: string; sublabel?: string; }
interface Props { onNavigate: (path: string) => void; }

export function NovoInventarioPage({ onNavigate }: Props) {
  const { tenantId, empresaId, armazemId, usuarioId } = useTenant();

  // --- Dados Gerais
  const [tipo, setTipo] = useState<Tipo>("");
  const [descricao, setDescricao] = useState("");
  const [dataPlanejada, setDataPlanejada] = useState(() => toISODate(todayFortaleza()));
  const [tipoExecucao, setTipoExecucao] = useState("");
  const [bloquearMov, setBloquearMov] = useState(false);

  // --- Escopo ROTATIVO
  const [criterio, setCriterio] = useState<"" | "CURVA_VENDAS" | "CURVA_ACESSO" | "CORTES" | "ESTORNOS">("");
  const [curva, setCurva] = useState<"" | "A" | "B" | "C" | "D">("");
  const [maxEnderecosDia, setMaxEnderecosDia] = useState("");
  const [priorizarPicking, setPriorizarPicking] = useState(true);
  const [periodoAnalise, setPeriodoAnalise] = useState<PeriodoOpt>("30D");

  // --- Escopo ZONA / GRUPO (select simples)
  const [zonas, setZonas] = useState<Option[]>([]);
  const [zonaId, setZonaId] = useState("");
  const [grupos, setGrupos] = useState<Option[]>([]);
  const [grupoId, setGrupoId] = useState("");

  // --- Escopo ENDERECO / PRODUTO (combobox com busca)
  const [enderecoId, setEnderecoId] = useState("");
  const [enderecoLabel, setEnderecoLabel] = useState("");
  const [enderecoSearch, setEnderecoSearch] = useState("");
  const [enderecoResults, setEnderecoResults] = useState<Option[]>([]);
  const [enderecoLoading, setEnderecoLoading] = useState(false);
  const [enderecoOpen, setEnderecoOpen] = useState(false);

  const [produtoId, setProdutoId] = useState("");
  const [produtoLabel, setProdutoLabel] = useState("");
  const [produtoSearch, setProdutoSearch] = useState("");
  const [produtoResults, setProdutoResults] = useState<Option[]>([]);
  const [produtoLoading, setProdutoLoading] = useState(false);
  const [produtoOpen, setProdutoOpen] = useState(false);

  // --- Submissão
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<{ geradas: number; finalizado: boolean } | null>(null);

  // --- Resumo (prévia)
  const [resumo, setResumo] = useState<{ enderecos: number; skus: number; loading: boolean; truncado: boolean; erro: string | null; calculado: boolean }>({
    enderecos: 0, skus: 0, loading: false, truncado: false, erro: null, calculado: false,
  });

  const debounceRef = useRef<any>(null);
  const previewRef = useRef<any>(null);

  // Reset escopo ao trocar tipo
  useEffect(() => {
    setCriterio(""); setCurva(""); setMaxEnderecosDia(""); setPriorizarPicking(true); setPeriodoAnalise("30D");
    setZonaId(""); setGrupoId("");
    setEnderecoId(""); setEnderecoLabel(""); setEnderecoSearch(""); setEnderecoResults([]);
    setProdutoId(""); setProdutoLabel(""); setProdutoSearch(""); setProdutoResults([]);
  }, [tipo]);

  // Limpa curva quando critério não exige
  useEffect(() => {
    if (criterio !== "CURVA_VENDAS" && criterio !== "CURVA_ACESSO") setCurva("");
  }, [criterio]);

  // Tipos de execução disponíveis
  const TIPOS_EXEC = useMemo(() => [
    { value: "AUDITORIA", label: "Auditoria" },
    { value: "ATUALIZACAO", label: "Atualização" },
  ], []);

  // Carregar zonas
  useEffect(() => {
    if (tipo !== "ZONA" || !tenantId || !armazemId) return;
    (async () => {
      const { data } = await (supabase as any).from("zona_atividade")
        .select("id, descricao")
        .eq("tenant_id", tenantId).eq("armazem_id", armazemId)
        .order("descricao");
      setZonas((data || []).map((z: any) => ({ id: z.id, label: z.descricao })));
    })();
  }, [tipo, tenantId, armazemId]);

  // Carregar grupos
  useEffect(() => {
    if (tipo !== "GRUPO_PRODUTO" || !tenantId || !empresaId) return;
    (async () => {
      const { data } = await (supabase as any).from("grupo_produto")
        .select("id, descricao")
        .eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("ativo", true)
        .order("descricao");
      setGrupos((data || []).map((g: any) => ({ id: g.id, label: g.descricao })));
    })();
  }, [tipo, tenantId, empresaId]);

  // Busca endereços (debounce)
  useEffect(() => {
    if (tipo !== "ENDERECO" || !tenantId || !armazemId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setEnderecoLoading(true);
      let q = (supabase as any).from("endereco")
        .select("id, codigo_endereco, descricao")
        .eq("tenant_id", tenantId).eq("armazem_id", armazemId).eq("ativo", true)
        .order("codigo_endereco").limit(50);
      if (enderecoSearch) q = q.or(`codigo_endereco.ilike.%${enderecoSearch}%,descricao.ilike.%${enderecoSearch}%`);
      const { data } = await q;
      setEnderecoResults((data || []).map((e: any) => ({
        id: e.id,
        label: String(e.codigo_endereco ?? ""),
        sublabel: e.descricao || undefined,
      })));
      setEnderecoLoading(false);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [tipo, tenantId, armazemId, enderecoSearch]);

  // Busca produtos (debounce)
  useEffect(() => {
    if (tipo !== "PRODUTO" || !tenantId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!produtoSearch || produtoSearch.length < 2) { setProdutoResults([]); return; }
      setProdutoLoading(true);
      let q = (supabase as any).from("produto")
        .select("id, sku, descricao")
        .eq("tenant_id", tenantId).eq("ativo", true).limit(50);
      if (empresaId) q = q.eq("empresa_id", empresaId);
      q = q.or(`sku.ilike.%${produtoSearch}%,descricao.ilike.%${produtoSearch}%`);
      const { data } = await q;
      setProdutoResults((data || []).map((p: any) => ({ id: p.id, label: p.sku, sublabel: p.descricao })));
      setProdutoLoading(false);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [tipo, tenantId, empresaId, produtoSearch]);

  // Prévia: Total Endereços / SKUs por escopo (consulta estoque_geral)
  useEffect(() => {
    const RESET = { enderecos: 0, skus: 0, loading: false, truncado: false, erro: null as string | null, calculado: false };
    if (!tenantId || !empresaId || !armazemId || !tipo) {
      setResumo(RESET);
      return;
    }
    // Tipos que exigem seleção antes de calcular
    if (
      (tipo === "ZONA" && !zonaId) ||
      (tipo === "ENDERECO" && !enderecoId) ||
      (tipo === "PRODUTO" && !produtoId) ||
      (tipo === "GRUPO_PRODUTO" && !grupoId) ||
      (tipo === "ROTATIVO" && (!criterio || ((criterio === "CURVA_VENDAS" || criterio === "CURVA_ACESSO") && !curva)))
    ) {
      setResumo(RESET);
      return;
    }

    if (previewRef.current) clearTimeout(previewRef.current);
    const cancelled = { v: false };
    const done = (patch: Partial<typeof RESET>) => {
      if (!cancelled.v) setResumo({ ...RESET, calculado: true, ...patch });
    };
    previewRef.current = setTimeout(async () => {
      setResumo((r) => ({ ...r, loading: true, erro: null }));
      try {
        const LIMIT = 2000;
        // Pré-filtros: produtos por grupo / curva quando aplicável
        let produtoIdsFilter: string[] | null = null;
        if (tipo === "GRUPO_PRODUTO") {
          let pq = (supabase as any).from("produto")
            .select("id").eq("tenant_id", tenantId).eq("grupo_id", grupoId).eq("ativo", true).limit(5000);
          if (empresaId) pq = pq.eq("empresa_id", empresaId);
          const { data: ps, error: pErr } = await pq;
          if (pErr) throw pErr;
          produtoIdsFilter = (ps || []).map((p: any) => p.id);
          if (produtoIdsFilter.length === 0) { done({}); return; }
        }
        if (tipo === "ROTATIVO" && (criterio === "CURVA_VENDAS" || criterio === "CURVA_ACESSO")) {
          const col = criterio === "CURVA_VENDAS" ? "curva_venda" : "curva_acesso";
          let pq = (supabase as any).from("produto")
            .select("id").eq("tenant_id", tenantId).eq(col, curva).eq("ativo", true).limit(5000);
          if (empresaId) pq = pq.eq("empresa_id", empresaId);
          const { data: ps, error: pErr } = await pq;
          if (pErr) throw pErr;
          produtoIdsFilter = (ps || []).map((p: any) => p.id);
          if (produtoIdsFilter.length === 0) { done({}); return; }
        }

        // Atalhos por tipo de escopo único
        if (tipo === "ENDERECO") {
          const { data, error } = await (supabase as any).from("estoque_geral")
            .select("produto_id")
            .eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("endereco_id", enderecoId)
            .gt("quantidade_total", 0)
            .limit(LIMIT);
          if (error) throw error;
          const skus = new Set((data || []).map((r: any) => r.produto_id));
          done({ enderecos: skus.size > 0 ? 1 : 0, skus: skus.size });
          return;
        }

        // Query genérica via embed em endereco (filtra armazem + situação)
        let q = (supabase as any).from("estoque_geral")
          .select("endereco_id, produto_id, endereco!inner(armazem_id)")
          .eq("tenant_id", tenantId)
          .eq("empresa_id", empresaId)
          .eq("endereco.armazem_id", armazemId)
          .gt("quantidade_total", 0)
          .limit(LIMIT);

        if (tipo === "PRODUTO") q = q.eq("produto_id", produtoId);
        if (tipo === "ZONA") {
          const { data: ez, error: ezErr } = await (supabase as any).from("endereco_zona_atividade")
            .select("endereco_id").eq("tenant_id", tenantId).eq("zona_atividade_id", zonaId).limit(5000);
          if (ezErr) throw ezErr;
          const ids = (ez || []).map((r: any) => r.endereco_id);
          if (ids.length === 0) { done({}); return; }
          q = q.in("endereco_id", ids);
        }
        if (produtoIdsFilter) q = q.in("produto_id", produtoIdsFilter);

        const { data, error } = await q;
        if (error) throw error;
        const rows = data || [];
        const setE = new Set<string>(); const setP = new Set<string>();
        for (const r of rows) { setE.add(r.endereco_id); setP.add(r.produto_id); }
        done({
          enderecos: setE.size,
          skus: tipo === "PRODUTO" ? (setE.size > 0 ? 1 : 0) : setP.size,
          truncado: rows.length >= LIMIT,
        });
      } catch (err: unknown) {
        const parsed = parseError(err, "inventario-preview");
        done({ erro: parsed.title || "Erro ao calcular o resumo" });
      }
    }, 250);
    return () => { cancelled.v = true; clearTimeout(previewRef.current); };
  }, [tipo, tenantId, empresaId, armazemId, zonaId, enderecoId, produtoId, grupoId, criterio, curva]);



  // Validação
  const isValid = useMemo(() => {
    if (!tipo || !tipoExecucao) return false;
    if (tipo === "ZONA") return !!zonaId;
    if (tipo === "ENDERECO") return !!enderecoId;
    if (tipo === "PRODUTO") return !!produtoId;
    if (tipo === "GRUPO_PRODUTO") return !!grupoId;
    if (tipo === "ROTATIVO") {
      if (!criterio) return false;
      if ((criterio === "CURVA_VENDAS" || criterio === "CURVA_ACESSO") && !curva) return false;
      if ((criterio === "CORTES" || criterio === "ESTORNOS") && !periodoAnalise) return false;
    }
    return true;
  }, [tipo, tipoExecucao, zonaId, enderecoId, produtoId, grupoId, criterio, curva, periodoAnalise]);

  const mapError = (err: any): string => {
    const raw = err?.message || String(err);
    for (const code in ERROR_MAP) if (raw.includes(code)) return ERROR_MAP[code];
    return raw;
  };

  const handleSave = async () => {
    if (!isValid) { toast.error("Preencha todos os campos obrigatórios."); return; }
    if (!tenantId || !empresaId || !armazemId) { toast.error(ERROR_MAP.ARMAZEM_OBRIGATORIO); return; }
    setSaving(true);
    setSaveError(null);
    setProgresso(null);
    try {
      // Pré-checagem: tipo de execução precisa estar configurado para o tenant
      const { data: cfg } = await (supabase as any).from("inventario_tipo_tarefa")
        .select("tipo_tarefa_id")
        .eq("tenant_id", tenantId)
        .eq("tipo_execucao", tipoExecucao)
        .maybeSingle();
      if (!cfg) throw new Error("TIPO_TAREFA_NAO_CONFIGURADO");

      const payload: any = {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_armazem_id: armazemId,
        p_usuario_id: usuarioId,
        p_descricao: descricao || null,
        p_tipo_inventario: tipo,
        p_tipo_execucao: tipoExecucao,
        p_bloquear_movimentacao: bloquearMov,
        p_data_planejada: dataPlanejada || null,
        p_zona_atividade_id: tipo === "ZONA" ? zonaId : null,
        p_endereco_id: tipo === "ENDERECO" ? enderecoId : null,
        p_produto_id: tipo === "PRODUTO" ? produtoId : null,
        p_grupo_produto_id: tipo === "GRUPO_PRODUTO" ? grupoId : null,
        p_criterio_selecao: tipo === "ROTATIVO" ? criterio : null,
        p_curva: tipo === "ROTATIVO" && (criterio === "CURVA_VENDAS" || criterio === "CURVA_ACESSO") ? curva : null,
        p_max_enderecos_dia: tipo === "ROTATIVO" && maxEnderecosDia ? Number(maxEnderecosDia) : null,
        p_priorizar_picking: tipo === "ROTATIVO" ? priorizarPicking : false,
        p_data_inicio_analise: tipo === "ROTATIVO" && (criterio === "CORTES" || criterio === "ESTORNOS")
          ? resolvePeriodo(periodoAnalise).inicio : null,
        p_data_fim_analise: tipo === "ROTATIVO" && (criterio === "CORTES" || criterio === "ESTORNOS")
          ? resolvePeriodo(periodoAnalise).fim : null,
      };
      const { data, error } = await supabase.rpc("fn_criar_inventario_v2" as any, payload);
      if (error) throw error;
      const inv = unwrap(data);
      const inventarioId = inv?.inventario_id;
      if (!inventarioId) throw new Error("Inventário não retornado pelo backend.");

      // Verificar se precisa gerar tarefas ou se é contagem livre (GERAL)
      const proximoPasso = inv?.proximo_passo;

      if (proximoPasso === 'PRONTO') {
        // Inventário GERAL: contagem livre — não gerar tarefas
        toast.success("Inventário geral criado! Pronto para contagem livre no coletor.");
        onNavigate("/atividades/inventario");
      } else {
        // Demais tipos: loop de geração de tarefas (fluxo original)
        let acumulado = 0;
        let finalizado = false;
        let safety = 500;
        while (!finalizado && safety-- > 0) {
          const { data: gen, error: genErr } = await supabase.rpc("fn_gerar_tarefas_inventario" as any, {
            p_tenant_id: tenantId,
            p_inventario_id: inventarioId,
            p_chunk_size: 200,
          });
          if (genErr) throw genErr;
          const g: any = unwrap(gen);
          const geradasChunk = Number(g?.tarefas_geradas || 0);
          acumulado += geradasChunk;
          finalizado = !!g?.finalizado;
          setProgresso({ geradas: acumulado, finalizado });
          if (!finalizado && geradasChunk === 0) throw new Error("LOOP_SEM_PROGRESSO");
        }
        toast.success(`Inventário criado com ${acumulado} ${acumulado === 1 ? "tarefa" : "tarefas"}.`);
        onNavigate("/atividades/inventario");
      }
    } catch (err: any) {
      const msg = mapError(err);
      setSaveError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // --- estilos
  const inputClass = "h-9 px-3 rounded-md border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary w-full";
  const labelClass = "block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider";

  const Toggle = ({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) => (
    <label className={cn("flex items-center gap-3 group", disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer")}>
      <div className={cn("w-10 h-5 rounded-full transition-colors relative", checked ? "bg-primary" : "bg-secondary")} onClick={() => !disabled && onChange(!checked)}>
        <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
      </div>
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );

  // Combobox component
  const Combobox = ({ value, label, results, loading, open, setOpen, search, setSearch, onPick, placeholder, emptyMsg }: any) => (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(inputClass, "text-left flex items-center justify-between")}
      >
        <span className={cn(!value && "text-muted-foreground")}>{label || placeholder}</span>
        <Search size={12} className="text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-md shadow-lg max-h-72 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full h-8 px-2 bg-secondary/40 rounded text-sm text-foreground outline-none border border-border focus:border-primary"
            />
          </div>
          <div className="overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-4"><Loader2 size={14} className="animate-spin text-muted-foreground" /></div>
            ) : results.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">{emptyMsg}</p>
            ) : results.map((r: Option) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { onPick(r); setOpen(false); }}
                className={cn("w-full text-left px-3 py-2 text-xs hover:bg-secondary/50 border-b border-border/30 last:border-0 flex items-center gap-2", value === r.id && "bg-primary/5")}
              >
                {value === r.id && <Check size={12} className="text-primary shrink-0" />}
                <span className="font-mono font-semibold text-primary">{r.label}</span>
                {r.sublabel && <span className="text-muted-foreground truncate">{r.sublabel}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const tipoLabel = TIPO_OPTIONS.find(t => t.value === tipo)?.label || "—";
  const execLabel = TIPOS_EXEC.find(t => t.value === tipoExecucao)?.label || "—";

  const buttonText = saving
  const semEstoque = false;
    ? (progresso ? `Gerando tarefas... (${progresso.geradas})` : "Criando...")
    : "Criar Inventário";

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 animate-fade-in">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">Novo Inventário</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => onNavigate("/atividades/inventario")} disabled={saving}
            className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isValid}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {buttonText}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="shrink-0 flex items-start gap-2 p-3 rounded-lg border border-destructive/40 bg-destructive/10">
          <AlertTriangle size={14} className="text-destructive mt-0.5 shrink-0" />
          <div className="text-xs text-destructive-foreground/90">
            <p className="font-semibold text-destructive">Não foi possível criar o inventário</p>
            <p className="mt-0.5">{saveError}</p>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="flex gap-4 min-h-full">
          {/* Form */}
          <div className="flex-1 flex flex-col gap-4">
            {/* Dados Gerais */}
            <div className="card-surface p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Dados Gerais</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Tipo Inventário *</label>
                  <select value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)} className={inputClass}>
                    <option value="">Selecione...</option>
                    {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Data Planejada</label>
                  <input type="date" value={dataPlanejada} onChange={(e) => setDataPlanejada(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Descrição</label>
                  <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição do inventário" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} title="Auditoria: registra divergência sem alterar estoque. Atualização: atualiza o saldo ao confirmar.">
                    Tipo de Execução *
                  </label>
                  <select value={tipoExecucao} onChange={(e) => setTipoExecucao(e.target.value)} className={inputClass}>
                    <option value="">Selecione...</option>
                    {TIPOS_EXEC.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <Toggle checked={bloquearMov} onChange={setBloquearMov} label="Bloquear movimentações do endereço durante a contagem" />
                </div>
              </div>
            </div>

            {/* Escopo */}
            {tipo && (
              <div className="card-surface p-5 transition-all duration-200">
                <h2 className="text-sm font-semibold text-foreground mb-4">Escopo do Inventário</h2>

                {tipo === "GERAL" && (
                  <div className="p-3 rounded-lg bg-secondary/30 border border-border flex items-start gap-2">
                    <Info size={14} className="text-primary shrink-0 mt-0.5" />
                    <span className="text-sm text-foreground">
                      Inventário de contagem livre — o operador escaneia qualquer endereço e produto diretamente no coletor. Nenhuma tarefa será pré-gerada.
                    </span>
                  </div>
                )}

                {tipo === "ROTATIVO" && (
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className={labelClass}>Critério de Seleção *</label>
                      <div className="flex flex-col gap-2 mt-1">
                        {CRITERIO_OPTIONS.map(c => (
                          <label key={c.value} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio" name="criterio" value={c.value}
                              checked={criterio === c.value}
                              onChange={() => setCriterio(c.value)}
                              className="w-4 h-4 accent-primary"
                            />
                            <span className="text-sm text-foreground">{c.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {(criterio === "CURVA_VENDAS" || criterio === "CURVA_ACESSO") && (
                      <div className="w-48 transition-all duration-200">
                        <label className={labelClass}>Curva *</label>
                        <select value={curva} onChange={(e) => setCurva(e.target.value as any)} className={inputClass}>
                          <option value="">Selecione...</option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                          <option value="D">D</option>
                        </select>
                      </div>
                    )}

                    {(criterio === "CORTES" || criterio === "ESTORNOS") && (
                      <div className="w-64 transition-all duration-200">
                        <label className={labelClass}>Período de Análise *</label>
                        <select value={periodoAnalise} onChange={(e) => setPeriodoAnalise(e.target.value as PeriodoOpt)} className={inputClass}>
                          {PERIODO_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </div>
                    )}


                    <div className="w-48">
                      <label className={labelClass}>Máx. Endereços/Dia</label>
                      <input type="number" min={1} value={maxEnderecosDia}
                        onChange={(e) => setMaxEnderecosDia(e.target.value)}
                        placeholder="Ex: 50" className={inputClass} />
                    </div>

                    <Toggle checked={priorizarPicking} onChange={setPriorizarPicking} label="Priorizar endereços de Picking" />

                    {maxEnderecosDia && (
                      <div className="p-3 rounded-lg bg-secondary/30 border border-border flex items-center gap-2">
                        <BarChart3 size={14} className="text-primary" />
                        <span className="text-sm text-foreground font-medium">
                          Estimativa diária: {maxEnderecosDia} endereços/dia
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {tipo === "ZONA" && (
                  <div>
                    <label className={labelClass}>Zona de Atividade *</label>
                    {zonas.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">Nenhuma zona cadastrada para este armazém.</p>
                    ) : (
                      <select value={zonaId} onChange={(e) => setZonaId(e.target.value)} className={inputClass}>
                        <option value="">Selecione a zona</option>
                        {zonas.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
                      </select>
                    )}
                  </div>
                )}

                {tipo === "ENDERECO" && (
                  <div>
                    <label className={labelClass}>Endereço *</label>
                    <Combobox
                      value={enderecoId}
                      label={enderecoLabel}
                      results={enderecoResults}
                      loading={enderecoLoading}
                      open={enderecoOpen}
                      setOpen={setEnderecoOpen}
                      search={enderecoSearch}
                      setSearch={setEnderecoSearch}
                      onPick={(o: Option) => { setEnderecoId(o.id); setEnderecoLabel(o.label); }}
                      placeholder="Buscar endereço..."
                      emptyMsg="Nenhum endereço encontrado."
                    />
                  </div>
                )}

                {tipo === "PRODUTO" && (
                  <div>
                    <label className={labelClass}>Produto *</label>
                    <Combobox
                      value={produtoId}
                      label={produtoLabel}
                      results={produtoResults}
                      loading={produtoLoading}
                      open={produtoOpen}
                      setOpen={setProdutoOpen}
                      search={produtoSearch}
                      setSearch={setProdutoSearch}
                      onPick={(o: Option) => { setProdutoId(o.id); setProdutoLabel(`${o.label} — ${o.sublabel || ""}`); }}
                      placeholder="Buscar por SKU ou descrição..."
                      emptyMsg={produtoSearch.length < 2 ? "Digite ao menos 2 caracteres." : "Nenhum produto encontrado."}
                    />
                  </div>
                )}

                {tipo === "GRUPO_PRODUTO" && (
                  <div>
                    <label className={labelClass}>Grupo de Produto *</label>
                    <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)} className={inputClass}>
                      <option value="">Selecione o grupo</option>
                      {grupos.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Resumo */}
          <div className="w-72 shrink-0 hidden lg:block">
            <div className="card-surface p-5 sticky top-0">
              <h2 className="text-xs font-semibold text-muted-foreground mb-4 uppercase tracking-widest">Resumo</h2>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                  <span className="text-xs text-muted-foreground">Tipo</span>
                  <span className="text-xs font-semibold text-foreground">{tipoLabel}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                  <span className="text-xs text-muted-foreground">Execução</span>
                  <span className="text-xs font-semibold text-foreground">{execLabel}</span>
                </div>
                {resumo.erro ? (
                  <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/40 bg-destructive/10">
                    <AlertTriangle size={13} className="text-destructive mt-0.5 shrink-0" />
                    <div className="text-[11px] leading-snug">
                      <p className="font-semibold text-destructive">Erro ao calcular o resumo</p>
                      <p className="text-muted-foreground mt-0.5">{resumo.erro}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                      <span className="text-xs text-muted-foreground">Total Endereços</span>
                      <span className="text-sm font-bold text-primary flex items-center gap-1">
                        {resumo.loading ? <Loader2 size={12} className="animate-spin" /> : !resumo.calculado ? <span className="text-muted-foreground font-normal text-xs">—</span> : <>{resumo.enderecos}{resumo.truncado && "+"}</>}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                      <span className="text-xs text-muted-foreground">Total SKUs</span>
                      <span className="text-sm font-bold text-primary flex items-center gap-1">
                        {resumo.loading ? <Loader2 size={12} className="animate-spin" /> : !resumo.calculado ? <span className="text-muted-foreground font-normal text-xs">—</span> : <>{resumo.skus}{resumo.truncado && "+"}</>}
                      </span>
                    </div>
                    {semEstoque && (
                      <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10">
                        <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />
                        <p className="text-[11px] leading-snug text-amber-200/90">
                          Nenhuma posição com saldo no armazém selecionado para este escopo. Nenhuma tarefa de inventário será gerada.
                        </p>
                      </div>
                    )}
                  </>
                )}
                {progresso && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/30">
                    <span className="text-xs text-muted-foreground">Tarefas geradas</span>
                    <span className="text-sm font-bold text-primary">{progresso.geradas}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile summary banner */}
      <div className="lg:hidden shrink-0 card-surface p-3 flex items-center justify-around text-xs">
        <div className="flex flex-col items-center"><span className="text-muted-foreground">Tipo</span><span className="font-semibold text-foreground">{tipoLabel}</span></div>
        <div className="flex flex-col items-center"><span className="text-muted-foreground">Execução</span><span className="font-semibold text-foreground">{execLabel}</span></div>
        <div className="flex flex-col items-center"><span className="text-muted-foreground">Endereços</span><span className="font-bold text-primary">{resumo.loading ? "…" : `${resumo.enderecos}${resumo.truncado ? "+" : ""}`}</span></div>
        <div className="flex flex-col items-center"><span className="text-muted-foreground">SKUs</span><span className="font-bold text-primary">{resumo.loading ? "…" : `${resumo.skus}${resumo.truncado ? "+" : ""}`}</span></div>
      </div>
    </div>
  );
}

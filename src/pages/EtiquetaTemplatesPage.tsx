import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { type EtiquetaConfig, type CampoEtiqueta, type TipoEtiquetaConfig } from "@/hooks/useEtiquetaTemplate";
import { parseError } from "@/lib/errorMapper";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { EtiquetaEnderecoPreview } from "@/components/etiqueta/EtiquetaEnderecoPreview";
import { EtiquetaHUPreview } from "@/components/etiqueta/EtiquetaHUPreview";
import { EtiquetaProdutoPreview } from "@/components/etiqueta/EtiquetaProdutoPreview";
import { EtiquetaVolumePreview } from "@/components/etiqueta/EtiquetaVolumePreview";
import { gerarZplTemplate } from "@/lib/zplGenerator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MapPin,
  Package,
  Barcode,
  Box,
  ArrowUp,
  ArrowDown,
  Loader2,
  Save,
  Building2,
  Info,
  Plus,
  Trash2,
  Star,
  Code,
  Eye,
  Printer,
  Copy,
  RefreshCw,
} from "lucide-react";

interface Props {
  onNavigate: (path: string) => void;
}

const TIPOS: { key: TipoEtiquetaConfig; label: string; icon: React.ReactNode }[] = [
  { key: "ENDERECO", label: "Endereço", icon: <MapPin size={14} /> },
  { key: "HU", label: "HU", icon: <Package size={14} /> },
  { key: "PRODUTO", label: "Produto", icon: <Barcode size={14} /> },
  { key: "VOLUME", label: "Volume", icon: <Box size={14} /> },
];

interface Empresa {
  id: string;
  razaosocial: string;
  codigo: string | null;
}

const DEFAULT_CAMPOS_BY_TIPO: Record<TipoEtiquetaConfig, CampoEtiqueta[]> = {
  ENDERECO: [
    { chave: "descricao", label: "Descrição", ativo: true, ordem: 1 },
    { chave: "codigo_endereco", label: "Código", ativo: true, ordem: 2 },
  ],
  HU: [
    { chave: "codigo_hu", label: "Código HU", ativo: true, ordem: 1 },
    { chave: "tipo_hu", label: "Tipo de HU", ativo: true, ordem: 2 },
    { chave: "tamanho", label: "Tamanho", ativo: true, ordem: 3 },
    { chave: "parceiro_nome", label: "Fornecedor", ativo: true, ordem: 4 },
    { chave: "numero_movimento", label: "Nº Movimento", ativo: true, ordem: 5 },
    { chave: "numero_nota", label: "Nº Nota Fiscal", ativo: true, ordem: 6 },
    { chave: "data_entrada", label: "Data Entrada", ativo: true, ordem: 7 },
    { chave: "lote_principal", label: "Lote", ativo: true, ordem: 8 },
    { chave: "validade_proxima", label: "Validade", ativo: true, ordem: 9 },
    { chave: "total_quantidade", label: "Qtd Total", ativo: false, ordem: 10 },
    { chave: "total_itens", label: "Qtd SKUs", ativo: false, ordem: 11 },
    { chave: "peso_bruto", label: "Peso Bruto (kg)", ativo: false, ordem: 12 },
  ],
  PRODUTO: [
    { chave: "sku", label: "SKU", ativo: true, ordem: 1 },
    { chave: "descricao", label: "Descrição", ativo: true, ordem: 2 },
    { chave: "ean", label: "EAN", ativo: true, ordem: 3 },
  ],
  VOLUME: [
    { chave: "codigo_volume", label: "Código", ativo: true, ordem: 1 },
    { chave: "parceiro_nome", label: "Cliente", ativo: true, ordem: 2 },
  ],
};

function parseTemplateRow(row: any): EtiquetaConfig {
  return {
    ...row,
    campos: typeof row.campos === "string" ? JSON.parse(row.campos) : row.campos,
  };
}

export function EtiquetaTemplatesPage({ onNavigate }: Props) {
  const { tenantId } = useTenant();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaSel, setEmpresaSel] = useState<string>(""); // "" = padrão do tenant
  const [tipo, setTipo] = useState<TipoEtiquetaConfig>("ENDERECO");

  const [templates, setTemplates] = useState<EtiquetaConfig[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadFlag, setReloadFlag] = useState(0);

  const [draft, setDraft] = useState<EtiquetaConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [zplCode, setZplCode] = useState<string>("");
  const [zplEditado, setZplEditado] = useState(false);
  const [zplPreviewUrl, setZplPreviewUrl] = useState<string | null>(null);
  const [zplPreviewLoading, setZplPreviewLoading] = useState(false);
  const [zplPreviewError, setZplPreviewError] = useState<string | null>(null);

  // Limpa objectURL ao desmontar / trocar
  useEffect(() => {
    return () => {
      if (zplPreviewUrl) URL.revokeObjectURL(zplPreviewUrl);
    };
  }, [zplPreviewUrl]);

  const gerarPreviewTermica = useCallback(async () => {
    if (!zplCode || !draft) return;
    setZplPreviewLoading(true);
    setZplPreviewError(null);
    try {
      const dadosMock: Record<string, string> = {
        codigo_volume: "VOL-000000001",
        parceiro_nome: "CLIENTE EXEMPLO LTDA",
        destino_carga: "SAO PAULO / SP",
        numero_onda: "42",
        numero_volume: "01",
        total_volumes: "05",
        data_hora: "20/07/2026 10:00",
        usuario: "OPERADOR",
        peso: "12.5",
        nota_fiscal: "123456",
        pedido: "PED-000123",
        transportadora: "TRANSPORTE X",
        observacao: "Manuseio cuidadoso",
        codigo_hu: "HU-000000001",
        tipo_hu: "PALLET",
        tamanho: "M",
        numero_movimento: "131",
        numero_nota: "250",
        data_entrada: "21/07/2026",
        lote_principal: "L2026-A",
        validade_proxima: "15/12/2026",
        total_quantidade: "150",
        total_itens: "3",
        peso_bruto: "45.5",
        sku: "SKU-001",
        descricao: "PRODUTO EXEMPLO 500ML",
        ean: "7891234567890",
        embalagem: "CAIXA",
        marca: "MARCA X",
        referencia: "REF-001",
        codigo_endereco: "12345",
        tipo_endereco: "PICKING",
        curva_acesso: "A",
      };
      let zplComDados = zplCode;
      for (const [chave, valor] of Object.entries(dadosMock)) {
        zplComDados = zplComDados.split(`{{${chave}}}`).join(valor);
      }
      zplComDados = zplComDados.replace(/\{\{[^}]+\}\}/g, "---");

      const largPol = ((draft.largura_mm || 100) / 25.4).toFixed(2);
      const altPol = ((draft.altura_mm || 40) / 25.4).toFixed(2);
      const path = `v1/printers/8dpmm/labels/${largPol}x${altPol}/0/`;

      let response: Response;
      try {
        response = await fetch(`https://api.labelary.com/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: zplComDados,
        });
      } catch {
        response = await fetch(`http://api.labelary.com/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: zplComDados,
        });
      }
      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(errText || `Labelary retornou ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setZplPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err: any) {
      setZplPreviewError(err?.message || "Erro ao gerar preview");
      setZplPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } finally {
      setZplPreviewLoading(false);
    }
  }, [zplCode, draft]);


  // Carrega empresas do tenant
  useEffect(() => {
    if (!tenantId) return;
    (supabase as any)
      .from("empresa")
      .select("id, razaosocial, codigo")
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .order("razaosocial")
      .then(({ data }: any) => setEmpresas(data || []));
  }, [tenantId]);

  // Carrega TODOS os templates do tipo/empresa
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { data, error } = await (supabase.rpc as any)(
          "listar_etiqueta_templates",
          { p_tipo: tipo, p_empresa_id: empresaSel || null }
        );
        if (cancelled) return;
        if (error) throw error;
        const parsed = (data || []).map(parseTemplateRow);
        setTemplates(parsed);
        // Seleciona padrão ou primeiro
        const padrao = parsed.find((t: EtiquetaConfig) => t.padrao);
        setSelectedTemplateId(padrao?.id || parsed[0]?.id || null);
      } catch (err: any) {
        if (!cancelled) {
          setTemplates([]);
          setSelectedTemplateId(null);
          const parsed = parseError(err, "carregar templates");
          toast.error(parsed.title);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tipo, empresaSel, reloadFlag]);

  const reload = useCallback(() => setReloadFlag((v) => v + 1), []);

  // Sincroniza draft ao trocar seleção
  useEffect(() => {
    const selected = templates.find((t) => t.id === selectedTemplateId);
    if (selected) {
      setDraft(structuredClone(selected));
      if (selected.corpo_zpl) {
        setZplCode(selected.corpo_zpl);
        setZplEditado(true);
      } else {
        setZplEditado(false);
      }
    } else {
      setDraft(null);
      setZplCode("");
      setZplEditado(false);
    }
  }, [selectedTemplateId, templates]);

  // Auto-gera ZPL a partir do draft (se não foi editado manualmente)
  useEffect(() => {
    if (!draft || zplEditado) return;
    try {
      const zpl = gerarZplTemplate(tipo, draft);
      setZplCode(zpl);
    } catch (err) {
      console.warn("[ZPL Generator]", err);
      setZplCode("// Erro ao gerar ZPL");
    }
  }, [draft, tipo, zplEditado]);


  const handleFieldToggle = (chave: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      campos: draft.campos.map((c) => (c.chave === chave ? { ...c, ativo: !c.ativo } : c)),
    });
  };

  const moveField = (idx: number, dir: -1 | 1) => {
    if (!draft) return;
    const arr = [...draft.campos];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    const reordered = arr.map((c, i) => ({ ...c, ordem: i + 1 }));
    setDraft({ ...draft, campos: reordered });
  };

  const handleSave = async () => {
    if (!draft || !tenantId) return;
    setSaving(true);
    try {
      const payload = {
        nome: draft.nome,
        tamanho: draft.tamanho,
        orientacao: draft.orientacao,
        com_cabecalho: draft.com_cabecalho,
        com_logo: draft.com_logo,
        logo_url: draft.logo_url,
        campos: draft.campos,
        largura_mm: draft.largura_mm,
        altura_mm: draft.altura_mm,
        duas_colunas: draft.duas_colunas,
        intervalo_colunas_mm: draft.intervalo_colunas_mm,
        direcao_seta: draft.direcao_seta,
        escala_fonte: draft.escala_fonte,
        corpo_zpl: zplCode || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await (supabase as any)
        .from("etiqueta_template")
        .update(payload)
        .eq("id", draft.id);
      if (error) throw error;
      toast.success("Template salvo com sucesso!");
      reload();
    } catch (err: any) {
      const parsed = parseError(err, "salvar template de etiqueta");
      toast.error(parsed.title);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateNew = async () => {
    if (!tenantId) return;
    try {
      const baseCampos = templates[0]?.campos || DEFAULT_CAMPOS_BY_TIPO[tipo];
      const isHU = tipo === "HU";
      const payload = {
        tenant_id: tenantId,
        empresa_id: empresaSel || null,
        tipo,
        nome: `Novo Template ${tipo}`,
        tamanho: isHU ? "100x70" : "100x40",
        orientacao: "horizontal",
        largura_mm: 100,
        altura_mm: isHU ? 70 : 40,
        com_cabecalho: true,
        com_logo: false,
        logo_url: null,
        campos: baseCampos,
        padrao: false,
        ativo: true,
        duas_colunas: false,
        intervalo_colunas_mm: 3,
        direcao_seta: "NENHUMA",
        escala_fonte: 1.0,
      };
      const { data, error } = await (supabase as any)
        .from("etiqueta_template")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      toast.success("Template criado!");
      // Recarrega e seleciona o novo
      const newId = data?.id;
      setReloadFlag((v) => v + 1);
      if (newId) {
        // aguarda o effect recarregar e então selecionar
        setTimeout(() => setSelectedTemplateId(newId), 0);
      }
    } catch (err: any) {
      const parsed = parseError(err, "criar template");
      toast.error(parsed.title);
    }
  };

  const handleDelete = async (): Promise<boolean> => {
    if (!draft) return false;
    if (draft.padrao) {
      toast.error("Não é possível excluir o template padrão.");
      return false;
    }
    try {
      const { error } = await (supabase as any)
        .from("etiqueta_template")
        .update({ ativo: false, updated_at: new Date().toISOString() })
        .eq("id", draft.id);
      if (error) throw error;
      toast.success("Template excluído.");
      setSelectedTemplateId(null);
      reload();
      return true;
    } catch (err: any) {
      const parsed = parseError(err, "excluir template");
      toast.error(parsed.title);
      return false;
    }
  };

  const handleSetPadrao = async () => {
    if (!draft || !tenantId || draft.padrao) return;
    try {
      // Desmarca padrão atual no mesmo escopo (tenant + tipo + empresa)
      let unsetQuery = (supabase as any)
        .from("etiqueta_template")
        .update({ padrao: false, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("tipo", tipo)
        .eq("ativo", true);
      if (empresaSel) {
        unsetQuery = unsetQuery.eq("empresa_id", empresaSel);
      } else {
        unsetQuery = unsetQuery.is("empresa_id", null);
      }
      const { error: e1 } = await unsetQuery;
      if (e1) throw e1;

      // Marca este como padrão
      const { error: e2 } = await (supabase as any)
        .from("etiqueta_template")
        .update({ padrao: true, updated_at: new Date().toISOString() })
        .eq("id", draft.id);
      if (e2) throw e2;

      toast.success("Template definido como padrão!");
      reload();
    } catch (err: any) {
      const parsed = parseError(err, "definir padrão");
      toast.error(parsed.title);
    }
  };

  const previewConfig = useMemo(() => {
    if (!draft) return undefined;
    return {
      tamanho: draft.tamanho,
      orientacao: draft.orientacao,
      com_cabecalho: draft.com_cabecalho,
      com_logo: draft.com_logo,
      logo_url: draft.logo_url,
      campos: draft.campos,
      largura_mm: draft.largura_mm,
      altura_mm: draft.altura_mm,
      duas_colunas: draft.duas_colunas,
      intervalo_colunas_mm: draft.intervalo_colunas_mm,
      direcao_seta: draft.direcao_seta,
      escala_fonte: draft.escala_fonte,
    };
  }, [draft]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Templates de Etiqueta</h1>
          <p className="text-xs text-muted-foreground">
            Configure múltiplos templates por tipo. Marque um como padrão para ser pré-selecionado nos modais de impressão.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
        {/* Controles */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <Building2 size={12} /> Empresa
              </label>
              <select
                value={empresaSel}
                onChange={(e) => setEmpresaSel(e.target.value)}
                className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Padrão do Tenant</option>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.codigo ? `${e.codigo} · ` : ""}{e.razaosocial}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Tipo</label>
              <div className="grid grid-cols-4 gap-1.5">
                {TIPOS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTipo(t.key)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-md text-[11px] font-medium border transition-colors ${
                      tipo === t.key
                        ? "bg-primary/15 text-primary border-primary/40"
                        : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                    }`}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lista de templates */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Templates ({templates.length})
                </span>
                <button
                  onClick={handleCreateNew}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                >
                  <Plus size={14} /> Novo template
                </button>
              </div>

              {loading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                  <Loader2 size={12} className="animate-spin" /> Carregando...
                </div>
              ) : templates.length === 0 ? (
                <div className="flex items-start gap-2 bg-muted/40 border border-border rounded-md px-2.5 py-2 text-[11px] text-muted-foreground">
                  <Info size={12} className="mt-0.5 shrink-0" />
                  <span>Nenhum template cadastrado. Clique em "Novo template" para criar.</span>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[260px] overflow-auto pr-1">
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTemplateId(t.id)}
                      className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                        selectedTemplateId === t.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-muted-foreground bg-secondary/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{t.nome}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {t.padrao && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-semibold">
                              PADRÃO
                            </span>
                          )}
                          {t.empresa_id == null && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-semibold">
                              TENANT
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {t.largura_mm}×{t.altura_mm}mm · {t.orientacao}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {loading || !draft ? (
            <div className="bg-card border border-border rounded-lg p-6 flex items-center justify-center text-muted-foreground text-sm">
              {loading ? (
                <><Loader2 size={14} className="animate-spin mr-2" /> Carregando template...</>
              ) : (
                <span>Selecione ou crie um template para editar.</span>
              )}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                    Nome do Template
                  </label>
                  <input
                    type="text"
                    value={draft.nome}
                    onChange={(e) => setDraft({ ...draft, nome: e.target.value })}
                    className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <button
                  onClick={handleSetPadrao}
                  disabled={draft.padrao}
                  title={draft.padrao ? "Já é o padrão" : "Marcar como padrão"}
                  className={`mt-5 flex items-center gap-1 px-2.5 py-2 rounded-md border text-xs transition-colors ${
                    draft.padrao
                      ? "border-primary/40 bg-primary/10 text-primary cursor-default"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  <Star size={12} className={draft.padrao ? "fill-current" : ""} />
                  {draft.padrao ? "Padrão" : "Tornar padrão"}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Tamanho</label>
                  <input
                    type="text"
                    value={draft.tamanho}
                    onChange={(e) => setDraft({ ...draft, tamanho: e.target.value })}
                    placeholder="100x40"
                    className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Orientação</label>
                  <select
                    value={draft.orientacao}
                    onChange={(e) => {
                      const newOri = e.target.value as "horizontal" | "vertical";
                      if (newOri !== draft.orientacao) {
                        setDraft({
                          ...draft,
                          orientacao: newOri,
                          largura_mm: draft.altura_mm,
                          altura_mm: draft.largura_mm,
                        });
                      } else {
                        setDraft({ ...draft, orientacao: newOri });
                      }
                    }}
                    className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border outline-none"
                  >
                    <option value="horizontal">Horizontal</option>
                    <option value="vertical">Vertical</option>
                  </select>
                </div>
              </div>

              {((draft.orientacao === "vertical" && (draft.largura_mm ?? 0) >= (draft.altura_mm ?? 0)) ||
                (draft.orientacao === "horizontal" && (draft.altura_mm ?? 0) > (draft.largura_mm ?? 0))) && (
                <p className="text-[10px] text-amber-500 italic">
                  Aviso: as dimensões não correspondem à orientação selecionada. Ajuste largura/altura ou troque a orientação.
                </p>
              )}

              {/* Dimensões customizadas (mm) */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Largura (mm)</label>
                  <input
                    type="number" min={10} max={300} step={1}
                    value={draft.largura_mm ?? 0}
                    onChange={(e) => setDraft({ ...draft, largura_mm: Number(e.target.value) || 0 })}
                    className="w-full bg-secondary text-foreground text-sm rounded-md px-2 py-2 border border-border outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Altura (mm)</label>
                  <input
                    type="number" min={10} max={300} step={1}
                    value={draft.altura_mm ?? 0}
                    onChange={(e) => setDraft({ ...draft, altura_mm: Number(e.target.value) || 0 })}
                    className="w-full bg-secondary text-foreground text-sm rounded-md px-2 py-2 border border-border outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Escala Fonte</label>
                  <select
                    value={String(draft.escala_fonte ?? 1)}
                    onChange={(e) => setDraft({ ...draft, escala_fonte: Number(e.target.value) })}
                    className="w-full bg-secondary text-foreground text-sm rounded-md px-2 py-2 border border-border outline-none"
                  >
                    {[0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5].map((v) => (
                      <option key={v} value={v}>{v.toFixed(2)}×</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Duas colunas */}
              <div className="grid grid-cols-2 gap-2 items-end">
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!draft.duas_colunas}
                    onChange={(e) => setDraft({ ...draft, duas_colunas: e.target.checked })}
                    className="accent-primary"
                  />
                  Impressão em 2 colunas
                </label>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Intervalo (mm)</label>
                  <input
                    type="number" min={0} max={20} step={1}
                    value={draft.intervalo_colunas_mm ?? 3}
                    disabled={!draft.duas_colunas}
                    onChange={(e) => setDraft({ ...draft, intervalo_colunas_mm: Number(e.target.value) || 0 })}
                    className="w-full bg-secondary text-foreground text-sm rounded-md px-2 py-2 border border-border outline-none disabled:opacity-50"
                  />
                </div>
              </div>

              {tipo === "ENDERECO" && (
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Direção da Seta</label>
                  <select
                    value={draft.direcao_seta ?? "NENHUMA"}
                    onChange={(e) => setDraft({ ...draft, direcao_seta: e.target.value as any })}
                    className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border outline-none"
                  >
                    <option value="NENHUMA">Nenhuma</option>
                    <option value="CIMA">↑ Cima</option>
                    <option value="BAIXO">↓ Baixo</option>
                    <option value="ESQUERDA">← Esquerda</option>
                    <option value="DIREITA">→ Direita</option>
                  </select>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground italic">
                Seta direcional, impressão em 2 colunas e intervalo são valores padrão de impressão. O operador pode alterá-los no momento de imprimir.
              </p>

              <div className="flex items-center gap-4 py-1">
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.com_cabecalho}
                    onChange={(e) => setDraft({ ...draft, com_cabecalho: e.target.checked })}
                    className="accent-primary"
                  />
                  Com cabeçalho
                </label>
                <label className={`flex items-center gap-2 text-xs cursor-pointer ${draft.com_cabecalho ? "text-foreground" : "text-muted-foreground opacity-50"}`}>
                  <input
                    type="checkbox"
                    checked={draft.com_logo}
                    disabled={!draft.com_cabecalho}
                    onChange={(e) => setDraft({ ...draft, com_logo: e.target.checked })}
                    className="accent-primary"
                  />
                  Com logo
                </label>
              </div>

              {draft.com_cabecalho && draft.com_logo && (
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">URL do Logo</label>
                  <input
                    type="text"
                    value={draft.logo_url || ""}
                    onChange={(e) => setDraft({ ...draft, logo_url: e.target.value || null })}
                    placeholder="https://..."
                    className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Campos ({draft.campos.filter((c) => c.ativo).length}/{draft.campos.length} ativos)
                </label>
                <div className="space-y-1 max-h-[320px] overflow-auto pr-1">
                  {draft.campos.map((c, idx) => (
                    <div
                      key={c.chave}
                      className="flex items-center gap-2 bg-secondary/60 border border-border rounded-md px-2 py-1.5"
                    >
                      <input
                        type="checkbox"
                        checked={c.ativo}
                        onChange={() => handleFieldToggle(c.chave)}
                        className="accent-primary shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-foreground truncate">{c.label}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{c.chave}</div>
                      </div>
                      <button
                        onClick={() => moveField(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 rounded hover:bg-secondary text-muted-foreground disabled:opacity-30"
                        title="Mover acima"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        onClick={() => moveField(idx, 1)}
                        disabled={idx === draft.campos.length - 1}
                        className="p-1 rounded hover:bg-secondary text-muted-foreground disabled:opacity-30"
                        title="Mover abaixo"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  Salvar
                </button>
                {!draft.padrao && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-destructive/40 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                    title="Excluir template"
                  >
                    <Trash2 size={12} />
                    Excluir
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Área com abas: Preview visual + Código ZPL */}
        <div className="bg-card border border-border rounded-lg p-4 flex flex-col">
          <Tabs defaultValue="preview" className="flex flex-col flex-1">
            <TabsList className="grid w-full grid-cols-2 mb-3">
              <TabsTrigger value="preview" className="text-xs flex items-center gap-1.5">
                <Eye size={12} /> Preview
              </TabsTrigger>
              <TabsTrigger value="zpl" className="text-xs flex items-center gap-1.5">
                <Code size={12} /> Código ZPL
              </TabsTrigger>
            </TabsList>

            <TabsContent value="preview" className="flex-1 overflow-auto mt-0">
              <div className="flex items-start justify-center bg-black/30 rounded-md p-4 min-h-[300px]">
                {draft && previewConfig && <RenderPreview tipo={tipo} config={previewConfig} />}
              </div>
            </TabsContent>

            <TabsContent value="zpl" className="flex-1 flex flex-col mt-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Printer size={11} />
                  Código ZPL para impressora térmica
                  {zplEditado && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-semibold ml-1">
                      EDITADO
                    </span>
                  )}
                </span>
                <div className="flex gap-3">
                  {zplEditado && (
                    <button
                      onClick={() => setZplEditado(false)}
                      className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
                      title="Regenerar ZPL automaticamente a partir da configuração"
                    >
                      <RefreshCw size={10} /> Regenerar
                    </button>
                  )}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(zplCode);
                      toast.success("Código ZPL copiado!");
                    }}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Copy size={10} /> Copiar
                  </button>
                </div>
              </div>

              <textarea
                value={zplCode}
                onChange={(e) => {
                  setZplCode(e.target.value);
                  setZplEditado(true);
                }}
                className="flex-1 min-h-[400px] font-mono text-[11px] leading-relaxed bg-[hsl(222,47%,6%)] text-green-400 border border-border rounded-lg p-3 resize-none outline-none focus:ring-1 focus:ring-primary/50"
                spellCheck={false}
                placeholder="^XA&#10;^CI28&#10;...comandos ZPL...&#10;^XZ"
              />

              {draft?.campos && draft.campos.filter((c) => c.ativo).length > 0 && (
                <div className="mt-2 p-2 bg-secondary/40 rounded-md">
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    <strong>Placeholders disponíveis</strong> (substituídos pelo agente):{" "}
                    {draft.campos
                      .filter((c) => c.ativo)
                      .map((c) => (
                        <code
                          key={c.chave}
                          className="bg-black/30 px-1 py-0.5 rounded text-green-400 mx-0.5"
                        >
                          {"{{" + c.chave + "}}"}
                        </code>
                      ))}
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <DeleteConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Excluir template"
        description="Este template será desativado. Continuar?"
      />
    </div>
  );
}

function RenderPreview({ tipo, config }: { tipo: TipoEtiquetaConfig; config: any }) {
  if (tipo === "ENDERECO") {
    return (
      <EtiquetaEnderecoPreview
        enderecos={[{
          id: "mock",
          codigo_endereco: 12345,
          descricao: "R01-P02-N03-A04",
          tipo_endereco: "PICKING",
          curva_acesso: "A",
          nivel: 3,
          apto: 4,
        }]}
        tamanho={config.tamanho as any}
        orientacao={config.orientacao}
        config={config}
      />
    );
  }
  if (tipo === "HU") {
    return (
      <EtiquetaHUPreview
        hus={[{
          id: "mock",
          codigo_hu: "HU-000000001",
          tipo_hu: "PALLET",
          tamanho: "M",
          peso_bruto: 45.5,
          numero_movimento: "131",
          data_entrada: "21/07/2026",
          parceiro_nome: "FORNECEDOR EXEMPLO LTDA",
          numero_nota: "250",
          lote_principal: "L2026-A",
          validade_proxima: "15/12/2026",
          total_itens: 3,
          total_quantidade: 150,
          itens: [
            { sku: "1301009", descricao: "DESINFETANTE YPE 500ML LAVANDA CX 12.0", quantidade: 150, lote: "L2026-A", data_validade: "15/12/2026" }
          ],
        } as any]}
        config={config}
      />
    );
  }
  if (tipo === "PRODUTO") {
    return (
      <EtiquetaProdutoPreview
        items={[{
          produto_id: "mock",
          sku: "SKU-001",
          descricao: "PRODUTO EXEMPLO 500ML",
          marca: "MARCA X",
          ean: "7891234567890",
          embalagem: "CAIXA",
          fator: 12,
          altura: 10,
          largura: 20,
          comprimento: 30,
          peso_bruto: 1.5,
          peso_liquido: 1.2,
          m3: 0.006,
        }]}
        tamanho={config.tamanho}
        orientacao={config.orientacao}
        config={config}
      />
    );
  }
  return (
    <EtiquetaVolumePreview
      volumes={[{
        id: "mock",
        codigo_volume: "VOL-000000001",
        parceiro_nome: "CLIENTE EXEMPLO LTDA",
        destino_carga: "SÃO PAULO / SP",
        numero_onda: 42,
        numero_volume: 1,
        total_volumes_movimento: 5,
        peso: 12.5,
        nota_fiscal: "123456",
        pedido: "PED-000123",
        transportadora: "TRANSPORTE X",
        observacao: "Manuseio cuidadoso",
      }]}
      usuario="OPERADOR"
      dataHora="20/07/2026 10:00"
      config={config}
    />
  );
}

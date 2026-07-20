import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useEtiquetaTemplate, type EtiquetaConfig, type CampoEtiqueta, type TipoEtiquetaConfig } from "@/hooks/useEtiquetaTemplate";
import { parseError } from "@/lib/errorMapper";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { EtiquetaEnderecoPreview } from "@/components/etiqueta/EtiquetaEnderecoPreview";
import { EtiquetaHUPreview } from "@/components/etiqueta/EtiquetaHUPreview";
import { EtiquetaProdutoPreview } from "@/components/etiqueta/EtiquetaProdutoPreview";
import { EtiquetaVolumePreview } from "@/components/etiqueta/EtiquetaVolumePreview";
import {
  MapPin,
  Package,
  Barcode,
  Box,
  ArrowUp,
  ArrowDown,
  Loader2,
  Save,
  RotateCcw,
  Building2,
  Info,
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

const TAMANHOS_POR_TIPO: Record<TipoEtiquetaConfig, string[]> = {
  ENDERECO: ["100x40", "50x20", "80x20"],
  HU: ["100x40"],
  PRODUTO: ["100x40", "50x20"],
  VOLUME: ["100x40"],
};

interface Empresa {
  id: string;
  razaosocial: string;
  codigo: string | null;
}

export function EtiquetaTemplatesPage({ onNavigate }: Props) {
  const { tenantId, empresaId: currentEmpresaId } = useTenant();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaSel, setEmpresaSel] = useState<string>(""); // "" = padrão do tenant
  const [tipo, setTipo] = useState<TipoEtiquetaConfig>("ENDERECO");
  const { config, loading, reload } = useEtiquetaTemplate(tipo, empresaSel || null);

  const [draft, setDraft] = useState<EtiquetaConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

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

  // Sincroniza draft com config resolvido
  useEffect(() => {
    if (config) setDraft(structuredClone(config));
  }, [config]);

  const isOverride = draft?.empresa_id != null && draft.empresa_id === empresaSel;
  const isInherited = empresaSel !== "" && draft?.empresa_id == null;

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
        tenant_id: tenantId,
        empresa_id: empresaSel || null,
        tipo: draft.tipo,
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
        ativo: true,
        updated_at: new Date().toISOString(),
      };

      // Se estamos herdando o padrão do tenant e usuário escolheu uma empresa,
      // criar novo override para essa empresa.
      if (isInherited) {
        const { error } = await (supabase as any)
          .from("etiqueta_template")
          .insert(payload);
        if (error) throw error;
      } else {
        // Atualiza o registro existente (padrão do tenant ou override)
        const { error } = await (supabase as any)
          .from("etiqueta_template")
          .update(payload)
          .eq("id", draft.id);
        if (error) throw error;
      }
      toast.success("Template salvo com sucesso!");
      reload();
    } catch (err: any) {
      const parsed = parseError(err, "salvar template de etiqueta");
      const fallbackToRaw = !parsed.errorCode && parsed.title === "Ocorreu um erro inesperado.";
      toast.error(fallbackToRaw ? "Erro ao salvar template." : parsed.title);
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (): Promise<boolean> => {
    if (!draft || !isOverride) return false;
    try {
      const { error } = await (supabase as any)
        .from("etiqueta_template")
        .delete()
        .eq("id", draft.id);
      if (error) throw error;
      toast.success("Override removido. Voltando ao padrão do tenant.");
      reload();
      return true;
    } catch (err: any) {
      const parsed = parseError(err, "restaurar padrão do tenant");
      const fallbackToRaw = !parsed.errorCode && parsed.title === "Ocorreu um erro inesperado.";
      toast.error(fallbackToRaw ? "Erro ao restaurar padrão." : parsed.title);
      return false;
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
          <p className="text-xs text-muted-foreground">Configuração de etiquetas por empresa. O padrão do tenant é usado quando não há override.</p>
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

            {isInherited && (
              <div className="flex items-start gap-2 bg-muted/40 border border-border rounded-md px-2.5 py-2 text-[11px] text-muted-foreground">
                <Info size={12} className="mt-0.5 shrink-0" />
                <span>Esta empresa está usando o <b>padrão do tenant</b>. Salvar criará um override específico.</span>
              </div>
            )}
          </div>

          {loading || !draft ? (
            <div className="bg-card border border-border rounded-lg p-6 flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 size={14} className="animate-spin mr-2" /> Carregando template...
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Nome do Template</label>
                <input
                  type="text"
                  value={draft.nome}
                  onChange={(e) => setDraft({ ...draft, nome: e.target.value })}
                  className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Tamanho</label>
                  <select
                    value={draft.tamanho}
                    onChange={(e) => setDraft({ ...draft, tamanho: e.target.value })}
                    className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border outline-none"
                  >
                    {TAMANHOS_POR_TIPO[tipo].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Orientação</label>
                  <select
                    value={draft.orientacao}
                    onChange={(e) => setDraft({ ...draft, orientacao: e.target.value as "horizontal" | "vertical" })}
                    disabled={draft.tamanho === "80x20"}
                    className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border outline-none disabled:opacity-50"
                  >
                    <option value="horizontal">Horizontal</option>
                    <option value="vertical">Vertical</option>
                  </select>
                </div>
              </div>

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
                {isOverride && (
                  <button
                    onClick={() => setConfirmRestore(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    title="Excluir o override e voltar ao padrão do tenant"
                  >
                    <RotateCcw size={12} />
                    Restaurar padrão
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="bg-card border border-border rounded-lg p-4 flex flex-col">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Preview ao vivo</div>
          <div className="flex-1 overflow-auto flex items-start justify-center bg-black/30 rounded-md p-4">
            {draft && previewConfig && <RenderPreview tipo={tipo} config={previewConfig} />}
          </div>
        </div>
      </div>

      <DeleteConfirmDialog
        open={confirmRestore}
        onClose={() => setConfirmRestore(false)}
        onConfirm={handleRestore}
        title="Restaurar padrão do tenant"
        description="O template específico desta empresa será excluído e ela voltará a usar o padrão do tenant. Continuar?"
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
        hus={[{ id: "mock", codigo_hu: "HU-000000001", tipo_hu: "PALLET", tamanho: "PBR" }]}
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

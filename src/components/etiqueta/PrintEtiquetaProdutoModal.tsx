import { useState, useEffect, useMemo } from "react";
import {
  Printer,
  Send,
  Loader2,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Tag,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ZplPreview } from "./ZplPreview";
import { gerarZplTemplate } from "@/lib/zplGenerator";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { parseError } from "@/lib/errorMapper";
import { toast } from "sonner";
import type { EtiquetaConfig } from "@/hooks/useEtiquetaTemplate";
import type { OverflowInfo } from "@/lib/detectarOverflowZpl";
import type { EtiquetaProdutoItem } from "./EtiquetaProdutoPreview";

interface Props {
  open: boolean;
  onClose: () => void;
  items: EtiquetaProdutoItem[];
  onNavigate?: (path: string) => void;
}

function dadosDoProduto(item: any) {
  return {
    sku: item.sku || "",
    descricao: item.descricao || "",
    ean: item.ean || "",
    marca: item.marca || "",
    embalagem: item.embalagem || "",
    referencia: item.referencia || "",
    fator: item.fator != null ? String(item.fator) : "",
    altura: item.altura != null ? String(item.altura) : "",
    largura: item.largura != null ? String(item.largura) : "",
    comprimento: item.comprimento != null ? String(item.comprimento) : "",
    peso_bruto: item.peso_bruto != null ? String(item.peso_bruto) : "",
    peso_liquido: item.peso_liquido != null ? String(item.peso_liquido) : "",
    m3: item.m3 != null ? String(item.m3) : "",
  };
}

const identificadorLegivel = (item: EtiquetaProdutoItem) => item.sku || item.produto_id;

export function PrintEtiquetaProdutoModal({ open, onClose, items, onNavigate }: Props) {
  const { empresaId, armazemId } = useTenant();

  const [templates, setTemplates] = useState<EtiquetaConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<EtiquetaConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [indicePreview, setIndicePreview] = useState(0);
  const [zoomLevel, setZoomLevel] = useState<"fit" | 1.5 | 2>("fit");
  const [overflowInfo, setOverflowInfo] = useState<OverflowInfo | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoadingConfig(true);
      try {
        const { data, error } = await (supabase.rpc as any)("listar_etiqueta_templates", {
          p_tipo: "PRODUTO",
          p_empresa_id: empresaId || null,
        });
        if (cancelled) return;
        if (error) throw error;
        const parsed: EtiquetaConfig[] = (data || []).map((row: any) => ({
          ...row,
          campos: typeof row.campos === "string" ? JSON.parse(row.campos) : row.campos,
        }));
        setTemplates(parsed);
        setSelectedConfig(parsed.find((t) => t.padrao) || parsed[0] || null);
      } catch (err: any) {
        if (!cancelled) toast.error(parseError(err, "carregar templates").title);
      } finally {
        if (!cancelled) setLoadingConfig(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open, empresaId]);

  useEffect(() => {
    if (open) {
      setIndicePreview(0);
      setZoomLevel("fit");
    }
  }, [open, items.length]);

  const total = items.length;
  const plural = total > 1;
  const itemAtual = items[Math.min(indicePreview, Math.max(total - 1, 0))];

  const zplDoTemplate = useMemo(() => {
    if (!selectedConfig) return "";
    const corpo = selectedConfig.corpo_zpl?.trim();
    if (corpo) return corpo;
    try {
      return gerarZplTemplate("PRODUTO", selectedConfig);
    } catch {
      return "";
    }
  }, [selectedConfig]);

  const dadosPreview = useMemo(() => (itemAtual ? dadosDoProduto(itemAtual) : {}), [itemAtual]);

  const semTemplates = !loadingConfig && templates.length === 0;
  const semZpl = !!selectedConfig && !zplDoTemplate;

  const semEan = items.filter((it) => !String(it.ean || "").trim());

  const handleEnviar = async () => {
    if (!armazemId) {
      toast.error("Selecione um armazém antes de imprimir");
      return;
    }
    if (!selectedConfig) {
      toast.error("Selecione um template antes de imprimir");
      return;
    }

    setEnviando(true);
    let successCount = 0;
    let errorCount = 0;
    const errosDetalhados: string[] = [];

    for (const item of items) {
      try {
        const { data, error } = await (supabase.rpc as any)("solicitar_impressao", {
          p_armazem_id: armazemId,
          p_tipo_etiqueta: "PRODUTO",
          p_dados: dadosDoProduto(item),
          p_origem: "PAINEL_ADMINISTRATIVO",
          p_documento_origem_id: item.embalagem_id || item.produto_id || undefined,
          p_tipo_documento_origem: "produto_embalagem",
          p_prioridade: 5,
          p_template_id: selectedConfig?.id ?? undefined,
        });

        if (error) {
          errorCount++;
          errosDetalhados.push(`${identificadorLegivel(item)}: ${error.message}`);
          continue;
        }
        const result = typeof data === "string" ? JSON.parse(data) : data;
        if (result?.success) {
          successCount++;
        } else {
          errorCount++;
          errosDetalhados.push(
            `${identificadorLegivel(item)}: ${result?.error ?? "erro desconhecido"}`,
          );
        }
      } catch (err: any) {
        errorCount++;
        errosDetalhados.push(`${identificadorLegivel(item)}: ${err?.message ?? "erro inesperado"}`);
      }
    }

    setEnviando(false);

    if (successCount > 0 && errorCount === 0) {
      toast.success(`${successCount} etiqueta(s) enviada(s) para impressão`);
      onClose();
      return;
    }
    if (successCount > 0 && errorCount > 0) {
      toast.success(`${successCount} etiqueta(s) enviada(s)`);
      toast.warning(`${errorCount} falharam — verifique a Fila de Impressão`);
      console.warn("[Impressão Produto] Falhas:", errosDetalhados);
      onClose();
      return;
    }
    toast.error(
      "Nenhuma etiqueta foi enfileirada. Verifique se há impressora cadastrada no armazém e template configurado.",
    );
    console.error("[Impressão Produto] Todas falharam:", errosDetalhados);
  };

  const handleReimprimirAtual = async () => {
    if (!armazemId) {
      toast.error("Selecione um armazém antes de imprimir");
      return;
    }
    if (!selectedConfig || !itemAtual) return;

    setEnviando(true);
    try {
      const { data, error } = await (supabase.rpc as any)("solicitar_impressao", {
        p_armazem_id: armazemId,
        p_tipo_etiqueta: "PRODUTO",
        p_dados: dadosDoProduto(itemAtual),
        p_origem: "PAINEL_ADMINISTRATIVO",
        p_documento_origem_id: itemAtual.embalagem_id || itemAtual.produto_id || undefined,
        p_tipo_documento_origem: "produto_embalagem",
        p_prioridade: 5,
        p_template_id: selectedConfig?.id ?? undefined,
      });
      if (error) throw error;
      const result = typeof data === "string" ? JSON.parse(data) : data;
      if (result?.success) {
        toast.success(`Etiqueta ${identificadorLegivel(itemAtual)} enviada para impressão`);
      } else {
        toast.error(result?.error ?? "Falha ao enfileirar");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Erro inesperado ao reimprimir");
    } finally {
      setEnviando(false);
    }
    // NÃO fecha o modal.
  };

  const irParaTemplates = () => {
    if (onNavigate) onNavigate("/config/etiquetas");
    else window.location.hash = "#/config/etiquetas";
  };

  const zoomBtn = (nivel: "fit" | 1.5 | 2, label: string, aria: string) => (
    <button
      type="button"
      onClick={() => setZoomLevel(nivel)}
      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
        zoomLevel === nivel
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
      }`}
      aria-label={aria}
    >
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl bg-card border-border">
        <DialogHeader>
          <DialogTitle asChild>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Printer size={17} className="text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground leading-tight">
                  Imprimir etiquetas de produto
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {total} {plural ? "etiquetas selecionadas" : "etiqueta selecionada"}
                  {selectedConfig && (
                    <>
                      <span className="mx-1.5">·</span>
                      <span>Template: {selectedConfig.nome}</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[1fr_260px]">
          {/* COLUNA ESQUERDA — PREVIEW (hero) */}
          <div className="min-w-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Preview térmico
              </span>
              <div className="flex items-center gap-0.5 bg-secondary/50 border border-border/50 rounded-md p-0.5">
                {zoomBtn("fit", "Ajustar", "Ajustar preview ao container")}
                {zoomBtn(1.5, "150%", "Zoom 150%")}
                {zoomBtn(2, "200%", "Zoom 200%")}
              </div>
            </div>

            <ZplPreview
              zpl={zplDoTemplate}
              larguraMm={Number(selectedConfig?.largura_mm) || 100}
              alturaMm={Number(selectedConfig?.altura_mm) || 40}
              dados={dadosPreview}
              escalaPx={4}
              maxLarguraPx={560}
              zoom={zoomLevel}
              onOverflow={setOverflowInfo}
            />

            {total > 1 && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setIndicePreview((i) => Math.max(0, i - 1))}
                  disabled={indicePreview === 0}
                  className="h-7 w-7 flex items-center justify-center rounded-md border border-border hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Etiqueta anterior"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-muted-foreground font-medium px-1">
                  Etiqueta <span className="text-foreground">{indicePreview + 1}</span> de{" "}
                  <span className="text-foreground">{total}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIndicePreview((i) => Math.min(total - 1, i + 1))}
                  disabled={indicePreview >= total - 1}
                  className="h-7 w-7 flex items-center justify-center rounded-md border border-border hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Próxima etiqueta"
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleReimprimirAtual}
                  disabled={enviando || !selectedConfig}
                  className="ml-2 flex items-center gap-1.5 px-2.5 h-7 rounded-md border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Printer size={12} />
                  Reimprimir esta
                </button>
              </div>
            )}

            {itemAtual && (
              <div className="mt-3 flex items-center gap-3 bg-secondary/40 border border-border/60 rounded-lg px-3 py-2.5">
                <Tag size={15} className="text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-mono font-semibold text-foreground truncate">
                    {itemAtual.sku}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {itemAtual.descricao}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {itemAtual.embalagem && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                      {itemAtual.embalagem}
                    </span>
                  )}
                  {itemAtual.fator != null && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-secondary text-muted-foreground border border-border">
                      Fator {itemAtual.fator}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-secondary text-muted-foreground border border-border">
                    {itemAtual.ean || "SEM EAN"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* COLUNA DIREITA — CONTROLES */}
          <div className="space-y-4">
            {loadingConfig ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 size={12} className="animate-spin" /> Carregando templates...
              </div>
            ) : semTemplates ? (
              <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                <AlertTriangle size={13} className="text-yellow-400 shrink-0 mt-0.5" />
                <span className="text-xs text-yellow-400 leading-relaxed">
                  Nenhum template de produto cadastrado. Cadastre pelo menos um template antes de
                  imprimir.
                </span>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    Template
                  </label>
                  <div className="relative">
                    <select
                      value={selectedConfig?.id || ""}
                      onChange={(e) => {
                        const t = templates.find((tpl) => tpl.id === e.target.value);
                        if (t) setSelectedConfig(t);
                      }}
                      className="w-full h-10 px-3 pr-8 appearance-none rounded-lg bg-secondary border border-border text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
                    >
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nome} — {t.largura_mm}×{t.altura_mm}mm{t.padrao ? " (Padrão)" : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                    />
                  </div>
                  {selectedConfig && (
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {selectedConfig.largura_mm}×{selectedConfig.altura_mm}mm ·{" "}
                      {selectedConfig.orientacao === "horizontal" ? "Paisagem" : "Retrato"} ·{" "}
                      {Math.round(Number(selectedConfig.largura_mm) * 8)}×
                      {Math.round(Number(selectedConfig.altura_mm) * 8)}px
                    </div>
                  )}
                </div>

                {semZpl && (
                  <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                    <AlertTriangle size={13} className="text-destructive shrink-0 mt-0.5" />
                    <span className="text-xs text-destructive leading-relaxed">
                      Template sem ZPL configurado. Abra a tela de templates e configure o ZPL antes
                      de imprimir.
                    </span>
                  </div>
                )}

                {semEan.length > 0 && (
                  <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle size={13} className="text-yellow-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-400 leading-relaxed">
                      {semEan.length} item(ns) sem EAN cadastrado. O código de barras ficará vazio
                      nessas etiquetas.
                    </p>
                  </div>
                )}

                {overflowInfo?.overflow && (
                  <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle size={13} className="text-yellow-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-400 leading-relaxed">
                      O ZPL deste template desenha em {overflowInfo.yMaxMm.toFixed(1)}mm, além da
                      altura configurada de {overflowInfo.alturaMm}mm. O preview aparece cortado.
                      Ajuste o template ou aumente a altura.
                    </p>
                  </div>
                )}

                <div className="flex items-start gap-2 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2">
                  <Info size={13} className="text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Opções de layout (QR Code, campos exibidos, colunas) agora são configuradas no
                    template.{" "}
                    <button
                        type="button"
                        onClick={irParaTemplates}
                        className="text-primary hover:underline font-medium"
                      >
                        Editar template
                      </button>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/30 px-6 py-4 -mx-6 -mb-6 mt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleEnviar}
            disabled={enviando || loadingConfig || !selectedConfig || semTemplates}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {enviando ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send size={15} />
                Enviar {total} para fila
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect, useMemo } from "react";
import {
  Printer,
  Send,
  Loader2,
  AlertTriangle,
  Info,
  Layers,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ZplPreview } from "./ZplPreview";
import { gerarZplTemplate } from "@/lib/zplGenerator";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { parseError } from "@/lib/errorMapper";
import { toast } from "sonner";
import type { EtiquetaConfig } from "@/hooks/useEtiquetaTemplate";

type DirecaoSeta = "NENHUMA" | "CIMA" | "BAIXO" | "ESQUERDA" | "DIREITA";

const SETA_SIMBOLO: Record<string, string> = {
  NENHUMA: "",
  CIMA: "↑",
  BAIXO: "↓",
  ESQUERDA: "←",
  DIREITA: "→",
};

interface PrintEtiquetaEnderecoModalProps {
  open: boolean;
  onClose: () => void;
  enderecos: Array<{
    id: string | number;
    codigo?: string;
    descricao?: string;
    codigo_endereco?: number | string | null;
    setor?: string;
    setor_id?: string;
    tipo_endereco?: string;
    curva_acesso?: string;
    nivel?: number | string | null;
    apto?: number | string | null;
  }>;
  onNavigate?: (path: string) => void;
}

export function PrintEtiquetaEnderecoModal({
  open,
  onClose,
  enderecos,
  onNavigate,
}: PrintEtiquetaEnderecoModalProps) {
  const { armazemId, empresaId } = useTenant();

  const [templates, setTemplates] = useState<EtiquetaConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<EtiquetaConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [direcaoSeta, setDirecaoSeta] = useState<DirecaoSeta>("NENHUMA");
  const [indicePreview, setIndicePreview] = useState(0);
  const [enviando, setEnviando] = useState(false);

  // Carrega templates de ENDERECO
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoadingConfig(true);
      try {
        const { data, error } = await (supabase.rpc as any)("listar_etiqueta_templates", {
          p_tipo: "ENDERECO",
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

  // Reinicia navegação/seta ao abrir ou trocar template
  useEffect(() => {
    if (open) setIndicePreview(0);
  }, [open, enderecos.length]);

  useEffect(() => {
    if (selectedConfig) setDirecaoSeta(((selectedConfig.direcao_seta as DirecaoSeta) || "NENHUMA"));
  }, [selectedConfig]);

  const total = enderecos.length;
  const plural = total > 1;
  const enderecoAtual = enderecos[Math.min(indicePreview, Math.max(total - 1, 0))];

  const zplDoTemplate = useMemo(() => {
    if (!selectedConfig) return "";
    const corpo = selectedConfig.corpo_zpl?.trim();
    if (corpo) return corpo;
    try {
      return gerarZplTemplate("ENDERECO", selectedConfig);
    } catch {
      return "";
    }
  }, [selectedConfig]);

  const dadosPreview = useMemo(() => {
    if (!enderecoAtual) return {};
    return {
      codigo_endereco: enderecoAtual.codigo_endereco != null ? String(enderecoAtual.codigo_endereco) : "",
      descricao: enderecoAtual.descricao ?? "",
      tipo_endereco: enderecoAtual.tipo_endereco ?? "",
      curva_acesso: enderecoAtual.curva_acesso ?? "",
      direcao_seta: direcaoSeta,
      seta_simbolo: SETA_SIMBOLO[direcaoSeta],
    };
  }, [enderecoAtual, direcaoSeta]);

  const semTemplates = !loadingConfig && templates.length === 0;
  const semZpl = !!selectedConfig && !zplDoTemplate;

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

    for (const end of enderecos) {
      try {
        const { data, error } = await (supabase.rpc as any)("solicitar_impressao", {
          p_armazem_id: armazemId,
          p_tipo_etiqueta: "ENDERECO",
          p_dados: {
            codigo_endereco: end.codigo_endereco != null ? String(end.codigo_endereco) : "",
            descricao: end.descricao ?? "",
            tipo_endereco: end.tipo_endereco ?? "",
            curva_acesso: end.curva_acesso ?? "",
            direcao_seta: direcaoSeta,
            seta_simbolo: SETA_SIMBOLO[direcaoSeta],
          },
          p_origem: "PAINEL_ADMINISTRATIVO",
          p_documento_origem_id: String(end.id),
          p_tipo_documento_origem: "endereco",
          p_prioridade: 5,
        });

        if (error) {
          errorCount++;
          errosDetalhados.push(`${end.descricao ?? end.id}: ${error.message}`);
          continue;
        }
        const result = typeof data === "string" ? JSON.parse(data) : data;
        if (result?.success) {
          successCount++;
        } else {
          errorCount++;
          errosDetalhados.push(`${end.descricao ?? end.id}: ${result?.error ?? "erro desconhecido"}`);
        }
      } catch (err: any) {
        errorCount++;
        errosDetalhados.push(`${end.descricao ?? end.id}: ${err?.message ?? "erro inesperado"}`);
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
      console.warn("[Impressão Endereço] Falhas:", errosDetalhados);
      onClose();
      return;
    }
    toast.error(
      "Nenhuma etiqueta foi enfileirada. Verifique se há impressora cadastrada no armazém e template configurado.",
    );
    console.error("[Impressão Endereço] Todas falharam:", errosDetalhados);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Printer size={18} className="text-primary" />
            Imprimir Etiquetas de Endereço
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[280px_1fr]">
          {/* Coluna esquerda — controles */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
              <Layers size={13} className="text-primary shrink-0" />
              <span className="text-xs text-primary font-medium">
                {total} {plural ? "etiquetas selecionadas" : "etiqueta selecionada"}
              </span>
            </div>

            {loadingConfig ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 size={12} className="animate-spin" /> Carregando templates...
              </div>
            ) : semTemplates ? (
              <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                <AlertTriangle size={13} className="text-yellow-400 shrink-0 mt-0.5" />
                <span className="text-xs text-yellow-400 leading-relaxed">
                  Nenhum template de endereço cadastrado. Cadastre pelo menos um template antes de imprimir.
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

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    Seta Direcional
                  </label>
                  <div className="relative">
                    <select
                      value={direcaoSeta}
                      onChange={(e) => setDirecaoSeta(e.target.value as DirecaoSeta)}
                      className="w-full h-10 px-3 pr-8 appearance-none rounded-lg bg-secondary border border-border text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
                    >
                      <option value="NENHUMA">Nenhuma</option>
                      <option value="CIMA">↑ Para cima</option>
                      <option value="BAIXO">↓ Para baixo</option>
                      <option value="ESQUERDA">← Para esquerda</option>
                      <option value="DIREITA">→ Para direita</option>
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                    />
                  </div>
                </div>

                {semZpl && (
                  <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                    <AlertTriangle size={13} className="text-destructive shrink-0 mt-0.5" />
                    <span className="text-xs text-destructive leading-relaxed">
                      Template sem ZPL configurado. Abra a tela de templates e configure o ZPL antes de imprimir.
                    </span>
                  </div>
                )}

                <div className="flex items-start gap-2 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2">
                  <Info size={13} className="text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Opções de layout (QR Code, Curva, Tipo, Colunas) são configuradas no template.{" "}
                    {onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate("/config/etiqueta-templates")}
                        className="text-primary hover:underline font-medium"
                      >
                        Editar template
                      </button>
                    )}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Coluna direita — preview */}
          <div className="flex flex-col items-center justify-start">
            <ZplPreview
              zpl={zplDoTemplate}
              larguraMm={Number(selectedConfig?.largura_mm) || 100}
              alturaMm={Number(selectedConfig?.altura_mm) || 40}
              dados={dadosPreview}
              escalaPx={4}
              maxLarguraPx={520}
            />

            {total > 1 && (
              <div className="flex items-center justify-center gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setIndicePreview((i) => Math.max(0, i - 1))}
                  disabled={indicePreview === 0}
                  className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground disabled:opacity-30"
                  aria-label="Etiqueta anterior"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-muted-foreground font-medium">
                  {indicePreview + 1} de {total}
                </span>
                <button
                  type="button"
                  onClick={() => setIndicePreview((i) => Math.min(total - 1, i + 1))}
                  disabled={indicePreview >= total - 1}
                  className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground disabled:opacity-30"
                  aria-label="Próxima etiqueta"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleEnviar}
            disabled={enviando || !selectedConfig || semTemplates}
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
                Enviar {total} para Fila
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

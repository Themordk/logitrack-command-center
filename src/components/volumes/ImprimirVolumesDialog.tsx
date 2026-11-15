/**
 * Impressão e reimpressão de etiquetas de volume pela tela Volumes (A7, A20).
 * A prévia usa os mesmos dados que o servidor grava no job (fn_etiqueta_volume_dados);
 * o envio vai só com os ids, por rpc_volume_imprimir, que decide se a reimpressão exige motivo.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, Printer, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ZplPreview } from "@/components/etiqueta/ZplPreview";
import { CopiasField } from "@/components/etiqueta/CopiasField";
import { ImpressoraSelect } from "@/components/impressao/ImpressoraSelect";
import { gerarZplTemplate } from "@/lib/zplGenerator";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { parseError } from "@/lib/errorMapper";
import type { EtiquetaConfig } from "@/hooks/useEtiquetaTemplate";
import { volumesService, type VolumeLinha } from "@/lib/volumesService";
import { identificacaoVolume, precisaMotivoReimpressao } from "@/lib/volumesExibicao";

interface Props {
  open: boolean;
  volumes: VolumeLinha[];
  onClose: () => void;
  onImpresso: () => void;
}

type Rpc = (nome: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc as unknown as Rpc;

export function ImprimirVolumesDialog({ open, volumes, onClose, onImpresso }: Props) {
  const { empresaId, armazemId } = useTenant();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [impressoraId, setImpressoraId] = useState<string | null>(null);
  const [copias, setCopias] = useState(1);
  const [motivo, setMotivo] = useState("");
  const [pedirMotivo, setPedirMotivo] = useState(false);
  const [indice, setIndice] = useState(0);
  const [enviando, setEnviando] = useState(false);

  const jaImpressos = useMemo(() => volumes.filter((v) => (v.etiqueta_impressoes ?? 0) > 0).length, [volumes]);
  const motivoObrigatorio = pedirMotivo || precisaMotivoReimpressao(volumes);

  useEffect(() => {
    if (!open) return;
    setIndice(0); setCopias(1); setMotivo(""); setPedirMotivo(false);
  }, [open, volumes]);

  const templates = useQuery({
    queryKey: ["etiqueta-templates", "VOLUME", empresaId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await rpc("listar_etiqueta_templates", { p_tipo: "VOLUME", p_empresa_id: empresaId || null });
      if (error) throw error;
      return ((data as EtiquetaConfig[] | null) ?? []).map((t) => ({
        ...t, campos: typeof t.campos === "string" ? JSON.parse(t.campos as unknown as string) : t.campos,
      }));
    },
  });

  useEffect(() => {
    const lista = templates.data ?? [];
    if (lista.length && !lista.some((t) => t.id === templateId)) setTemplateId((lista.find((t) => t.padrao) ?? lista[0]).id);
  }, [templates.data, templateId]);

  const template = (templates.data ?? []).find((t) => t.id === templateId) ?? null;
  const volumeAtual = volumes[Math.min(indice, Math.max(volumes.length - 1, 0))];

  // Dados da prévia: os mesmos que o servidor vai gravar no job
  const dados = useQuery({
    queryKey: ["etiqueta-volume-dados", volumeAtual?.id],
    enabled: open && !!volumeAtual,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await rpc("fn_etiqueta_volume_dados", { p_volume_ids: [volumeAtual!.id] });
      if (error) throw error;
      const linha = ((data as { volume_id: string; dados: Record<string, string> }[] | null) ?? [])[0];
      return linha?.dados ?? {};
    },
  });

  const zpl = useMemo(() => {
    if (!template) return "";
    const corpo = template.corpo_zpl?.trim();
    if (corpo) return corpo;
    try { return gerarZplTemplate("VOLUME", template); } catch { return ""; }
  }, [template]);

  const enviar = async () => {
    if (!armazemId) { toast.error("Selecione um armazém antes de imprimir."); return; }
    if (motivoObrigatorio && motivo.trim().length < 5) { toast.error("Informe o motivo da reimpressão (mínimo 5 caracteres)."); return; }
    setEnviando(true);
    try {
      const r = await volumesService.imprimir({
        volumeIds: volumes.map((v) => v.id), armazemId, impressoraId, templateId, copias,
        motivo: motivoObrigatorio ? motivo : null,
      });
      if (!r.sucesso && r.codigo === "MOTIVO_REIMPRESSAO_OBRIGATORIO") {
        setPedirMotivo(true);
        toast.warning(r.mensagem ?? "Informe o motivo da reimpressão.");
        return;
      }
      const d = r.dados;
      if (d?.aviso) toast.warning(d.aviso);
      if ((d?.enviados ?? 0) > 0) {
        toast.success(r.mensagem ?? `${d?.enviados} etiqueta(s) enviada(s).`);
        if (d?.falhas?.length) {
          toast.warning(`${d.falhas.length} etiqueta(s) não foram enviadas`, {
            description: d.falhas.slice(0, 3).map((f) => `${f.codigo_volume}: ${f.erro}`).join("\n"),
          });
        }
        if (d?.interrompido) toast.error(r.mensagem ?? "Impressão interrompida.");
        onImpresso();
        if (!d?.interrompido) onClose();
        return;
      }
      toast.error(r.mensagem ?? "Nenhuma etiqueta foi enviada.");
    } catch (e) {
      const p = parseError(e, "imprimir-volumes");
      toast.error(p.title, { description: p.technicalMessage });
    } finally {
      setEnviando(false);
    }
  };

  const total = volumes.length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !enviando && onClose()}>
      <DialogContent className="sm:max-w-4xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {jaImpressos > 0 ? <RotateCcw size={17} className="text-primary" aria-hidden="true" /> : <Printer size={17} className="text-primary" aria-hidden="true" />}
            {jaImpressos > 0 ? "Reimprimir etiquetas de volume" : "Imprimir etiquetas de volume"}
          </DialogTitle>
          <DialogDescription>
            {total} volume{total === 1 ? "" : "s"} selecionado{total === 1 ? "" : "s"}
            {jaImpressos > 0 && ` · ${jaImpressos} já com etiqueta impressa`}
            {". Os dados da etiqueta vêm do servidor: cliente, pedido, NF e totais atuais."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[1fr_260px]">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prévia</span>
              {total > 1 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <button type="button" onClick={() => setIndice((i) => Math.max(0, i - 1))} disabled={indice === 0}
                    className="p-1 rounded hover:bg-secondary disabled:opacity-30" aria-label="Volume anterior"><ChevronLeft size={14} /></button>
                  <span className="font-mono">{volumeAtual?.codigo_volume} ({indice + 1}/{total})</span>
                  <button type="button" onClick={() => setIndice((i) => Math.min(total - 1, i + 1))} disabled={indice >= total - 1}
                    className="p-1 rounded hover:bg-secondary disabled:opacity-30" aria-label="Próximo volume"><ChevronRight size={14} /></button>
                </div>
              )}
            </div>
            {templates.isLoading || dados.isLoading ? (
              <div className="flex items-center justify-center h-48 rounded-lg border border-border"><Loader2 className="animate-spin text-muted-foreground" /></div>
            ) : !template ? (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-400">
                Nenhum template de etiqueta de VOLUME ativo. Cadastre um em Configurações › Etiquetas.
              </div>
            ) : (
              <ZplPreview zpl={zpl} larguraMm={Number(template.largura_mm) || 100} alturaMm={Number(template.altura_mm) || 40}
                dados={dados.data ?? {}} escalaPx={4} maxLarguraPx={560} />
            )}
            {volumeAtual && (
              <p className="text-[11px] text-muted-foreground">
                Volume {identificacaoVolume(volumeAtual)} · pedido {volumeAtual.numero_pedido ?? "—"}
                {dados.data && !dados.data.nota_fiscal && " · sem NF autorizada: o campo de NF sai vazio"}
              </p>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="imp-template" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Template</label>
              <select id="imp-template" value={templateId ?? ""} onChange={(e) => setTemplateId(e.target.value || null)}
                className="w-full h-10 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground outline-none focus:border-primary">
                {(templates.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.nome}{t.padrao ? " (padrão)" : ""}</option>)}
              </select>
            </div>
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Impressora</span>
              <ImpressoraSelect armazemId={armazemId} tipoEtiqueta="VOLUME" value={impressoraId} onChange={(id) => setImpressoraId(id)}
                templateLarguraMm={Number(template?.largura_mm) || undefined} templateAlturaMm={Number(template?.altura_mm) || undefined} lembrarEscolha />
            </div>
            <CopiasField value={copias} onChange={setCopias} disabled={enviando} />
            {motivoObrigatorio && (
              <div>
                <label htmlFor="imp-motivo" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Motivo da reimpressão
                </label>
                <Textarea id="imp-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
                  placeholder="Ex.: etiqueta rasgada, NF autorizada depois da impressão..." />
                <p className="text-[11px] text-muted-foreground mt-1">Fica registrado no histórico de impressões do volume.</p>
              </div>
            )}
            <button type="button" onClick={() => void enviar()} disabled={enviando || !template || total === 0}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40">
              {enviando ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
              {enviando ? "Enviando..." : `Enviar ${total} etiqueta${total === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

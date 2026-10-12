import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, AlertTriangle, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDateTime, formatDate } from "@/utils/dateTime";
import { parseError } from "@/lib/errorMapper";
import { cn } from "@/lib/utils";

interface NotaFiscal {
  id: string;
  numero_nf: string | number | null;
  serie: string | number | null;
  modelo: string | null;
  chave_nfe: string | null;
  situacao: string | null;
  data_emissao: string | null;
  data_saida: string | null;
  data_cancelamento: string | null;
  tipo_ambiente: string | number | null;
  finalidade: string | number | null;
  valor_total_nf: number | null;
  valor_produtos: number | null;
  valor_frete: number | null;
  modalidade_frete: string | number | null;
  id_transportadora_externo: string | null;
  qtd_itens: number | null;
  ultima_sincronizacao_em: string | null;
  sync_erro: string | null;
}

interface NfVigente {
  nf_id: string | null;
  qtd_nfs: number | null;
  qtd_nfs_autorizadas: number | null;
  nf_status_consulta: string | null;
  nf_consultada_em: string | null;
}

const brl = (v: number | null) =>
  v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const SITUACAO_CLS: Record<string, string> = {
  AUTORIZADA: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  CANCELADA: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  INUTILIZADA: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

function Campo({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <div className="text-xs text-foreground mt-0.5">{children}</div>
    </div>
  );
}

export function DocSaidaNfTab({ documentoId, enabled }: { documentoId: string; enabled: boolean }) {
  const query = useQuery({
    queryKey: ["doc-saida-nfs", documentoId],
    enabled,
    queryFn: async () => {
      const [nfsRes, vigRes] = await Promise.all([
        (supabase as any)
          .from("documento_saida_nf")
          .select("id, numero_nf, serie, modelo, chave_nfe, situacao, data_emissao, data_saida, data_cancelamento, tipo_ambiente, finalidade, valor_total_nf, valor_produtos, valor_frete, modalidade_frete, id_transportadora_externo, qtd_itens, ultima_sincronizacao_em, sync_erro")
          .eq("documento_saida_id", documentoId)
          .order("data_emissao", { ascending: false }),
        (supabase as any)
          .from("vw_documento_saida_nf_vigente")
          .select("nf_id, qtd_nfs, qtd_nfs_autorizadas, nf_status_consulta, nf_consultada_em")
          .eq("documento_saida_id", documentoId)
          .maybeSingle(),
      ]);
      if (nfsRes.error) throw nfsRes.error;
      if (vigRes.error) throw vigRes.error;
      return { nfs: (nfsRes.data || []) as NotaFiscal[], vigente: (vigRes.data || null) as NfVigente | null };
    },
  });

  if (query.isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="m-4 rounded-lg border border-destructive/40 p-4 flex items-center justify-between gap-3">
        <span className="text-sm text-foreground">{parseError(query.error, "doc-saida-nf").title}</span>
        <Button size="sm" variant="outline" onClick={() => query.refetch()}>Tentar novamente</Button>
      </div>
    );
  }

  const { nfs, vigente } = query.data!;

  const copiar = async (chave: string) => {
    try {
      await navigator.clipboard.writeText(chave);
      toast.success("Chave copiada");
    } catch {
      toast.error("Não foi possível copiar a chave.");
    }
  };

  return (
    <div className="p-4 space-y-3">
      {vigente && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          <span>Status da consulta: <span className="text-foreground font-medium">{vigente.nf_status_consulta || "—"}</span></span>
          <span>Última consulta: <span className="text-foreground">{formatDateTime(vigente.nf_consultada_em)}</span></span>
          <span>NFs: <span className="text-foreground">{vigente.qtd_nfs ?? 0}</span> ({vigente.qtd_nfs_autorizadas ?? 0} autorizadas)</span>
        </div>
      )}

      {nfs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
          <FileText size={28} className="opacity-40" />
          <p className="text-sm">Nenhuma nota fiscal vinculada a este documento.</p>
          {vigente?.nf_status_consulta && <p className="text-xs">Status da consulta: {vigente.nf_status_consulta}</p>}
        </div>
      ) : (
        nfs.map((nf) => (
          <div key={nf.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <Campo label="Número / Série">
                <span className="inline-flex items-center gap-2">
                  <span className="font-mono">{nf.numero_nf ?? "—"}{nf.serie ? `/${nf.serie}` : ""}</span>
                  {vigente?.nf_id === nf.id && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-sky-500/15 text-sky-400 border-sky-500/30">Vigente</Badge>
                  )}
                </span>
              </Campo>
              <Campo label="Modelo">{nf.modelo || "—"}</Campo>
              <Campo label="Situação">
                {nf.situacao ? (
                  <Badge variant="outline" className={cn("text-[10px]", SITUACAO_CLS[nf.situacao] || "")}>{nf.situacao}</Badge>
                ) : "—"}
              </Campo>
              <Campo label="Chave NF-e" className="col-span-3">
                {nf.chave_nfe ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="font-mono break-all">{nf.chave_nfe}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Copiar chave NF-e" title="Copiar chave NF-e" onClick={() => copiar(nf.chave_nfe!)}>
                      <Copy size={13} />
                    </Button>
                  </span>
                ) : "—"}
              </Campo>
              <Campo label="Data de emissão">{formatDateTime(nf.data_emissao)}</Campo>
              <Campo label="Data de saída">{formatDateTime(nf.data_saida)}</Campo>
              {nf.data_cancelamento ? <Campo label="Data de cancelamento">{formatDateTime(nf.data_cancelamento)}</Campo> : <div />}
              <Campo label="Ambiente">{nf.tipo_ambiente ?? "—"}</Campo>
              <Campo label="Finalidade">{nf.finalidade ?? "—"}</Campo>
              <div />
              <Campo label="Valor total da NF"><span className="font-mono">{brl(nf.valor_total_nf)}</span></Campo>
              <Campo label="Valor dos produtos"><span className="font-mono">{brl(nf.valor_produtos)}</span></Campo>
              <Campo label="Valor do frete"><span className="font-mono">{brl(nf.valor_frete)}</span></Campo>
              <Campo label="Modalidade de frete">{nf.modalidade_frete ?? "—"}</Campo>
              <Campo label="Transportadora (cód. ERP)">{nf.id_transportadora_externo || "—"}</Campo>
              <Campo label="Qtd. de itens">{nf.qtd_itens != null ? Number(nf.qtd_itens).toLocaleString("pt-BR") : "—"}</Campo>
              <Campo label="Última sincronização">{formatDateTime(nf.ultima_sincronizacao_em)}</Campo>
            </div>
            {nf.sync_erro && (
              <Alert variant="destructive">
                <AlertTriangle size={14} />
                <AlertDescription className="text-xs">{nf.sync_erro}</AlertDescription>
              </Alert>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// formatDate exportado para evitar import não usado em futuras extensões
void formatDate;

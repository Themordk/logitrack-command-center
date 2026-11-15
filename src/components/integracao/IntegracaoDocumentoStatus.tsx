import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  avisoErrosAnteriores, estadoIntegracao, linhaIntegracao, motivoNaoEnviado, VISUAL_ESTADO,
  type IntegracaoDocumento,
} from "@/lib/integracaoStatus";

/**
 * Status de integração de um documento (S1): "Integrado · Expedição · 15/11 10:42", "Erro no ERP · …".
 * Só exibe o que o banco calculou (documento.integracao_*); o marcador livre da regra aparece no título.
 */
export function IntegracaoDocumentoStatus({ integracao, className }: { integracao: IntegracaoDocumento | null | undefined; className?: string }) {
  if (!integracao) return null;
  const estado = estadoIntegracao(integracao.estado) ?? "nao_integra";
  const v = VISUAL_ESTADO[estado];
  const aviso = avisoErrosAnteriores(integracao);
  const motivo = motivoNaoEnviado(estado);
  const titulo = [
    estado === "erro" && integracao.erro ? `Erro: ${integracao.erro}` : null,
    motivo,
    aviso,
    integracao.marcador ? `Marcador da regra: ${integracao.marcador}` : null,
  ].filter(Boolean).join("\n");
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <Badge variant="outline" className={cn("text-[10px]", v.classe)} title={titulo || undefined}>
        {linhaIntegracao(integracao)}
      </Badge>
      {estado === "erro" && integracao.erro && (
        <span className="max-w-[28rem] truncate text-[11px] text-rose-500" title={integracao.erro}>{integracao.erro}</span>
      )}
      {aviso && (
        <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400" title="Outra regra deste documento terminou com erro">
          <AlertTriangle size={11} aria-hidden /> {aviso}
        </span>
      )}
    </span>
  );
}

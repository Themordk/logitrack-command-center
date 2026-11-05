import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Copy, ExternalLink, Info } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { parseError } from "@/lib/errorMapper";
import { formatDateTime } from "@/utils/dateTime";
import { cn } from "@/lib/utils";
import type { EntidadeDocumentoEvento, EventoDocumento, FonteEvento } from "../eventosDocumento.types";
import { obterDetalheEventoDocumento } from "../eventosDocumentoService";
import { eventosDocumentoKeys } from "../eventosDocumentoKeys";
import { DIRECAO_UI, origemTexto } from "../eventosDocumentoUi";
import { SituacaoEventoBadge } from "./SituacaoEventoBadge";
import { JsonBloco } from "./JsonBloco";

interface Props {
  evento: EventoDocumento | null;
  tenantId: string;
  empresaId: string;
  entidade: EntidadeDocumentoEvento;
  documentoId: string;
  onFechar: () => void;
  /** Abre um retorno disparado (lista de execuções de retorno_evento). */
  onAbrirRetorno?: (execucaoId: string) => void;
}

type Dados = Record<string, unknown>;

const txt = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
};

async function copiar(valor: string) {
  try { await navigator.clipboard.writeText(valor); toast.success("Copiado"); }
  catch { toast.error("Não foi possível copiar."); }
}

function Campo({ rotulo, valor, copiavel, mono }: { rotulo: string; valor: string | null; copiavel?: boolean; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <div className="flex items-center gap-1 min-w-0">
        <span className={cn("text-xs text-foreground break-all", mono && "font-mono")}>{valor ?? "—"}</span>
        {copiavel && valor && (
          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" aria-label={`Copiar ${rotulo}`} onClick={() => copiar(valor)}>
            <Copy size={13} aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold text-foreground">{titulo}</h4>
      {children}
    </section>
  );
}

function Grade({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

interface ItemAlteracao { produto_codigo?: string; produto_descricao?: string; acao?: string; quantidade?: number | string; estagio?: string }
interface ExecucaoDisparada { id: string; status: string; fluxo_nome?: string; erro?: string | null }

function SecoesFonte({ fonte, d, onAbrirRetorno }: { fonte: FonteEvento; d: Dados; onAbrirRetorno?: (id: string) => void }) {
  switch (fonte) {
    case "documento_alteracao":
      return (
        <>
          <Grade>
            <Campo rotulo="Situação" valor={txt(d.situacao)} />
            <Campo rotulo="Tentativas" valor={txt(d.tentativas)} />
            <Campo rotulo="Alteração anterior" valor={txt(d.id_alteracao_anterior)} mono />
            <Campo rotulo="Processado em" valor={d.processado_em ? formatDateTime(String(d.processado_em)) : null} />
          </Grade>
          <JsonBloco titulo="Diferença" valor={d.diferenca} />
          <JsonBloco titulo="Documentos gerados" valor={d.documentos_gerados} />
          <JsonBloco titulo="Payload recebido" valor={d.payload} />
        </>
      );
    case "api_erro":
      return (
        <>
          <Secao titulo="Requisição">
            <Grade>
              <Campo rotulo="Método / caminho" valor={[txt(d.metodo), txt(d.caminho)].filter(Boolean).join(" ") || null} mono />
              <Campo rotulo="HTTP" valor={txt(d.http_status)} />
              <Campo rotulo="Ação" valor={txt(d.acao)} />
              <Campo rotulo="Duração" valor={d.duracao_ms != null ? `${Number(d.duracao_ms).toLocaleString("pt-BR")} ms` : null} />
            </Grade>
          </Secao>
          <Secao titulo="Erro">
            <p className="text-xs text-rose-400"><span className="font-mono">{txt(d.codigo_erro) ?? ""}</span> {txt(d.mensagem) ?? ""}</p>
          </Secao>
          <JsonBloco titulo="Detalhes" valor={d.detalhes} />
          {d.payload_truncado === true && (
            <p className="text-xs text-amber-400 flex items-center gap-1"><AlertTriangle size={13} aria-hidden /> Payload truncado pelo gateway</p>
          )}
          <JsonBloco titulo="Payload" valor={d.payload} />
        </>
      );
    case "documento_saida_cancelamento":
      return (
        <>
          <Grade>
            <Campo rotulo="Resultado" valor={txt(d.resultado)} />
            <Campo rotulo="Estágio" valor={txt(d.estagio)} />
            <Campo rotulo="Onda" valor={txt(d.numero_onda)} />
            <Campo rotulo="Retirada" valor={txt(d.status_retirada)} />
            <Campo rotulo="Código da recusa" valor={txt(d.codigo_recusa)} mono />
            <Campo rotulo="Motivo" valor={txt(d.motivo_texto)} />
          </Grade>
          <JsonBloco titulo="Impacto" valor={d.impacto} />
          <JsonBloco titulo="Resposta" valor={d.resposta} />
        </>
      );
    case "documento_saida_alteracao": {
      const itens = Array.isArray(d.itens) ? (d.itens as ItemAlteracao[]) : [];
      return (
        <>
          <Grade>
            <Campo rotulo="Modo" valor={txt(d.modo)} />
            <Campo rotulo="Situação" valor={txt(d.situacao)} />
            <Campo rotulo="Vínculo" valor={txt(d.numero_vinculo)} />
            <Campo rotulo="Erro" valor={txt(d.erro)} />
          </Grade>
          {itens.length > 0 && (
            <Secao titulo="Itens">
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/40 text-muted-foreground">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium">Código</th>
                      <th className="text-left px-2 py-1.5 font-medium">Descrição</th>
                      <th className="text-left px-2 py-1.5 font-medium">Ação</th>
                      <th className="text-right px-2 py-1.5 font-medium">Qtd.</th>
                      <th className="text-left px-2 py-1.5 font-medium">Estágio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((it, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="px-2 py-1.5 font-mono">{it.produto_codigo ?? "—"}</td>
                        <td className="px-2 py-1.5">{it.produto_descricao ?? "—"}</td>
                        <td className="px-2 py-1.5">{it.acao ?? "—"}</td>
                        <td className="px-2 py-1.5 text-right">{it.quantidade != null ? Number(it.quantidade).toLocaleString("pt-BR") : "—"}</td>
                        <td className="px-2 py-1.5">{it.estagio ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Secao>
          )}
          <JsonBloco titulo="Resumo" valor={d.resumo} />
        </>
      );
    }
    case "retorno_evento": {
      const execs = Array.isArray(d.execucoes) ? (d.execucoes as ExecucaoDisparada[]) : [];
      return (
        <>
          {txt(d.descricao) && <p className="text-xs text-muted-foreground">{txt(d.descricao)}</p>}
          <Grade>
            <Campo rotulo="Evento" valor={txt(d.evento)} mono />
            <Campo rotulo="Status" valor={txt(d.status)} />
          </Grade>
          <Secao titulo="Retornos disparados">
            {execs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum retorno foi disparado por este evento.</p>
            ) : (
              <ul className="space-y-1.5">
                {execs.map((x) => (
                  <li key={x.id} className="flex items-center gap-2 text-xs">
                    <SituacaoEventoBadge fonte="retorno_execucao" situacao={x.status} />
                    <span className="text-foreground truncate">{x.fluxo_nome ?? "Fluxo"}</span>
                    {onAbrirRetorno && (
                      <Button size="sm" variant="link" className="h-auto px-0 ml-auto text-xs" onClick={() => onAbrirRetorno(x.id)}>
                        <ExternalLink size={13} aria-hidden /> Abrir
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Secao>
          <JsonBloco titulo="Contexto" valor={d.contexto} />
        </>
      );
    }
    case "evento_integracao":
      return (
        <>
          <Grade>
            <Campo rotulo="Operação" valor={txt(d.operacao)} />
            <Campo rotulo="Id externo" valor={txt(d.id_externo)} mono copiavel />
          </Grade>
          <JsonBloco titulo="Payload" valor={d.payload} />
        </>
      );
    case "movimento_documento_remocao":
      return (
        <>
          <Grade>
            <Campo rotulo="Movimento" valor={txt(d.numero_movimento)} />
            <Campo rotulo="Status antes" valor={txt(d.status_movimento)} />
            <Campo rotulo="Status depois" valor={txt(d.status_movimento_final)} />
            <Campo rotulo="Observação" valor={txt(d.observacao)} />
          </Grade>
          <JsonBloco titulo="Impacto" valor={d.impacto} />
        </>
      );
    case "documento_evento_log":
      return (
        <>
          <Grade>
            <Campo rotulo="Tipo" valor={txt(d.tipo)} />
            <Campo rotulo="Origem" valor={txt(d.origem)} />
            <Campo rotulo="Motivo" valor={txt(d.motivo)} />
          </Grade>
          <JsonBloco titulo="Detalhe" valor={d.detalhe} />
        </>
      );
    case "retorno_execucao": {
      const caminho = d.caminho;
      return (
        <>
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
            Detalhes técnicos do envio disponíveis para quem tem acesso a Retornos ao ERP.
          </p>
          <Grade>
            <Campo rotulo="Fluxo" valor={txt(d.fluxo_nome)} />
            <Campo rotulo="Versão" valor={txt(d.fluxo_versao)} />
            <Campo rotulo="Status" valor={txt(d.status)} />
            <Campo rotulo="HTTP" valor={txt(d.erro_http_status)} />
            <Campo rotulo="Duração" valor={d.duracao_ms != null ? `${Number(d.duracao_ms).toLocaleString("pt-BR")} ms` : null} />
            <Campo rotulo="Erro" valor={txt(d.erro)} />
          </Grade>
          {typeof caminho === "string" ? <Campo rotulo="Caminho" valor={caminho} mono /> : <JsonBloco titulo="Caminho" valor={caminho} />}
        </>
      );
    }
    default:
      return null;
  }
}

export function EventoIntegracaoDetalheSheet({ evento, tenantId, empresaId, entidade, documentoId, onFechar, onAbrirRetorno }: Props) {
  const fonte = evento?.fonte;
  const q = useQuery({
    queryKey: eventosDocumentoKeys.detalhe(fonte ?? "documento", evento?.id ?? ""),
    queryFn: () => obterDetalheEventoDocumento({
      tenantId, empresaId, entidade, documentoId,
      fonte: fonte as Exclude<FonteEvento, "documento">,
      id: (evento as EventoDocumento).id,
    }),
    enabled: !!evento && evento.tem_detalhe && fonte !== "documento",
    staleTime: 60_000,
    retry: false,
  });

  const dir = evento ? DIRECAO_UI[evento.direcao] : null;
  const DirIcone = dir?.icone;
  const dados = q.data?.dados ?? {};

  return (
    <Sheet open={!!evento} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        {evento && (
          <div className="space-y-4">
            <SheetHeader className="space-y-2 text-left">
              <SheetTitle className="flex items-center gap-2 text-base pr-6">
                {DirIcone && <DirIcone size={15} className={dir?.texto} aria-label={dir?.rotulo} />}
                <span className="text-foreground">{evento.titulo}</span>
              </SheetTitle>
              <SheetDescription asChild>
                <div className="flex items-center gap-2 text-xs">
                  <SituacaoEventoBadge fonte={evento.fonte} situacao={evento.situacao} />
                  <span className="text-muted-foreground">{evento.ocorrido_em ? formatDateTime(evento.ocorrido_em) : "—"}</span>
                </div>
              </SheetDescription>
            </SheetHeader>

            <Grade>
              <Campo rotulo="Origem" valor={origemTexto(evento)} />
              <Campo rotulo="Usuário" valor={evento.ator_nome} />
              <Campo rotulo="Código" valor={evento.codigo} mono />
              <Campo rotulo="Id da alteração" valor={evento.id_alteracao ?? txt(dados.id_alteracao)} mono copiavel />
              <Campo rotulo="Id da requisição" valor={evento.request_id ?? txt(dados.request_id)} mono copiavel />
            </Grade>

            {evento.mensagem && (
              <div className={cn("rounded-lg border p-3 text-xs",
                evento.problema ? "border-rose-500/30 bg-rose-500/10 text-rose-400" : "border-border bg-secondary/30 text-foreground")}>
                {evento.mensagem}
              </div>
            )}

            {q.isLoading ? (
              <div className="space-y-2"><Skeleton className="h-6" /><Skeleton className="h-6" /><Skeleton className="h-24" /></div>
            ) : q.isError ? (
              <div className="rounded-lg border border-destructive/40 p-3 text-xs flex items-center gap-3">
                <span className="text-muted-foreground">{parseError(q.error, "doc-eventos-detalhe").title}</span>
                <Button size="sm" variant="outline" onClick={() => q.refetch()}>Tentar novamente</Button>
              </div>
            ) : q.data ? (
              <SecoesFonte fonte={q.data.fonte} d={dados} onAbrirRetorno={onAbrirRetorno} />
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

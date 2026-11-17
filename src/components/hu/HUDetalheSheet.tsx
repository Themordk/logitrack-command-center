/** Painel de detalhe da HU (H5): conteúdo, estoque atual, origem, histórico, impressões e ações permitidas. */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ban, Combine, Loader2, Lock, LockOpen, PackageOpen, Pencil, Printer, Split } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { parseError } from "@/lib/errorMapper";
import { formatDate as fmtDateBR } from "@/utils/dateTime";
import { huService, HuRpcError, type DetalheHU, type HULinha } from "@/lib/huService";
import { EVENTO_HU_LABEL, STATUS_HU, motivoDivergencia, textoConteudo, textoIdade } from "@/lib/huExibicao";
import { STATUS_IMPRESSAO } from "@/lib/volumesExibicao";

export type AcaoHU = "fechar" | "reabrir" | "desmontar" | "descartar";

interface Props {
  huId: string | null;
  onClose: () => void;
  onImprimir: (hus: HULinha[]) => void;
  onEditar: (hu: HULinha) => void;
  onAcao: (acao: AcaoHU, hu: HULinha) => void;
  onDividir: (hu: HULinha, itens: DetalheHU["itens"]) => void;
  onJuntar: (hu: HULinha) => void;
}

const dataHora = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const num = (v: unknown) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 }));

function Campo({ rotulo, valor, mono }: { rotulo: string; valor: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className={`text-sm text-foreground break-words ${mono ? "font-mono text-xs" : ""}`}>{valor || "—"}</div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{titulo}</h3>
      {children}
    </section>
  );
}

const Selo = ({ cls, children }: { cls: string; children: React.ReactNode }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${cls}`}>{children}</span>
);

const botao = "flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed";
const th = "px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase text-left";
const td = "px-2 py-1.5 align-top";

/** Resumo legível dos dados do evento (endereço, item, motivo). */
function detalheEvento(e: { evento: string; dados: Record<string, unknown> }): string {
  const d = e.dados || {};
  if (e.evento === "VERIFICADA") return `${d.confere ? "confere" : "não confere"} em ${d.endereco ?? "—"}`;
  if (d.hu_nova) return `HU nova ${d.hu_nova}`;
  if (d.hu_destino) return `para ${d.hu_destino}`;
  if (d.hu_origem) return `de ${d.hu_origem}`;
  if (d.endereco) return String(d.endereco);
  if (d.sku) return `${d.sku} · ${num(d.quantidade)} un.${d.lote ? ` · lote ${d.lote}` : ""}`;
  if (Array.isArray(d.itens)) return `${d.itens.length} item(ns)`;
  if (e.evento === "IMPRESSA" && d.copias) return `${d.copias} cópia(s)`;
  return "";
}

export function HUDetalheSheet({ huId, onClose, onImprimir, onEditar, onAcao, onDividir, onJuntar }: Props) {
  const q = useQuery({
    queryKey: ["hu-detalhe", huId],
    enabled: !!huId,
    queryFn: () => huService.detalhe(huId!),
  });
  const d = q.data;
  const h = d?.hu;
  const st = h ? STATUS_HU[h.status] ?? { label: h.status, cls: "" } : null;
  const divergencia = h ? motivoDivergencia(h) : null;

  return (
    <Sheet open={!!huId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{h?.codigo_hu ?? "HU"}</span>
            {st && <Selo cls={st.cls}>{st.label}</Selo>}
            {h && <span className="text-sm text-muted-foreground font-normal">{[h.tipo_hu, h.tamanho].filter(Boolean).join(" ")}</span>}
          </SheetTitle>
          <SheetDescription>
            {h ? `${textoConteudo(h)} · último movimento há ${textoIdade(h.horas_parada)}` : "Carregando..."}
          </SheetDescription>
        </SheetHeader>

        {q.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : q.isError ? (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {q.error instanceof HuRpcError ? q.error.message : parseError(q.error, "hu-detalhe").title}
          </div>
        ) : d && h ? (
          <div className="mt-4 space-y-5">
            <div className="flex flex-wrap gap-2">
              <button type="button" className={botao} disabled={!d.acoes.imprimir} onClick={() => onImprimir([h])}>
                <Printer size={14} /> {h.etiqueta_impressoes > 0 ? "Reimprimir etiqueta" : "Imprimir etiqueta"}
              </button>
              <button type="button" className={botao} disabled={!d.acoes.editar} onClick={() => onEditar(h)}>
                <Pencil size={14} /> Tipo, peso e medidas
              </button>
              {d.acoes.fechar && <button type="button" className={botao} onClick={() => onAcao("fechar", h)}><Lock size={14} /> Fechar</button>}
              {d.acoes.reabrir && <button type="button" className={botao} onClick={() => onAcao("reabrir", h)}><LockOpen size={14} /> Reabrir</button>}
              {d.acoes.dividir && <button type="button" className={botao} onClick={() => onDividir(h, d.itens)}><Split size={14} /> Dividir</button>}
              {d.acoes.juntar && <button type="button" className={botao} onClick={() => onJuntar(h)}><Combine size={14} /> Juntar em outra HU</button>}
              {d.acoes.desmontar && <button type="button" className={botao} onClick={() => onAcao("desmontar", h)}><PackageOpen size={14} /> Desmontar</button>}
              {d.acoes.descartar && (
                <button type="button" className={`${botao} text-red-400`} onClick={() => onAcao("descartar", h)}><Ban size={14} /> Descartar</button>
              )}
            </div>

            {divergencia && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> {divergencia}
              </div>
            )}

            <Secao titulo="Onde está">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Campo rotulo="Armazém" valor={h.armazem} />
                <Campo rotulo="Endereço" valor={h.endereco} mono />
                <Campo rotulo="Disponibilidade" valor={h.disponibilidade} />
                <Campo rotulo="Último evento" valor={h.ultimo_evento ? `${EVENTO_HU_LABEL[h.ultimo_evento] ?? h.ultimo_evento} · ${dataHora(h.ultimo_evento_em)}` : null} />
              </div>
            </Secao>

            <Secao titulo="Origem">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Campo rotulo="Recebimento" valor={h.numero_movimento} mono />
                <Campo rotulo="NF(s)" valor={h.nfs} mono />
                <Campo rotulo="Fornecedor(es)" valor={h.fornecedores} />
                <Campo rotulo="Criada" valor={`${dataHora(h.created_at)}${h.criado_por_nome ? ` · ${h.criado_por_nome}` : ""}`} />
                <Campo rotulo="Peso bruto (kg)" valor={num(h.peso_bruto)} />
                <Campo rotulo="Cubagem (m³)" valor={num(h.m3)} />
                <Campo rotulo="Altura" valor={num(h.altura)} />
              </div>
            </Secao>

            <Secao titulo={`Conteúdo (${d.itens.length})`}>
              {d.itens.length === 0 ? (
                <p className="text-xs text-muted-foreground">A HU não tem itens. Itens entram pela conferência de entrada no coletor.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border">
                    <th className={th}>Produto</th><th className={th}>Lote / validade</th><th className={`${th} text-right`}>Qtd.</th><th className={th}>Conferido</th>
                  </tr></thead>
                  <tbody>
                    {d.itens.map((i) => (
                      <tr key={i.hu_item_id} className="border-b border-border/50">
                        <td className={td}><div className="font-mono">{i.sku}</div><div className="text-muted-foreground">{i.descricao}</div></td>
                        <td className={td}>{i.lote ?? "—"}{i.validade ? ` · ${fmtDateBR(i.validade)}` : ""}</td>
                        <td className={`${td} text-right tabular-nums`}>{num(i.quantidade)}</td>
                        <td className={`${td} text-muted-foreground`}>{dataHora(i.conferido_em)}{i.conferido_por ? ` · ${i.conferido_por}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Secao>

            <Secao titulo="Estoque atual da HU">
              {d.estoque.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {h.status === "ARMAZENADA" ? "Sem saldo com esta HU no estoque." : "A HU ainda não está no estoque (é gravada na armazenagem)."}
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border">
                    <th className={th}>Endereço</th><th className={th}>Produto</th><th className={th}>Lote / validade</th><th className={`${th} text-right`}>Saldo</th>
                  </tr></thead>
                  <tbody>
                    {d.estoque.map((e, n) => (
                      <tr key={`${e.endereco}-${e.sku}-${n}`} className="border-b border-border/50">
                        <td className={`${td} font-mono`}>{e.endereco ?? "—"}</td>
                        <td className={td}><span className="font-mono">{e.sku}</span> <span className="text-muted-foreground">{e.descricao}</span></td>
                        <td className={td}>{e.lote ?? "—"}{e.validade ? ` · ${fmtDateBR(e.validade)}` : ""}</td>
                        <td className={`${td} text-right tabular-nums`}>{num(e.quantidade)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Secao>

            <Secao titulo={`Etiquetas (${d.impressoes.length})`}>
              {d.impressoes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma etiqueta enviada para a impressora.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {d.impressoes.map((i) => {
                    const s = STATUS_IMPRESSAO[i.status as keyof typeof STATUS_IMPRESSAO];
                    return (
                      <li key={i.id} className="flex flex-wrap items-center gap-2">
                        <span className={s?.cls ?? "text-foreground"}>{s?.label ?? i.status}</span>
                        <span className="text-muted-foreground">{dataHora(i.criado_em)} · {i.impressora ?? "—"} · {i.copias} cópia(s)</span>
                        {i.erro && <span className="text-red-400">{i.erro}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Secao>

            <Secao titulo="Histórico">
              {d.eventos.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem eventos registrados.</p>
              ) : (
                <ol className="space-y-2 border-l border-border pl-3">
                  {d.eventos.map((e, n) => (
                    <li key={`${e.created_at}-${n}`} className="text-xs">
                      <div className="text-foreground font-medium">
                        {EVENTO_HU_LABEL[e.evento] ?? e.evento}
                        {e.status_novo && e.status_anterior && e.status_novo !== e.status_anterior && (
                          <span className="text-muted-foreground font-normal"> · {STATUS_HU[e.status_anterior as keyof typeof STATUS_HU]?.label ?? e.status_anterior} → {STATUS_HU[e.status_novo as keyof typeof STATUS_HU]?.label ?? e.status_novo}</span>
                        )}
                      </div>
                      <div className="text-muted-foreground">
                        {dataHora(e.created_at)}{e.usuario ? ` · ${e.usuario}` : ""}{detalheEvento(e) ? ` · ${detalheEvento(e)}` : ""}
                      </div>
                      {e.observacao && <div className="text-foreground/80">Motivo: {e.observacao}</div>}
                    </li>
                  ))}
                </ol>
              )}
            </Secao>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

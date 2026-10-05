import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, FileSearch, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/dateTime";
import { GRUPO_NO_UI, TIPO_NO_UI } from "../retornosUi";
import { retornosKeys } from "../retornosKeys";
import { documentosRecentes } from "../retornosService";
import type { Aviso, Catalogo, Destino, DocumentoRecente, TipoNo } from "../retornos.types";
import { ContextoTree } from "./campos/ContextoTree";
import { PainelContext, listarCaminhos } from "./campos/painelContext";
import type { FluxoNode } from "./definicaoRf";
import { ParametrosAtualizar, ParametrosHttp, ParametrosNotificar, ParametrosProvedor, ParametrosWebhook, ResultadoAtualizar, ResultadoHttp, ResultadoNotificar, ResultadoProvedor, ResultadoWebhook } from "./forms/FormAcoes";
import { ParametrosPayload, ResultadoPayload } from "./forms/FormPayload";
import { contextoLote } from "./avaliacao";
import { ParametrosGatilho, ResultadoGatilho } from "./forms/FormGatilho";
import { ParametrosAguardar, ParametrosCondicao, ResultadoAguardar, ResultadoCondicao } from "./forms/FormLogica";
import type { FormNoProps } from "./forms/formTypes";
import type { Ligacao } from "../retornos.types";
import { nomeTipo } from "./resumoNo";

const FORMS: Partial<Record<TipoNo, [ComponentType<FormNoProps>, ComponentType<FormNoProps>]>> = {
  "gatilho.evento": [ParametrosGatilho, ResultadoGatilho],
  "gatilho.manual": [ParametrosGatilho, ResultadoGatilho],
  "logica.condicao": [ParametrosCondicao, ResultadoCondicao],
  "logica.aguardar": [ParametrosAguardar, ResultadoAguardar],
  "dados.payload": [ParametrosPayload, ResultadoPayload],
  "acao.http": [ParametrosHttp, ResultadoHttp],
  "acao.webhook": [ParametrosWebhook, ResultadoWebhook],
  "acao.provedor": [ParametrosProvedor, ResultadoProvedor],
  "acao.atualizar_documento": [ParametrosAtualizar, ResultadoAtualizar],
  "acao.notificar": [ParametrosNotificar, ResultadoNotificar],
};

const CONTEXTO_VAZIO: Record<string, unknown> = {
  evento: null, evento_nome: null, ocorrido_em: null,
  empresa: { id: null, codigo: null, cnpj: null, razao_social: null },
  operador: { id: null, nome: null, login: null },
  documento: { id: null, numero: null, codigo_erp: null, sistema_origem: null, status_wms: null, status_integracao: null, tipo: { id: null, descricao: null, codigo_erp: null } },
  parceiro: { id: null, codigo_erp: null, documento: null, razao_social: null },
  movimento: { id: null, numero: null, status: null },
  itens: [{ produto: { sku: null, codigo_erp: null, descricao: null }, qtd_solicitada: null, qtd_atendida: null, qtd_cortada: null }],
  erro: { mensagem: null, http_status: null },
};

interface Props {
  no: FluxoNode | null;
  nos: FluxoNode[];
  ligacoes: Ligacao[];
  catalogo?: Catalogo;
  destinos?: Destino[];
  avisos: Aviso[];
  evento: string | null;
  tenantId: string;
  empresaId: string;
  fluxoId: string;
  somenteLeitura: boolean;
  amostra: DocumentoRecente | null;
  onDefinirAmostra: (d: DocumentoRecente) => void;
  onFechar: () => void;
  onRenomear: (nome: string) => void;
  onAlterar: (config: Record<string, unknown>, tipo?: TipoNo) => void;
  onAbrirNo: (id: string) => void;
}

function linhaDoErro(texto: string, msg: string): number {
  const l = /line (\d+)/i.exec(msg);
  if (l) return Number(l[1]);
  const p = /position (\d+)/i.exec(msg);
  return p ? texto.slice(0, Number(p[1])).split("\n").length : 1;
}

function SeletorAmostra({ evento, tenantId, empresaId, amostra, onDefinir }: {
  evento: string | null; tenantId: string; empresaId: string; amostra: DocumentoRecente | null; onDefinir: (d: DocumentoRecente) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [buscaExata, setBuscaExata] = useState("");
  const recentes = useQuery({
    queryKey: retornosKeys.docsRecentes(tenantId, empresaId, evento ?? "", "[]", ""),
    queryFn: () => documentosRecentes({ tenantId, empresaId, evento: evento as string, filtros: [], combinador: "e", limite: 20 }),
    enabled: !!evento,
  });
  const exata = useQuery({
    queryKey: retornosKeys.docsRecentes(tenantId, empresaId, evento ?? "", "[]", buscaExata),
    queryFn: () => documentosRecentes({ tenantId, empresaId, evento: evento as string, filtros: [], combinador: "e", limite: 20, busca: buscaExata }),
    enabled: !!evento && !!buscaExata,
  });
  const docs = useMemo(() => recentes.data ?? [], [recentes.data]);

  useEffect(() => { if (!amostra && docs[0]) onDefinir(docs[0]); }, [amostra, docs, onDefinir]);

  const q = texto.trim().toLowerCase();
  const filtrados = useMemo(() => {
    const base = q ? docs.filter((d) => d.numero.toLowerCase().includes(q) || (d.codigo_erp ?? "").toLowerCase().includes(q)) : docs;
    const extras = (exata.data ?? []).filter((d) => !base.some((b) => b.documento_id === d.documento_id));
    return [...extras, ...base];
  }, [docs, q, exata.data]);

  if (!evento) return <p className="text-xs text-muted-foreground">Escolha o evento do gatilho para carregar documentos.</p>;
  if (recentes.isLoading) return <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin" /> Carregando…</p>;
  if (!docs.length && !amostra) {
    return <p className="text-xs text-muted-foreground">Nenhum documento recente para este evento. A pré-visualização usará um exemplo vazio.</p>;
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={aberto} aria-label="Documento de amostra" className="h-10 w-full justify-between bg-secondary/40">
          <span className="truncate font-mono text-xs">{amostra ? `${amostra.numero} · ${amostra.tipo ?? ""}` : "Escolha"}</span>
          <ChevronsUpDown size={13} className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-2">
        <div className="relative mb-1">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input autoFocus aria-label="Buscar documento" placeholder="Número ou código ERP (Enter busca exato)" value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && texto.trim()) { e.preventDefault(); setBuscaExata(texto.trim()); } }}
            className="h-8 pl-7 text-xs bg-secondary/40" />
        </div>
        {exata.isFetching && <p className="px-2 py-1 text-xs text-muted-foreground">Buscando…</p>}
        <ul className="max-h-64 overflow-y-auto">
          {filtrados.map((d) => (
            <li key={`${d.documento_id}-${d.movimento_id ?? ""}`}>
              <button type="button" onClick={() => { onDefinir(d); setAberto(false); }}
                className={cn("flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-secondary", amostra?.documento_id === d.documento_id && "bg-secondary/60")}>
                <span className="min-w-0"><span className="font-mono">{d.numero}</span> <span className="text-muted-foreground">{d.tipo ?? ""}</span></span>
                <span className="shrink-0 text-muted-foreground">{formatDateTime(d.quando)}</span>
              </button>
            </li>
          ))}
          {!filtrados.length && <li className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum documento. Pressione Enter para buscar o número exato.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function NodeConfigDialog(p: Props) {
  const { no } = p;
  const [nome, setNome] = useState("");
  const [modo, setModo] = useState<"form" | "json">("form");
  const [texto, setTexto] = useState("");
  const [erroJson, setErroJson] = useState<string | null>(null);
  const noId = no?.id;
  const par = no ? FORMS[no.data.tipo] : undefined;

  useEffect(() => {
    if (!no) return;
    setNome(no.data.nome ?? "");
    setModo(FORMS[no.data.tipo] ? "form" : "json");
    setTexto(JSON.stringify(no.data.config ?? {}, null, 2));
    setErroJson(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noId]);

  const agrupado = p.nos.some((n) => n.data.tipo === "gatilho.evento" && n.data.config.modo === "agrupado");
  const contextoBase = (p.amostra?.contexto as Record<string, unknown> | undefined) ?? CONTEXTO_VAZIO;
  const contexto = useMemo(() => (agrupado ? contextoLote(contextoBase) : contextoBase), [agrupado, contextoBase]);
  const caminhos = useMemo(() => listarCaminhos(contexto), [contexto]);

  const aplicarJson = (): boolean => {
    if (p.somenteLeitura || !no) return true;
    try {
      const v: unknown = JSON.parse(texto);
      if (!v || typeof v !== "object" || Array.isArray(v)) { setErroJson("A configuração precisa ser um objeto JSON."); return false; }
      setErroJson(null);
      if (JSON.stringify(v) !== JSON.stringify(no.data.config)) p.onAlterar(v as Record<string, unknown>);
      return true;
    } catch (e) {
      setErroJson(`JSON inválido na linha ${linhaDoErro(texto, e instanceof Error ? e.message : "")}`);
      return false;
    }
  };

  const trocarModo = (m: string) => {
    if (!m || m === modo || !no) return;
    if (m === "form") { if (!aplicarJson()) return; }
    else setTexto(JSON.stringify(no.data.config ?? {}, null, 2));
    setModo(m as "form" | "json");
  };

  const confirmarNome = () => {
    if (!no || p.somenteLeitura) return;
    const n = nome.trim();
    if (n !== (no.data.nome ?? "")) p.onRenomear(n);
  };

  const fechar = () => {
    confirmarNome();
    if (modo === "json" && !aplicarJson()) return;
    p.onFechar();
  };

  const ui = no ? TIPO_NO_UI[no.data.tipo] : null;
  const Icone = ui?.icone;
  const descricao = no ? p.catalogo?.nos.find((n) => n.tipo === no.data.tipo)?.descricao : "";
  const formProps: FormNoProps | null = no ? {
    no, config: no.data.config, alterar: p.onAlterar, catalogo: p.catalogo, destinos: p.destinos, nos: p.nos, ligacoes: p.ligacoes,
    contexto, amostra: p.amostra, onDefinirAmostra: p.onDefinirAmostra, avisos: p.avisos,
    tenantId: p.tenantId, empresaId: p.empresaId, fluxoId: p.fluxoId, onAbrirNo: p.onAbrirNo, somenteLeitura: p.somenteLeitura,
  } : null;
  const [Parametros, Resultado] = par ?? [null, null];

  return (
    <Dialog open={!!no} onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="flex h-[85vh] max-w-[1400px] w-[96vw] flex-col gap-0 p-0 overflow-hidden">
        <div className="flex items-start gap-3 border-b border-border px-5 py-3 pr-12">
          {Icone && ui && <Icone size={18} className={cn("mt-1.5", GRUPO_NO_UI[ui.grupo].icone)} aria-hidden />}
          <div className="flex min-w-0 flex-1 flex-col">
            <DialogTitle className="sr-only">{no ? nomeTipo(no.data.tipo, p.catalogo) : ""}</DialogTitle>
            <input
              aria-label="Nome do nó"
              value={nome}
              maxLength={60}
              disabled={p.somenteLeitura}
              placeholder={no ? nomeTipo(no.data.tipo, p.catalogo) : ""}
              onChange={(e) => setNome(e.target.value)}
              onBlur={confirmarNome}
              onKeyDown={(e) => { if (e.key === "Enter") confirmarNome(); }}
              className="rounded bg-transparent px-1 text-base font-semibold text-foreground hover:bg-secondary/40 focus:bg-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <DialogDescription className="px-1 text-xs">{no ? nomeTipo(no.data.tipo, p.catalogo) : ""} · {descricao}</DialogDescription>
          </div>
          <ToggleGroup type="single" value={modo} onValueChange={trocarModo} className="rounded-lg border border-border bg-secondary p-0.5">
            <ToggleGroupItem value="form" disabled={!par} className="h-7 px-3 text-xs" aria-label="Formulário">Formulário</ToggleGroupItem>
            <ToggleGroupItem value="json" className="h-7 px-3 text-xs" aria-label="JSON">JSON</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <PainelContext.Provider value={{ contexto, caminhos, somenteLeitura: p.somenteLeitura }}>
          <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
            <ResizablePanel defaultSize={26} minSize={16} className="flex flex-col min-h-0">
              <div className="px-4 py-2.5 border-b border-border bg-secondary/30"><h3 className="text-sm font-semibold">Entrada</h3></div>
              <div className="flex flex-col gap-3 overflow-y-auto p-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Documento de amostra</span>
                  <SeletorAmostra evento={p.evento} tenantId={p.tenantId} empresaId={p.empresaId} amostra={p.amostra} onDefinir={p.onDefinirAmostra} />
                </div>
                {agrupado && <p className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-1.5 text-[11px] text-violet-400">Fluxo agrupado: a amostra simula um lote com 1 documento.</p>}
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><FileSearch size={12} aria-hidden /> Clique copia o caminho; arraste para um campo.</p>
                <ContextoTree contexto={contexto} />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={44} minSize={25} className="flex flex-col min-h-0">
              <div className="px-4 py-2.5 border-b border-border bg-secondary/30"><h3 className="text-sm font-semibold">Parâmetros</h3></div>
              <div className="flex-1 overflow-y-auto p-4">
                {modo === "json" || !Parametros || !formProps ? (
                  <div className="flex h-full flex-col gap-1.5">
                    {!par && <p className="text-xs text-muted-foreground">O formulário deste nó chega numa próxima etapa. Edite a configuração em JSON.</p>}
                    <label htmlFor="no-config-json" className="text-xs uppercase tracking-wide text-muted-foreground">Configuração (JSON)</label>
                    <Textarea id="no-config-json" value={texto} disabled={p.somenteLeitura} spellCheck={false}
                      onChange={(e) => setTexto(e.target.value)} onBlur={() => { aplicarJson(); }}
                      className="min-h-[320px] flex-1 rounded-lg bg-secondary/40 font-mono text-xs" aria-invalid={!!erroJson} />
                    {erroJson && <p className="text-xs text-rose-400" role="alert">{erroJson}</p>}
                  </div>
                ) : <Parametros {...formProps} />}
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={30} minSize={18} className="flex flex-col min-h-0">
              <div className="px-4 py-2.5 border-b border-border bg-secondary/30"><h3 className="text-sm font-semibold">Resultado</h3></div>
              <div className="flex-1 overflow-y-auto p-4">
                {Resultado && formProps ? <Resultado {...formProps} /> : <p className="text-xs text-muted-foreground">Sem pré-visualização para este nó.</p>}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </PainelContext.Provider>

        <div className="flex justify-end border-t border-border px-5 py-3">
          <Button variant="secondary" onClick={fechar}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

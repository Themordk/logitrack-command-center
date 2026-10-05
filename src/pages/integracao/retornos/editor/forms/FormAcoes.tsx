import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { obterCaminho, renderTemplate } from "../avaliacao";
import type { Destino, MetodoHttp } from "../../retornos.types";
import { BlocoCodigo, Campo, Secao } from "../campos/Campo";
import { TemplateInput } from "../campos/TemplateInput";
import { entidadeDoGatilho } from "../novoNo";
import type { FormNoProps } from "./formTypes";
import { payloadAnterior, previaOmie, previaRequisicao, type PreviaRequisicao } from "../previaRequisicao";
import { usePreviaPayload } from "../usePreviaPayload";

const HEADERS_PROIBIDOS = ["authorization", "x-api-key", "cookie", "proxy-authorization"];
const METODOS: MetodoHttp[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const ULTIMO = "__ultimo";

function abrirDestinos() {
  window.open(`${window.location.origin}${window.location.pathname}#/config/integracao/retornos?aba=destinos`, "_blank", "noopener");
}

function SelectDestino({ p, modo }: { p: FormNoProps; modo: "http" | "webhook" }) {
  const lista = (p.destinos ?? []).filter((d) => d.ativo && d.modo === modo);
  const atual = p.config.destino_id as string | undefined;
  return (
    <Campo rotulo="Destino *" htmlFor="dest" dica={
      <button type="button" onClick={abrirDestinos} className="inline-flex items-center gap-1 text-primary hover:underline">
        Gerenciar destinos <ExternalLink size={11} aria-hidden />
      </button>
    }>
      <Select value={atual ?? ""} disabled={p.somenteLeitura} onValueChange={(v) => p.alterar({ ...p.config, destino_id: v })}>
        <SelectTrigger id="dest" className="h-10 rounded-lg bg-secondary/40"><SelectValue placeholder="Escolha um destino" /></SelectTrigger>
        <SelectContent>
          {lista.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome} <span className="text-muted-foreground">· {d.url_base}</span></SelectItem>)}
          {!lista.length && <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum destino ativo deste tipo.</div>}
        </SelectContent>
      </Select>
    </Campo>
  );
}

const destinoDe = (p: FormNoProps): Destino | undefined => p.destinos?.find((d) => d.id === p.config.destino_id);

// ---------- HTTP ----------
function HeadersExtras({ p }: { p: FormNoProps }) {
  const inicial = Object.entries((p.config.headers as Record<string, string>) ?? {});
  const [linhas, setLinhas] = useState<[string, string][]>(inicial.length ? inicial : []);
  useEffect(() => { setLinhas(Object.entries((p.config.headers as Record<string, string>) ?? {})); }, [p.no.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (ls: [string, string][]) => {
    setLinhas(ls);
    const h: Record<string, string> = {};
    ls.forEach(([k, v]) => { const n = k.trim(); if (n && !HEADERS_PROIBIDOS.includes(n.toLowerCase())) h[n] = v; });
    const { headers: _h, ...resto } = p.config;
    p.alterar(Object.keys(h).length ? { ...resto, headers: h } : resto);
  };

  return (
    <Campo rotulo="Headers extras">
      <div className="flex flex-col gap-2">
        {linhas.map(([k, v], i) => {
          const proibido = HEADERS_PROIBIDOS.includes(k.trim().toLowerCase());
          return (
            <div key={i} className="flex flex-col gap-1">
              <div className="grid grid-cols-[1fr_1.5fr_auto] items-start gap-2">
                <Input aria-label={`Nome do header ${i + 1}`} value={k} disabled={p.somenteLeitura} placeholder="X-Header"
                  onChange={(e) => commit(linhas.map((l, j) => (j === i ? [e.target.value, l[1]] : l)))}
                  className="h-9 rounded-lg bg-secondary/40 font-mono text-xs" aria-invalid={proibido} />
                <TemplateInput aria-label={`Valor do header ${i + 1}`} value={v} onChange={(nv) => commit(linhas.map((l, j) => (j === i ? [l[0], nv] : l)))} />
                {!p.somenteLeitura && (
                  <Button type="button" size="icon" variant="ghost" className="h-9 w-9" aria-label={`Remover header ${i + 1}`} onClick={() => commit(linhas.filter((_, j) => j !== i))}>
                    <Trash2 size={13} />
                  </Button>
                )}
              </div>
              {proibido && <p className="text-xs text-rose-400">Credencial em header não é permitida. Use a autenticação do destino.</p>}
            </div>
          );
        })}
        {!p.somenteLeitura && (
          <Button type="button" size="sm" variant="ghost" className="self-start gap-1.5 text-primary" onClick={() => setLinhas([...linhas, ["", ""]])}>
            <Plus size={13} /> Adicionar header
          </Button>
        )}
      </div>
    </Campo>
  );
}

export function ParametrosHttp(p: FormNoProps) {
  const d = destinoDe(p);
  const metodo = (p.config.metodo as MetodoHttp) ?? d?.metodo ?? "POST";
  const payloads = p.nos.filter((n) => n.data.tipo === "dados.payload");
  const semCorpo = metodo === "GET" || metodo === "DELETE";
  return (
    <div className="flex flex-col gap-5">
      <SelectDestino p={p} modo="http" />
      <Campo rotulo="Método" htmlFor="http-metodo">
        <Select value={metodo} disabled={p.somenteLeitura} onValueChange={(v) => p.alterar({ ...p.config, metodo: v })}>
          <SelectTrigger id="http-metodo" className="h-10 w-36 rounded-lg bg-secondary/40"><SelectValue /></SelectTrigger>
          <SelectContent>{METODOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </Campo>
      <Campo rotulo="Caminho" htmlFor="http-caminho">
        <TemplateInput id="http-caminho" value={(p.config.caminho as string) ?? ""} placeholder="/pedidos/{{documento.codigo_erp}}"
          onChange={(v) => p.alterar({ ...p.config, caminho: v })} />
      </Campo>
      <Campo rotulo="Corpo" htmlFor="http-corpo">
        <Select value={(p.config.corpo_de as string) ?? ULTIMO} disabled={p.somenteLeitura || semCorpo}
          onValueChange={(v) => {
            const { corpo_de: _c, ...resto } = p.config;
            p.alterar(v === ULTIMO ? resto : { ...resto, corpo_de: v });
          }}>
          <SelectTrigger id="http-corpo" className="h-10 rounded-lg bg-secondary/40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ULTIMO}>Último payload montado</SelectItem>
            {payloads.map((n) => <SelectItem key={n.id} value={n.id}>{n.data.nome || n.id}</SelectItem>)}
          </SelectContent>
        </Select>
      </Campo>
      <HeadersExtras p={p} />
    </div>
  );
}

function Aviso({ cor, children }: { cor: "amber" | "rose"; children: React.ReactNode }) {
  const c = cor === "amber" ? "border-amber-500/30 bg-amber-500/10 text-amber-400" : "border-rose-500/30 bg-rose-500/10 text-rose-400";
  return <p className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-xs", c)}><AlertTriangle size={13} className="shrink-0" aria-hidden /> {children}</p>;
}

/** Requisição como o servidor monta (previaRequisicao), com o corpo do payload do caminho. */
function useRequisicao(p: FormNoProps, tipo: "acao.http" | "acao.webhook") {
  const d = destinoDe(p);
  const corpoDe = p.config.corpo_de as string | undefined;
  const anterior = useMemo(() => payloadAnterior(p.no.id, p.nos.map((n) => ({ id: n.id, tipo: n.data.tipo })), p.ligacoes), [p.no.id, p.nos, p.ligacoes]);
  const noCorpo = p.nos.find((n) => n.id === (corpoDe ?? anterior.id));
  const previa = usePreviaPayload(noCorpo?.data.config, p.contexto, p.tenantId, p.empresaId, p.fluxoId);
  const [req, setReq] = useState<PreviaRequisicao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const chave = JSON.stringify([p.config, d?.id, noCorpo ? previa.valor ?? null : "__sem"]);
  useEffect(() => {
    if (!d || (noCorpo && previa.calculando)) { if (!d) setReq(null); return; }
    let vivo = true;
    previaRequisicao({ tipo, noId: p.no.id, config: p.config, destino: d, contexto: p.contexto, corpoPayload: noCorpo ? previa.valor ?? null : undefined })
      .then((r) => { if (vivo) { setReq(r); setErro(null); } })
      .catch((e: unknown) => { if (vivo) setErro((e as { message?: string })?.message ?? "Falha ao montar a prévia"); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, p.contexto, previa.calculando]);
  return { d, req, erro, noCorpo, ambiguo: !corpoDe && anterior.ambiguo, erroCorpo: noCorpo ? previa.erro : undefined };
}

function VisaoRequisicao({ p, r }: { p: FormNoProps; r: ReturnType<typeof useRequisicao> }) {
  const { req } = r;
  return (
    <>
      {!r.d && <p className="text-xs text-rose-400">Escolha um destino ativo desta empresa.</p>}
      {r.erro && <Aviso cor="rose">{r.erro}</Aviso>}
      {req?.bloqueio && <Aviso cor="rose">O servidor recusaria esta URL: {req.bloqueio}</Aviso>}
      {r.ambiguo && <Aviso cor="amber">O corpo depende do caminho: há mais de um ‘Montar payload’ antes deste nó. Use ‘Corpo’ para escolher um.</Aviso>}
      {req && (
        <>
          <BlocoCodigo><span className="font-semibold text-primary">{req.metodo}</span> {req.url}</BlocoCodigo>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Headers</p>
            <BlocoCodigo>{Object.keys(req.headers).length ? Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\n") : "—"}</BlocoCodigo>
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Corpo</p>
            {r.erroCorpo ? <Aviso cor="rose">{r.erroCorpo}</Aviso> : <BlocoCodigo>{req.corpo === null ? "(sem corpo)" : JSON.stringify(req.corpo, null, 2)}</BlocoCodigo>}
            {r.noCorpo && (
              <p className="mt-1 text-[11px] text-muted-foreground">Calculado pelo nó{" "}
                <button type="button" className="text-primary hover:underline" onClick={() => p.onAbrirNo(r.noCorpo!.id)}>{r.noCorpo.data.nome || r.noCorpo.id}</button>
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}

export function ResultadoHttp(p: FormNoProps) {
  const r = useRequisicao(p, "acao.http");
  return (
    <div className="flex flex-col gap-3">
      {r.d && !r.noCorpo && <Aviso cor="amber">Sem “Montar payload” antes deste nó: o servidor envia {"{}"} como corpo.</Aviso>}
      <VisaoRequisicao p={p} r={r} />
    </div>
  );
}

// ---------- Webhook ----------
export function ParametrosWebhook(p: FormNoProps) {
  return (
    <div className="flex flex-col gap-5">
      <SelectDestino p={p} modo="webhook" />
      <Campo rotulo="Caminho (opcional)" htmlFor="wh-caminho">
        <TemplateInput id="wh-caminho" value={(p.config.caminho as string) ?? ""} placeholder="/eventos"
          onChange={(v) => { const { caminho: _c, ...r } = p.config; p.alterar(v ? { ...r, caminho: v } : r); }} />
      </Campo>
    </div>
  );
}

export function ResultadoWebhook(p: FormNoProps) {
  const r = useRequisicao(p, "acao.webhook");
  return (
    <div className="flex flex-col gap-3">
      {r.req && !r.req.assinado && <Aviso cor="rose">Este destino não tem HMAC: o envelope iria sem assinatura.</Aviso>}
      <VisaoRequisicao p={p} r={r} />
    </div>
  );
}

// ---------- Ação do ERP ----------
export function ParametrosProvedor(p: FormNoProps) {
  const ent = entidadeDoGatilho(p.nos, p.catalogo);
  const ops = (p.catalogo?.operacoes_provedor ?? []).filter((o) => !ent || o.entidade === ent);
  const atual = p.catalogo?.operacoes_provedor.find((o) => o.operacao === p.config.operacao);
  const params = (p.config.parametros as Record<string, string>) ?? {};
  return (
    <div className="flex flex-col gap-5">
      <Campo rotulo="Operação" htmlFor="erp-op">
        <Select value={(p.config.operacao as string) ?? ""} disabled={p.somenteLeitura}
          onValueChange={(v) => { const op = ops.find((o) => o.operacao === v); p.alterar({ ...p.config, provedor: "omie", operacao: v, parametros: { ...(op?.parametros ?? {}) } }); }}>
          <SelectTrigger id="erp-op" className="h-10 rounded-lg bg-secondary/40"><SelectValue placeholder="Escolha a operação" /></SelectTrigger>
          <SelectContent>{ops.map((o) => <SelectItem key={o.operacao} value={o.operacao}>{o.nome}</SelectItem>)}</SelectContent>
        </Select>
      </Campo>
      {Object.keys({ ...(atual?.parametros ?? {}), ...params }).map((k) => (
        <Campo key={k} rotulo={k} htmlFor={`erp-${k}`}>
          <Input id={`erp-${k}`} value={params[k] ?? ""} disabled={p.somenteLeitura} placeholder={atual?.parametros[k]}
            onChange={(e) => p.alterar({ ...p.config, parametros: { ...params, [k]: e.target.value } })}
            className="h-10 rounded-lg bg-secondary/40 font-mono text-xs" />
        </Campo>
      ))}
    </div>
  );
}

export function ResultadoProvedor(p: FormNoProps) {
  const semConexao = p.avisos.find((a) => a.codigo === "PROVEDOR_SEM_CONEXAO");
  const res = p.config.operacao ? previaOmie(p.config, p.contexto) : null;
  return (
    <div className="flex flex-col gap-3">
      {semConexao && <Aviso cor="amber">{semConexao.mensagem}</Aviso>}
      {!res && <BlocoCodigo>Escolha a operação.</BlocoCodigo>}
      {res && res.ok === false && <Aviso cor="rose">{res.erro}</Aviso>}
      {res?.ok && res.observacao && <p className="text-xs text-muted-foreground">{res.observacao}</p>}
      {res?.ok && res.chamadas.map((c, i) => (
        <div key={i}>
          <p className="mb-1 font-mono text-xs text-primary">{c.call} · {c.endpoint}</p>
          <BlocoCodigo>{JSON.stringify(c.param, null, 2)}</BlocoCodigo>
        </div>
      ))}
    </div>
  );
}

// ---------- Atualizar documento ----------
export function ParametrosAtualizar(p: FormNoProps) {
  return (
    <div className="flex flex-col gap-5">
      <Campo rotulo="Status de integração" htmlFor="at-status">
        <TemplateInput id="at-status" value={(p.config.status_integracao as string) ?? ""} sugestoes={["retornado", "retornado_erp", "retorno_erro"]}
          onChange={(v) => p.alterar({ ...p.config, status_integracao: v })} />
      </Campo>
      <div className="flex items-start gap-3">
        <Switch id="at-exp" checked={!!p.config.marcar_exportado} disabled={p.somenteLeitura}
          onCheckedChange={(v) => p.alterar({ ...p.config, marcar_exportado: v })} />
        <label htmlFor="at-exp" className="flex flex-col gap-0.5 text-sm">
          Marcar como exportado ao ERP
          <span className="text-xs text-muted-foreground">Muda a situação do documento para exportado, como o retorno legado faz.</span>
        </label>
      </div>
    </div>
  );
}

export function ResultadoAtualizar(p: FormNoProps) {
  const numero = obterCaminho(p.contexto, "documento.numero") ?? p.amostra?.numero ?? "—";
  return (
    <div className="flex flex-col gap-2 text-sm">
      <BlocoCodigo>
        {`No documento ${String(numero)}:\nstatus_integracao = ${renderTemplate((p.config.status_integracao as string) ?? "", p.contexto) || "(vazio)"}`}
        {p.config.marcar_exportado ? "\nsituação = exportado" : ""}
      </BlocoCodigo>
      <p className="text-xs text-muted-foreground">Em Testar/Simular nada é gravado.</p>
    </div>
  );
}

// ---------- Notificar ----------
const CORES = [
  { v: "red", r: "Vermelho", c: "border-rose-500/40 bg-rose-500/10 text-rose-400" },
  { v: "orange", r: "Laranja", c: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
  { v: "blue", r: "Azul", c: "border-sky-500/40 bg-sky-500/10 text-sky-400" },
  { v: "green", r: "Verde", c: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
];

export function ParametrosNotificar(p: FormNoProps) {
  const titulo = (p.config.titulo as string) ?? "";
  return (
    <div className="flex flex-col gap-5">
      <Campo rotulo="Título *" htmlFor="nt-titulo">
        <TemplateInput id="nt-titulo" value={titulo} onChange={(v) => p.alterar({ ...p.config, titulo: v })} />
        {!titulo.trim() && <p className="text-xs text-rose-400">Informe o título.</p>}
      </Campo>
      <Campo rotulo="Mensagem" htmlFor="nt-msg" dica="No ramo de erro, use {{erro.mensagem}}.">
        <TemplateInput id="nt-msg" multilinha value={(p.config.mensagem as string) ?? ""} onChange={(v) => p.alterar({ ...p.config, mensagem: v })} />
      </Campo>
      <Campo rotulo="Cor" htmlFor="nt-cor">
        <Select value={(p.config.cor as string) ?? "red"} disabled={p.somenteLeitura} onValueChange={(v) => p.alterar({ ...p.config, cor: v })}>
          <SelectTrigger id="nt-cor" className="h-10 w-40 rounded-lg bg-secondary/40"><SelectValue /></SelectTrigger>
          <SelectContent>{CORES.map((c) => <SelectItem key={c.v} value={c.v}>{c.r}</SelectItem>)}</SelectContent>
        </Select>
      </Campo>
    </div>
  );
}

export function ResultadoNotificar(p: FormNoProps) {
  const cor = CORES.find((c) => c.v === p.config.cor) ?? CORES[0];
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border p-3", cor.c)}>
      <Bell size={15} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{renderTemplate((p.config.titulo as string) ?? "", p.contexto) || "(sem título)"}</p>
        <p className="whitespace-pre-wrap text-xs text-foreground/80">{renderTemplate((p.config.mensagem as string) ?? "", p.contexto)}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">agora · painel de notificações</p>
      </div>
    </div>
  );
}

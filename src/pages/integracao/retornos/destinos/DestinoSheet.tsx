import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Eye, EyeOff, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { parseError } from "@/lib/errorMapper";
import { salvarDestino } from "../retornosService";
import type { AuthTipo, Destino, DestinoEntrada, MetodoHttp } from "../retornos.types";
import { useCatalogoRetorno } from "../useRetornos";
import { AUTH_ROTULO } from "./destinosUtils";

const METODOS: MetodoHttp[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const HEADERS_PROIBIDOS = ["authorization", "x-api-key", "cookie", "proxy-authorization"];
const AUTH_PADRAO: AuthTipo[] = ["nenhuma", "api_key", "bearer", "basic", "hmac"];

const lbl = "text-xs uppercase tracking-wide text-muted-foreground";
const inp = "h-10 rounded-lg bg-secondary/40";

interface Form {
  nome: string; modo: "http" | "webhook"; metodo: MetodoHttp; url_base: string; auth_tipo: AuthTipo;
  apiKeyEm: "header" | "query"; apiKeyNome: string; usuario: string;
  headers: { chave: string; valor: string }[];
  timeout_ms: string; max_tentativas: string; limite_falhas: string; ativo: boolean;
}

function formDe(d: Destino | null): Form {
  const ac = d?.auth_config ?? {};
  return {
    nome: d?.nome ?? "", modo: d?.modo ?? "http", metodo: d?.metodo ?? "POST", url_base: d?.url_base ?? "",
    auth_tipo: d?.auth_tipo ?? "nenhuma",
    apiKeyEm: ac.query ? "query" : "header", apiKeyNome: ac.query ?? ac.header ?? "X-API-Key", usuario: ac.usuario ?? "",
    headers: Object.entries(d?.headers ?? {}).map(([chave, valor]) => ({ chave, valor: String(valor) })),
    timeout_ms: String(d?.timeout_ms ?? 15000), max_tentativas: String(d?.max_tentativas ?? 5),
    limite_falhas: String(d?.limite_falhas ?? 20), ativo: d?.ativo ?? true,
  };
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold text-foreground border-b border-border pb-1.5">{titulo}</h4>
      {children}
    </section>
  );
}

interface Props { aberto: boolean; destino: Destino | null; podeEditar: boolean; onFechar: () => void; onSalvo: () => void }

export function DestinoSheet({ aberto, destino, podeEditar, onFechar, onSalvo }: Props) {
  const { tenantId, empresaId } = useTenant();
  const { data: catalogo } = useCatalogoRetorno();
  const [form, setForm] = useState<Form>(() => formDe(destino));
  const [segredo, setSegredo] = useState("");
  const [verSegredo, setVerSegredo] = useState(false);
  const [removerSegredo, setRemoverSegredo] = useState(false);
  const [confirmarRemover, setConfirmarRemover] = useState(false);
  const [confirmarPausado, setConfirmarPausado] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setForm(formDe(destino)); setSegredo(""); setVerSegredo(false); setRemoverSegredo(false);
      setErros({}); setErroGeral(null);
    }
  }, [aberto, destino]);

  const ro = !podeEditar;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => {
    const n = { ...f, [k]: v };
    if (n.modo === "webhook") n.auth_tipo = "hmac";
    return n;
  });
  const webhook = form.modo === "webhook";
  const authTipos = catalogo?.auth_tipos?.length ? catalogo.auth_tipos : AUTH_PADRAO;
  const temSegredoSalvo = !!destino?.tem_segredo && !removerSegredo;
  const precisaSegredo = form.auth_tipo !== "nenhuma";

  const validar = () => {
    const e: Record<string, string> = {};
    if (!form.nome.trim()) e.nome = "Informe o nome do destino.";
    if (!/^https:\/\//i.test(form.url_base.trim())) e.url_base = "Use https://";
    if (form.auth_tipo === "api_key" && !form.apiKeyNome.trim()) e.apiKeyNome = "Informe o nome.";
    if (form.auth_tipo === "basic" && !form.usuario.trim()) e.usuario = "Informe o usuário.";
    if (webhook && form.auth_tipo !== "hmac") e.segredo = "O webhook LogiTrack precisa da autenticação HMAC.";
    if (precisaSegredo && !segredo && !temSegredoSalvo) e.segredo = "Informe o token, chave ou senha.";
    form.headers.forEach((h, i) => {
      if (HEADERS_PROIBIDOS.includes(h.chave.trim().toLowerCase())) e[`h${i}`] = "Credenciais vão em Autenticação";
      else if (!h.chave.trim() && h.valor.trim()) e[`h${i}`] = "Informe o nome do header.";
    });
    const t = Number(form.timeout_ms), m = Number(form.max_tentativas), l = Number(form.limite_falhas);
    if (!(t >= 1000 && t <= 60000)) e.timeout_ms = "Entre 1000 e 60000.";
    if (!(m >= 1 && m <= 10)) e.max_tentativas = "Entre 1 e 10.";
    if (!(l >= 1)) e.limite_falhas = "Mínimo 1.";
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const montar = (): DestinoEntrada => {
    const auth_config: Record<string, string> =
      form.auth_tipo === "api_key" ? { [form.apiKeyEm]: form.apiKeyNome.trim() }
        : form.auth_tipo === "basic" ? { usuario: form.usuario.trim() } : {};
    const headers: Record<string, string> = {};
    form.headers.forEach((h) => { if (h.chave.trim()) headers[h.chave.trim()] = h.valor; });
    return {
      ...(destino ? { id: destino.id } : {}),
      nome: form.nome.trim(), modo: form.modo, metodo: form.modo === "webhook" ? "POST" : form.metodo, url_base: form.url_base.trim(),
      auth_tipo: form.auth_tipo, auth_config, headers,
      timeout_ms: Number(form.timeout_ms), max_tentativas: Number(form.max_tentativas), limite_falhas: Number(form.limite_falhas),
      ativo: form.ativo, erp_provedor_id: destino?.erp_provedor_id ?? null,
    };
  };

  const pedirSalvar = () => {
    setErroGeral(null);
    if (!validar()) return;
    if (destino?.pausado_em) setConfirmarPausado(true);
    else salvar();
  };

  const salvar = async () => {
    if (!tenantId || !empresaId) return;
    setSalvando(true);
    try {
      await salvarDestino(tenantId, empresaId, montar(), segredo || null, removerSegredo && !segredo);
      toast.success("Destino salvo.");
      onSalvo();
      onFechar();
    } catch (e) {
      const p = parseError(e, "Salvar destino");
      setErroGeral(p.instruction ? `${p.title} ${p.instruction}` : p.title);
      toast.error(p.title);
    } finally {
      setSalvando(false);
      setConfirmarPausado(false);
    }
  };

  const Erro = ({ k }: { k: string }) => erros[k] ? <p className="text-xs text-destructive">{erros[k]}</p> : null;

  const rotuloSegredo = form.auth_tipo === "api_key" ? "Chave" : form.auth_tipo === "bearer" ? "Token"
    : form.auth_tipo === "basic" ? "Senha" : "Segredo de assinatura";

  return (
    <Sheet open={aberto} onOpenChange={(o) => !o && !salvando && onFechar()}>
      <SheetContent className="w-full sm:max-w-[560px] flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b border-border">
          <SheetTitle>{destino ? (ro ? destino.nome : "Editar destino") : "Novo destino"}</SheetTitle>
          <SheetDescription>Endereço do ERP reaproveitado pelos nós HTTP e Webhook dos fluxos.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-6">
          {ro && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Eye size={13} /> Somente leitura.</p>}

          <Secao titulo="Identificação">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="d-nome" className={lbl}>Nome *</label>
              <Input id="d-nome" className={inp} value={form.nome} onChange={(e) => set("nome", e.target.value)} disabled={ro} />
              <Erro k="nome" />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className={lbl}>Tipo</span>
              <RadioGroup value={form.modo} onValueChange={(v) => set("modo", v as Form["modo"])} disabled={ro} className="grid grid-cols-2 gap-2">
                {([["http", "Requisição HTTP"], ["webhook", "Webhook LogiTrack"]] as const).map(([v, r]) => (
                  <label key={v} htmlFor={`d-modo-${v}`} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${form.modo === v ? "border-primary bg-primary/10" : "border-border bg-secondary/20"}`}>
                    <RadioGroupItem id={`d-modo-${v}`} value={v} /> {r}
                  </label>
                ))}
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                {form.modo === "webhook"
                  ? "O webhook envia um envelope padrão assinado com HMAC."
                  : "HTTP envia o corpo montado no fluxo, no formato do ERP."}
              </p>
            </div>
          </Secao>

          <Secao titulo="Endereço">
            <div className={form.modo === "webhook" ? "grid grid-cols-1 gap-3" : "grid grid-cols-[120px_1fr] gap-3"}>
              {form.modo !== "webhook" && <div className="flex flex-col gap-1.5">
                <label htmlFor="d-metodo" className={lbl}>Método</label>
                <Select value={form.metodo} onValueChange={(v) => set("metodo", v as MetodoHttp)} disabled={ro}>
                  <SelectTrigger id="d-metodo" className={inp}><SelectValue /></SelectTrigger>
                  <SelectContent>{METODOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="d-url" className={lbl}>URL base *</label>
                <Input id="d-url" className={`${inp} font-mono text-xs`} placeholder="https://api.erp.com.br/v1"
                  value={form.url_base} onChange={(e) => set("url_base", e.target.value)} disabled={ro} />
                <Erro k="url_base" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              O caminho final (ex.: <span className="font-mono">/pedidos/{"{{documento.codigo_erp}}"}</span>) é definido em cada nó do fluxo.
            </p>
          </Secao>

          <Secao titulo="Autenticação">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="d-auth" className={lbl}>Tipo</label>
              <Select value={form.auth_tipo} onValueChange={(v) => set("auth_tipo", v as AuthTipo)} disabled={ro || webhook}>
                <SelectTrigger id="d-auth" className={inp}><SelectValue /></SelectTrigger>
                <SelectContent>{authTipos.map((a) => <SelectItem key={a} value={a}>{AUTH_ROTULO[a] ?? a}</SelectItem>)}</SelectContent>
              </Select>
              {webhook && <p className="text-xs text-muted-foreground">O webhook LogiTrack é sempre assinado com HMAC.</p>}
            </div>

            {form.auth_tipo === "api_key" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="d-apiem" className={lbl}>Enviar em</label>
                  <Select value={form.apiKeyEm} onValueChange={(v) => {
                    set("apiKeyEm", v as Form["apiKeyEm"]);
                    if (v === "query" && form.apiKeyNome === "X-API-Key") set("apiKeyNome", "api_key");
                    else if (v === "header" && (form.apiKeyNome === "api_key" || !form.apiKeyNome)) set("apiKeyNome", "X-API-Key");
                  }} disabled={ro}>
                    <SelectTrigger id="d-apiem" className={inp}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="header">Header</SelectItem>
                      <SelectItem value="query">Query string</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="d-apinome" className={lbl}>{form.apiKeyEm === "header" ? "Nome do header" : "Nome do parâmetro"}</label>
                  <Input id="d-apinome" className={`${inp} font-mono text-xs`} value={form.apiKeyNome}
                    onChange={(e) => set("apiKeyNome", e.target.value)} disabled={ro} />
                  <Erro k="apiKeyNome" />
                </div>
              </div>
            )}

            {form.auth_tipo === "basic" && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="d-usuario" className={lbl}>Usuário</label>
                <Input id="d-usuario" className={inp} value={form.usuario} onChange={(e) => set("usuario", e.target.value)} disabled={ro} autoComplete="off" />
                <Erro k="usuario" />
              </div>
            )}

            {precisaSegredo && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="d-segredo" className={lbl}>{rotuloSegredo}</label>
                  {temSegredoSalvo && !ro && (
                    <button type="button" onClick={() => setConfirmarRemover(true)}
                      className="text-xs text-destructive hover:underline flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                      <Trash2 size={12} /> Remover segredo
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input id="d-segredo" type={verSegredo ? "text" : "password"} autoComplete="new-password"
                    className={`${inp} pr-10 font-mono text-xs`} value={segredo} onChange={(e) => setSegredo(e.target.value)}
                    placeholder={temSegredoSalvo ? "••• (deixe vazio para manter)" : ""} disabled={ro} />
                  <button type="button" onClick={() => setVerSegredo((v) => !v)} aria-label={verSegredo ? "Ocultar" : "Mostrar"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {verSegredo ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {removerSegredo && <p className="text-xs text-amber-400">O segredo será removido ao salvar.</p>}
                {form.auth_tipo === "hmac" && (
                  <p className="text-xs text-muted-foreground">Enviado nos headers X-LogiTrack-Timestamp e X-LogiTrack-Signature (sha256).</p>
                )}
                <Erro k="segredo" />
              </div>
            )}
          </Secao>

          <Secao titulo="Headers extras">
            {form.headers.length === 0 && <p className="text-xs text-muted-foreground">Nenhum header extra. Valores aceitam {"{{variáveis}}"}.</p>}
            {form.headers.map((h, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Input aria-label="Nome do header" placeholder="Nome" className={`${inp} font-mono text-xs`} value={h.chave} disabled={ro}
                    onChange={(e) => set("headers", form.headers.map((x, j) => j === i ? { ...x, chave: e.target.value } : x))} />
                  <Input aria-label="Valor do header" placeholder="Valor" className={`${inp} font-mono text-xs`} value={h.valor} disabled={ro}
                    onChange={(e) => set("headers", form.headers.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} />
                  <Button type="button" size="icon" variant="ghost" aria-label="Remover header" disabled={ro}
                    onClick={() => set("headers", form.headers.filter((_, j) => j !== i))}><X size={14} /></Button>
                </div>
                <Erro k={`h${i}`} />
              </div>
            ))}
            {!ro && (
              <Button type="button" variant="outline" size="sm" className="self-start gap-1.5"
                onClick={() => set("headers", [...form.headers, { chave: "", valor: "" }])}><Plus size={14} /> Adicionar header</Button>
            )}
          </Secao>

          <Collapsible>
            <CollapsibleTrigger className="group flex w-full items-center justify-between text-sm font-semibold border-b border-border pb-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
              Entrega (avançado) <ChevronDown size={14} className="transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-3">
                {([["timeout_ms", "Timeout (ms)"], ["max_tentativas", "Tentativas máx."], ["limite_falhas", "Pausar após N falhas"]] as const).map(([k, r]) => (
                  <div key={k} className="flex flex-col gap-1.5">
                    <label htmlFor={`d-${k}`} className={lbl}>{r}</label>
                    <Input id={`d-${k}`} type="number" className={inp} value={form[k]} onChange={(e) => set(k, e.target.value)} disabled={ro} />
                    <Erro k={k} />
                  </div>
                ))}
              </div>
              <label htmlFor="d-ativo" className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2 text-sm">
                Ativo <Switch id="d-ativo" checked={form.ativo} onCheckedChange={(v) => set("ativo", v)} disabled={ro} />
              </label>
            </CollapsibleContent>
          </Collapsible>

          {erroGeral && <div className="rounded-lg border border-destructive/40 px-3 py-2 text-xs text-destructive">{erroGeral}</div>}
        </div>

        <div className="px-6 py-3 border-t border-border flex justify-end gap-2">
          <Button variant="outline" onClick={onFechar} disabled={salvando}>{ro ? "Fechar" : "Cancelar"}</Button>
          {!ro && (
            <Button onClick={pedirSalvar} disabled={salvando} className="gap-1.5">
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar destino
            </Button>
          )}
        </div>
      </SheetContent>

      <AlertDialog open={confirmarRemover} onOpenChange={setConfirmarRemover}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover segredo</AlertDialogTitle>
            <AlertDialogDescription>O segredo será apagado ao salvar. Sem ele, os envios com autenticação vão falhar.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setRemoverSegredo(true); setSegredo(""); }}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmarPausado} onOpenChange={(o) => !salvando && setConfirmarPausado(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Destino pausado</AlertDialogTitle>
            <AlertDialogDescription>Salvar retoma os envios para este destino.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); salvar(); }} disabled={salvando}>
              {salvando && <Loader2 size={14} className="animate-spin mr-1.5" />} Salvar e retomar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

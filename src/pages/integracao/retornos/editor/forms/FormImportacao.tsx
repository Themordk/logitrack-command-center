// Nós exclusivos dos fluxos "Importar do ERP" (importar.*): Confirmar com o usuário e Gravar no LogiTrack (§6.3).
import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { obterCaminho, renderTemplate } from "../avaliacao";
import { BlocoCodigo, Campo } from "../campos/Campo";
import { TemplateInput } from "../campos/TemplateInput";
import { payloadAnterior } from "../previaRequisicao";
import { geraSaida } from "../saidasAnteriores";
import type { FormNoProps } from "./formTypes";

const ULTIMO = "__ultimo";
const campoCls = "h-9 rounded-md bg-secondary/40";

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-caption text-warning">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> <span>{children}</span>
    </p>
  );
}

/** Nós que vêm antes deste e geram saída (payload, requisições). */
function nosComSaida(p: FormNoProps, soPayload: boolean) {
  return p.nos.filter((n) => n.id !== p.no.id && (soPayload ? n.data.tipo === "dados.payload" : geraSaida(n.data.tipo) && n.data.tipo !== "acao.gravar_logitrack"));
}

/** Id do nó cuja saída vale: o escolhido ou o último payload antes deste (mesma regra do dispatcher). */
function useOrigem(p: FormNoProps, chave: "previa_de" | "corpo_de") {
  const escolhido = p.config[chave] as string | undefined;
  const anterior = useMemo(
    () => payloadAnterior(p.no.id, p.nos.map((n) => ({ id: n.id, tipo: n.data.tipo })), p.ligacoes),
    [p.no.id, p.nos, p.ligacoes],
  );
  const id = escolhido ?? anterior.id;
  const valor = id ? obterCaminho(p.contexto, `saidas.${id}`) : undefined;
  return { id, valor, escolhido, ambiguo: !escolhido && anterior.ambiguo };
}

function SeletorOrigem({ p, chave, rotulo, rotuloUltimo, soPayload, dica }: {
  p: FormNoProps; chave: "previa_de" | "corpo_de"; rotulo: string; rotuloUltimo: string; soPayload: boolean; dica: string;
}) {
  const opcoes = nosComSaida(p, soPayload);
  const id = `imp-${chave}`;
  return (
    <Campo rotulo={rotulo} htmlFor={id} dica={dica}>
      <Select value={(p.config[chave] as string) ?? ULTIMO} disabled={p.somenteLeitura}
        onValueChange={(v) => {
          const { [chave]: _c, ...resto } = p.config;
          void _c;
          p.alterar(v === ULTIMO ? resto : { ...resto, [chave]: v });
        }}>
        <SelectTrigger id={id} className={campoCls}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ULTIMO}>{rotuloUltimo}</SelectItem>
          {opcoes.map((n) => (
            <SelectItem key={n.id} value={n.id}>
              {n.data.nome || n.id} <span className="font-mono text-muted-foreground">· {n.id}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Campo>
  );
}

// ---------- Confirmar com o usuário ----------
export function ParametrosConfirmar(p: FormNoProps) {
  const expira = Number(p.config.expira_minutos) || 15;
  const foraDoIntervalo = expira < 1 || expira > 60;
  return (
    <div className="flex flex-col gap-5">
      <p className="text-body-sm text-muted-foreground">
        O fluxo para aqui e a tela mostra a prévia. Só segue para os próximos nós quando o usuário confirmar.
        Em Testar e Simular não há pausa.
      </p>
      <Campo rotulo="Título" htmlFor="cf-titulo">
        <TemplateInput id="cf-titulo" value={(p.config.titulo as string) ?? ""}
          onChange={(v) => p.alterar({ ...p.config, titulo: v })} />
      </Campo>
      <Campo rotulo="Mensagem" htmlFor="cf-msg" dica="Aceita variáveis, como {{importacao.valor}}.">
        <TemplateInput id="cf-msg" multilinha value={(p.config.mensagem as string) ?? ""}
          onChange={(v) => p.alterar({ ...p.config, mensagem: v })} />
      </Campo>
      <SeletorOrigem p={p} chave="previa_de" rotulo="Prévia mostrada" rotuloUltimo="Último payload montado" soPayload={false}
        dica="O que o usuário confere antes de gravar: a saída de um payload ou de uma requisição ao ERP." />
      <Campo rotulo="Expira em (minutos)" htmlFor="cf-expira" dica="De 1 a 60. Depois disso a prévia é descartada e o usuário busca de novo.">
        <Input id="cf-expira" type="number" min={1} max={60} disabled={p.somenteLeitura} value={expira}
          onChange={(e) => p.alterar({ ...p.config, expira_minutos: Math.min(60, Math.max(1, Number(e.target.value) || 15)) })}
          className={`${campoCls} w-32 tabular-nums`} />
        {foraDoIntervalo && <p className="text-caption text-danger" role="alert">Use um valor de 1 a 60 minutos.</p>}
      </Campo>
    </div>
  );
}

export function ResultadoConfirmar(p: FormNoProps) {
  const origem = useOrigem(p, "previa_de");
  const titulo = renderTemplate((p.config.titulo as string) || "Confirme a importação", p.contexto);
  const mensagem = renderTemplate((p.config.mensagem as string) ?? "", p.contexto);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-muted-foreground">Como o usuário vê na tela do cadastro</p>
      <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <p className="text-heading-sm text-foreground">{titulo}</p>
        {mensagem && <p className="whitespace-pre-wrap text-body-sm text-muted-foreground">{mensagem}</p>}
        <BlocoCodigo>{origem.valor === undefined ? "Sem prévia: monte um payload antes deste nó." : JSON.stringify(origem.valor, null, 2)}</BlocoCodigo>
      </div>
      {origem.ambiguo && <Aviso>Há mais de um payload antes deste nó. Escolha qual vira a prévia.</Aviso>}
      {!origem.id && <Aviso>Nenhum payload antes deste nó. O usuário verá a prévia vazia.</Aviso>}
    </div>
  );
}

// ---------- Gravar no LogiTrack ----------
export function ParametrosGravar(p: FormNoProps) {
  const confirmar = p.nos.some((n) => n.data.tipo === "logica.confirmar_usuario");
  return (
    <div className="flex flex-col gap-5">
      <p className="text-body-sm text-muted-foreground">
        Envia o registro para a API do LogiTrack desta tela, com a chave da conexão ERP da empresa. A API valida e
        grava como numa integração normal. Saídas: sucesso (registro gravado) e erro.
      </p>
      <SeletorOrigem p={p} chave="corpo_de" rotulo="Corpo" rotuloUltimo="Último payload montado" soPayload
        dica="Monte o corpo no formato da API do LogiTrack (o mesmo que o ERP enviaria)." />
      {!confirmar && (
        <Aviso>Sem Confirmar com o usuário, o registro é gravado direto, sem prévia na tela.</Aviso>
      )}
    </div>
  );
}

export function ResultadoGravar(p: FormNoProps) {
  const origem = useOrigem(p, "corpo_de");
  const rota = obterCaminho(p.contexto, "importacao.rota");
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-caption text-primary">POST /{typeof rota === "string" && rota ? rota : "rota-da-tela"}</p>
      <BlocoCodigo>{origem.valor === undefined ? "Sem corpo: monte um payload antes deste nó." : JSON.stringify(origem.valor, null, 2)}</BlocoCodigo>
      {origem.ambiguo && <Aviso>Há mais de um payload antes deste nó. Escolha qual vira o corpo.</Aviso>}
      <p className="text-caption text-muted-foreground">Em Testar e Simular o registro não é gravado (passo simulado).</p>
    </div>
  );
}

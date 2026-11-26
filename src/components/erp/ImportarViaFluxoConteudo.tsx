import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime } from "@/utils/dateTime";
import {
  camposPrevia, linkExecucaoImportacao, mensagemErroImportacao, rotuloRegistroGravado,
} from "./importacaoFluxo";
import type { ImportacaoFluxo } from "./useImportacaoFluxo";

export interface ImportarViaFluxoProps {
  fluxo: ImportacaoFluxo;
  /** Título do diálogo na busca, ex.: "Importar produto do ERP". */
  titulo: string;
  labelCampo: string;
  placeholder?: string;
  inputMode?: "text" | "numeric";
  /** Limpa o que é digitado (ex.: só dígitos na chave da NF-e). */
  normalizar?: (v: string) => string;
  /** Erro de formato antes de chamar o servidor; null = válido. */
  validar?: (v: string) => string | null;
  /** Parâmetros extras enviados ao fluxo (ex.: tipo_busca). */
  parametros?: (valor: string) => Record<string, unknown>;
  verRegistroPath?: (id: string) => string;
  rotuloVerRegistro?: string;
  onSucesso?: (registro: { id: string | null; status: string | null; dados: unknown }) => void;
  onFechar: () => void;
}

/** Corpo do diálogo do botão Importar do ERP quando há um fluxo ativo no Retorno ao ERP. */
export function ImportarViaFluxoConteudo(p: ImportarViaFluxoProps) {
  const { fluxo } = p;
  const [valor, setValor] = useState("");
  const [erroCampo, setErroCampo] = useState<string | null>(null);
  const avisado = useRef<string | null>(null);
  const imp = fluxo.importacao;

  useEffect(() => {
    if (fluxo.estado === "sucesso" && imp && avisado.current !== imp.execucao_id) {
      avisado.current = imp.execucao_id;
      p.onSucesso?.({ id: imp.registro?.id ?? null, status: imp.registro?.status ?? null, dados: imp.registro?.dados ?? null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fluxo.estado, imp?.execucao_id]);

  // Fechar com a prévia aberta descarta a importação: o hook cancela quando o diálogo fecha.
  const fechar = p.onFechar;

  const buscar = () => {
    const v = valor.trim();
    const erroFormato = !v ? `Informe ${p.labelCampo.toLowerCase()}.` : p.validar?.(v) ?? null;
    setErroCampo(erroFormato);
    if (erroFormato) return;
    void fluxo.buscar({ valor: v, ...(p.parametros?.(v) ?? {}) });
  };

  const novaBusca = () => { fluxo.reiniciar(); setValor(""); setErroCampo(null); };

  if (fluxo.carregando) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-9 w-full" />
        <div className="flex justify-end gap-2"><Skeleton className="h-10 w-24" /><Skeleton className="h-10 w-32" /></div>
      </div>
    );
  }

  // ---- Prévia aguardando confirmação ----
  if (fluxo.estado === "aguardando" && imp) {
    const campos = camposPrevia(imp.previa);
    return (
      <>
        <DialogHeader>
          <DialogTitle className="text-heading-sm">{imp.confirmacao?.titulo || "Confirme a importação"}</DialogTitle>
          <DialogDescription className="text-body-sm">
            {imp.confirmacao?.mensagem || "Confira os dados vindos do ERP antes de gravar no LogiTrack."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {campos ? (
            <dl className="divide-y divide-border rounded-lg border border-border">
              {campos.map((c) => (
                <div key={c.chave} className="flex items-start justify-between gap-4 px-3 py-2 text-body-sm">
                  <dt className="font-mono text-caption text-muted-foreground">{c.chave}</dt>
                  <dd className="text-right text-foreground tabular-nums break-all">{c.valor}</dd>
                </div>
              ))}
            </dl>
          ) : imp.previa != null ? (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-muted p-3 font-mono text-caption text-foreground">
              {JSON.stringify(imp.previa, null, 2)}
            </pre>
          ) : (
            <p className="rounded-lg border border-border px-3 py-2 text-body-sm text-muted-foreground">O fluxo não montou prévia para este registro.</p>
          )}
          {imp.confirmacao?.expira_em && (
            <p className="text-caption text-muted-foreground">A prévia vale até {formatTime(imp.confirmacao.expira_em)}. Depois disso, busque de novo.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={fluxo.ocupado} onClick={() => { void fluxo.cancelar(); novaBusca(); }}>Cancelar</Button>
          <Button disabled={fluxo.ocupado} onClick={() => void fluxo.confirmar()}>
            {fluxo.ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Confirmar e gravar
          </Button>
        </DialogFooter>
      </>
    );
  }

  // ---- Gravado ----
  if (fluxo.estado === "sucesso" && imp) {
    const id = imp.registro?.id ?? null;
    return (
      <>
        <DialogHeader>
          <DialogTitle className="text-heading-sm">Importação concluída</DialogTitle>
          <DialogDescription className="text-body-sm">
            {imp.registro ? rotuloRegistroGravado(imp.registro.status) : "O fluxo terminou sem gravar registro no LogiTrack."}
          </DialogDescription>
        </DialogHeader>
        <p className="text-body-sm text-muted-foreground">
          Código buscado: <span className="font-mono text-foreground">{imp.valor}</span>
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={novaBusca}>Importar outro</Button>
          {p.verRegistroPath && id ? (
            <Button onClick={() => { window.location.hash = "#" + (p.verRegistroPath as (i: string) => string)(id); p.onFechar(); }}>
              {p.rotuloVerRegistro ?? "Ver registro"}
            </Button>
          ) : (
            <Button onClick={p.onFechar}>Fechar</Button>
          )}
        </DialogFooter>
      </>
    );
  }

  // ---- Busca (com erro/filtrado/descartado abaixo do campo) ----
  const executando = fluxo.estado === "executando";
  const mensagemFalha =
    fluxo.estado === "filtrado" ? "Esta busca não passa nos filtros do fluxo de importação. Confira o código ou os filtros do gatilho."
      : fluxo.estado === "descartado" ? "A importação foi cancelada ou a prévia expirou. Busque de novo."
        : fluxo.estado === "erro" ? (fluxo.erro ? [fluxo.erro.titulo, fluxo.erro.instrucao].filter(Boolean).join(" ") : mensagemErroImportacao(imp))
          : null;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-heading-sm">{p.titulo}</DialogTitle>
        <DialogDescription className="text-body-sm">
          {fluxo.ambiguo
            ? "Há mais de um fluxo de importação ativo para esta tela."
            : `A busca segue o fluxo ${fluxo.fluxoNome ?? "configurado"} do Retorno ao ERP.`}
        </DialogDescription>
      </DialogHeader>
      {fluxo.ambiguo ? (
        <p className="rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-body-sm text-warning">
          Deixe só um fluxo ativo para este botão em Integração › Retorno ao ERP.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="importar-fluxo-valor" className="text-body-sm font-medium">{p.labelCampo}</Label>
          <Input
            id="importar-fluxo-valor"
            autoFocus
            value={valor}
            maxLength={200}
            inputMode={p.inputMode}
            placeholder={p.placeholder}
            disabled={executando}
            aria-invalid={!!erroCampo}
            onChange={(e) => { setValor(p.normalizar ? p.normalizar(e.target.value) : e.target.value); setErroCampo(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }}
            className="h-9 font-mono"
          />
          {erroCampo && <p className="text-caption text-danger" role="alert">{erroCampo}</p>}
          {executando && (
            <p className="text-caption text-muted-foreground" aria-live="polite">Consultando o ERP. Pode levar até um minuto.</p>
          )}
          {mensagemFalha && (
            <div className="mt-2 flex flex-col gap-1 rounded-md border border-danger/25 bg-danger/10 px-3 py-2" role="alert">
              <p className="text-body-sm text-danger">{mensagemFalha}</p>
              {imp && (
                <a href={"#" + linkExecucaoImportacao(imp)} className="text-caption text-primary hover:underline" onClick={p.onFechar}>
                  Ver os passos da execução
                </a>
              )}
            </div>
          )}
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={fechar}>Fechar</Button>
        {!fluxo.ambiguo && (
          <Button onClick={buscar} disabled={executando}>
            {executando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {executando ? "Buscando" : "Buscar no ERP"}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

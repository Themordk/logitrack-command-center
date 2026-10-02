import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parseError } from "@/lib/errorMapper";
import { invokeDispatcher } from "../retornosService";
import type { Destino, DispatcherTestarResposta } from "../retornos.types";

interface RequestTeste { metodo?: string; url?: string; headers?: Record<string, string> }

function texto(v: unknown, max = 4000) {
  if (v == null) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  return s.length > max ? `${s.slice(0, max)}\n… (truncado)` : s;
}

export function TestarDestinoDialog({ destino, onFechar }: { destino: Destino | null; onFechar: () => void }) {
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<DispatcherTestarResposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const testar = async (id: string) => {
    setCarregando(true); setResultado(null); setErro(null);
    try {
      setResultado(await invokeDispatcher({ acao: "testar_destino", destino_id: id }));
    } catch (e) {
      setErro(parseError(e, "Testar destino").title);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { if (destino) testar(destino.id); }, [destino]);

  const req = (resultado?.request ?? null) as RequestTeste | null;

  return (
    <Dialog open={!!destino} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Testar conexão</DialogTitle>
          <DialogDescription>{destino?.nome} — envia um ping assinado ao destino.</DialogDescription>
        </DialogHeader>

        {carregando ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 size={14} className="animate-spin" /> Testando…</p>
        ) : erro ? (
          <div className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">{erro}</div>
        ) : resultado ? (
          <div className="flex flex-col gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {resultado.ok
                ? <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1"><CheckCircle2 size={12} /> OK</Badge>
                : <Badge variant="outline" className="bg-rose-500/15 text-rose-400 border-rose-500/30 gap-1"><XCircle size={12} /> Falhou</Badge>}
              <span className="text-muted-foreground">HTTP <span className="text-foreground font-semibold">{resultado.http_status ?? "—"}</span></span>
              <span className="text-muted-foreground">Tempo <span className="text-foreground font-semibold">{(resultado.duracao_ms ?? 0).toLocaleString("pt-BR")} ms</span></span>
            </div>
            {resultado.erro && <div className="rounded-lg border border-destructive/40 px-3 py-2 text-destructive">{resultado.erro}</div>}
            {resultado.resposta != null && (
              <div>
                <p className="text-muted-foreground uppercase tracking-wide mb-1">Resposta</p>
                <pre className="font-mono text-xs bg-secondary/40 rounded-lg p-3 max-h-48 overflow-auto whitespace-pre-wrap break-all">{texto(resultado.resposta)}</pre>
              </div>
            )}
            {req && (
              <div>
                <p className="text-muted-foreground uppercase tracking-wide mb-1">Requisição enviada</p>
                <pre className="font-mono text-xs bg-secondary/40 rounded-lg p-3 max-h-48 overflow-auto whitespace-pre-wrap break-all">
                  {`${req.metodo ?? ""} ${req.url ?? ""}`}
                  {req.headers && Object.entries(req.headers).map(([k, v]) => `\n${k}: ${v}`).join("")}
                </pre>
              </div>
            )}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => destino && testar(destino.id)} disabled={carregando || !destino}>Testar de novo</Button>
          <Button size="sm" onClick={onFechar}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

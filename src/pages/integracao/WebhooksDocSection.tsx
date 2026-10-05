import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Loader2, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { obterCatalogo } from "./retornos/retornosService";

const ENVELOPE = `{
  "id": "uuid-da-execucao",
  "evento": "documento_saida.expedido",
  "ocorrido_em": "2026-10-05T17:55:00Z",
  "tentativa": 1,
  "dados": { "...": "payload montado pelo fluxo" }
}`;

const HEADERS = [
  ["X-LogiTrack-Event", "Código do evento."],
  ["X-LogiTrack-Execution-Id", "Id da execução (igual a envelope.id)."],
  ["X-LogiTrack-Attempt", "Número da tentativa, começando em 1."],
  ["Idempotency-Key", "Chave estável entre tentativas. Use para não processar duas vezes."],
  ["X-LogiTrack-Timestamp", "Unix timestamp (segundos) usado na assinatura."],
  ["X-LogiTrack-Signature", 'sha256= + HMAC-SHA256(segredo, timestamp + "." + corpo) em hex.'],
];

const NODE = `const crypto = require("crypto");

function verificar(req, corpoBruto, segredo) {
  const ts = req.headers["x-logitrack-timestamp"];
  const recebida = req.headers["x-logitrack-signature"] || "";
  const esperada = "sha256=" + crypto
    .createHmac("sha256", segredo)
    .update(ts + "." + corpoBruto)
    .digest("hex");
  const a = Buffer.from(recebida), b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Math.abs(Date.now() / 1000 - Number(ts)) < 300; // 5 min
}`;

const CSHARP = `using System.Security.Cryptography;
using System.Text;

static bool Verificar(string timestamp, string assinatura, string corpoBruto, string segredo)
{
    using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(segredo));
    var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(timestamp + "." + corpoBruto));
    var esperada = "sha256=" + Convert.ToHexString(hash).ToLowerInvariant();
    var ok = CryptographicOperations.FixedTimeEquals(
        Encoding.UTF8.GetBytes(esperada), Encoding.UTF8.GetBytes(assinatura ?? ""));
    var idade = DateTimeOffset.UtcNow.ToUnixTimeSeconds() - long.Parse(timestamp);
    return ok && Math.Abs(idade) < 300;
}`;

function Bloco({ titulo, codigo }: { titulo: string; codigo: string }) {
  const copiar = async () => {
    try { await navigator.clipboard.writeText(codigo); toast.success("Copiado."); }
    catch { toast.error("Não foi possível copiar."); }
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground">{titulo}</span>
        <Button size="sm" variant="outline" className="h-7" onClick={copiar} aria-label={`Copiar ${titulo}`}>
          <Copy size={13} /> Copiar
        </Button>
      </div>
      <pre className="text-xs font-mono bg-secondary/40 border border-border rounded-lg p-3 overflow-auto max-h-72 text-foreground">{codigo}</pre>
    </div>
  );
}

export function WebhooksDocSection() {
  const cat = useQuery({ queryKey: ["retorno-catalogo"], queryFn: obterCatalogo, staleTime: 600_000 });
  const eventos = cat.data?.eventos ?? [];
  return (
    <div className="card-surface p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Webhook size={15} className="text-primary" aria-hidden />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Webhooks emitidos pelo LogiTrack</h3>
          <p className="text-xs text-muted-foreground">Para o time do ERP: o que chega no seu endpoint e como validar.</p>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Eventos ({eventos.length})</h4>
        {cat.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin" /> Carregando…</div>
        ) : cat.isError ? (
          <div className="rounded-lg border border-destructive/40 p-3 text-xs flex items-center gap-3">
            <span className="text-muted-foreground">Não foi possível carregar os eventos.</span>
            <Button size="sm" variant="outline" onClick={() => cat.refetch()}>Tentar novamente</Button>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-secondary/40 text-muted-foreground">
              <tr><th className="text-left px-3 py-2 font-medium">Código</th><th className="text-left px-3 py-2 font-medium">Nome</th><th className="text-left px-3 py-2 font-medium">Entidade</th><th className="text-left px-3 py-2 font-medium">Descrição</th></tr>
            </thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.codigo} className="border-t border-border/40 hover:bg-secondary/30">
                  <td className="px-3 py-2 font-mono text-foreground">{e.codigo}</td>
                  <td className="px-3 py-2">{e.nome}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.entidade === "documento_saida" ? "Saída" : "Entrada"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.descricao ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Bloco titulo="Envelope (corpo POST)" codigo={ENVELOPE} />

      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Headers</h4>
        <table className="w-full text-xs">
          <tbody>
            {HEADERS.map(([h, d]) => (
              <tr key={h} className="border-t border-border/40"><td className="px-3 py-2 font-mono text-foreground whitespace-nowrap">{h}</td><td className="px-3 py-2 text-muted-foreground">{d}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <h4 className="font-semibold uppercase tracking-wide">Política de reenvio</h4>
        <p>Respostas 408, 425, 429 e 5xx (e falhas de rede) são reenviadas com espera de 1 min, 5 min, 15 min, 1 h e 6 h. O header Retry-After é respeitado.</p>
        <p>Demais 4xx não são reenviados: a execução fica com erro. Responda 2xx para confirmar o recebimento.</p>
      </div>

      <Bloco titulo="Verificação da assinatura — Node.js" codigo={NODE} />
      <Bloco titulo="Verificação da assinatura — C#" codigo={CSHARP} />
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, Copy, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { parseError } from "@/lib/errorMapper";

interface DocumentacaoApiTabProps {
  tenantId: string;
  empresaId: string;
  erpProvedorId: string;
}

interface CampoDoc {
  nome: string;
  tipo: string;
  obrigatorio: boolean;
  descricao: string;
}

interface EndpointDoc {
  id: string;
  grupo: "dados-mestres" | "movimentos" | "sistema";
  entidade: string;
  endpoint: string;
  metodo: string;
  descricao: string;
  descricao_longa: string | null;
  campos: CampoDoc[] | null;
  payload_exemplo: object | null;
  response_exemplo: object | null;
  batch_limite: number | null;
  notas: string | null;
  ordem: number;
}

const BASE_URL = "https://dcpmykhxysvxnpgmlyli.supabase.co/functions/v1/integration-gateway";

const METODO_CLASS: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  POST: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  PATCH: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  DELETE: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

const GRUPOS = [
  { key: "dados-mestres", label: "Dados Mestres" },
  { key: "movimentos", label: "Movimentos" },
  { key: "sistema", label: "Sistema" },
] as const;

export function DocumentacaoApiTab({ erpProvedorId }: DocumentacaoApiTabProps) {
  const [docs, setDocs] = useState<EndpointDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [grupo, setGrupo] = useState<string>("dados-mestres");
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase as any).rpc("integracao_listar_api_docs", { p_grupo: null });
        if (error) throw error;
        if (!alive) return;
        setDocs((data || []) as EndpointDoc[]);
      } catch (e: any) {
        const p = parseError(e, "docs-api");
        toast.error(
          !p.errorCode && p.title === "Ocorreu um erro inesperado." ? "Erro ao carregar documentação." : p.title,
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [erpProvedorId]);

  const filtrados = useMemo(
    () => docs.filter((d) => d.grupo === grupo).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)),
    [docs, grupo],
  );

  const porEntidade = useMemo(() => {
    const map = new Map<string, EndpointDoc[]>();
    for (const d of filtrados) {
      const arr = map.get(d.entidade) || [];
      arr.push(d);
      map.set(d.entidade, arr);
    }
    return Array.from(map.entries());
  }, [filtrados]);

  const copiarCurl = async (d: EndpointDoc) => {
    const url = `${BASE_URL}${d.endpoint}`;
    let cmd: string;
    if (d.metodo === "POST") {
      const payload = d.payload_exemplo ? JSON.stringify(d.payload_exemplo, null, 2) : "{}";
      cmd = `curl -X POST \\\n  ${url} \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-key: SUA_CHAVE_AQUI" \\\n  -d '${payload}'`;
    } else {
      cmd = `curl -X GET \\\n  ${url} \\\n  -H "x-api-key: SUA_CHAVE_AQUI"`;
    }
    try {
      await navigator.clipboard.writeText(cmd);
      toast.success("cURL copiado!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <div className="card-surface p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen size={16} className="text-primary" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Documentação da API</h3>
          <p className="text-xs text-muted-foreground">
            Base URL: <code className="font-mono">{BASE_URL}</code>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {GRUPOS.map((g) => (
          <button
            key={g.key}
            onClick={() => {
              setGrupo(g.key);
              setAberto(null);
            }}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              grupo === g.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary/40 text-muted-foreground border-border hover:text-foreground hover:bg-secondary/60"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
          <Loader2 size={14} className="animate-spin" /> Carregando…
        </div>
      ) : porEntidade.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">Nenhum endpoint documentado neste grupo.</p>
      ) : (
        porEntidade.map(([entidade, endpoints]) => (
          <div key={entidade} className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{entidade}</h4>
            {endpoints.map((d) => {
              const isOpen = aberto === d.id;
              const campos = Array.isArray(d.campos) ? d.campos : [];
              return (
                <div key={d.id} className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setAberto(isOpen ? null : d.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/30 text-left transition-colors"
                  >
                    <Badge variant="outline" className={METODO_CLASS[d.metodo] || ""}>
                      {d.metodo}
                    </Badge>
                    <code className="font-mono text-xs text-foreground">{d.endpoint}</code>
                    <span className="text-xs text-muted-foreground flex-1 truncate">{d.descricao}</span>
                    <ChevronDown
                      size={14}
                      className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-3 py-3 border-t border-border/40 space-y-3 bg-secondary/10">
                      {d.descricao_longa && <p className="text-xs text-muted-foreground">{d.descricao_longa}</p>}

                      {campos.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground border-b border-border/40">
                                <th className="text-left py-1.5 pr-3 font-medium">Nome</th>
                                <th className="text-left py-1.5 pr-3 font-medium">Tipo</th>
                                <th className="text-left py-1.5 pr-3 font-medium">Obrigatório</th>
                                <th className="text-left py-1.5 font-medium">Descrição</th>
                              </tr>
                            </thead>
                            <tbody>
                              {campos.map((c) => (
                                <tr key={c.nome} className="border-b border-border/20 last:border-0">
                                  <td className="py-1.5 pr-3 font-mono text-foreground">{c.nome}</td>
                                  <td className="py-1.5 pr-3 text-muted-foreground">{c.tipo}</td>
                                  <td className="py-1.5 pr-3">
                                    <Badge
                                      variant="outline"
                                      className={
                                        c.obrigatorio
                                          ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                                          : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                                      }
                                    >
                                      {c.obrigatorio ? "sim" : "não"}
                                    </Badge>
                                  </td>
                                  <td className="py-1.5 text-muted-foreground">{c.descricao}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {d.payload_exemplo && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">Payload exemplo</div>
                          <pre className="text-xs font-mono bg-secondary/40 border border-border rounded p-2 whitespace-pre-wrap break-all text-foreground max-h-64 overflow-auto">
                            {JSON.stringify(d.payload_exemplo, null, 2)}
                          </pre>
                        </div>
                      )}

                      {d.response_exemplo && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">Response exemplo</div>
                          <pre className="text-xs font-mono bg-secondary/40 border border-border rounded p-2 whitespace-pre-wrap break-all text-foreground max-h-64 overflow-auto">
                            {JSON.stringify(d.response_exemplo, null, 2)}
                          </pre>
                        </div>
                      )}

                      {d.batch_limite != null && (
                        <p className="text-xs text-muted-foreground">
                          Limite por requisição: <span className="text-foreground">{d.batch_limite} itens</span>
                        </p>
                      )}

                      {d.notas && <p className="text-xs text-muted-foreground italic">{d.notas}</p>}

                      {(d.metodo === "POST" || d.metodo === "GET") && (
                        <div>
                          <button
                            onClick={() => copiarCurl(d)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border text-xs text-foreground hover:bg-secondary/60"
                          >
                            <Copy size={12} /> Copiar cURL
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

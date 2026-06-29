import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { LABELS_TIPO_OCORRENCIA, OcorrenciasResult } from "../dashboard.service";

interface Props {
  data: OcorrenciasResult | null;
  loading?: boolean;
}

const CORES_TIPO: Record<string, string> = {
  FALTA: "hsl(0 72% 55%)",
  SOBRA: "hsl(45 90% 50%)",
  AVARIA: "hsl(15 85% 55%)",
  EXTRAVIO: "hsl(340 75% 55%)",
  DIVERGENCIA_INVENTARIO: "hsl(260 60% 55%)",
  PRODUTO_INCORRETO: "hsl(200 70% 55%)",
  VALIDADE_INCORRETA: "hsl(30 80% 55%)",
  LOTE_INCORRETO: "hsl(170 60% 45%)",
  OUTROS: "hsl(220 15% 55%)",
};

export function OcorrenciasChart({ data, loading }: Props) {
  const resumo = data?.resumo;
  const porTipoRaw = Array.isArray(data?.por_tipo) ? data!.por_tipo : [];
  const porTipo = porTipoRaw.map((item) => ({
    nome: LABELS_TIPO_OCORRENCIA[item.tipo] || item.tipo,
    tipo: item.tipo,
    quantidade: item.quantidade,
    pendentes: item.pendentes,
  }));
  const temDados = !!resumo && resumo.total > 0;

  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-400" />
          Ocorrências Operacionais
        </h3>
        <div className="flex items-center gap-3">
          {resumo && resumo.criticas > 0 && (
            <span className="flex items-center gap-1 text-xs font-medium text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">
              <ShieldAlert size={12} />
              {resumo.criticas} crítica{resumo.criticas !== 1 ? "s" : ""}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {resumo?.total || 0} no período
          </span>
        </div>
      </div>

      {temDados && resumo && (
        <div className="flex gap-4 mb-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-muted-foreground">
              {resumo.pendentes} pendente{resumo.pendentes !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-400" />
            <span className="text-muted-foreground">
              {resumo.em_investigacao} em investigação
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-muted-foreground">
              {resumo.resolvidas} resolvida{resumo.resolvidas !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="h-[240px] rounded-lg bg-secondary/30 animate-pulse" />
      ) : !temDados ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Nenhuma ocorrência no período ✓
        </div>
      ) : (
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={porTipo} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <YAxis dataKey="nome" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={150} tick={{ fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip
                cursor={{ fill: "hsl(var(--secondary) / 0.3)" }}
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, _name: string, props: any) => {
                  const pendentes = props.payload.pendentes;
                  return [
                    `${value} ocorrência${value !== 1 ? "s" : ""} (${pendentes} pendente${pendentes !== 1 ? "s" : ""})`,
                    "Total",
                  ];
                }}
              />
              <Bar dataKey="quantidade" radius={[0, 4, 4, 0]}>
                {porTipo.map((item, i) => (
                  <Cell key={i} fill={CORES_TIPO[item.tipo] || CORES_TIPO.OUTROS} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { MapPin } from "lucide-react";

interface TipoEnderecoOcupacao {
  tipo_endereco: string;
  tipo_nome: string;
  total: number;
  ocupados: number;
  livres: number;
  bloqueados: number;
  taxa_ocupacao: number;
}

interface Props {
  data: TipoEnderecoOcupacao[];
  loading?: boolean;
}

export function OcupacaoTipoEnderecoChart({ data, loading }: Props) {
  const safeData = Array.isArray(data) ? data : [];
  const temDados = safeData.length > 0;

  const chartData = safeData.map((t) => ({
    nome: t.tipo_nome,
    ocupados: t.ocupados,
    livres: t.livres,
    bloqueados: t.bloqueados,
  }));

  const labels: Record<string, string> = {
    ocupados: "Ocupados",
    livres: "Livres",
    bloqueados: "Bloqueados",
  };

  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Ocupação por Tipo de Endereço</h3>
        </div>
        {temDados && (
          <span className="text-xs text-muted-foreground">
            {safeData.length} tipo{safeData.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-[220px] rounded-lg bg-secondary/30 animate-pulse" />
      ) : !temDados ? (
        <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground text-center px-4">
          Nenhum endereço configurado para este armazém.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 mb-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-sm bg-yellow-500" /> Ocupados
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-sm bg-green-500" /> Livres
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Bloqueados
            </div>
          </div>

          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 8 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="nome" width={90} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--secondary) / 0.3)" }}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "hsl(var(--popover-foreground))",
                  }}
                  itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                  labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                  formatter={(value: number, name: string) => [`${value} endereços`, labels[name] || name]}
                  labelFormatter={(label: string) => `Tipo: ${label}`}
                />
                <Bar dataKey="ocupados" stackId="a" fill="hsl(45 93% 47%)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="livres" stackId="a" fill="hsl(142 76% 36%)" />
                <Bar dataKey="bloqueados" stackId="a" fill="hsl(0 84% 60%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {safeData.map((t) => (
              <div key={t.tipo_endereco} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/40 text-xs">
                <span className="text-muted-foreground">{t.tipo_nome}</span>
                <span
                  className={`font-semibold ${
                    t.taxa_ocupacao > 85 ? "text-red-400" : t.taxa_ocupacao >= 70 ? "text-yellow-400" : "text-green-400"
                  }`}
                >
                  {t.taxa_ocupacao}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

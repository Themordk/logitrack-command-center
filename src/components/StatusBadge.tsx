import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string | number;
  type: "endereco-situacao" | "endereco-tipo" | "hu-disponibilidade" | "volume-status" | "veiculo" | "generic";
  className?: string;
}

const configs = {
  "endereco-situacao": {
    LIVRE: { label: "Livre", cls: "bg-green-500/15 text-green-400 border-green-500/30" },
    OCUPADO: { label: "Ocupado", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
    BLOQUEADO: { label: "Bloqueado", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
    BLOQUEADO_INVENTARIO: { label: "Bloq. Inventário", cls: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  },
  "endereco-tipo": {
    0: { label: "Pulmão", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    1: { label: "Picking", cls: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  },
  "hu-disponibilidade": {
    0: { label: "Disponível", cls: "bg-green-500/15 text-green-400 border-green-500/30" },
    1: { label: "Reservada", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
    2: { label: "Bloqueada", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
    3: { label: "Em Movimento", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    4: { label: "Descartada", cls: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
  },
  "volume-status": {
    0: { label: "Aberto", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
    1: { label: "Fechado", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
    2: { label: "Conferido", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    3: { label: "Expedido", cls: "bg-green-500/15 text-green-400 border-green-500/30" },
  },
  veiculo: {
    disponivel: { label: "Disponível", cls: "bg-green-500/15 text-green-400 border-green-500/30" },
    em_rota: { label: "Em Rota", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
    manutencao: { label: "Manutenção", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  },
  generic: {
    ativo: { label: "Ativo", cls: "bg-green-500/15 text-green-400 border-green-500/30" },
    inativo: { label: "Inativo", cls: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
    concluido: { label: "Concluído", cls: "bg-green-500/15 text-green-400 border-green-500/30" },
    em_andamento: { label: "Em Andamento", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
    disponivel: { label: "Disponível", cls: "bg-green-500/15 text-green-400 border-green-500/30" },
  },
} as const;

export function StatusBadge({ status, type, className }: StatusBadgeProps) {
  const config = configs[type] as Record<string | number, { label: string; cls: string }>;
  const item = config?.[status];
  if (!item) return <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-500/15 text-gray-400 border border-gray-500/30", className)}>{String(status)}</span>;

  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border", item.cls, className)}>
      {item.label}
    </span>
  );
}

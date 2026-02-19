import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string | number;
  type: "endereco-situacao" | "endereco-tipo" | "hu-disponibilidade" | "volume-status" | "veiculo" | "generic";
  className?: string;
}

const configs = {
  "endereco-situacao": {
    0: { label: "Livre", cls: "badge-free" },
    1: { label: "Ocupado", cls: "badge-busy" },
    2: { label: "Bloqueado", cls: "badge-blocked" },
  },
  "endereco-tipo": {
    0: { label: "Pulmão", cls: "badge-pulm" },
    1: { label: "Picking", cls: "badge-pick" },
  },
  "hu-disponibilidade": {
    0: { label: "Disponível", cls: "badge-free" },
    1: { label: "Reservada", cls: "badge-busy" },
    2: { label: "Bloqueada", cls: "badge-blocked" },
    3: { label: "Em Movimento", cls: "badge-moving" },
    4: { label: "Descartada", cls: "badge-discarded" },
  },
  "volume-status": {
    0: { label: "Aberto", cls: "badge-moving" },
    1: { label: "Fechado", cls: "badge-busy" },
    2: { label: "Conferido", cls: "badge-pulm" },
    3: { label: "Expedido", cls: "badge-free" },
  },
  veiculo: {
    disponivel: { label: "Disponível", cls: "badge-free" },
    em_rota: { label: "Em Rota", cls: "badge-moving" },
    manutencao: { label: "Manutenção", cls: "badge-blocked" },
  },
  generic: {
    ativo: { label: "Ativo", cls: "badge-free" },
    inativo: { label: "Inativo", cls: "badge-discarded" },
    concluido: { label: "Concluído", cls: "badge-free" },
    em_andamento: { label: "Em Andamento", cls: "badge-moving" },
    disponivel: { label: "Disponível", cls: "badge-free" },
  },
} as const;

export function StatusBadge({ status, type, className }: StatusBadgeProps) {
  const config = configs[type] as Record<string | number, { label: string; cls: string }>;
  const item = config?.[status];
  if (!item) return <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium badge-discarded", className)}>{String(status)}</span>;

  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", item.cls, className)}>
      {item.label}
    </span>
  );
}

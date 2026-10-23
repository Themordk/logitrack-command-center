/**
 * Exibição do status do movimento de entrada na lista "Selecionar Movimento"
 * do coletor (conferência).
 *
 * Com conferência e armazenagem simultâneas, um movimento em LIB_ARMAZENAGEM
 * ou ARMAZENAGEM_PARCIAL continua na lista enquanto houver itens a conferir.
 * O status do movimento não volta para EM_CONFERENCIA (regra no backend:
 * entrada_conferencia_buscar_tarefas), então a tela sinaliza que a
 * armazenagem segue em paralelo.
 */

export const STATUS_ARMAZENAGEM_EM_PARALELO = ["LIB_ARMAZENAGEM", "ARMAZENAGEM_PARCIAL"] as const;

export function armazenagemEmParalelo(status: string | null | undefined): boolean {
  return (STATUS_ARMAZENAGEM_EM_PARALELO as readonly string[]).includes(status ?? "");
}

export function recebimentoStatusLabel(status: string | null | undefined): string {
  if (!status) return "";
  if (status === "LIB_ARMAZENAGEM") return "LIB. ARMAZ.";
  if (status === "ARMAZENAGEM_PARCIAL") return "ARMAZ. PARCIAL";
  return status.replace(/_/g, " ");
}

export function recebimentoStatusColor(status: string | null | undefined): string {
  switch (status) {
    case "LIBERADO":
      return "text-[#22C55E]";
    case "EM_CONFERENCIA":
      return "text-[hsl(217,91%,60%)]";
    case "DIVERGENCIA":
      return "text-[#F59E0B]";
    case "LIB_ARMAZENAGEM":
    case "ARMAZENAGEM_PARCIAL":
      return "text-[#A78BFA]";
    default:
      return "text-[hsl(213,31%,55%)]";
  }
}

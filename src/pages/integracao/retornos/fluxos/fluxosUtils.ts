import type { FluxoResumo } from "../retornos.types";

export function descreverModo(f: Pick<FluxoResumo, "modo_ativacao" | "agrupamento">): string {
  if (f.modo_ativacao === "manual") return "Manual";
  if (f.modo_ativacao === "agrupado") {
    const partes: string[] = [];
    if (f.agrupamento?.intervalo_minutos) partes.push(`a cada ${f.agrupamento.intervalo_minutos} min`);
    if (f.agrupamento?.max_documentos) partes.push(`até ${f.agrupamento.max_documentos} docs`);
    return partes.length ? `Agrupado · ${partes.join(" / ")}` : "Agrupado";
  }
  if (f.modo_ativacao === "imediato") return "Imediato";
  return "—";
}

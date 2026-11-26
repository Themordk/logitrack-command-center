import type { Catalogo, EntidadeRetorno } from "../retornos.types";

type EventoCatalogo = Catalogo["eventos"][number];

/** Ordem e rótulo dos grupos de evento nos seletores (Novo fluxo e gatilho). */
export const GRUPOS_EVENTO: { entidade: EntidadeRetorno; rotulo: string }[] = [
  { entidade: "documento_entrada", rotulo: "Entrada" },
  { entidade: "documento_saida", rotulo: "Saída" },
  { entidade: "movimentacao_interna", rotulo: "Estoque" },
  { entidade: "cadastro_importacao", rotulo: "Importar do ERP" },
];

export interface GrupoEventos { entidade: EntidadeRetorno; rotulo: string; eventos: EventoCatalogo[] }

/** Agrupa os eventos automáticos do catálogo (sem os manuais), só os grupos com algum evento. */
export function agruparEventos(eventos: EventoCatalogo[] | undefined): GrupoEventos[] {
  const automaticos = (eventos ?? []).filter((e) => !e.manual && !e.codigo.startsWith("manual."));
  return GRUPOS_EVENTO
    .map((g) => ({ ...g, eventos: automaticos.filter((e) => e.entidade === g.entidade) }))
    .filter((g) => g.eventos.length > 0);
}

export const ehEntidadeImportacao = (entidade: EntidadeRetorno | null | undefined) => entidade === "cadastro_importacao";

/** Como chamar o "documento" de cada entidade nos textos do editor. */
export function termoRegistro(entidade: EntidadeRetorno | null | undefined): { plural: string; todos: string; vazio: string } {
  switch (entidade) {
    case "movimentacao_interna":
      return { plural: "movimentações", todos: "todas as movimentações", vazio: "Nenhuma movimentação recente que mude armazém, setor ou tipo de estoque." };
    case "cadastro_importacao":
      return { plural: "buscas", todos: "todas as buscas", vazio: "Nenhuma busca recente por este botão. Use Testar com um código do ERP." };
    default:
      return { plural: "documentos", todos: "todos os documentos", vazio: "Nenhum documento recente para este evento." };
  }
}

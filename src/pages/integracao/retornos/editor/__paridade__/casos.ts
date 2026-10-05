export const mapaItens = [
  { dominio: "status_pedido", valor_wms: "PARCIAL", valor_erp: "EXP_PARCIAL_EMPRESA", fluxo_id: null },
  { dominio: "status_pedido", valor_wms: "PARCIAL", valor_erp: "EXP_PARCIAL_FLUXO", fluxo_id: "f1" },
  { dominio: "status", valor_wms: "saida.expedido", valor_erp: "40", fluxo_id: null },
];
const F1 = "{\"pedido\": documento.numero, \"status\": $mapa(\"status_pedido\", tem_corte ? \"PARCIAL\" : \"TOTAL\"), \"cliente\": parceiro.codigo_erp, \"itens\": [itens.{\"sku\": produto.sku, \"atendido\": qtd_atendida, \"cortado\": qtd_cortada}]}";
const F5 = [{"tipo":"caminho","campo":"quantidade","valor":"quantidade"},{"tipo":"fixo","campo":"origem","valor":"LogiTrack"},{"tipo":"lista","campo":"pedidos","valor":"documentos","campos":[{"tipo":"caminho","campo":"numero","valor":"documento.numero"},{"tipo":"expressao","campo":"status","valor":"tem_corte ? \"PARCIAL\" : \"TOTAL\"","dominio":"status_pedido"},{"tipo":"caminho","campo":"itens","valor":"totais.itens"}]}];
const fixo = (v: unknown, formato: string) => ({ modo: "mapeamento", campos: [{ campo: "x", tipo: "fixo", valor: v, formato }] });
export const casosPayload: { nome: string; cfg: Record<string, unknown>; lote?: boolean }[] = [
  { nome: "F1 JSONata + de-para do fluxo vence o da empresa", cfg: { modo: "jsonata", expressao: F1 } },
  { nome: "F5 mapeamento em lote", cfg: { modo: "mapeamento", campos: F5 }, lote: true },
  { nome: "$raiz dentro da lista", cfg: { modo: "mapeamento", campos: [{ campo: "itens", tipo: "lista", valor: "itens", campos: [{ campo: "pedido", valor: "$raiz.documento.numero" }, { campo: "sku", valor: "produto.sku" }] }] } },
  { nome: "payload sem modo = JSONata", cfg: { expressao: "{\"p\": documento.numero}" } },
  { nome: "de-para sem correspondência mantém número", cfg: { modo: "mapeamento", campos: [{ campo: "q", valor: "totais.itens", dominio: "status" }] } },
  { nome: "de-para sem correspondência mantém booleano", cfg: { modo: "mapeamento", campos: [{ campo: "c", valor: "tem_corte", dominio: "x" }] } },
  { nome: "$mapa no JSONata sem correspondência mantém número", cfg: { modo: "jsonata", expressao: "{\"q\": $mapa(\"x\", totais.itens)}" } },
  { nome: "booleano 'sim'", cfg: fixo("sim", "booleano") },
  { nome: "booleano 'S'", cfg: fixo("S", "booleano") },
  { nome: "booleano 'TRUE'", cfg: fixo("TRUE", "booleano") },
  { nome: "booleano 'não'", cfg: fixo("não", "booleano") },
  { nome: "número '1,5'", cfg: fixo("1,5", "numero") },
  { nome: "número vazio", cfg: fixo("", "numero") },
  { nome: "número inválido", cfg: fixo("abc", "numero") },
  { nome: "inteiro '7.9'", cfg: fixo("7.9", "inteiro") },
  { nome: "texto de booleano", cfg: fixo(true, "texto") },
  { nome: "texto de número", cfg: fixo(2, "texto") },
  { nome: "lista sobre objeto vira []", cfg: { modo: "mapeamento", campos: [{ campo: "l", tipo: "lista", valor: "documento", campos: [{ campo: "n", valor: "numero" }] }] } },
  { nome: "caminho com espaço nas pontas", cfg: { modo: "mapeamento", campos: [{ campo: "n", valor: " documento.numero " }] } },
  { nome: "caminho $raiz sozinho", cfg: { modo: "mapeamento", campos: [{ campo: "r", valor: "$raiz" }] } },
  { nome: "expressão vazia num campo vira null", cfg: { modo: "mapeamento", campos: [{ campo: "e", tipo: "expressao", valor: "" }] } },
  { nome: "objeto aninhado", cfg: { modo: "mapeamento", campos: [{ campo: "cab", tipo: "objeto", campos: [{ campo: "num", valor: "documento.numero" }, { campo: "valor", valor: "documento.valor", formato: "texto" }] }] } },
];
export const casosRegra: { nome: string; regra: { campo: string; operador: string; valor?: unknown } }[] = [
  { nome: "contém ignora maiúsculas", regra: { campo: "parceiro.razao_social", operador: "contem", valor: "logistica" } },
  { nome: "igual: campo nulo ≠ texto vazio", regra: { campo: "documento.codigo_erp", operador: "igual", valor: "" } },
  { nome: "em: lista não é aparada", regra: { campo: "documento.numero", operador: "em", valor: ["10000 ", "1"] } },
  { nome: "igual booleano", regra: { campo: "tem_corte", operador: "igual", valor: true } },
  { nome: "maior", regra: { campo: "totais.qtd_cortada", operador: "maior", valor: "1" } },
  { nome: "existe em campo nulo", regra: { campo: "documento.codigo_erp", operador: "existe" } },
  { nome: "nao_em com campo ausente", regra: { campo: "documento.inexistente", operador: "nao_em", valor: "a,b" } },
];
export const casosTemplate = ["/pedidos/{{documento.numero}}/{{ documento.tipo.descricao }}?c={{a-b}}", "{{documento.inexistente}}|{{itens.0.produto.sku}}"];

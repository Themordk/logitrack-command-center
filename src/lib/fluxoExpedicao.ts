/**
 * Fluxo de Expedição · F1 — contratos e textos da tela de configuração.
 *
 * A configuração (critérios por nível, limite de SKUs) é gravada e validada só por
 * roteiro_saida_obter / roteiro_saida_salvar. Aqui ficam os rótulos, a frase que traduz
 * a escolha e as dicas de coerência exibidas na tela (o backend é quem recusa).
 */
import { supabase } from "@/integrations/supabase/client";

export type NivelFluxo = "movimento" | "separacao" | "conferencia" | "embarque";
export type CriterioFluxo =
  | "DOCUMENTO" | "PARCEIRO" | "ROTA"
  | "ZONA_ATIVIDADE" | "TIPO_POSICAO" | "TIPO_SEPARACAO_SKU"
  | "MARCA" | "GRUPO_PRODUTO" | "SUBGRUPO_PRODUTO"
  | "GRUPO_SEPARACAO" | "HU_VOLUME";

export interface ConfigFluxo {
  movimento: CriterioFluxo[];
  separacao: CriterioFluxo[];
  conferencia: CriterioFluxo[];
  embarque: CriterioFluxo[];
  /** Máximo de SKUs por grupo de separação; null = sem limite. */
  maxSku: number | null;
}

export interface RoteiroDados {
  movimento: CriterioFluxo[];
  separacao: CriterioFluxo[];
  conferencia: CriterioFluxo[];
  embarque: CriterioFluxo[];
  limites: Record<string, number>;
  criterios_permitidos: Record<NivelFluxo, CriterioFluxo[]>;
  /** % dos produtos ativos da empresa com a informação (critérios de produto do N3). */
  cobertura?: Partial<Record<CriterioFluxo, number>> & { produtos?: number };
}

export interface RoteiroAviso { codigo: string; mensagem: string }

export const CONFIG_VAZIA: ConfigFluxo = { movimento: [], separacao: [], conferencia: [], embarque: [], maxSku: null };

export const CRITERIO_LABEL: Record<CriterioFluxo, string> = {
  DOCUMENTO: "Documento (pedido)",
  PARCEIRO: "Parceiro (cliente)",
  ROTA: "Rota",
  ZONA_ATIVIDADE: "Zona de atividade",
  TIPO_POSICAO: "Tipo de posição (pulmão / picking)",
  TIPO_SEPARACAO_SKU: "Tipo de separação do SKU",
  MARCA: "Marca do produto",
  GRUPO_PRODUTO: "Grupo de produto",
  SUBGRUPO_PRODUTO: "Subgrupo de produto",
  GRUPO_SEPARACAO: "Grupo de separação",
  HU_VOLUME: "HU / volume",
};

/** Nome curto, usado na frase e nos selos de herança. */
export const CRITERIO_CURTO: Record<CriterioFluxo, string> = {
  DOCUMENTO: "documento", PARCEIRO: "parceiro", ROTA: "rota",
  ZONA_ATIVIDADE: "zona", TIPO_POSICAO: "tipo de posição", TIPO_SEPARACAO_SKU: "tipo de separação",
  MARCA: "marca", GRUPO_PRODUTO: "grupo de produto", SUBGRUPO_PRODUTO: "subgrupo de produto",
  GRUPO_SEPARACAO: "grupo de separação", HU_VOLUME: "HU/volume",
};

export const CRITERIO_AJUDA: Partial<Record<CriterioFluxo, string>> = {
  DOCUMENTO: "Cada pedido vira um movimento de saída próprio.",
  PARCEIRO: "Pedidos do mesmo cliente ficam no mesmo movimento.",
  ROTA: "Pedidos da mesma rota de entrega ficam no mesmo movimento.",
  ZONA_ATIVIDADE: "Cada zona de atividade do endereço vira um pacote de separação.",
  TIPO_POSICAO: "Separa o que sai do pulmão do que sai do picking.",
  TIPO_SEPARACAO_SKU: "Separa fracionado, embalagem total e caixaria.",
  MARCA: "Cada marca vira um pacote (grafias diferentes da mesma marca são unidas).",
  GRUPO_PRODUTO: "Cada grupo do cadastro de produtos vira um pacote.",
  SUBGRUPO_PRODUTO: "Cada subgrupo do cadastro de produtos vira um pacote.",
  GRUPO_SEPARACAO: "Cada grupo de separação é conferido como uma unidade.",
  HU_VOLUME: "Cada HU ou volume coletado é conferido como uma unidade.",
};

export const NIVEL_INFO: Record<NivelFluxo, { codigo: string; titulo: string; nasce: string; unificar: string }> = {
  movimento: {
    codigo: "N2", titulo: "Movimento de saída (onda)",
    nasce: "Como os pedidos liberados viram movimentos de saída.",
    unificar: "Um movimento por empresa e tipo de saída.",
  },
  separacao: {
    codigo: "N3", titulo: "Grupo de separação",
    nasce: "Como as tarefas do movimento são divididas entre os separadores.",
    unificar: "Um grupo por armazém dentro do movimento.",
  },
  conferencia: {
    codigo: "N4", titulo: "Unidade de conferência",
    nasce: "O que o conferente confere de uma vez.",
    unificar: "O movimento inteiro é conferido junto.",
  },
  embarque: {
    codigo: "N5", titulo: "Carga de embarque",
    nasce: "Como a Montagem de Carga sugere juntar os movimentos conferidos.",
    unificar: "A sugestão junta movimentos com o mesmo veículo/transportadora e box.",
  },
};

/** Critérios de N2 que descem como "herdados" para N3 e N4. */
export function herdados(config: ConfigFluxo): CriterioFluxo[] {
  return config.movimento;
}

export function moverCriterio(lista: CriterioFluxo[], indice: number, direcao: -1 | 1): CriterioFluxo[] {
  const alvo = indice + direcao;
  if (alvo < 0 || alvo >= lista.length) return lista;
  const nova = [...lista];
  [nova[indice], nova[alvo]] = [nova[alvo], nova[indice]];
  return nova;
}

export function alternarCriterio(lista: CriterioFluxo[], criterio: CriterioFluxo): CriterioFluxo[] {
  return lista.includes(criterio) ? lista.filter((c) => c !== criterio) : [...lista, criterio];
}

const juntar = (itens: string[]) =>
  itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;

/** Frase de cada nível, para o rodapé do bloco. */
export function fraseNivel(nivel: NivelFluxo, config: ConfigFluxo): string {
  const nomes = (l: CriterioFluxo[]) => juntar(l.map((c) => CRITERIO_CURTO[c]));
  const her = herdados(config);
  switch (nivel) {
    case "movimento":
      return config.movimento.length === 0
        ? "Os pedidos da mesma empresa e tipo de saída entram juntos em um movimento."
        : config.movimento.length === 1
          ? `Cada ${nomes(config.movimento)} vira um movimento de saída (dentro de empresa e tipo de saída).`
          : `Cada combinação de ${nomes(config.movimento)} vira um movimento de saída (dentro de empresa e tipo de saída).`;
    case "separacao": {
      const base = config.separacao.length === 0
        ? "Cada movimento tem um grupo de separação por armazém"
        : `Dentro do movimento, um grupo de separação por ${juntar(["armazém", ...config.separacao.map((c) => CRITERIO_CURTO[c])])}`;
      const lim = config.maxSku ? `, com no máximo ${config.maxSku} SKUs por grupo` : "";
      const h = her.length ? ` Já separado por ${nomes(her)} (herdado do movimento).` : "";
      return `${base}${lim}.${h}`;
    }
    case "conferencia": {
      const base = config.conferencia.length === 0
        ? "O movimento é conferido inteiro, como uma unidade só"
        : `O conferente confere por ${nomes(config.conferencia)}`;
      const h = her.length ? ` Já separado por ${nomes(her)} (herdado do movimento).` : "";
      return `${base}.${h}`;
    }
    case "embarque":
      return config.embarque.length === 0
        ? "A Montagem de Carga sugere juntar movimentos com o mesmo veículo/transportadora e box."
        : `A Montagem de Carga sugere cargas por ${nomes(config.embarque)}.`;
  }
}

/** Dicas de coerência exibidas no nível (o backend devolve os avisos oficiais ao salvar). */
export function dicasNivel(nivel: NivelFluxo, config: ConfigFluxo): string[] {
  const dicas: string[] = [];
  if (nivel === "conferencia" && config.conferencia.includes("GRUPO_SEPARACAO")
      && config.separacao.length === 0 && !config.maxSku) {
    dicas.push("Sem critério nem limite na separação, cada movimento tem um grupo por armazém: a conferência por grupo só divide movimentos com mais de um armazém.");
  }
  if (nivel === "separacao" && config.separacao.includes("GRUPO_PRODUTO") && config.separacao.includes("SUBGRUPO_PRODUTO")) {
    dicas.push("Grupo e Subgrupo juntos: o subgrupo já pertence a um grupo, então marcar os dois não divide mais do que só o Subgrupo.");
  }
  if (nivel === "separacao" && config.maxSku !== null && (!Number.isInteger(config.maxSku) || config.maxSku <= 0)) {
    dicas.push("O máximo de SKUs deve ser um número inteiro maior que zero.");
  }
  return dicas;
}

export function configDeDados(d: RoteiroDados): ConfigFluxo {
  const max = d.limites?.["separacao.MAX_SKU"];
  return {
    movimento: d.movimento ?? [], separacao: d.separacao ?? [], conferencia: d.conferencia ?? [], embarque: d.embarque ?? [],
    maxSku: typeof max === "number" ? max : max ? Number(max) : null,
  };
}

export function configIgual(a: ConfigFluxo, b: ConfigFluxo): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Payload de roteiro_saida_salvar: todos os níveis de uma vez (gravação atômica). */
export function payloadSalvar(c: ConfigFluxo) {
  return {
    movimento: c.movimento, separacao: c.separacao, conferencia: c.conferencia, embarque: c.embarque,
    limites: { separacao: c.maxSku ? { MAX_SKU: c.maxSku } : {} },
  };
}

// ----- acesso às RPCs -----
interface Resposta<T> { sucesso: boolean; codigo: string; mensagem?: string; dados?: T; avisos?: RoteiroAviso[] }

export class RoteiroRpcError extends Error {
  codigo: string;
  constructor(codigo: string, mensagem: string) {
    super(`${codigo}: ${mensagem}`);
    this.name = "RoteiroRpcError";
    this.codigo = codigo;
  }
}

async function chamar<T>(fn: string, args: Record<string, unknown>): Promise<Resposta<T>> {
  // roteiro_saida_* não estão nos tipos gerados do Supabase: cast único e localizado aqui.
  const rpc = supabase.rpc as unknown as (n: string, p: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc.call(supabase, fn, args);
  if (error) throw error;
  const r = (typeof data === "string" ? JSON.parse(data) : data) as Resposta<T>;
  if (!r || typeof r !== "object") throw new RoteiroRpcError("RESPOSTA_INVALIDA", "O servidor devolveu uma resposta inesperada.");
  if (!r.sucesso) throw new RoteiroRpcError(r.codigo, r.mensagem ?? "");
  return r;
}

export interface SimulacaoFluxo {
  origem: "PENDENTES" | "PERIODO";
  dias: number;
  pedidos: number;
  itens: number;
  skus: number;
  movimentos: number;
  grupos_separacao: number;
  unidades_conferencia: number;
  movimentos_conferidos: number;
  conferencia_por_hu: boolean;
  movimentos_com_embarque: number;
  /** null = sem critério no N5: a sugestão depende do veículo e box informados na geração da onda. */
  cargas_sugeridas: number | null;
  por_tipo: { tipo: string; pedidos: number; movimentos: number; grupos_separacao: number; unidades_conferencia: number }[];
}

export function descreverAmostra(s: SimulacaoFluxo): string {
  return s.origem === "PENDENTES"
    ? `${s.pedidos} pedido(s) pendente(s) de movimento`
    : `${s.pedidos} pedido(s) dos últimos ${s.dias} dias (não há pendentes)`;
}

export const fluxoExpedicaoService = {
  obter: async (tenantId: string, empresaId: string) =>
    (await chamar<RoteiroDados>("roteiro_saida_obter", { p_tenant_id: tenantId, p_empresa_id: empresaId })).dados as RoteiroDados,
  /** Somente leitura: aplica a configuração ainda não salva sobre pedidos reais. */
  simular: async (tenantId: string, empresaId: string, config: ConfigFluxo, dias: number) =>
    (await chamar<SimulacaoFluxo>("roteiro_saida_simular", {
      p_tenant_id: tenantId, p_empresa_id: empresaId, p_config: payloadSalvar(config), p_dias: dias,
    })).dados as SimulacaoFluxo,
  salvar: async (tenantId: string, empresaId: string, config: ConfigFluxo) => {
    const r = await chamar<RoteiroDados>("roteiro_saida_salvar", { p_tenant_id: tenantId, p_empresa_id: empresaId, p_config: payloadSalvar(config) });
    return { dados: r.dados as RoteiroDados, avisos: r.avisos ?? [], mensagem: r.mensagem ?? "Fluxo salvo." };
  },
};

/** Critérios que dependem do cadastro de produto: a tela mostra quanto do cadastro tem a informação. */
export const CRITERIOS_CADASTRO: CriterioFluxo[] = ["MARCA", "GRUPO_PRODUTO", "SUBGRUPO_PRODUTO"];

export function textoCobertura(criterio: CriterioFluxo, pct: number | undefined): { texto: string; alerta: boolean } | null {
  if (!CRITERIOS_CADASTRO.includes(criterio) || pct === undefined || pct === null) return null;
  const sem = criterio === "MARCA" ? "Sem marca" : criterio === "GRUPO_PRODUTO" ? "Sem grupo" : "Sem subgrupo";
  if (pct >= 100) return { texto: "100% dos produtos têm a informação.", alerta: false };
  return { texto: `${pct}% dos produtos têm a informação; os demais vão para "${sem}".`, alerta: pct < 80 };
}

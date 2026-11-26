// Esqueleto do contexto por entidade, usado no editor enquanto não há amostra escolhida.
// Espelha integracao.fn_retorno_contexto (§3.6 e §6.2): os caminhos aparecem no painel mesmo sem documento.
import type { EntidadeRetorno } from "../retornos.types";

const BASE = {
  evento: null, evento_nome: null, ocorrido_em: null,
  empresa: { id: null, codigo: null, cnpj: null, razao_social: null },
  operador: { id: null, nome: null, login: null },
  erro: { mensagem: null, http_status: null },
};

const DOCUMENTO = {
  ...BASE,
  documento: { id: null, numero: null, codigo_erp: null, sistema_origem: null, status_wms: null, status_integracao: null, tipo: { id: null, descricao: null, codigo_erp: null } },
  parceiro: { id: null, codigo_erp: null, documento: null, razao_social: null },
  movimento: { id: null, numero: null, status: null },
  itens: [{ produto: { sku: null, codigo_erp: null, descricao: null }, qtd_solicitada: null, qtd_atendida: null, qtd_cortada: null }],
};

const LOCAL = {
  endereco: { id: null, codigo: null },
  armazem: { id: null, codigo_erp: null, descricao: null },
  setor: { id: null, codigo_erp: null, descricao: null },
  tipo_estoque: { id: null, codigo_erp: null, descricao: null },
};

const MOVIMENTACAO = {
  ...BASE,
  documento: { id: null, numero: null },
  movimentacao: {
    id: null, numero: null, rotina: null, ocorrida_em: null, mudancas: [],
    muda_armazem: null, muda_setor: null, muda_tipo_estoque: null,
  },
  origem: LOCAL,
  destino: LOCAL,
  itens: [{
    produto: { sku: null, codigo_erp: null, descricao: null, referencia: null },
    lote: null, validade: null, fabricacao: null, numero_serie: null, hu: null, quantidade: null,
    saldo_origem_apos: null, saldo_destino_apos: null,
  }],
  totais: { itens: null, quantidade: null },
};

const IMPORTACAO = {
  ...BASE,
  importacao: { id: null, evento: null, entidade: null, tela: null, rota: null, valor: null, tipo_busca: null, parametros: {}, teste: null },
};

export function contextoVazio(entidade: EntidadeRetorno | null | undefined): Record<string, unknown> {
  switch (entidade) {
    case "movimentacao_interna": return MOVIMENTACAO;
    case "cadastro_importacao": return IMPORTACAO;
    default: return DOCUMENTO;
  }
}

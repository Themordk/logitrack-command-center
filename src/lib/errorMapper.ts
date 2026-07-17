export interface ParsedError {
  type: "validation" | "business" | "system";
  title: string;
  details?: string;
  errorCode?: string;
  technicalMessage?: string;
  instruction?: string;
}

const BUSINESS_ERROR_MAP: Record<string, { title: string; instruction: string }> = {
  // === Inventário ===
  INVENTARIO_NAO_ENCONTRADO: {
    title: "Inventário não encontrado.",
    instruction: "Volte e selecione outro inventário.",
  },
  INVENTARIO_NAO_GERAL: {
    title: "Este inventário não é do tipo Geral.",
    instruction: "Selecione um inventário do tipo correto.",
  },
  INVENTARIO_STATUS_INVALIDO: {
    title: "Este inventário não está em contagem.",
    instruction: "Volte à lista de inventários.",
  },
  JA_CONTADO: {
    title: "Este produto já foi contado neste endereço.",
    instruction: "Escaneie outro produto.",
  },
  TIPO_TAREFA_NAO_CONFIGURADO: {
    title: "Tipo de tarefa não configurado.",
    instruction: "Peça ao supervisor para configurar em Configurações > Inventário.",
  },
  ESCOPO_ZONA_OBRIGATORIO: {
    title: "Selecione uma zona de atividade.",
    instruction: "Preencha o campo de zona antes de continuar.",
  },
  ESCOPO_ENDERECO_OBRIGATORIO: {
    title: "Selecione um endereço.",
    instruction: "Preencha o campo de endereço antes de continuar.",
  },
  ESCOPO_PRODUTO_OBRIGATORIO: {
    title: "Selecione um produto.",
    instruction: "Preencha o campo de produto antes de continuar.",
  },
  ESCOPO_GRUPO_OBRIGATORIO: {
    title: "Selecione um grupo de produto.",
    instruction: "Preencha o campo de grupo antes de continuar.",
  },
  CRITERIO_ROTATIVO_OBRIGATORIO: {
    title: "Selecione o critério do inventário rotativo.",
    instruction: "Preencha o critério antes de continuar.",
  },
  CURVA_OBRIGATORIA: {
    title: "Selecione a curva (A, B, C ou D).",
    instruction: "Preencha a curva antes de continuar.",
  },
  ARMAZEM_OBRIGATORIO: {
    title: "Armazém não identificado.",
    instruction: "Recarregue a página e tente novamente.",
  },

  // === Estoque / Endereço ===
  ESTOQUE_INSUFICIENTE: {
    title: "Estoque insuficiente para esta operação.",
    instruction: "Verifique a quantidade disponível e tente novamente.",
  },
  ENDERECO_NAO_ENCONTRADO: {
    title: "Endereço não encontrado ou inativo.",
    instruction: "Escaneie novamente ou verifique o código.",
  },
  ENDERECO_ARMAZEM_INVALIDO: {
    title: "Endereço não pertence ao armazém deste inventário.",
    instruction: "Verifique se está no armazém correto.",
  },
  ENDERECO_OCUPADO: {
    title: "Este endereço já está ocupado.",
    instruction: "Escolha outro endereço disponível.",
  },
  SALDO_INSUFICIENTE: {
    title: "Saldo insuficiente neste endereço.",
    instruction: "Verifique a quantidade e tente novamente.",
  },

  // === EAN / Produto ===
  EAN_NAO_ENCONTRADO: {
    title: "Código de barras não cadastrado.",
    instruction: "Verifique o produto e tente outro código.",
  },
  PRODUTO_NAO_ENCONTRADO: {
    title: "Produto não encontrado no sistema.",
    instruction: "Verifique o código e tente novamente.",
  },
  PRODUTO_EMPRESA_INVALIDO: {
    title: "Produto não pertence a esta empresa.",
    instruction: "Verifique se está no armazém correto.",
  },
  PRODUTO_INATIVO: {
    title: "Este produto está inativo no sistema.",
    instruction: "Informe ao supervisor.",
  },
  EAN_DIVERGENTE: {
    title: "O código de barras não corresponde ao produto esperado.",
    instruction: "Verifique se escaneou o produto correto.",
  },

  // === Tarefas ===
  TAREFA_NAO_ENCONTRADA: {
    title: "Tarefa não encontrada.",
    instruction: "Atualize a lista e tente novamente.",
  },
  TAREFA_JA_ATRIBUIDA: {
    title: "Esta tarefa já está atribuída a outro operador.",
    instruction: "Volte à lista de tarefas.",
  },
  TAREFA_JA_CONCLUIDA: {
    title: "Esta tarefa já foi concluída.",
    instruction: "Volte à lista de tarefas.",
  },
  TAREFA_STATUS_INVALIDO: {
    title: "Esta tarefa não pode ser executada no status atual.",
    instruction: "Volte à lista e verifique o status.",
  },
  TAREFA_CANCELADA: {
    title: "Esta tarefa foi cancelada.",
    instruction: "Volte à lista de tarefas.",
  },

  // === Separação / Conferência / Expedição ===
  ONDA_NAO_ENCONTRADA: {
    title: "Onda de separação não encontrada.",
    instruction: "Volte e selecione outra onda.",
  },
  VOLUME_JA_GERADO: {
    title: "Volume já foi gerado para esta conferência.",
    instruction: "Prossiga com o carregamento.",
  },
  DOCUMENTO_SAIDA_NAO_ENCONTRADO: {
    title: "Documento de saída não encontrado.",
    instruction: "Volte e verifique os dados.",
  },
  QUANTIDADE_INVALIDA: {
    title: "Quantidade informada é inválida.",
    instruction: "Informe uma quantidade maior que zero.",
  },

  // === Abastecimento ===
  ABASTECIMENTO_NAO_ENCONTRADO: {
    title: "Abastecimento não encontrado.",
    instruction: "Atualize a lista e tente novamente.",
  },
  PICKING_PRODUTO_NAO_ENCONTRADO: {
    title: "Endereço de picking não configurado para este produto.",
    instruction: "Informe ao supervisor.",
  },

  // === Login / Auth ===
  INVALID_CREDENTIALS: {
    title: "Usuário ou senha incorretos.",
    instruction: "Verifique seus dados e tente novamente.",
  },
  USER_INACTIVE: {
    title: "Seu acesso está desativado.",
    instruction: "Entre em contato com o supervisor.",
  },
  TENANT_NOT_FOUND: {
    title: "Empresa não encontrada.",
    instruction: "Verifique o endereço de acesso.",
  },
  SESSION_EXPIRED: {
    title: "Sua sessão expirou.",
    instruction: "Faça login novamente.",
  },

  // === Integração ERP ===
  ERP_SYNC_FAILED: {
    title: "Falha na sincronização com o ERP.",
    instruction: "Tente novamente. Se persistir, verifique a configuração.",
  },
  ERP_CONNECTION_ERROR: {
    title: "Não foi possível conectar ao ERP.",
    instruction: "Verifique as credenciais de integração.",
  },

  // === Genéricos ===
  REGISTRO_DUPLICADO: {
    title: "Este registro já existe no sistema.",
    instruction: "Verifique se não há duplicidade.",
  },
  REGISTRO_NAO_ENCONTRADO: {
    title: "Registro não encontrado.",
    instruction: "Verifique os dados e tente novamente.",
  },
  SEM_PERMISSAO: {
    title: "Você não tem permissão para esta ação.",
    instruction: "Fale com o administrador.",
  },
  OPERACAO_NAO_PERMITIDA: {
    title: "Esta operação não é permitida.",
    instruction: "Verifique as condições e tente novamente.",
  },
};

const SYSTEM_ERROR_PATTERNS: Array<{
  pattern: RegExp;
  title: string;
  instruction: string;
}> = [
  {
    pattern: /Invalid login credentials/i,
    title: "Usuário ou senha incorretos.",
    instruction: "Verifique seus dados e tente novamente.",
  },
  {
    pattern: /duplicate key/i,
    title: "Este registro já existe no sistema.",
    instruction: "Verifique se não há dados duplicados.",
  },
  {
    pattern: /row-level security/i,
    title: "Sem permissão para esta ação.",
    instruction: "Verifique suas permissões ou fale com o administrador.",
  },
  {
    pattern: /violates foreign key/i,
    title: "Este registro está vinculado a outros dados.",
    instruction: "Remova os vínculos antes de prosseguir.",
  },
  {
    pattern: /violates not-null/i,
    title: "Um campo obrigatório não foi preenchido.",
    instruction: "Preencha todos os campos obrigatórios.",
  },
  {
    pattern: /violates check constraint/i,
    title: "Um valor informado é inválido.",
    instruction: "Verifique os campos e tente novamente.",
  },
  {
    pattern: /value too long/i,
    title: "Um campo excede o tamanho máximo permitido.",
    instruction: "Reduza o texto e tente novamente.",
  },
  {
    pattern: /invalid input syntax/i,
    title: "Formato de dados inválido.",
    instruction: "Verifique os valores informados.",
  },
  {
    pattern: /network|fetch|ERR_NETWORK|ECONNREFUSED|Failed to fetch/i,
    title: "Falha na comunicação com o servidor.",
    instruction: "Verifique sua conexão e tente novamente.",
  },
  {
    pattern: /timeout|ETIMEDOUT|AbortError/i,
    title: "O servidor demorou para responder.",
    instruction: "Aguarde um momento e tente novamente.",
  },
  {
    pattern: /JWT|token.*expired|token.*invalid/i,
    title: "Sua sessão expirou.",
    instruction: "Faça login novamente.",
  },
];

function extractMessage(error: unknown): string {
  if (error === null || error === undefined) return "Erro desconhecido";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.error === "string") return obj.error;
    if (typeof obj.error_description === "string") return obj.error_description;
    if (typeof obj.mensagem === "string") return obj.mensagem;
    try {
      return JSON.stringify(error);
    } catch {
      return "Erro desconhecido";
    }
  }
  return String(error);
}

function findBusinessError(
  message: string,
): { code: string; title: string; instruction: string } | null {
  try {
    const parsed = JSON.parse(message) as { codigo?: string };
    if (parsed.codigo && BUSINESS_ERROR_MAP[parsed.codigo]) {
      return {
        code: parsed.codigo,
        ...BUSINESS_ERROR_MAP[parsed.codigo],
      };
    }
  } catch {
    // não é JSON
  }

  for (const [code, mapped] of Object.entries(BUSINESS_ERROR_MAP)) {
    if (message.includes(code)) {
      return { code, ...mapped };
    }
  }

  return null;
}

/**
 * Analisa qualquer erro e retorna um objeto estruturado com mensagem amigável.
 */
export function parseError(error: unknown, context?: string): ParsedError {
  const rawMessage = extractMessage(error);

  const businessMatch = findBusinessError(rawMessage);
  if (businessMatch) {
    return {
      type: "business",
      title: businessMatch.title,
      instruction: businessMatch.instruction,
      errorCode: businessMatch.code,
      technicalMessage: context ? `[${context}] ${rawMessage}` : rawMessage,
    };
  }

  const systemMatch = SYSTEM_ERROR_PATTERNS.find((p) => p.pattern.test(rawMessage));
  if (systemMatch) {
    return {
      type: "system",
      title: systemMatch.title,
      instruction: systemMatch.instruction,
      technicalMessage: context ? `[${context}] ${rawMessage}` : rawMessage,
    };
  }

  return {
    type: "system",
    title: "Ocorreu um erro inesperado.",
    instruction: "Tente novamente. Se persistir, informe ao administrador.",
    technicalMessage: context ? `[${context}] ${rawMessage}` : rawMessage,
  };
}

/**
 * Formata o erro para cópia (diagnóstico do admin).
 */
export function formatErrorForCopy(
  parsed: ParsedError,
  extras?: Record<string, unknown>,
): string {
  return JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      type: parsed.type,
      title: parsed.title,
      errorCode: parsed.errorCode ?? null,
      technicalMessage: parsed.technicalMessage ?? null,
      ...extras,
    },
    null,
    2,
  );
}

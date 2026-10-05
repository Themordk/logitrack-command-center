// Tipos do Motor de Retorno ao ERP — espelham docs/retorno-erp/CONTRATO_FRONTEND.md §3.

export type TipoNo =
  | "gatilho.evento" | "gatilho.manual"
  | "logica.condicao" | "logica.aguardar" | "logica.dividir_itens"
  | "dados.payload"
  | "acao.http" | "acao.webhook" | "acao.provedor" | "acao.atualizar_documento" | "acao.notificar";

export type GrupoNo = "gatilho" | "logica" | "dados" | "acao";

export type Operador =
  | "igual" | "diferente" | "contem" | "em" | "nao_em"
  | "maior" | "maior_igual" | "menor" | "menor_igual" | "existe" | "nao_existe";

export type EntidadeDocumento = "documento_entrada" | "documento_saida";
export type AuthTipo = "nenhuma" | "api_key" | "bearer" | "basic" | "hmac";
export type MetodoHttp = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Combinador = "e" | "ou";
export type ModoAtivacao = "imediato" | "agrupado" | "manual";

export interface Catalogo {
  eventos: { codigo: string; entidade: EntidadeDocumento; nome: string; descricao: string | null; manual: boolean }[];
  nos: { tipo: TipoNo; grupo: GrupoNo; nome: string; descricao: string; saidas: string[]; config_exemplo: Record<string, unknown>; disponivel: boolean }[];
  operadores: { codigo: Operador; nome: string }[];
  operacoes_provedor: { provedor: "omie"; operacao: string; entidade: string; nome: string; parametros: Record<string, string> }[];
  auth_tipos: AuthTipo[];
  limites: { max_nos: number; timeout_ms_max: number; max_tentativas: number };
}

export type StatusExecucao =
  | "agrupando" | "agrupado" | "pendente" | "executando" | "aguardando_retry"
  | "sucesso" | "erro" | "filtrado" | "descartado";
export type ModoExecucao = "automatico" | "manual" | "teste" | "simulacao" | "lote";
export type StatusPasso = "sucesso" | "erro" | "retry" | "simulado" | "filtrado";
export type StatusFluxo = "rascunho" | "publicado" | "pausado" | "arquivado";
export type MotorRetorno = "legado" | "fluxos";

export interface RetornoConfig {
  motor: MotorRetorno;
  fluxos_ativos: number;
  execucoes_24h: Partial<Record<StatusExecucao, number>>;
  pendentes: number;
  erros_abertos: number;
  destinos_pausados: number;
  eventos_com_erro_24h: number;
  ultima_execucao_em: string | null;
}

export interface Destino {
  id: string;
  nome: string;
  erp_provedor_id: string | null;
  modo: "http" | "webhook";
  metodo: MetodoHttp;
  url_base: string;
  auth_tipo: AuthTipo;
  auth_config: Record<string, string>;
  tem_segredo: boolean;
  headers: Record<string, string>;
  timeout_ms: number;
  max_tentativas: number;
  limite_falhas: number;
  falhas_consecutivas: number;
  pausado_em: string | null;
  pausado_motivo: string | null;
  ultimo_sucesso_em: string | null;
  ultimo_erro_em: string | null;
  ativo: boolean;
  updated_at: string;
  fluxos_usando: number;
}

export interface DestinoEntrada {
  id?: string;
  nome: string;
  modo: "http" | "webhook";
  metodo: MetodoHttp;
  url_base: string;
  auth_tipo: AuthTipo;
  auth_config: Record<string, string>;
  headers: Record<string, string>;
  timeout_ms: number;
  max_tentativas: number;
  limite_falhas: number;
  ativo: boolean;
  erp_provedor_id?: string | null;
  reativar?: boolean;
}

export interface MapaItem {
  id: string;
  fluxo_id: string | null;
  dominio: string;
  valor_wms: string;
  valor_erp: string;
}

export interface Regra {
  campo: string;
  operador: Operador;
  valor?: string | number | boolean | string[];
}

export interface CampoMapeado {
  campo: string;
  tipo?: "caminho" | "fixo" | "expressao" | "lista" | "objeto";
  valor?: unknown;
  dominio?: string;
  campos?: CampoMapeado[];
  formato?: "texto" | "numero" | "inteiro" | "booleano";
}

// ---- Config de cada nó ----
export interface ConfigGatilhoEvento {
  evento: string;
  filtros: Regra[];
  combinador: Combinador;
  modo: "imediato" | "agrupado";
  agrupamento?: { intervalo_minutos: number; max_documentos: number };
}
export interface ConfigGatilhoManual { entidade: EntidadeDocumento; filtros: Regra[]; combinador: Combinador }
export interface ConfigCondicao { regras: Regra[]; combinador: Combinador }
export interface ConfigAguardar { minutos: number }
export type ConfigPayload =
  | { modo: "jsonata"; expressao: string }
  | { modo: "mapeamento"; campos: CampoMapeado[] };
export interface ConfigHttp { destino_id: string; metodo?: MetodoHttp; caminho?: string; corpo_de?: string; headers?: Record<string, string> }
export interface ConfigWebhook { destino_id: string; caminho?: string }
export interface ConfigProvedor { provedor: "omie"; operacao: string; parametros: { etapa?: string } & Record<string, string | undefined> }
export interface ConfigAtualizarDocumento { status_integracao: string; marcar_exportado: boolean }
export interface ConfigNotificar { titulo: string; mensagem: string; cor: "red" | "orange" | "blue" | "green" }
export type ConfigDividirItens = Record<string, unknown>;

export interface ConfigPorTipo {
  "gatilho.evento": ConfigGatilhoEvento;
  "gatilho.manual": ConfigGatilhoManual;
  "logica.condicao": ConfigCondicao;
  "logica.aguardar": ConfigAguardar;
  "logica.dividir_itens": ConfigDividirItens;
  "dados.payload": ConfigPayload;
  "acao.http": ConfigHttp;
  "acao.webhook": ConfigWebhook;
  "acao.provedor": ConfigProvedor;
  "acao.atualizar_documento": ConfigAtualizarDocumento;
  "acao.notificar": ConfigNotificar;
}

export interface No<T extends TipoNo = TipoNo> {
  id: string;
  tipo: T;
  nome?: string;
  posicao?: { x: number; y: number };
  config: ConfigPorTipo[T];
}

export interface Ligacao { de: string; para: string; saida?: string }

export interface Definicao { versao_schema: 1; nos: No[]; ligacoes: Ligacao[] }

export interface Aviso { codigo: string; mensagem: string; no_id?: string }

export interface Validacao {
  valido: boolean;
  erros: Aviso[];
  avisos: Aviso[];
  gatilho: {
    id: string; tipo: TipoNo; evento: string | null; entidade: EntidadeDocumento | null;
    modo: ModoAtivacao; agrupamento: { intervalo_minutos?: number; max_documentos?: number } | null;
  } | null;
}

export interface FluxoResumo {
  id: string;
  nome: string;
  descricao: string | null;
  erp_provedor_id: string | null;
  evento: string | null;
  evento_nome: string | null;
  modo_ativacao: ModoAtivacao | null;
  agrupamento: { intervalo_minutos?: number; max_documentos?: number } | null;
  versao_publicada: number | null;
  publicado_em: string | null;
  ativo: boolean;
  arquivado_em: string | null;
  updated_at: string;
  created_at: string;
  status: StatusFluxo;
  alteracoes_nao_publicadas: boolean;
  execucoes_24h: Partial<Record<StatusExecucao, number>>;
  ultima_execucao_em: string | null;
}

export interface FluxoCompleto extends FluxoResumo {
  definicao_rascunho: Definicao;
  definicao_publicada: Definicao | null;
  validacao_rascunho: Validacao;
}

export interface FluxoEntrada {
  id?: string;
  nome: string;
  descricao?: string | null;
  erp_provedor_id?: string | null;
  definicao: Definicao;
  updated_at_esperado?: string;
}

export interface VersaoFluxo {
  versao: number;
  publicado_em: string;
  publicado_por: string | null;
  definicao: Definicao;
  atual: boolean;
}

/** Contexto canônico que os nós enxergam (§3.6). Estrutura aberta. */
export type Contexto = Record<string, unknown>;

export interface DocumentoRecente {
  documento_id: string;
  movimento_id: string | null;
  entidade: EntidadeDocumento;
  numero: string;
  tipo: string | null;
  codigo_erp: string | null;
  sistema_origem: string | null;
  quando: string;
  passa_filtro: boolean | null;
  barrado_por: string | null;
  contexto: Contexto;
}

export interface PassoCaminho { no_id: string; status: StatusPasso; saida: string | null }

export interface ExecucaoResumo {
  id: string;
  fluxo_id: string;
  fluxo_nome: string;
  fluxo_versao: number | null;
  evento: string;
  entidade: EntidadeDocumento;
  documento_id: string | null;
  documento_numero: string;
  modo: ModoExecucao;
  status: StatusExecucao;
  proximo_no: string | null;
  tentativas_no: number;
  processar_apos: string | null;
  iniciado_em: string | null;
  finalizado_em: string | null;
  erro: string | null;
  erro_http_status: number | null;
  disparado_por: string;
  lote_execucao_id: string | null;
  created_at: string;
  updated_at: string;
  duracao_ms: number | null;
  caminho: PassoCaminho[];
}

export interface Passo {
  id: string;
  seq: number;
  no_id: string;
  no_tipo: TipoNo;
  tentativa: number;
  status: StatusPasso;
  saida: string | null;
  entrada: unknown;
  resultado: unknown;
  request: { metodo: string; url: string; headers: Record<string, string>; corpo: string | null } | null;
  response: { status: number; corpo: string | null; json: unknown } | null;
  http_status: number | null;
  duracao_ms: number | null;
  erro: string | null;
  created_at: string;
}

export interface ExecucaoDetalhe extends ExecucaoResumo {
  contexto: Contexto;
  estado: Record<string, unknown>;
  definicao: Definicao;
  membros_lote: { id: string; documento_id: string; documento_numero: string }[];
  passos: Passo[];
}

export interface FiltrosExecucao {
  fluxo_id?: string;
  status?: StatusExecucao | StatusExecucao[];
  documento_id?: string;
  modo?: ModoExecucao;
  de?: string;
  ate?: string;
  busca?: string;
}

export interface ListaExecucoes { total: number; itens: ExecucaoResumo[] }

export interface ResultadoExecutar {
  execucao_id: string;
  status: "pendente" | "filtrado";
  modo: ModoExecucao;
  evento: string;
}

export type DispatcherBody =
  | { acao: "executar"; execucao_id: string }
  | { acao: "testar_destino"; destino_id: string };

export interface DispatcherExecutarResposta {
  execucao_id: string;
  executado: boolean;
  status?: StatusExecucao;
  passos?: number;
  erro?: string;
  motivo?: string;
  detalhe?: ExecucaoDetalhe;
}

export interface DispatcherTestarResposta {
  ok: boolean;
  http_status?: number;
  duracao_ms: number;
  resposta?: unknown;
  erro?: string;
  request?: unknown;
}

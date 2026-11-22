/**
 * Fonte única do menu do painel web.
 *
 * Usado pelo TopNav (desktop, "Mais" e drawer mobile), pela busca global (Ctrl+K),
 * pelo breadcrumb e pela tela de Perfis de Acesso (agrupamento da aba Web).
 *
 * O `id` de cada grupo é a mesma chave gravada em modulo.menu_grupo no banco
 * (migration 20261122160903_perfis_menu_visibilidade). menuGrupoDoModulo espelha o
 * CASE dessa migration: se um item cair em outro grupo, o teste de menuRegistry falha.
 *
 * A permissão de cada item continua vindo de getModuleForChildRoute (useRoutePermission),
 * como antes. O menu oculto pelo perfil já chega filtrado de fn_usuario_permissoes.
 */
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Building2,
  Gauge,
  LayoutDashboard,
  Package,
  PlugZap,
  Settings,
} from "lucide-react";
import { getModuleForChildRoute } from "@/hooks/useRoutePermission";

export interface MenuItem {
  label: string;
  path: string;
  /** Subtítulo do mega-menu (colunas). Itens sem seção ficam numa coluna só. */
  secao?: string;
  /** Termos extras para a busca global. */
  palavrasChave?: string[];
}

export interface MenuGrupo {
  /** Igual a modulo.menu_grupo no banco. */
  id: string;
  label: string;
  /** Rótulo curto para larguras intermediárias. */
  labelCurto: string;
  icon: LucideIcon;
  itens: MenuItem[];
}

export const MENU_GRUPOS: MenuGrupo[] = [
  {
    id: "torre",
    label: "Torre de Controle",
    labelCurto: "Torre",
    icon: LayoutDashboard,
    itens: [{ label: "Dashboard", path: "/", palavrasChave: ["início", "home", "painel"] }],
  },
  {
    id: "operacao",
    label: "Operação",
    labelCurto: "Operação",
    icon: Activity,
    itens: [
      { label: "Gerar Entradas", path: "/atividades/entradas", secao: "Entrada", palavrasChave: ["recebimento", "nota"] },
      { label: "Movimento de Entrada", path: "/atividades/movimentos", secao: "Entrada" },
      { label: "HU", path: "/atividades/hus", secao: "Entrada", palavrasChave: ["palete", "unidade de manuseio"] },
      { label: "Gerar Saída", path: "/atividades/saidas", secao: "Saída", palavrasChave: ["pedido", "documento"] },
      { label: "Ondas de Carregamento", path: "/atividades/mov-saida", secao: "Saída", palavrasChave: ["onda", "separação"] },
      { label: "Volumes", path: "/atividades/volumes", secao: "Saída", palavrasChave: ["etiqueta"] },
      { label: "Montagem de Carga", path: "/atividades/montagem-carga", secao: "Saída", palavrasChave: ["embarque", "carga"] },
      { label: "Abastecimento", path: "/atividades/abastecimento", secao: "Estoque", palavrasChave: ["reposição", "picking"] },
      { label: "Inventário", path: "/atividades/inventario", secao: "Estoque", palavrasChave: ["contagem"] },
      { label: "Ocorrências", path: "/atividades/ocorrencias", secao: "Estoque" },
    ],
  },
  {
    id: "armazem",
    label: "Armazém",
    labelCurto: "Armazém",
    icon: Building2,
    itens: [
      { label: "Cadastro de Armazém", path: "/armazem/armazens" },
      { label: "Tipos de Estoque", path: "/armazem/tipos-estoque" },
      { label: "Setores", path: "/armazem/setores" },
      { label: "Localizações / Endereços", path: "/armazem/enderecos", palavrasChave: ["endereço", "posição"] },
      { label: "Box", path: "/armazem/box", palavrasChave: ["doca"] },
      { label: "Turnos", path: "/armazem/turnos" },
      { label: "Veículos", path: "/armazem/veiculos" },
      { label: "Zonas de Atividade", path: "/armazem/zonas" },
    ],
  },
  {
    id: "cadastros",
    label: "Cadastros",
    labelCurto: "Cadastros",
    icon: Package,
    itens: [
      { label: "Produtos", path: "/dados-mestres/produtos", palavrasChave: ["sku", "ean", "dados mestres"] },
      { label: "Grupos de Produtos", path: "/dados-mestres/grupos" },
      { label: "Subgrupos de Produtos", path: "/dados-mestres/subgrupos" },
      { label: "Parceiros", path: "/dados-mestres/parceiros", palavrasChave: ["cliente", "fornecedor", "transportadora"] },
      { label: "Rotas", path: "/dados-mestres/rotas" },
      { label: "Tipos de Entrada", path: "/dados-mestres/tipos-entrada" },
      { label: "Tipos de Saída", path: "/dados-mestres/tipos-saida" },
    ],
  },
  {
    id: "produtividade",
    label: "Produtividade (LMS)",
    labelCurto: "LMS",
    icon: Gauge,
    itens: [
      { label: "Acompanhamento", path: "/lms/acompanhamento", palavrasChave: ["lms", "produtividade"] },
      { label: "Metas", path: "/lms/metas", palavrasChave: ["lms"] },
      { label: "Configurações do LMS", path: "/lms/configuracao", palavrasChave: ["lms", "tempo padrão"] },
    ],
  },
  {
    id: "relatorios",
    label: "Relatórios",
    labelCurto: "Relatórios",
    icon: BarChart3,
    itens: [
      { label: "Posição de Estoque", path: "/relatorios/estoque", secao: "Estoque" },
      { label: "Curva ABC", path: "/relatorios/curva-abc", secao: "Estoque" },
      { label: "Validade & Lote", path: "/relatorios/validade-lote", secao: "Estoque", palavrasChave: ["vencimento", "fefo"] },
      { label: "Baixo Giro / Obsoletos", path: "/relatorios/baixo-giro", secao: "Estoque" },
      { label: "Histórico de Movimentos", path: "/relatorios/movimentacoes", secao: "Estoque" },
      { label: "Ocupação de Endereços", path: "/relatorios/ocupacao", secao: "Estoque" },
      { label: "Produtos Mapeados em Picking", path: "/relatorios/produtos-mapeados", secao: "Estoque" },
      { label: "Recebimento (Dock-to-Stock)", path: "/relatorios/recebimento", secao: "Operação" },
      { label: "Cortes de Separação", path: "/relatorios/cortes", secao: "Operação" },
      { label: "Expedições", path: "/relatorios/expedicoes", secao: "Operação" },
      { label: "Tempo de Ciclo de Pedido", path: "/relatorios/ciclo-pedido", secao: "Operação" },
      { label: "Inventário", path: "/relatorios/inventario", secao: "Operação", palavrasChave: ["acuracidade"] },
      { label: "Produtividade Operacional", path: "/relatorios/produtividade", secao: "Operação" },
      { label: "Cancelamentos de Tarefas", path: "/relatorios/cancelamentos", secao: "Cancelamentos" },
      { label: "Documentos Cancelados", path: "/relatorios/documentos-cancelados", secao: "Cancelamentos" },
    ],
  },
  {
    id: "integracoes",
    label: "Integrações",
    labelCurto: "Integrações",
    icon: PlugZap,
    itens: [
      { label: "Integração ERP", path: "/config/integracao", palavrasChave: ["erp", "omie"] },
      { label: "Retornos ao ERP", path: "/config/integracao/retornos", palavrasChave: ["erp"] },
      { label: "Padrões de cadastro de produto", path: "/integracao/padroes-produto", palavrasChave: ["erp"] },
    ],
  },
  {
    id: "configuracoes",
    label: "Configurações",
    labelCurto: "Config.",
    icon: Settings,
    itens: [
      { label: "Empresas", path: "/config/empresas" },
      { label: "Usuários", path: "/config/usuarios" },
      { label: "Perfis de Acesso", path: "/config/perfis", palavrasChave: ["permissão", "rbac"] },
      { label: "Motivos de Ocorrência", path: "/config/motivos-ocorrencia" },
      { label: "Templates de Etiqueta", path: "/config/etiquetas" },
      { label: "Impressão", path: "/config/impressao", palavrasChave: ["impressora"] },
      { label: "Fluxo de Expedição", path: "/config/fluxo-expedicao" },
    ],
  },
];

/** Espelho do CASE de modulo.menu_grupo (migration 20261122160903). */
export function menuGrupoDoModulo(codigo: string): string | null {
  if (codigo === "web.dashboard") return "torre";
  if (codigo.startsWith("web.atividades.")) return "operacao";
  if (codigo.startsWith("web.armazem.")) return "armazem";
  if (codigo.startsWith("web.dados-mestres.")) return "cadastros";
  if (codigo.startsWith("web.lms.")) return "produtividade";
  if (codigo.startsWith("web.relatorios.")) return "relatorios";
  if (codigo.startsWith("web.config.integracao")) return "integracoes";
  if (codigo.startsWith("web.config.")) return "configuracoes";
  return null;
}

export function getMenuGrupo(id: string | null | undefined): MenuGrupo | undefined {
  return id ? MENU_GRUPOS.find((g) => g.id === id) : undefined;
}

/** Menu com só os itens que o usuário pode visualizar; grupos vazios saem. */
export function filtrarMenu(can: (modulo: string, acao: string) => boolean): MenuGrupo[] {
  return MENU_GRUPOS.map((g) => ({
    ...g,
    itens: g.itens.filter((item) => {
      const modulo = getModuleForChildRoute(item.path);
      return !modulo || can(modulo, "READ");
    }),
  })).filter((g) => g.itens.length > 0);
}

export interface MenuItemLocalizado extends MenuItem {
  grupo: MenuGrupo;
}

export function localizarItem(path: string): MenuItemLocalizado | undefined {
  for (const grupo of MENU_GRUPOS) {
    const item = grupo.itens.find((i) => i.path === path);
    if (item) return { ...item, grupo };
  }
  return undefined;
}

/** Itens agrupados por seção, na ordem em que aparecem. */
export function secoesDoGrupo(grupo: MenuGrupo): { titulo: string | null; itens: MenuItem[] }[] {
  const secoes: { titulo: string | null; itens: MenuItem[] }[] = [];
  for (const item of grupo.itens) {
    const titulo = item.secao ?? null;
    let secao = secoes.find((s) => s.titulo === titulo);
    if (!secao) {
      secao = { titulo, itens: [] };
      secoes.push(secao);
    }
    secao.itens.push(item);
  }
  return secoes;
}

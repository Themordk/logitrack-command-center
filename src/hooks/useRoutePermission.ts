/**
 * Maps a route path to a module code for RBAC.
 */
const routeToModuleMap: Record<string, string> = {
  "/": "web.dashboard",
  "/rastreabilidade": "web.rastreabilidade",
  "/armazem/armazens": "web.armazem.armazens",
  "/armazem/setores": "web.armazem.setores",
  "/armazem/tipos-estoque": "web.armazem.tipos-estoque",
  "/armazem/enderecos": "web.armazem.enderecos",
  "/armazem/box": "web.armazem.box",
  "/armazem/turnos": "web.armazem.turnos",
  "/armazem/motivos": "web.armazem.motivos",
  "/armazem/veiculos": "web.armazem.veiculos",
  "/armazem/zonas": "web.armazem.zonas",
  "/armazem/roteiro-separacao": "web.armazem.roteiro-separacao",
  "/dados-mestres/produtos": "web.dados-mestres.produtos",
  "/dados-mestres/grupos": "web.dados-mestres.grupos",
  "/dados-mestres/subgrupos": "web.dados-mestres.subgrupos",
  "/dados-mestres/parceiros": "web.dados-mestres.parceiros",
  "/dados-mestres/rotas": "web.dados-mestres.rotas",
  "/dados-mestres/tipos-entrada": "web.dados-mestres.tipos-entrada",
  "/dados-mestres/tipos-saida": "web.dados-mestres.tipos-saida",
  "/atividades/hus": "web.atividades.hus",
  "/atividades/entradas": "web.atividades.entradas",
  "/atividades/movimentos": "web.atividades.movimentos",
  "/atividades/saidas": "web.atividades.saidas",
  "/atividades/mov-saida": "web.atividades.mov-saida",
  "/atividades/volumes": "web.atividades.volumes",
  "/atividades/abastecimento": "web.atividades.abastecimento",
  "/atividades/abastecimento/gerar": "web.atividades.abastecimento",
  "/atividades/inventario": "web.atividades.inventario",
  "/atividades/inventario/novo": "web.atividades.inventario",
  "/relatorios/estoque": "web.relatorios.estoque",
  "/relatorios/movimentacoes": "web.relatorios.movimentacoes",
  "/config/empresas": "web.config.empresas",
  "/config/usuarios": "web.config.usuarios",
  "/config/integracao": "web.config.integracao",
  "/config/perfis": "web.config.perfis",
};

const coletorModuleMap: Record<string, string> = {
  "/coletor/recebimento": "coletor.recebimento",
  "/coletor/armazenagem": "coletor.armazenagem",
  "/coletor/movimentos": "coletor.movimentos",
  "/coletor/separacao/iniciar": "coletor.separacao",
  "/coletor/conferencia/iniciar": "coletor.conferencia",
  "/coletor/inventario": "coletor.inventario",
  "/coletor/consulta": "coletor.consulta",
};

export function getModuleForRoute(path: string): string | null {
  return routeToModuleMap[path] || null;
}

export function getModuleForColetorPath(path: string): string | null {
  return coletorModuleMap[path] || null;
}

export function getModuleForChildRoute(childPath: string): string | null {
  // Try exact match first
  if (routeToModuleMap[childPath]) return routeToModuleMap[childPath];
  // Convert path like /armazem/enderecos → web.armazem.enderecos
  const code = "web" + childPath.replace(/\//g, ".");
  return code;
}

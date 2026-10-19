export const PADRAO_EXIBICAO_COLETOR = {
  exibe_parceiro_separacao: true,
  exibe_vendedor_separacao: false,
  exibe_parceiro_conferencia: false,
  exibe_vendedor_conferencia: false,
};

export function deveExibirNomeColetor(permitido?: boolean, nome?: string | null): boolean {
  return permitido === true && Boolean(nome);
}

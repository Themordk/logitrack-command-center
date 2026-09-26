import { useQuery } from "@tanstack/react-query";
import { Info, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissions } from "@/contexts/PermissionsContext";
import { formatarValorPadrao, labelModo, type RegraPadraoProduto } from "./produtoPadroes.types";
import { listarRegrasPadrao, regrasPadraoQueryKey } from "./produtoPadroesService";

/** Regras de padrão da integração para o formulário de produto. Erros (ex.: sem permissão) são ignorados. */
export function useRegrasPadraoProduto(empresaId: string | null, enabled = true) {
  const { data, isLoading } = useQuery({
    queryKey: regrasPadraoQueryKey(empresaId),
    queryFn: () => listarRegrasPadrao(empresaId).catch(() => [] as RegraPadraoProduto[]),
    staleTime: 60_000,
    enabled,
    retry: false,
  });
  const mapa = new Map((data ?? []).filter((r) => r.ativo !== false).map((r) => [r.campo, r]));
  return {
    regra: (campo: string) => mapa.get(campo),
    bloqueado: (campo: string) => mapa.get(campo)?.modo === "SEMPRE",
    carregado: !isLoading,
  };
}

export function PadraoCampoIndicador({ regra, onNavigate }: { regra?: RegraPadraoProduto; onNavigate?: (p: string) => void }) {
  const { can } = usePermissions();
  if (!regra) return null;
  const valor = formatarValorPadrao(regra.valor);
  const podeIr = !!onNavigate && can("web.config.integracao", "READ");
  const link = podeIr ? (
    <button type="button" className="underline text-primary mt-1 block" onClick={() => onNavigate!("/integracao/padroes-produto")}>
      Ir para Padrões de cadastro de produto
    </button>
  ) : null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          {regra.modo === "SEMPRE" ? (
            <Badge variant="secondary" className="ml-1.5 gap-1 text-[9px] px-1.5 py-0 cursor-help normal-case tracking-normal" tabIndex={0}>
              <Lock size={9} aria-hidden /> Padrão da integração
            </Badge>
          ) : (
            <button type="button" className="ml-1.5 inline-flex align-middle text-muted-foreground" aria-label={`Padrão da integração: ${labelModo(regra.modo)}`}>
              <Info size={12} />
            </button>
          )}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs normal-case tracking-normal">
          {regra.modo === "SEMPRE" ? (
            <p>Este campo é definido automaticamente pela integração (valor padrão: {valor}). Para alterar, ajuste em Integração › Padrões de cadastro de produto.</p>
          ) : regra.modo === "SE_VAZIO" ? (
            <p>Padrão da integração "Se vazio": quando o ERP não informar, a integração usa {valor}.</p>
          ) : (
            <p>Padrão da integração "Só na criação": produtos criados pela integração recebem {valor}; depois, edições manuais são preservadas.</p>
          )}
          {link}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

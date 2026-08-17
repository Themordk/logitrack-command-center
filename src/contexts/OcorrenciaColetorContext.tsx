import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { OcorrenciaContexto } from "@/components/ocorrencia/RegistrarOcorrenciaModal";

interface OcorrenciaColetorContextType {
  contexto: OcorrenciaContexto;
  setContexto: (ctx: OcorrenciaContexto) => void;
  clearContexto: () => void;
  fabVisivel: boolean;
  setFabVisivel: (v: boolean) => void;
}

const Ctx = createContext<OcorrenciaColetorContextType | null>(null);

export function OcorrenciaColetorProvider({ children }: { children: ReactNode }) {
  const [contexto, setContextoState] = useState<OcorrenciaContexto>({});
  const [fabVisivel, setFabVisivelState] = useState(false);

  const setContexto = useCallback((ctx: OcorrenciaContexto) => setContextoState(ctx), []);
  const clearContexto = useCallback(() => setContextoState({}), []);
  const setFabVisivel = useCallback((v: boolean) => setFabVisivelState(v), []);

  const value = useMemo(
    () => ({ contexto, setContexto, clearContexto, fabVisivel, setFabVisivel }),
    [contexto, setContexto, clearContexto, fabVisivel, setFabVisivel],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOcorrenciaColetorContext() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOcorrenciaColetorContext deve ser usado dentro de OcorrenciaColetorProvider");
  return ctx;
}

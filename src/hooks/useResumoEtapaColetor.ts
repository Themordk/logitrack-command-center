import { useCallback, useEffect, useRef, useState } from "react";
import { resumoEtapaColetor } from "@/lib/responsaveisOndaService";
import type { EtapaColetor, ResumoEtapaColetor } from "@/lib/responsaveisOnda.types";

/**
 * Resumo da etapa da onda selecionada no coletor, SEM reservar nada
 * (convocação híbrida: abrir não é assumir). Só consulta quando online.
 */
export function useResumoEtapaColetor(movimentoSaidaId: string | null, etapa: EtapaColetor, isOnline: boolean) {
  const [resumo, setResumo] = useState<ResumoEtapaColetor | null>(null);
  const [loading, setLoading] = useState(false);
  const ultimaConsulta = useRef(0);

  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const usuarioId = localStorage.getItem("core_usuario_id");

  const carregar = useCallback(async (): Promise<ResumoEtapaColetor | null> => {
    const consulta = ++ultimaConsulta.current;
    if (!movimentoSaidaId || !isOnline || !tenantId || !empresaId || !usuarioId) {
      setResumo(null);
      return null;
    }
    setLoading(true);
    try {
      const r = await resumoEtapaColetor({ tenantId, empresaId, usuarioId, movimentoSaidaId, etapa });
      if (consulta === ultimaConsulta.current) setResumo(r);
      return r;
    } catch {
      if (consulta === ultimaConsulta.current) setResumo(null);
      return null;
    } finally {
      if (consulta === ultimaConsulta.current) setLoading(false);
    }
  }, [movimentoSaidaId, etapa, isOnline, tenantId, empresaId, usuarioId]);

  useEffect(() => {
    setResumo(null);
    void carregar();
  }, [carregar]);

  const contexto =
    tenantId && empresaId && usuarioId && movimentoSaidaId
      ? { tenantId, empresaId, usuarioId, movimentoSaidaId, etapa }
      : null;

  return { resumo, loading, recarregar: carregar, contexto };
}

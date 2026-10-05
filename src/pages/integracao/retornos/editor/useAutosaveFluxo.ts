import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { parseError } from "@/lib/errorMapper";
import { retornosKeys } from "../retornosKeys";
import { obterFluxo, salvarFluxo } from "../retornosService";
import type { Definicao, FluxoCompleto } from "../retornos.types";

export type EstadoSalvamento = "ocioso" | "salvando" | "salvo" | "erro";

interface Params {
  tenantId: string;
  empresaId: string;
  inicial: FluxoCompleto;
  habilitado: boolean;
  obterPayload: () => { nome: string; definicao: Definicao };
}

const DEBOUNCE_MS = 1500;

export function useAutosaveFluxo({ tenantId, empresaId, inicial, habilitado, obterPayload }: Params) {
  const qc = useQueryClient();
  const [ultimoSalvo, setUltimoSalvo] = useState<FluxoCompleto>(inicial);
  const [estado, setEstado] = useState<EstadoSalvamento>("ocioso");
  const [conflito, setConflito] = useState(false);
  const [salvoEm, setSalvoEm] = useState<number | null>(null);

  const ultimoRef = useRef(inicial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promessaRef = useRef<Promise<boolean> | null>(null);
  const sujoRef = useRef(false);
  const pendenteRef = useRef(false);
  const pausadoRef = useRef(false);
  const habilitadoRef = useRef(habilitado);
  habilitadoRef.current = habilitado;
  const payloadRef = useRef(obterPayload);
  payloadRef.current = obterPayload;

  const limparTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };

  const salvarAgora = useCallback(async (): Promise<boolean> => {
    limparTimer();
    if (!habilitadoRef.current || pausadoRef.current) return !pendenteRef.current;
    if (promessaRef.current) { sujoRef.current = true; return promessaRef.current; }
    if (!pendenteRef.current) return true;

    const rodar = async (): Promise<boolean> => {
      sujoRef.current = false;
      setEstado("salvando");
      try {
        const { nome, definicao } = payloadRef.current();
        const f = ultimoRef.current;
        const r = await salvarFluxo(tenantId, empresaId, {
          id: f.id, nome, descricao: f.descricao, erp_provedor_id: f.erp_provedor_id, definicao,
          updated_at_esperado: f.updated_at,
        });
        ultimoRef.current = r;
        setUltimoSalvo(r);
        setSalvoEm(Date.now());
        qc.setQueryData(retornosKeys.fluxo(f.id), r);
        void qc.invalidateQueries({ queryKey: ["retorno-fluxos"] });
        setEstado("salvo");
        if (!sujoRef.current) pendenteRef.current = false;
        return true;
      } catch (e) {
        const pe = parseError(e, "Salvar fluxo");
        if (pe.errorCode === "RETORNO_FLUXO_CONFLITO") {
          pausadoRef.current = true;
          setConflito(true);
        } else {
          toast.error(pe.title, { description: pe.instruction || undefined });
        }
        sujoRef.current = false;
        setEstado("erro");
        return false;
      }
    };

    const p = (async () => {
      let ok = await rodar();
      while (ok && sujoRef.current && !pausadoRef.current) ok = await rodar();
      return ok;
    })();
    promessaRef.current = p;
    try { return await p; } finally { promessaRef.current = null; }
  }, [tenantId, empresaId, qc]);

  const agendar = useCallback(() => {
    if (!habilitadoRef.current) return;
    pendenteRef.current = true;
    if (pausadoRef.current) return;
    limparTimer();
    timerRef.current = setTimeout(() => { void salvarAgora(); }, DEBOUNCE_MS);
  }, [salvarAgora]);

  const manterMinhaVersao = useCallback(async () => {
    try {
      const atual = await obterFluxo(ultimoRef.current.id);
      ultimoRef.current = { ...ultimoRef.current, updated_at: atual.updated_at };
      pausadoRef.current = false;
      setConflito(false);
      pendenteRef.current = true;
      await salvarAgora();
    } catch (e) {
      toast.error(parseError(e, "Carregar fluxo").title);
    }
  }, [salvarAgora]);

  const descartarConflito = useCallback(() => {
    pausadoRef.current = false;
    pendenteRef.current = false;
    setConflito(false);
    limparTimer();
  }, []);

  const temPendencia = useCallback(() => pendenteRef.current || !!promessaRef.current, []);

  // beforeunload enquanto houver pendência
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (habilitadoRef.current && (pendenteRef.current || promessaRef.current)) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  // Ao desmontar com pendência: salva na hora.
  useEffect(() => () => {
    if (pendenteRef.current && habilitadoRef.current && !pausadoRef.current && !promessaRef.current) void salvarAgora();
    limparTimer();
  }, [salvarAgora]);

  return { ultimoSalvo, salvoEm, estado, conflito, agendar, salvarAgora, manterMinhaVersao, descartarConflito, temPendencia };
}

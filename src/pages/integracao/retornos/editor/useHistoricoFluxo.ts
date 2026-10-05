import { useCallback, useRef, useState } from "react";
import type { Definicao } from "../retornos.types";

export interface Instantaneo { definicao: Definicao; selecionados: string[] }

const LIMITE = 50;

export function useHistoricoFluxo() {
  const passado = useRef<Instantaneo[]>([]);
  const futuro = useRef<Instantaneo[]>([]);
  const [, setVersao] = useState(0);
  const tocar = () => setVersao((v) => v + 1);

  const registrar = useCallback((s: Instantaneo) => {
    passado.current.push(structuredClone(s));
    if (passado.current.length > LIMITE) passado.current.shift();
    futuro.current = [];
    tocar();
  }, []);

  const desfazer = useCallback((atual: Instantaneo): Instantaneo | null => {
    const s = passado.current.pop();
    if (!s) return null;
    futuro.current.push(structuredClone(atual));
    tocar();
    return s;
  }, []);

  const refazer = useCallback((atual: Instantaneo): Instantaneo | null => {
    const s = futuro.current.pop();
    if (!s) return null;
    passado.current.push(structuredClone(atual));
    tocar();
    return s;
  }, []);

  const limpar = useCallback(() => { passado.current = []; futuro.current = []; tocar(); }, []);

  return {
    registrar, desfazer, refazer, limpar,
    podeDesfazer: passado.current.length > 0,
    podeRefazer: futuro.current.length > 0,
  };
}

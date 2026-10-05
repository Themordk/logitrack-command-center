import { createContext, useContext } from "react";
import type { Aviso, Catalogo, Destino, TipoNo } from "../retornos.types";

export interface EditorContextValor {
  catalogo?: Catalogo;
  destinos?: Destino[];
  errosPorNo: Map<string, Aviso[]>;
  avisosPorNo: Map<string, Aviso[]>;
  desconectados: Set<string>;
  editavel: boolean;
  /** Chaves `${noId}:${saida}` já ligadas. */
  saidasOcupadas: Set<string>;
  limiteAtingido: boolean;
  renomeandoId: string | null;
  onAdicionarNoRamo?: (noId: string, saida: string, tipo: TipoNo) => void;
  onConcluirRenomear?: (noId: string, nome: string | null) => void;
}

export const EditorContext = createContext<EditorContextValor>({
  errosPorNo: new Map(), avisosPorNo: new Map(), desconectados: new Set(), editavel: false,
  saidasOcupadas: new Set(), limiteAtingido: false, renomeandoId: null,
});

export const useEditorContext = () => useContext(EditorContext);

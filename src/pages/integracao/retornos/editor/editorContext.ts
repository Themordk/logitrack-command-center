import { createContext, useContext } from "react";
import type { Aviso, Catalogo, Destino, TipoNo } from "../retornos.types";
import type { ExecucaoVisual } from "./execucaoVisual";

/** Valores estáveis do editor: mudam raramente (catálogo, destinos, permissão, limite). */
export interface EditorEstaticoValor {
  catalogo?: Catalogo;
  destinos?: Destino[];
  editavel: boolean;
  limiteAtingido: boolean;
  renomeandoId: string | null;
  onAdicionarNoRamo?: (noId: string, saida: string, tipo: TipoNo) => void;
  onConcluirRenomear?: (noId: string, nome: string | null) => void;
}

/** Valores que mudam a cada edição, validação ou execução visual. */
export interface EditorDinamicoValor {
  errosPorNo: Map<string, Aviso[]>;
  avisosPorNo: Map<string, Aviso[]>;
  desconectados: Set<string>;
  /** Chaves `${noId}:${saida}` já ligadas. */
  saidasOcupadas: Set<string>;
  /** Resultado de teste sobreposto ao canvas. */
  execucao?: ExecucaoVisual | null;
  onAbrirPasso?: (noId: string) => void;
}

export const EditorEstaticoContext = createContext<EditorEstaticoValor>({
  editavel: false, limiteAtingido: false, renomeandoId: null,
});

export const EditorDinamicoContext = createContext<EditorDinamicoValor>({
  errosPorNo: new Map(), avisosPorNo: new Map(), desconectados: new Set(), saidasOcupadas: new Set(),
});

export const useEditorEstatico = () => useContext(EditorEstaticoContext);
export const useEditorDinamico = () => useContext(EditorDinamicoContext);

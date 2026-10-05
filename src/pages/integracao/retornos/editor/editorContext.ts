import { createContext, useContext } from "react";
import type { Aviso, Catalogo, Destino } from "../retornos.types";

export interface EditorContextValor {
  catalogo?: Catalogo;
  destinos?: Destino[];
  errosPorNo: Map<string, Aviso[]>;
  avisosPorNo: Map<string, Aviso[]>;
  desconectados: Set<string>;
  editavel: boolean;
}

export const EditorContext = createContext<EditorContextValor>({
  errosPorNo: new Map(), avisosPorNo: new Map(), desconectados: new Set(), editavel: false,
});

export const useEditorContext = () => useContext(EditorContext);

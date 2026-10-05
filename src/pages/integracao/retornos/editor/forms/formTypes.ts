import type { Aviso, Catalogo, Destino, DocumentoRecente, TipoNo } from "../../retornos.types";
import type { FluxoNode } from "../definicaoRf";

export interface FormNoProps {
  no: FluxoNode;
  config: Record<string, unknown>;
  /** Atualiza a config (e opcionalmente o tipo) do nó — entra no salvamento automático. */
  alterar: (config: Record<string, unknown>, tipo?: TipoNo) => void;
  catalogo?: Catalogo;
  destinos?: Destino[];
  nos: FluxoNode[];
  contexto: Record<string, unknown>;
  amostra: DocumentoRecente | null;
  onDefinirAmostra: (d: DocumentoRecente) => void;
  avisos: Aviso[];
  tenantId: string;
  empresaId: string;
  onAbrirNo: (id: string) => void;
  somenteLeitura: boolean;
}

import { IntegracaoGalleryPage } from "./integracao/IntegracaoGalleryPage";
import { IntegracaoErpDetalhePage } from "./integracao/IntegracaoErpDetalhePage";

interface Props {
  onNavigate: (path: string) => void;
  erpProvedorId?: string;
}

export function IntegracaoPage({ onNavigate, erpProvedorId }: Props) {
  if (erpProvedorId) {
    return <IntegracaoErpDetalhePage erpProvedorId={erpProvedorId} onNavigate={onNavigate} />;
  }
  return <IntegracaoGalleryPage onNavigate={onNavigate} />;
}

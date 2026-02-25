import { useState } from "react";
import { TenantProvider, useTenant } from "./contexts/TenantContext";
import { LoginPage } from "./pages/LoginPage";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { ArmazensPage } from "./pages/ArmazensPage";
import { SetoresPage } from "./pages/SetoresPage";
import { TiposEstoquePage } from "./pages/TiposEstoquePage";
import { EnderecosPage } from "./pages/EnderecosPage";
import { ZonasAtividadePage } from "./pages/ZonasAtividadePage";
import { ProdutosPage } from "./pages/ProdutosPage";
import { GruposProdutoPage } from "./pages/GruposProdutoPage";
import { ParceirosPage } from "./pages/ParceirosPage";
import { RotasPage } from "./pages/RotasPage";
import { VeiculosPage } from "./pages/VeiculosPage";
import { HUsPage } from "./pages/HUsPage";
import { VolumesPage } from "./pages/VolumesPage";
import { EmpresasPage } from "./pages/EmpresasPage";
import { UsuariosPage } from "./pages/UsuariosPage";
import { RastreabilidadePage } from "./pages/RastreabilidadePage";
import { EntradasPage } from "./pages/EntradasPage";
import { MovimentoEntradaPage } from "./pages/MovimentoEntradaPage";
import { BoxPage } from "./pages/BoxPage";
import { TurnosPage } from "./pages/TurnosPage";
import { MotivosOcorrenciaPage } from "./pages/MotivosOcorrenciaPage";
import { SubgruposPage } from "./pages/SubgruposPage";
import { IntegracaoPage } from "./pages/IntegracaoPage";
import { TiposEntradaPage } from "./pages/TiposEntradaPage";
import { TiposSaidaPage } from "./pages/TiposSaidaPage";
import { SaidasPage } from "./pages/SaidasPage";
import { MovimentoSaidaPage } from "./pages/MovimentoSaidaPage";

const breadcrumbs: Record<string, { label: string; path?: string }[]> = {
  "/": [{ label: "CORE LogiTrack" }, { label: "Dashboard" }],
  "/rastreabilidade": [{ label: "CORE LogiTrack" }, { label: "Rastreabilidade" }],
  "/armazem/armazens": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Armazéns" }],
  "/armazem/setores": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Setores" }],
  "/armazem/tipos-estoque": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Tipos de Estoque" }],
  "/armazem/enderecos": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Endereços" }],
  "/armazem/veiculos": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Veículos" }],
  "/armazem/zonas": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Zonas de Atividade" }],
  "/armazem/box": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Box" }],
  "/armazem/turnos": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Turnos" }],
  "/armazem/motivos": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Motivos de Ocorrência" }],
  "/atividades/hus": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "HUs" }],
  "/atividades/entradas": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Entradas" }],
  "/atividades/movimentos": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Movimentos de Entrada" }],
  "/atividades/saidas": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Documentos de Saída" }],
  "/atividades/mov-saida": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Ondas de Carregamento" }],
  "/atividades/volumes": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Volumes" }],
  "/dados-mestres/produtos": [{ label: "CORE LogiTrack" }, { label: "Dados Mestres" }, { label: "Produtos" }],
  "/dados-mestres/grupos": [{ label: "CORE LogiTrack" }, { label: "Dados Mestres" }, { label: "Grupos" }],
  "/dados-mestres/subgrupos": [{ label: "CORE LogiTrack" }, { label: "Dados Mestres" }, { label: "Subgrupos" }],
  "/dados-mestres/parceiros": [{ label: "CORE LogiTrack" }, { label: "Dados Mestres" }, { label: "Parceiros" }],
  "/dados-mestres/rotas": [{ label: "CORE LogiTrack" }, { label: "Dados Mestres" }, { label: "Rotas" }],
  "/dados-mestres/tipos-entrada": [{ label: "CORE LogiTrack" }, { label: "Dados Mestres" }, { label: "Tipos de Entrada" }],
  "/dados-mestres/tipos-saida": [{ label: "CORE LogiTrack" }, { label: "Dados Mestres" }, { label: "Tipos de Saída" }],
  "/config/empresas": [{ label: "CORE LogiTrack" }, { label: "Configurações" }, { label: "Empresas" }],
  "/config/usuarios": [{ label: "CORE LogiTrack" }, { label: "Configurações" }, { label: "Usuários" }],
  "/config/integracao": [{ label: "CORE LogiTrack" }, { label: "Configurações" }, { label: "Integração" }],
};

function renderPage(path: string, onNavigate: (p: string) => void) {
  switch (path) {
    case "/": return <Dashboard onNavigate={onNavigate} />;
    case "/rastreabilidade": return <RastreabilidadePage />;
    case "/armazem/armazens": return <ArmazensPage />;
    case "/armazem/setores": return <SetoresPage />;
    case "/armazem/tipos-estoque": return <TiposEstoquePage />;
    case "/armazem/enderecos": return <EnderecosPage onNavigate={onNavigate} />;
    case "/armazem/veiculos": return <VeiculosPage />;
    case "/armazem/zonas": return <ZonasAtividadePage />;
    case "/armazem/box": return <BoxPage />;
    case "/armazem/turnos": return <TurnosPage />;
    case "/armazem/motivos": return <MotivosOcorrenciaPage />;
    case "/atividades/hus": return <HUsPage />;
    case "/atividades/entradas": return <EntradasPage />;
    case "/atividades/movimentos": return <MovimentoEntradaPage />;
    case "/atividades/saidas": return <SaidasPage />;
    case "/atividades/mov-saida": return <MovimentoSaidaPage />;
    case "/atividades/volumes": return <VolumesPage />;
    case "/dados-mestres/produtos": return <ProdutosPage />;
    case "/dados-mestres/grupos": return <GruposProdutoPage />;
    case "/dados-mestres/subgrupos": return <SubgruposPage />;
    case "/dados-mestres/parceiros": return <ParceirosPage />;
    case "/dados-mestres/rotas": return <RotasPage />;
    case "/dados-mestres/tipos-entrada": return <TiposEntradaPage />;
    case "/dados-mestres/tipos-saida": return <TiposSaidaPage />;
    case "/config/empresas": return <EmpresasPage />;
    case "/config/usuarios": return <UsuariosPage />;
    case "/config/integracao": return <IntegracaoPage />;
    default: {
      const label = path.split("/").pop()?.replace(/-/g, " ") ?? path;
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🚧</span>
          </div>
          <h2 className="text-lg font-semibold text-foreground capitalize mb-2">{label}</h2>
          <p className="text-sm text-muted-foreground max-w-sm">Em desenvolvimento.</p>
          <button onClick={() => onNavigate("/")} className="mt-6 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
            Voltar ao Dashboard
          </button>
        </div>
      );
    }
  }
}

function AppContent() {
  const { tenantId, empresaId, loading, authenticated, login } = useTenant();
  const [currentPath, setCurrentPath] = useState("/");

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><span className="text-muted-foreground">Carregando...</span></div>;
  if (!authenticated) return <LoginPage onLogin={login} />;

  const bc = breadcrumbs[currentPath] ?? [
    { label: "CORE LogiTrack" },
    { label: currentPath.split("/").pop()?.replace(/-/g, " ") ?? "Página" },
  ];

  return (
    <Layout currentPath={currentPath} breadcrumb={bc} onNavigate={setCurrentPath}>
      {renderPage(currentPath, setCurrentPath)}
    </Layout>
  );
}

export default function App() {
  return (
    <TenantProvider>
      <AppContent />
    </TenantProvider>
  );
}

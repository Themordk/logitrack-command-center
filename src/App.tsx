import { useState, useEffect } from "react";
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
import { RoteiroSeparacaoPage } from "./pages/RoteiroSeparacaoPage";

// Reports
import { EstoqueReportPage } from "./modules/reports/estoque/EstoqueReportPage";
import { MovimentacoesReportPage } from "./modules/reports/movimentacoes/MovimentacoesReportPage";

// Coletor pages
import { ColetorLoginPage } from "./pages/coletor/ColetorLoginPage";
import { ColetorHomePage } from "./pages/coletor/ColetorHomePage";
import { RecebimentoMenuPage } from "./pages/coletor/RecebimentoMenuPage";
import { RecebimentoIniciarPage } from "./pages/coletor/RecebimentoIniciarPage";
import { RecebimentoExecucaoPage } from "./pages/coletor/RecebimentoExecucaoPage";
import { RecebimentoConferenciaPage } from "./pages/coletor/RecebimentoConferenciaPage";
import { RecebimentoConcluidoPage } from "./pages/coletor/RecebimentoConcluidoPage";
import { ArmazenagemDashboardPage } from "./pages/coletor/ArmazenagemDashboardPage";
import { ArmazenagemIniciarPage } from "./pages/coletor/ArmazenagemIniciarPage";
import { ArmazenagemExecucaoPage } from "./pages/coletor/ArmazenagemExecucaoPage";
import { ArmazenagemConcluidoPage } from "./pages/coletor/ArmazenagemConcluidoPage";
import { ConsultaMenuPage } from "./pages/coletor/ConsultaMenuPage";
import { ConsultaProdutoPage } from "./pages/coletor/ConsultaProdutoPage";
import { ConsultaEnderecoPage } from "./pages/coletor/ConsultaEnderecoPage";
import { ConsultaHUPage } from "./pages/coletor/ConsultaHUPage";
import { MetasPage } from "./pages/coletor/MetasPage";
import { ConfiguracoesPage } from "./pages/coletor/ConfiguracoesPage";
import { MovimentosMenuPage } from "./pages/coletor/MovimentosMenuPage";
import { TransferenciaOrigemPage } from "./pages/coletor/TransferenciaOrigemPage";
import { TransferenciaProdutoPage } from "./pages/coletor/TransferenciaProdutoPage";
import { TransferenciaDetalhePage } from "./pages/coletor/TransferenciaDetalhePage";
import { TransferenciaDestinoPage } from "./pages/coletor/TransferenciaDestinoPage";
import { TransferenciaConcluidoPage } from "./pages/coletor/TransferenciaConcluidoPage";
import { AbastecimentoListPage } from "./pages/coletor/AbastecimentoListPage";
import { RecebimentoVolumesPage } from "./pages/coletor/RecebimentoVolumesPage";
import { SeparacaoIniciarPage } from "./pages/coletor/SeparacaoIniciarPage";

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
  "/atividades/roteiro-separacao": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Roteiro de Separação" }],
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
  "/relatorios/estoque": [{ label: "CORE LogiTrack" }, { label: "Relatórios" }, { label: "Posição de Estoque" }],
  "/relatorios/movimentacoes": [{ label: "CORE LogiTrack" }, { label: "Relatórios" }, { label: "Histórico de Movimentos" }],
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
    case "/atividades/roteiro-separacao": return <RoteiroSeparacaoPage />;
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
    case "/relatorios/estoque": return <EstoqueReportPage />;
    case "/relatorios/movimentacoes": return <MovimentacoesReportPage />;
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

function renderColetorPage(fullPath: string, onNavigate: (p: string) => void) {
  // Separate path from query string
  const [path, queryString] = fullPath.split("?");
  const params = new URLSearchParams(queryString || "");

  // Store movimento_id when navigating to execucao
  if (path === "/coletor/recebimento/execucao" && params.get("movimento_id")) {
    sessionStorage.setItem("coletor_movimento_id", params.get("movimento_id")!);
  }

  switch (path) {
    case "/coletor/login": return <ColetorLoginPage onNavigate={onNavigate} />;
    case "/coletor/home": return <ColetorHomePage onNavigate={onNavigate} />;
    case "/coletor/recebimento": return <RecebimentoMenuPage onNavigate={onNavigate} />;
    case "/coletor/recebimento/iniciar": return <RecebimentoIniciarPage onNavigate={onNavigate} />;
    case "/coletor/recebimento/volumes": return <RecebimentoVolumesPage onNavigate={onNavigate} />;
    case "/coletor/recebimento/execucao": return <RecebimentoExecucaoPage onNavigate={onNavigate} />;
    case "/coletor/recebimento/conferencia": return <RecebimentoConferenciaPage onNavigate={onNavigate} />;
    case "/coletor/recebimento/concluido": return <RecebimentoConcluidoPage onNavigate={onNavigate} />;
    case "/coletor/armazenagem": return <ArmazenagemDashboardPage onNavigate={onNavigate} />;
    case "/coletor/armazenagem/iniciar": return <ArmazenagemIniciarPage onNavigate={onNavigate} />;
    case "/coletor/armazenagem/execucao": return <ArmazenagemExecucaoPage onNavigate={onNavigate} />;
    case "/coletor/armazenagem/concluido": return <ArmazenagemConcluidoPage onNavigate={onNavigate} />;
    case "/coletor/consulta": return <ConsultaMenuPage onNavigate={onNavigate} />;
    case "/coletor/consulta/produto": return <ConsultaProdutoPage onNavigate={onNavigate} />;
    case "/coletor/consulta/endereco": return <ConsultaEnderecoPage onNavigate={onNavigate} />;
    case "/coletor/consulta/hu": return <ConsultaHUPage onNavigate={onNavigate} />;
    case "/coletor/metas": return <MetasPage onNavigate={onNavigate} />;
    case "/coletor/configuracoes": return <ConfiguracoesPage onNavigate={onNavigate} />;
    case "/coletor/movimentos": return <MovimentosMenuPage onNavigate={onNavigate} />;
    case "/coletor/movimentos/transferencia/origem": return <TransferenciaOrigemPage onNavigate={onNavigate} />;
    case "/coletor/movimentos/transferencia/produto": return <TransferenciaProdutoPage onNavigate={onNavigate} />;
    case "/coletor/movimentos/transferencia/detalhe": return <TransferenciaDetalhePage onNavigate={onNavigate} />;
    case "/coletor/movimentos/transferencia/destino": return <TransferenciaDestinoPage onNavigate={onNavigate} />;
    case "/coletor/movimentos/transferencia/concluido": return <TransferenciaConcluidoPage onNavigate={onNavigate} />;
    case "/coletor/movimentos/abastecimento": return <AbastecimentoListPage onNavigate={onNavigate} />;
    default: return <ColetorLoginPage onNavigate={onNavigate} />;
  }
}

function getInitialPath() {
  const hash = window.location.hash.replace("#", "") || "/";
  return hash;
}

function AppContent() {
  const { tenantId, empresaId, loading, authenticated, login } = useTenant();
  const [currentPath, setCurrentPath] = useState(getInitialPath);

  // Sync hash with state
  const navigate = (path: string) => {
    window.location.hash = path;
    setCurrentPath(path);
  };

  // Listen for browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace("#", "") || "/";
      setCurrentPath(hash);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Detect if we're in coletor mode
  const isColetor = currentPath.startsWith("/coletor");

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><span className="text-muted-foreground">Carregando...</span></div>;

  // Coletor routes handle their own auth
  if (isColetor) {
    return renderColetorPage(currentPath, navigate);
  }

  if (!authenticated) {
    return (
      <LoginPage
        onLogin={() => login()}
        onNavigateColetor={() => navigate("/coletor/login")}
      />
    );
  }

  const bc = breadcrumbs[currentPath] ?? [
    { label: "CORE LogiTrack" },
    { label: currentPath.split("/").pop()?.replace(/-/g, " ") ?? "Página" },
  ];

  return (
    <Layout currentPath={currentPath} breadcrumb={bc} onNavigate={navigate}>
      {renderPage(currentPath, navigate)}
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

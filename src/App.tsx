import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/feedback/ErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
import { TenantProvider, useTenant } from "./contexts/TenantContext";
import { PermissionsProvider } from "./contexts/PermissionsContext";
import { TenantBootProvider, useTenantBoot } from "./contexts/TenantBootContext";
import { TenantBootSplash, TenantBootError, TenantPickerPage } from "./components/tenant/TenantBootScreens";
import { UpdatePrompt } from "./components/pwa/UpdatePrompt";
import { LoginPage } from "./pages/LoginPage";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { ArmazensPage } from "./pages/ArmazensPage";
import { SetoresPage } from "./pages/SetoresPage";
import { TiposEstoquePage } from "./pages/TiposEstoquePage";
import { EnderecosPage } from "./pages/EnderecosPage";
import { EnderecosBatchPage } from "./pages/EnderecosBatchPage";
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
import { EtiquetaTemplatesPage } from "./pages/EtiquetaTemplatesPage";


import { EntradasPage } from "./pages/EntradasPage";
import { MovimentoEntradaPage } from "./pages/MovimentoEntradaPage";
import { OcorrenciasOperacionaisPage } from "./pages/OcorrenciasOperacionaisPage";
import { OcorrenciaDetalhePage } from "./pages/OcorrenciaDetalhePage";
import { BoxPage } from "./pages/BoxPage";
import { TurnosPage } from "./pages/TurnosPage";
import { MotivosOcorrenciaPage } from "./pages/MotivosOcorrenciaPage";

import { SubgruposPage } from "./pages/SubgruposPage";
import { IntegracaoPage } from "./pages/IntegracaoPage";
import { TiposEntradaPage } from "./pages/TiposEntradaPage";
import { TiposSaidaPage } from "./pages/TiposSaidaPage";
import { SaidasPage } from "./pages/SaidasPage";
import { MovimentoSaidaPage } from "./pages/MovimentoSaidaPage";
import { OperadoresAtivosPage } from "./pages/OperadoresAtivosPage";
import { TarefasAtivasPage } from "./pages/TarefasAtivasPage";
import { RoteiroSeparacaoPage } from "./pages/RoteiroSeparacaoPage";
import { InventarioPage } from "./pages/InventarioPage";
import { InventarioItensPage } from "./pages/InventarioItensPage";
import { InventarioExecucaoPage } from "./pages/InventarioExecucaoPage";
import { NovoInventarioPage } from "./pages/NovoInventarioPage";
import { PerfisAcessoPage } from "./pages/PerfisAcessoPage";
import { TiposTarefaPage } from "./pages/TiposTarefaPage";

import { AbastecimentoPage } from "./pages/AbastecimentoPage";
import { AbastecimentoGeracaoPage } from "./pages/AbastecimentoGeracaoPage";
import { AbastecimentoDetalhePage } from "./pages/AbastecimentoDetalhePage";

// Reports
import { EstoqueReportPage } from "./modules/reports/estoque/EstoqueReportPage";
import { MovimentacoesReportPage } from "./modules/reports/movimentacoes/MovimentacoesReportPage";
import { TarefaDetalhePage } from "./modules/reports/movimentacoes/TarefaDetalhePage";
import { OcupacaoReportPage } from "./modules/reports/ocupacao/OcupacaoReportPage";
import { ProdutividadeDashboardPage } from "./modules/reports/produtividade/ProdutividadeDashboardPage";
import { ProdutividadeOperadorPage } from "./modules/reports/produtividade/ProdutividadeOperadorPage";
import { TarefasColaboradorPage } from "./modules/reports/produtividade/TarefasColaboradorPage";
import { CortesReportPage } from "./modules/reports/cortes/CortesReportPage";
import { CurvaAbcReportPage } from "./modules/reports/curva-abc/CurvaAbcReportPage";
import { ValidadeLoteReportPage } from "./modules/reports/validade-lote/ValidadeLoteReportPage";
import { BaixoGiroReportPage } from "./modules/reports/baixo-giro/BaixoGiroReportPage";
import { InventarioReportPage } from "./modules/reports/inventario/InventarioReportPage";
import { RecebimentoReportPage } from "./modules/reports/recebimento/RecebimentoReportPage";
import { CicloPedidoReportPage } from "./modules/reports/ciclo-pedido/CicloPedidoReportPage";
import { CancelamentosPage } from "./modules/reports/cancelamentos/CancelamentosPage";
import { PickingNaoCadastradoReportPage } from "./modules/reports/picking-nao-cadastrado/PickingNaoCadastradoReportPage";

// Coletor pages
import { ColetorLoginPage } from "./pages/coletor/ColetorLoginPage";
import { ColetorHomePage } from "./pages/coletor/ColetorHomePage";
import { RecebimentoMenuPage } from "./pages/coletor/RecebimentoMenuPage";
import { RecebimentoIniciarPage } from "./pages/coletor/RecebimentoIniciarPage";
import { RecebimentoExecucaoPage } from "./pages/coletor/RecebimentoExecucaoPage";
import { RecebimentoConferenciaPage } from "./pages/coletor/RecebimentoConferenciaPage";
import { RecebimentoConcluidoPage } from "./pages/coletor/RecebimentoConcluidoPage";
import { ArmazenagemDashboardPage } from "./pages/coletor/ArmazenagemDashboardPage";
import { ArmazenagemMovimentosPage } from "./pages/coletor/ArmazenagemMovimentosPage";
import { ArmazenagemItensPage } from "./pages/coletor/ArmazenagemItensPage";
import { ArmazenagemIniciarPage } from "./pages/coletor/ArmazenagemIniciarPage";
import { ArmazenagemExecucaoPage } from "./pages/coletor/ArmazenagemExecucaoPage";
import { ArmazenagemConcluidoPage } from "./pages/coletor/ArmazenagemConcluidoPage";
import { ConsultaMenuPage } from "./pages/coletor/ConsultaMenuPage";
import { ConsultaProdutoPage } from "./pages/coletor/ConsultaProdutoPage";
import { ConsultaEnderecoPage } from "./pages/coletor/ConsultaEnderecoPage";
import { ConsultaEnderecoDetalhePage } from "./pages/coletor/ConsultaEnderecoDetalhePage";
import { ConsultaHUPage } from "./pages/coletor/ConsultaHUPage";
import { MapearPickingPage } from "./pages/coletor/MapearPickingPage";
import { ConsultaProdutoDetalhePage } from "./pages/coletor/ConsultaProdutoDetalhePage";
import { MetasPage } from "./pages/coletor/MetasPage";
import { ConfiguracoesPage } from "./pages/coletor/ConfiguracoesPage";
import { MovimentosMenuPage } from "./pages/coletor/MovimentosMenuPage";
import { TransferenciaOrigemPage } from "./pages/coletor/TransferenciaOrigemPage";
import { TransferenciaProdutoPage } from "./pages/coletor/TransferenciaProdutoPage";
import { TransferenciaDetalhePage } from "./pages/coletor/TransferenciaDetalhePage";
import { TransferenciaDestinoPage } from "./pages/coletor/TransferenciaDestinoPage";
import { TransferenciaConcluidoPage } from "./pages/coletor/TransferenciaConcluidoPage";
import { MudancaPickingOrigemPage } from "./pages/coletor/MudancaPickingOrigemPage";
import { MudancaPickingListaPage } from "./pages/coletor/MudancaPickingListaPage";
import { MudancaPickingDestinoPage } from "./pages/coletor/MudancaPickingDestinoPage";
import { MudancaPickingConcluidoPage } from "./pages/coletor/MudancaPickingConcluidoPage";
import { AbastecimentoListPage } from "./pages/coletor/AbastecimentoListPage";
import { AbastecimentoColetaPage } from "./pages/coletor/AbastecimentoColetaPage";
import { AbastecimentoDestinoPage } from "./pages/coletor/AbastecimentoDestinoPage";
import { RecebimentoVolumesPage } from "./pages/coletor/RecebimentoVolumesPage";
import { SeparacaoIniciarPage } from "./pages/coletor/SeparacaoIniciarPage";
import { SeparacaoEnderecoPage } from "./pages/coletor/SeparacaoEnderecoPage";
import { SeparacaoLotePage } from "./pages/coletor/SeparacaoLotePage";
import { SeparacaoProdutoPage } from "./pages/coletor/SeparacaoProdutoPage";
import { SeparacaoOcorrenciasPage } from "./pages/coletor/SeparacaoOcorrenciasPage";
import { ConferenciaIniciarPage } from "./pages/coletor/ConferenciaIniciarPage";
import { ConferenciaProdutoPage } from "./pages/coletor/ConferenciaProdutoPage";
import { ConferenciaItensPage } from "./pages/coletor/ConferenciaItensPage";
import { InventarioListPage } from "./pages/coletor/InventarioListPage";
import { InventarioEnderecoPage } from "./pages/coletor/InventarioEnderecoPage";
import { InventarioProdutoPage } from "./pages/coletor/InventarioProdutoPage";
import { InventarioLivreEnderecoPage } from "./pages/coletor/InventarioLivreEnderecoPage";
import { InventarioLivreProdutoPage } from "./pages/coletor/InventarioLivreProdutoPage";

// Suporte da plataforma
import { SupportRoute } from "./components/suporte/SupportRoute";
import { SupportTenantsPage } from "./pages/suporte/SupportTenantsPage";
import { SupportTenantDetailPage } from "./pages/suporte/SupportTenantDetailPage";
import { SupportChamadosPage } from "./pages/suporte/SupportChamadosPage";

// TV panels (Gestão à Vista) — rotas públicas sem tenant/auth
import { PainelTvOperacional } from "./pages/tv/PainelTvOperacional";
import { PainelTvVendas } from "./pages/tv/PainelTvVendas";

function TvRouter() {
  const [path, setPath] = useState(() => {
    const h = window.location.hash.replace(/^#/, "");
    return h.split("?")[0];
  });
  useEffect(() => {
    const onHash = () => setPath(window.location.hash.replace(/^#/, "").split("?")[0]);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  if (path === "/tv/vendas") return <PainelTvVendas />;
  return <PainelTvOperacional />;
}


const breadcrumbs: Record<string, { label: string; path?: string }[]> = {
  "/": [{ label: "CORE LogiTrack" }, { label: "Dashboard" }],
  
  "/armazem/armazens": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Armazéns" }],
  "/armazem/setores": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Setores" }],
  "/armazem/tipos-estoque": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Tipos de Estoque" }],
  "/armazem/enderecos": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Endereços" }],
  "/armazem/enderecos/lote": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Endereços", path: "/armazem/enderecos" }, { label: "Cadastro em Lote" }],
  "/armazem/veiculos": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Veículos" }],
  "/armazem/zonas": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Zonas de Atividade" }],
  "/config/etiquetas": [{ label: "CORE LogiTrack" }, { label: "Configurações" }, { label: "Templates de Etiqueta" }],
  "/armazem/box": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Box" }],
  "/armazem/turnos": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Turnos" }],
  "/armazem/motivos": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Motivos de Ocorrência" }],
  "/atividades/hus": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "HUs" }],
  "/atividades/entradas": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Entradas" }],
  "/atividades/movimentos": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Movimentos de Entrada" }],
  "/atividades/saidas": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Documentos de Saída" }],
  "/atividades/mov-saida": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Ondas de Carregamento" }],
  "/atividades/ocorrencias": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Ocorrências Operacionais" }],
  "/atividades/operadores-ativos": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Operadores Ativos" }],
  "/atividades/tarefas-ativas": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Tarefas Ativas" }],
  "/armazem/roteiro-separacao": [{ label: "CORE LogiTrack" }, { label: "Armazém" }, { label: "Roteiro de Separação" }],
  "/atividades/inventario": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Inventário" }],
  "/atividades/inventario/novo": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Inventário", path: "/atividades/inventario" }, { label: "Novo Inventário" }],
  "/atividades/volumes": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Volumes" }],
  "/atividades/abastecimento": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Abastecimento" }],
  "/atividades/abastecimento/gerar": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Abastecimento", path: "/atividades/abastecimento" }, { label: "Geração" }],
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
  "/config/perfis": [{ label: "CORE LogiTrack" }, { label: "Configurações" }, { label: "Perfis de Acesso" }],
  "/config/tipos-tarefa": [{ label: "CORE LogiTrack" }, { label: "Configurações" }, { label: "Tipos de Tarefa" }],
  "/config/motivos-ocorrencia": [{ label: "CORE LogiTrack" }, { label: "Configurações" }, { label: "Motivos de Ocorrência" }],

  "/relatorios/estoque": [{ label: "CORE LogiTrack" }, { label: "Relatórios" }, { label: "Posição de Estoque" }],
  "/relatorios/movimentacoes": [{ label: "CORE LogiTrack" }, { label: "Relatórios" }, { label: "Histórico de Movimentos" }],
  "/relatorios/ocupacao": [{ label: "CORE LogiTrack" }, { label: "Relatórios" }, { label: "Ocupação de Endereços" }],
  "/relatorios/produtividade": [{ label: "CORE LogiTrack" }, { label: "Relatórios" }, { label: "Produtividade Operacional" }],
  "/relatorios/cortes": [{ label: "CORE LogiTrack" }, { label: "Relatórios" }, { label: "Cortes de Separação" }],
  "/relatorios/curva-abc": [{ label: "CORE LogiTrack" }, { label: "Relatórios" }, { label: "Curva ABC" }],
  "/relatorios/validade-lote": [{ label: "CORE LogiTrack" }, { label: "Relatórios" }, { label: "Validade & Lote" }],
  "/relatorios/baixo-giro": [{ label: "CORE LogiTrack" }, { label: "Relatórios" }, { label: "Baixo Giro / Obsoletos" }],
  "/relatorios/inventario": [{ label: "CORE LogiTrack" }, { label: "Relatórios" }, { label: "Acuracidade de Inventário" }],
  "/relatorios/recebimento": [{ label: "CORE LogiTrack" }, { label: "Relatórios" }, { label: "Recebimento (Dock-to-Stock)" }],
  "/relatorios/ciclo-pedido": [{ label: "CORE LogiTrack" }, { label: "Relatórios" }, { label: "Tempo de Ciclo de Pedido" }],
  "/relatorios/cancelamentos": [{ label: "CORE LogiTrack" }, { label: "Relatórios" }, { label: "Cancelamentos de Tarefas" }],
  "/relatorios/picking-nao-cadastrado": [{ label: "CORE LogiTrack" }, { label: "Atividades" }, { label: "Movimentos de Entrada", path: "/atividades/movimentos" }, { label: "Itens sem Picking" }],
};

function getDynamicBreadcrumb(path: string): { label: string; path?: string }[] | null {
  if (path.startsWith("/atividades/ocorrencias/")) {
    return [
      { label: "CORE LogiTrack" },
      { label: "Atividades" },
      { label: "Ocorrências Operacionais", path: "/atividades/ocorrencias" },
      { label: "Detalhe" },
    ];
  }
  if (path.startsWith("/atividades/abastecimento/gerar")) {
    return [
      { label: "CORE LogiTrack" },
      { label: "Atividades" },
      { label: "Abastecimento", path: "/atividades/abastecimento" },
      { label: "Geração" },
    ];
  }
  const abastDetalheMatch = path.match(/^\/atividades\/abastecimento\/([^/]+)\/tarefas/);
  if (abastDetalheMatch) {
    return [
      { label: "CORE LogiTrack" },
      { label: "Atividades" },
      { label: "Abastecimento", path: "/atividades/abastecimento" },
      { label: "Tarefas" },
    ];
  }
  if (path.startsWith("/relatorios/movimentacoes/tarefa/")) {
    return [
      { label: "CORE LogiTrack" },
      { label: "Relatórios" },
      { label: "Histórico de Movimentos", path: "/relatorios/movimentacoes" },
      { label: "Detalhe da Tarefa" },
    ];
  }
  if (path.startsWith("/relatorios/produtividade/tarefas/")) {
    return [
      { label: "CORE LogiTrack" },
      { label: "Relatórios" },
      { label: "Produtividade Operacional", path: "/relatorios/produtividade" },
      { label: "Tarefas do Operador" },
    ];
  }
  if (path.startsWith("/relatorios/produtividade/operador/")) {
    return [
      { label: "CORE LogiTrack" },
      { label: "Relatórios" },
      { label: "Produtividade Operacional", path: "/relatorios/produtividade" },
      { label: "Detalhe do Operador" },
    ];
  }
  const erpMatch = path.match(/^\/config\/integracao\/([^/?]+)/);
  if (erpMatch) {
    return [
      { label: "CORE LogiTrack" },
      { label: "Configurações" },
      { label: "Integração", path: "/config/integracao" },
      { label: erpMatch[1].toUpperCase() },
    ];
  }
  return null;
}


function renderPage(path: string, onNavigate: (p: string) => void) {
  switch (path) {
    case "/": return <Dashboard onNavigate={onNavigate} />;
    
    case "/armazem/armazens": return <ArmazensPage />;
    case "/armazem/setores": return <SetoresPage />;
    case "/armazem/tipos-estoque": return <TiposEstoquePage />;
    case "/armazem/enderecos": return <EnderecosPage onNavigate={onNavigate} />;
    case "/armazem/enderecos/lote": return <EnderecosBatchPage onNavigate={onNavigate} />;
    case "/armazem/veiculos": return <VeiculosPage />;
    case "/armazem/zonas": return <ZonasAtividadePage />;
    case "/armazem/etiquetas":
    case "/config/etiquetas": return <EtiquetaTemplatesPage onNavigate={onNavigate} />;
    case "/armazem/box": return <BoxPage />;
    case "/armazem/turnos": return <TurnosPage />;
    case "/armazem/motivos":
    case "/config/motivos-ocorrencia": return <MotivosOcorrenciaPage />;
    case "/atividades/hus": return <HUsPage />;
    case "/atividades/entradas": return <EntradasPage />;
    case "/atividades/movimentos": return <MovimentoEntradaPage />;
    case "/atividades/saidas": return <SaidasPage />;
    case "/atividades/mov-saida": return <MovimentoSaidaPage />;
    case "/atividades/ocorrencias": return <OcorrenciasOperacionaisPage onNavigate={onNavigate} />;
    case "/atividades/operadores-ativos": return <OperadoresAtivosPage onNavigate={onNavigate} />;
    case "/atividades/tarefas-ativas": return <TarefasAtivasPage onNavigate={onNavigate} />;
    case "/armazem/roteiro-separacao": return <RoteiroSeparacaoPage />;
    case "/atividades/inventario": return <InventarioPage onNavigate={onNavigate} />;
    case "/atividades/inventario/novo": return <NovoInventarioPage onNavigate={onNavigate} />;
    case "/atividades/volumes": return <VolumesPage />;
    case "/atividades/abastecimento": return <AbastecimentoPage onNavigate={onNavigate} />;
    case "/dados-mestres/produtos": return <ProdutosPage />;
    case "/dados-mestres/grupos": return <GruposProdutoPage />;
    case "/dados-mestres/subgrupos": return <SubgruposPage />;
    case "/dados-mestres/parceiros": return <ParceirosPage />;
    case "/dados-mestres/rotas": return <RotasPage />;
    case "/dados-mestres/tipos-entrada": return <TiposEntradaPage />;
    case "/dados-mestres/tipos-saida": return <TiposSaidaPage />;
    case "/config/empresas": return <EmpresasPage />;
    case "/config/usuarios": return <UsuariosPage />;
    case "/config/integracao": return <IntegracaoPage onNavigate={onNavigate} />;
    case "/config/perfis": return <PerfisAcessoPage />;
    case "/config/tipos-tarefa": return <TiposTarefaPage />;
    

    case "/relatorios/estoque": return <EstoqueReportPage />;
    case "/relatorios/movimentacoes": return <MovimentacoesReportPage onNavigate={onNavigate} />;
    case "/relatorios/ocupacao": return <OcupacaoReportPage />;
    case "/relatorios/produtividade": return <ProdutividadeDashboardPage onNavigate={onNavigate} />;
    case "/relatorios/cortes": return <CortesReportPage />;
    case "/relatorios/curva-abc": return <CurvaAbcReportPage />;
    case "/relatorios/validade-lote": return <ValidadeLoteReportPage />;
    case "/relatorios/baixo-giro": return <BaixoGiroReportPage />;
    case "/relatorios/inventario": return <InventarioReportPage />;
    case "/relatorios/recebimento": return <RecebimentoReportPage />;
    case "/relatorios/ciclo-pedido": return <CicloPedidoReportPage />;
    case "/relatorios/cancelamentos": return <CancelamentosPage />;
    case "/relatorios/picking-nao-cadastrado": return <PickingNaoCadastradoReportPage onNavigate={onNavigate} />;
    default: {
      // Dynamic route: /atividades/ocorrencias/:id
      if (path.startsWith("/atividades/ocorrencias/")) {
        const ocorrenciaId = path.replace("/atividades/ocorrencias/", "").split("?")[0];
        return <OcorrenciaDetalhePage onNavigate={onNavigate} ocorrenciaId={ocorrenciaId} />;
      }
      // Dynamic route: /atividades/abastecimento/gerar
      if (path.startsWith("/atividades/abastecimento/gerar")) {
        const params = new URLSearchParams(path.split("?")[1] || "");
        const tipo = params.get("tipo") || "PREVENTIVO";
        const armazemId = params.get("armazem") || "";
        return <AbastecimentoGeracaoPage onNavigate={onNavigate} tipo={tipo} armazemId={armazemId} />;
      }
      // Dynamic route: /atividades/abastecimento/:id/tarefas
      const abastDetalheMatch = path.match(/^\/atividades\/abastecimento\/([^/]+)\/tarefas/);
      if (abastDetalheMatch) {
        return <AbastecimentoDetalhePage onNavigate={onNavigate} abastecimentoId={abastDetalheMatch[1]} />;
      }
      // Dynamic route: /relatorios/movimentacoes/tarefa/:id
      const tarefaMatch = path.match(/^\/relatorios\/movimentacoes\/tarefa\/([^/?]+)/);
      if (tarefaMatch) {
        return <TarefaDetalhePage tarefaExecucaoId={tarefaMatch[1]} onNavigate={onNavigate} />;
      }
      // Dynamic route: /relatorios/produtividade/tarefas/:id
      const tarefasColabMatch = path.match(/^\/relatorios\/produtividade\/tarefas\/([^/?]+)/);
      if (tarefasColabMatch) {
        const params = new URLSearchParams(path.split("?")[1] || "");
        return <TarefasColaboradorPage usuarioId={tarefasColabMatch[1]} onNavigate={onNavigate} dataInicio={params.get("inicio") || undefined} dataFim={params.get("fim") || undefined} />;
      }
      // Dynamic route: /relatorios/produtividade/operador/:id
      const operadorMatch = path.match(/^\/relatorios\/produtividade\/operador\/([^/?]+)/);
      if (operadorMatch) {
        const params = new URLSearchParams(path.split("?")[1] || "");
        return <ProdutividadeOperadorPage usuarioId={operadorMatch[1]} onNavigate={onNavigate} dataInicio={params.get("inicio") || undefined} dataFim={params.get("fim") || undefined} />;
      }
      // Dynamic route: /atividades/inventario/:id/execucao
      const invExecMatch = path.match(/^\/atividades\/inventario\/([^/]+)\/execucao/);
      if (invExecMatch) {
        const invId = invExecMatch[1];
        const params = new URLSearchParams(path.split("?")[1] || "");
        const numero = Number(params.get("numero") || "0");
        const tarefaId = params.get("tarefa_id") || "";
        const sku = decodeURIComponent(params.get("sku") || "");
        return <InventarioExecucaoPage onNavigate={onNavigate} inventarioId={invId} numeroInventario={numero} tarefaId={tarefaId} sku={sku} />;
      }
      // Dynamic route: /atividades/inventario/:id/itens
      const invItensMatch = path.match(/^\/atividades\/inventario\/([^/]+)\/itens/);
      if (invItensMatch) {
        const invId = invItensMatch[1];
        const params = new URLSearchParams(path.split("?")[1] || "");
        const numero = Number(params.get("numero") || "0");
        return <InventarioItensPage onNavigate={onNavigate} inventarioId={invId} numeroInventario={numero} />;
      }
      // Dynamic route: /config/integracao/:erpProvedorId
      const erpMatch = path.match(/^\/config\/integracao\/([^/?]+)/);
      if (erpMatch) {
        return <IntegracaoPage onNavigate={onNavigate} erpProvedorId={erpMatch[1]} />;
      }
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
    case "/coletor/armazenagem/movimentos": return <ArmazenagemMovimentosPage onNavigate={onNavigate} />;
    case "/coletor/armazenagem/itens": return <ArmazenagemItensPage onNavigate={onNavigate} />;
    case "/coletor/armazenagem/iniciar": return <ArmazenagemIniciarPage onNavigate={onNavigate} />;
    case "/coletor/armazenagem/execucao": return <ArmazenagemExecucaoPage onNavigate={onNavigate} />;
    case "/coletor/armazenagem/concluido": return <ArmazenagemConcluidoPage onNavigate={onNavigate} />;
    case "/coletor/consulta": return <ConsultaMenuPage onNavigate={onNavigate} />;
    case "/coletor/consulta/produto": return <ConsultaProdutoPage onNavigate={onNavigate} />;
    case "/coletor/consulta/endereco": return <ConsultaEnderecoPage onNavigate={onNavigate} />;
    case "/coletor/consulta/endereco/detalhe": return <ConsultaEnderecoDetalhePage onNavigate={onNavigate} />;
    case "/coletor/consulta/hu": return <ConsultaHUPage onNavigate={onNavigate} />;
    case "/coletor/consulta/mapear-picking": return <MapearPickingPage onNavigate={onNavigate} />;
    
    case "/coletor/consulta/produto/detalhe": return <ConsultaProdutoDetalhePage onNavigate={onNavigate} />;
    case "/coletor/metas": return <MetasPage onNavigate={onNavigate} />;
    case "/coletor/configuracoes": return <ConfiguracoesPage onNavigate={onNavigate} />;
    case "/coletor/movimentos": return <MovimentosMenuPage onNavigate={onNavigate} />;
    case "/coletor/movimentos/transferencia/origem": return <TransferenciaOrigemPage onNavigate={onNavigate} />;
    case "/coletor/movimentos/transferencia/produto": return <TransferenciaProdutoPage onNavigate={onNavigate} />;
    case "/coletor/movimentos/transferencia/detalhe": return <TransferenciaDetalhePage onNavigate={onNavigate} />;
    case "/coletor/movimentos/transferencia/destino": return <TransferenciaDestinoPage onNavigate={onNavigate} />;
    case "/coletor/movimentos/transferencia/concluido": return <TransferenciaConcluidoPage onNavigate={onNavigate} />;
    case "/coletor/movimentos/mudanca-picking/origem": return <MudancaPickingOrigemPage onNavigate={onNavigate} />;
    case "/coletor/movimentos/mudanca-picking/lista": return <MudancaPickingListaPage onNavigate={onNavigate} />;
    case "/coletor/movimentos/mudanca-picking/destino": return <MudancaPickingDestinoPage onNavigate={onNavigate} />;
    case "/coletor/movimentos/mudanca-picking/concluido": return <MudancaPickingConcluidoPage onNavigate={onNavigate} />;
    case "/coletor/movimentos/abastecimento": return <AbastecimentoListPage onNavigate={onNavigate} />;
    case "/coletor/movimentos/abastecimento/coleta": return <AbastecimentoColetaPage onNavigate={onNavigate} />;
    case "/coletor/movimentos/abastecimento/destino": return <AbastecimentoDestinoPage onNavigate={onNavigate} />;
    case "/coletor/separacao/iniciar": return <SeparacaoIniciarPage onNavigate={onNavigate} />;
    case "/coletor/separacao/endereco": return <SeparacaoEnderecoPage onNavigate={onNavigate} />;
    case "/coletor/separacao/lote": return <SeparacaoLotePage onNavigate={onNavigate} />;
    case "/coletor/separacao/produto": return <SeparacaoProdutoPage onNavigate={onNavigate} />;
    case "/coletor/separacao/ocorrencias": return <SeparacaoOcorrenciasPage onNavigate={onNavigate} />;
    case "/coletor/conferencia/iniciar": return <ConferenciaIniciarPage onNavigate={onNavigate} />;
    case "/coletor/conferencia/produto": return <ConferenciaProdutoPage onNavigate={onNavigate} />;
    case "/coletor/conferencia/itens": return <ConferenciaItensPage onNavigate={onNavigate} />;
    case "/coletor/inventario": return <InventarioListPage onNavigate={onNavigate} />;
    case "/coletor/inventario/endereco": return <InventarioEnderecoPage onNavigate={onNavigate} />;
    case "/coletor/inventario/produto": return <InventarioProdutoPage onNavigate={onNavigate} />;
    case "/coletor/inventario/livre/endereco": return <InventarioLivreEnderecoPage onNavigate={onNavigate} />;
    case "/coletor/inventario/livre/produto": return <InventarioLivreProdutoPage onNavigate={onNavigate} />;
    default: return <ColetorLoginPage onNavigate={onNavigate} />;
  }
}

function getInitialPath() {
  const hash = window.location.hash.replace("#", "") || "/";
  return hash;
}

function AppContent() {
  const { tenantId, empresaId, loading, authenticated, login } = useTenant();
  const boot = useTenantBoot();
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

  // Distinção entre rota PÚBLICA de login do suporte e ÁREA PROTEGIDA do suporte.
  // Importante: "/suporte-login" começa com "/suporte" mas NÃO faz parte da área protegida.
  const isSupportLogin = currentPath === "/suporte-login";
  const isSupportArea = currentPath === "/suporte" || currentPath.startsWith("/suporte/");

  // Flag persistente que indica que o usuário autenticado é do suporte da plataforma.
  // Usada para evitar que páginas de tenant (Dashboard, TenantPicker) sejam renderizadas
  // em qualquer "janela de transição" entre login e SupportRoute.
  const isPlatformSupport = typeof window !== "undefined" && !!localStorage.getItem("core_is_platform_support");

  // ===== Gate 1: identificação do tenant via subdomínio =====
  if (boot.status === "loading") return <TenantBootSplash />;
  if (boot.status === "not-found" || boot.status === "inactive" || boot.status === "error") {
    return <TenantBootError />;
  }

  // ===== Gate 2: sessão Supabase ainda restaurando =====
  // Bloqueia QUALQUER render de página final enquanto useTenant.loading=true.
  // Sem este gate, há janela de 1-3 frames onde authenticated muda mas o resto do estado
  // ainda não está pronto, causando flashes de Dashboard/TenantPicker.
  if (loading) return <TenantBootSplash />;

  // ===== Gate 3: anti-flash do SUPORTE DA PLATAFORMA =====
  // Se o usuário é do suporte e está autenticado mas o hash atual não é uma rota de
  // suporte (caso típico: pós-login com hash ainda em "/" antes do hashchange propagar,
  // ou recarga com hash em "/"), redireciona para /suporte/tenants e mostra splash.
  // NÃO bloqueia /suporte-login (ele precisa renderizar para o usuário entrar).
  if (isPlatformSupport && authenticated && !isSupportArea && !isSupportLogin) {
    if (currentPath !== "/suporte/tenants") {
      // Schedule navigation no próximo tick para evitar setState durante render
      Promise.resolve().then(() => navigate("/suporte/tenants"));
    }
    return <TenantBootSplash />;
  }

  // boot.status === "no-subdomain" → portal neutro, exceto:
  //  - rotas de suporte da plataforma (acessíveis em app.*)
  //  - rota dedicada ao login do suporte
  //  - rotas do coletor (modo dev/legado)
  // Caso o usuário já esteja autenticado (legado em preview/lovable.app), permite seguir.
  if (boot.status === "no-subdomain"
      && !isSupportArea
      && !isSupportLogin
      && !isColetor
      && !authenticated) {
    return <TenantPickerPage onNavigateSupport={() => navigate("/suporte-login")} />;
  }

  // Login PÚBLICO do suporte da plataforma — precisa vir ANTES do guard de área protegida
  // para evitar que SupportRoute redirecione o usuário não autenticado de volta para "/".
  if (!authenticated && isSupportLogin) {
    return (
      <LoginPage
        mode="support"
        onLogin={() => login()}
        onNavigateColetor={() => navigate("/coletor/login")}
        onBackToPicker={() => navigate("/")}
      />
    );
  }

  // Rotas de SUPORTE DA PLATAFORMA (independentes do tenant) — área protegida apenas
  if (isSupportArea) {
    const renderSupport = () => {
      const detalheMatch = currentPath.match(/^\/suporte\/tenants\/([^/?]+)/);
      if (detalheMatch) {
        return <SupportTenantDetailPage tenantId={detalheMatch[1]} onNavigate={navigate} />;
      }
      if (currentPath.startsWith("/suporte/chamados")) {
        const params = new URLSearchParams(currentPath.split("?")[1] || "");
        return <SupportChamadosPage onNavigate={navigate} tenantId={params.get("tenant_id") || undefined} />;
      }
      return <SupportTenantsPage onNavigate={navigate} />;
    };
    return (
      <SupportRoute onUnauthorized={() => navigate("/suporte-login")}>
        {renderSupport()}
      </SupportRoute>
    );
  }

  // Coletor routes handle their own auth
  if (isColetor) {
    return renderColetorPage(currentPath, navigate);
  }

  if (!authenticated) {
    return (
      <LoginPage
        mode="tenant"
        onLogin={() => login()}
        onNavigateColetor={() => navigate("/coletor/login")}
        onBackToPicker={() => navigate("/")}
      />
    );
  }

  const bc = breadcrumbs[currentPath] ?? getDynamicBreadcrumb(currentPath) ?? [
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
    <ErrorBoundary showDetails>
      <QueryClientProvider client={queryClient}>
        <TenantBootProvider>
          <TenantProvider>
            <PermissionsProvider>
              <UpdatePrompt />
              <AppContent />
            </PermissionsProvider>
          </TenantProvider>
        </TenantBootProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

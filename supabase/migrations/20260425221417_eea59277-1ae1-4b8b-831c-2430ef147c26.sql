
-- Estende a validação server-side de empresa/armazém para tabelas de cadastro adicionais.
-- Reutiliza as funções existentes:
--   * fn_validar_empresa_usuario()        (para tabelas com NEW.empresa_id)
--   * fn_validar_armazem_empresa_usuario() (para tabelas com NEW.armazem_id)

-- Tabelas com empresa_id direto
DROP TRIGGER IF EXISTS trg_validar_empresa_usuario ON public.usuario;
CREATE TRIGGER trg_validar_empresa_usuario
  BEFORE INSERT OR UPDATE ON public.usuario
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_empresa_usuario();

DROP TRIGGER IF EXISTS trg_validar_empresa_usuario ON public.tipo_entrada;
CREATE TRIGGER trg_validar_empresa_usuario
  BEFORE INSERT OR UPDATE ON public.tipo_entrada
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_empresa_usuario();

DROP TRIGGER IF EXISTS trg_validar_empresa_usuario ON public.tipo_saida;
CREATE TRIGGER trg_validar_empresa_usuario
  BEFORE INSERT OR UPDATE ON public.tipo_saida
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_empresa_usuario();

DROP TRIGGER IF EXISTS trg_validar_empresa_usuario ON public.subgrupo_produto;
CREATE TRIGGER trg_validar_empresa_usuario
  BEFORE INSERT OR UPDATE ON public.subgrupo_produto
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_empresa_usuario();

DROP TRIGGER IF EXISTS trg_validar_empresa_usuario ON public.produto_embalagem;
CREATE TRIGGER trg_validar_empresa_usuario
  BEFORE INSERT OR UPDATE ON public.produto_embalagem
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_empresa_usuario();

DROP TRIGGER IF EXISTS trg_validar_empresa_usuario ON public.agrupamento_separacao;
CREATE TRIGGER trg_validar_empresa_usuario
  BEFORE INSERT OR UPDATE ON public.agrupamento_separacao
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_empresa_usuario();

DROP TRIGGER IF EXISTS trg_validar_empresa_usuario ON public.agrupamento_conferencia;
CREATE TRIGGER trg_validar_empresa_usuario
  BEFORE INSERT OR UPDATE ON public.agrupamento_conferencia
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_empresa_usuario();

DROP TRIGGER IF EXISTS trg_validar_empresa_usuario ON public.ordem_expedicao;
CREATE TRIGGER trg_validar_empresa_usuario
  BEFORE INSERT OR UPDATE ON public.ordem_expedicao
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_empresa_usuario();

-- Tabelas com armazem_id direto
DROP TRIGGER IF EXISTS trg_validar_armazem_empresa_usuario ON public.rotas;
CREATE TRIGGER trg_validar_armazem_empresa_usuario
  BEFORE INSERT OR UPDATE ON public.rotas
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_armazem_empresa_usuario();

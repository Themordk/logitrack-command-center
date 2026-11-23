-- =====================================================================
-- Módulo de Entregas · D7 (plano aprovado em 23/11) · 2026-11-23
-- ---------------------------------------------------------------------
-- Carga de veículo próprio sem motorista informado recebe o nome do usuário
-- entregador do veículo (veiculos.usuario_id). Só preenche quando o campo
-- está vazio; um motorista digitado nunca é sobrescrito. Se o veículo trocar
-- e o motorista for o entregador do veículo anterior, passa a ser o do novo.
-- Vale para qualquer caminho que grave a carga (carga_montar, edição, etc.).
-- Reversão: DROP TRIGGER trg_carga_motorista_do_veiculo ON public.carga;
--           DROP FUNCTION public._fn_carga_motorista_do_veiculo();
-- =====================================================================
CREATE OR REPLACE FUNCTION public._fn_carga_motorista_do_veiculo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_nome text; v_nome_anterior text;
BEGIN
  IF NEW.modalidade IS DISTINCT FROM 'PROPRIA' OR NEW.veiculo_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT u.nome INTO v_nome FROM veiculos v JOIN usuario u ON u.id = v.usuario_id WHERE v.id = NEW.veiculo_id;
  IF v_nome IS NULL THEN RETURN NEW; END IF;

  IF NULLIF(btrim(NEW.motorista), '') IS NULL THEN
    NEW.motorista := v_nome;
  ELSIF TG_OP = 'UPDATE' AND NEW.veiculo_id IS DISTINCT FROM OLD.veiculo_id AND NEW.motorista IS NOT DISTINCT FROM OLD.motorista THEN
    SELECT u.nome INTO v_nome_anterior FROM veiculos v JOIN usuario u ON u.id = v.usuario_id WHERE v.id = OLD.veiculo_id;
    IF v_nome_anterior IS NOT NULL AND NEW.motorista = v_nome_anterior THEN
      NEW.motorista := v_nome;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._fn_carga_motorista_do_veiculo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_carga_motorista_do_veiculo ON public.carga;
CREATE TRIGGER trg_carga_motorista_do_veiculo BEFORE INSERT OR UPDATE OF veiculo_id, motorista, modalidade ON public.carga
  FOR EACH ROW EXECUTE FUNCTION public._fn_carga_motorista_do_veiculo();

-- Cargas abertas de veículo próprio sem motorista: preenche agora.
UPDATE public.carga c
   SET motorista = u.nome
  FROM veiculos v JOIN usuario u ON u.id = v.usuario_id
 WHERE v.id = c.veiculo_id
   AND c.modalidade = 'PROPRIA'
   AND c.status IN ('EM_MONTAGEM','LIBERADA','EM_CARREGAMENTO')
   AND NULLIF(btrim(c.motorista), '') IS NULL;


-- Tabela de simulações de despesas
CREATE TABLE public.expense_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  couple_id uuid,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','shared')),
  title text NOT NULL,
  amount numeric(12,2) NOT NULL,
  payment_method text NOT NULL,
  card_id uuid,
  installments integer NOT NULL DEFAULT 1,
  interest_enabled boolean NOT NULL DEFAULT false,
  interest_rate numeric(8,4),
  final_amount numeric(12,2),
  first_payment_date date,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  category text,
  simulation_result jsonb,
  risk_level text CHECK (risk_level IN ('seguro','atencao','arriscado','critico')),
  status text NOT NULL DEFAULT 'simulated' CHECK (status IN ('draft','simulated','converted','archived')),
  converted_expense_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expense_simulations_user ON public.expense_simulations(user_id);
CREATE INDEX idx_expense_simulations_couple ON public.expense_simulations(couple_id);
CREATE INDEX idx_expense_simulations_status ON public.expense_simulations(status);

-- GRANTs (política padrão de tabelas do usuário)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_simulations TO authenticated;
GRANT ALL ON public.expense_simulations TO service_role;

-- Enable RLS
ALTER TABLE public.expense_simulations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "select own or shared simulations"
  ON public.expense_simulations FOR SELECT
  TO authenticated
  USING (
    (visibility = 'private' AND user_id = auth.uid())
    OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
  );

CREATE POLICY "insert own simulations"
  ON public.expense_simulations FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (visibility = 'private' AND couple_id IS NULL)
      OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
    )
  );

CREATE POLICY "update own or shared simulations"
  ON public.expense_simulations FOR UPDATE
  TO authenticated
  USING (
    (visibility = 'private' AND user_id = auth.uid())
    OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
  )
  WITH CHECK (
    (visibility = 'private' AND user_id = auth.uid())
    OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
  );

CREATE POLICY "delete own or shared simulations"
  ON public.expense_simulations FOR DELETE
  TO authenticated
  USING (
    (visibility = 'private' AND user_id = auth.uid())
    OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
  );

-- updated_at trigger
CREATE TRIGGER trg_expense_simulations_updated_at
  BEFORE UPDATE ON public.expense_simulations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notificar parceiro em simulações compartilhadas
CREATE OR REPLACE FUNCTION public.notify_partner_on_simulation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_couple uuid;
  v_actor uuid;
  v_actor_name text;
  v_partner uuid;
  v_title text;
  v_body text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  v_couple := NEW.couple_id;
  v_actor := COALESCE(auth.uid(), NEW.user_id);

  IF NEW.visibility IS DISTINCT FROM 'shared' OR v_couple IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_partner
  FROM public.profiles
  WHERE couple_id = v_couple AND id <> v_actor
  LIMIT 1;

  IF v_partner IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, 'Seu parceiro') INTO v_actor_name
  FROM public.profiles WHERE id = v_actor;
  v_actor_name := COALESCE(v_actor_name, 'Seu parceiro');

  IF TG_OP = 'INSERT' THEN
    v_title := v_actor_name || ' criou uma simulação de despesa';
    v_body := NEW.title || ' — R$ ' || to_char(NEW.amount, 'FM999G999G990D00');
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (v_partner, v_title, v_body, 'simulation', '/app/financas/simulacoes');

    IF NEW.risk_level IN ('arriscado','critico') THEN
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (v_partner,
              'Simulação de alto risco',
              NEW.title || ' foi marcada como ' || NEW.risk_level,
              'simulation_risk', '/app/financas/simulacoes');
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'converted' AND COALESCE(OLD.status,'') <> 'converted' THEN
      v_title := v_actor_name || ' converteu uma simulação em despesa';
      v_body := NEW.title || ' — R$ ' || to_char(NEW.amount, 'FM999G999G990D00');
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (v_partner, v_title, v_body, 'simulation_converted', '/app/financas');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.notify_partner_on_simulation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_notify_partner_on_simulation_ins
  AFTER INSERT ON public.expense_simulations
  FOR EACH ROW EXECUTE FUNCTION public.notify_partner_on_simulation();

CREATE TRIGGER trg_notify_partner_on_simulation_upd
  AFTER UPDATE ON public.expense_simulations
  FOR EACH ROW EXECUTE FUNCTION public.notify_partner_on_simulation();

-- 1. Add fields to expense_simulations
ALTER TABLE public.expense_simulations
  ADD COLUMN IF NOT EXISTS decision_status text CHECK (decision_status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS decision_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS partner_comment text;

-- 2. Drop the duplicate trigger (trg_tx_installments without WHEN clause)
DROP TRIGGER IF EXISTS trg_tx_installments ON public.transactions;

-- 3. Update the notification trigger
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
    
    -- Check idempotency
    IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE title = v_title AND body = v_body AND user_id = v_partner) THEN
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (v_partner, v_title, v_body, 'simulation', '/app/financas/simulacoes');
    END IF;

    IF NEW.risk_level IN ('arriscado','critico') THEN
      v_title := 'Simulação de alto risco';
      v_body := NEW.title || ' foi marcada como ' || NEW.risk_level;
      IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE title = v_title AND body = v_body AND user_id = v_partner) THEN
        INSERT INTO public.notifications (user_id, title, body, type, link)
        VALUES (v_partner, v_title, v_body, 'simulation_risk', '/app/financas/simulacoes');
      END IF;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Conversion notification
    IF NEW.status = 'converted' AND COALESCE(OLD.status,'') <> 'converted' THEN
      v_title := v_actor_name || ' converteu uma simulação em despesa';
      v_body := NEW.title || ' — R$ ' || to_char(NEW.amount, 'FM999G999G990D00');
      IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE title = v_title AND body = v_body AND user_id = v_partner) THEN
        INSERT INTO public.notifications (user_id, title, body, type, link)
        VALUES (v_partner, v_title, v_body, 'simulation_converted', '/app/financas');
      END IF;
    END IF;

    -- Decision notification (Approve/Reject)
    IF NEW.decision_status <> 'pending' AND COALESCE(OLD.decision_status,'pending') = 'pending' THEN
      -- Actor is the one making the decision
      v_title := v_actor_name || CASE WHEN NEW.decision_status = 'approved' THEN ' aprovou' ELSE ' rejeitou' END || ' a simulação';
      v_body := NEW.title || ' — R$ ' || to_char(NEW.amount, 'FM999G999G990D00');
      -- Partner here is the original creator of the simulation
      IF NEW.user_id <> v_actor THEN
        IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE title = v_title AND body = v_body AND user_id = NEW.user_id) THEN
          INSERT INTO public.notifications (user_id, title, body, type, link)
          VALUES (NEW.user_id, v_title, v_body, 'simulation_decision', '/app/financas/simulacoes');
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TABLE public.investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  responsible_user_id uuid NOT NULL REFERENCES public.profiles(id),
  visibility text NOT NULL DEFAULT 'shared' CHECK (visibility IN ('private', 'shared')),
  institution text NOT NULL,
  investment_type text NOT NULL CHECK (investment_type IN ('cdb', 'tesouro_direto', 'fundo', 'acoes', 'etf', 'criptomoedas', 'poupanca', 'outros')),
  name text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  investment_date date NOT NULL,
  yield_description text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((visibility = 'private' AND couple_id IS NULL AND responsible_user_id = user_id) OR (visibility = 'shared' AND couple_id IS NOT NULL))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investments TO authenticated;
GRANT ALL ON public.investments TO service_role;
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "investments_select" ON public.investments FOR SELECT TO authenticated USING (
  (visibility = 'private' AND user_id = auth.uid()) OR
  (visibility = 'shared' AND public.is_couple_member(couple_id))
);
CREATE POLICY "investments_insert" ON public.investments FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND (
    (visibility = 'private' AND couple_id IS NULL AND responsible_user_id = auth.uid()) OR
    (visibility = 'shared' AND public.is_couple_member(couple_id) AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = responsible_user_id AND p.couple_id = investments.couple_id))
  )
);
CREATE POLICY "investments_update" ON public.investments FOR UPDATE TO authenticated USING (
  user_id = auth.uid() OR (visibility = 'shared' AND public.is_couple_member(couple_id))
) WITH CHECK (
  (visibility = 'private' AND user_id = auth.uid() AND couple_id IS NULL AND responsible_user_id = auth.uid()) OR
  (visibility = 'shared' AND public.is_couple_member(couple_id) AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = responsible_user_id AND p.couple_id = investments.couple_id))
);
CREATE POLICY "investments_delete" ON public.investments FOR DELETE TO authenticated USING (
  user_id = auth.uid() OR (visibility = 'shared' AND public.is_couple_member(couple_id))
);
CREATE TRIGGER investments_updated_at BEFORE UPDATE ON public.investments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX investments_space_idx ON public.investments (visibility, couple_id, user_id, investment_date DESC);

CREATE TABLE public.debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  responsible_user_id uuid NOT NULL REFERENCES public.profiles(id),
  visibility text NOT NULL DEFAULT 'shared' CHECK (visibility IN ('private', 'shared')),
  creditor text NOT NULL,
  description text NOT NULL,
  original_amount numeric NOT NULL CHECK (original_amount > 0),
  current_amount numeric NOT NULL CHECK (current_amount >= 0 AND current_amount <= original_amount),
  debt_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((visibility = 'private' AND couple_id IS NULL AND responsible_user_id = user_id) OR (visibility = 'shared' AND couple_id IS NOT NULL))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.debts TO authenticated;
GRANT ALL ON public.debts TO service_role;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "debts_select" ON public.debts FOR SELECT TO authenticated USING (
  (visibility = 'private' AND user_id = auth.uid()) OR
  (visibility = 'shared' AND public.is_couple_member(couple_id))
);
CREATE POLICY "debts_insert" ON public.debts FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND current_amount = original_amount AND status = 'open' AND (
    (visibility = 'private' AND couple_id IS NULL AND responsible_user_id = auth.uid()) OR
    (visibility = 'shared' AND public.is_couple_member(couple_id) AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = responsible_user_id AND p.couple_id = debts.couple_id))
  )
);
CREATE POLICY "debts_update" ON public.debts FOR UPDATE TO authenticated USING (
  user_id = auth.uid() OR (visibility = 'shared' AND public.is_couple_member(couple_id))
) WITH CHECK (
  (visibility = 'private' AND user_id = auth.uid() AND couple_id IS NULL AND responsible_user_id = auth.uid()) OR
  (visibility = 'shared' AND public.is_couple_member(couple_id) AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = responsible_user_id AND p.couple_id = debts.couple_id))
);
CREATE POLICY "debts_delete" ON public.debts FOR DELETE TO authenticated USING (
  user_id = auth.uid() OR (visibility = 'shared' AND public.is_couple_member(couple_id))
);
CREATE TRIGGER debts_updated_at BEFORE UPDATE ON public.debts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX debts_space_idx ON public.debts (visibility, couple_id, user_id, status);

CREATE TABLE public.debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id uuid NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.debt_payments TO authenticated;
GRANT ALL ON public.debt_payments TO service_role;
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "debt_payments_select" ON public.debt_payments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.debts d WHERE d.id = debt_id AND ((d.visibility = 'private' AND d.user_id = auth.uid()) OR (d.visibility = 'shared' AND public.is_couple_member(d.couple_id))))
);
CREATE POLICY "debt_payments_insert" ON public.debt_payments FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.debts d WHERE d.id = debt_id AND ((d.visibility = 'private' AND d.user_id = auth.uid() AND couple_id IS NULL) OR (d.visibility = 'shared' AND public.is_couple_member(d.couple_id) AND couple_id = d.couple_id)))
);
CREATE POLICY "debt_payments_update" ON public.debt_payments FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.debts d WHERE d.id = debt_id AND ((d.visibility = 'private' AND d.user_id = auth.uid()) OR (d.visibility = 'shared' AND public.is_couple_member(d.couple_id))))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.debts d WHERE d.id = debt_id AND ((d.visibility = 'private' AND d.user_id = auth.uid() AND couple_id IS NULL) OR (d.visibility = 'shared' AND public.is_couple_member(d.couple_id) AND couple_id = d.couple_id)))
);
CREATE POLICY "debt_payments_delete" ON public.debt_payments FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.debts d WHERE d.id = debt_id AND ((d.visibility = 'private' AND d.user_id = auth.uid()) OR (d.visibility = 'shared' AND public.is_couple_member(d.couple_id))))
);
CREATE TRIGGER debt_payments_updated_at BEFORE UPDATE ON public.debt_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX debt_payments_debt_date_idx ON public.debt_payments (debt_id, payment_date DESC);
CREATE INDEX debt_payments_couple_date_idx ON public.debt_payments (couple_id, payment_date DESC);

CREATE OR REPLACE FUNCTION public.sync_debt_after_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_debt_id uuid := COALESCE(NEW.debt_id, OLD.debt_id);
  debt_total numeric;
  paid_total numeric;
BEGIN
  SELECT original_amount INTO debt_total FROM public.debts WHERE id = target_debt_id FOR UPDATE;
  IF debt_total IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COALESCE(sum(amount), 0) INTO paid_total FROM public.debt_payments WHERE debt_id = target_debt_id;
  IF paid_total > debt_total THEN
    RAISE EXCEPTION 'O total pago não pode ultrapassar o valor original da dívida.';
  END IF;
  UPDATE public.debts
  SET current_amount = debt_total - paid_total,
      status = CASE WHEN debt_total - paid_total = 0 THEN 'paid' ELSE 'open' END,
      updated_at = now()
  WHERE id = target_debt_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.sync_debt_after_payment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_debt_after_payment() TO service_role;
CREATE TRIGGER sync_debt_after_payment_trigger AFTER INSERT OR UPDATE OR DELETE ON public.debt_payments FOR EACH ROW EXECUTE FUNCTION public.sync_debt_after_payment();

CREATE OR REPLACE FUNCTION public.protect_debt_calculated_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.original_amount <> OLD.original_amount THEN
    IF (SELECT COALESCE(sum(amount), 0) FROM public.debt_payments WHERE debt_id = OLD.id) > NEW.original_amount THEN
      RAISE EXCEPTION 'O valor original não pode ser menor que o total já pago.';
    END IF;
    NEW.current_amount := NEW.original_amount - (SELECT COALESCE(sum(amount), 0) FROM public.debt_payments WHERE debt_id = OLD.id);
    NEW.status := CASE WHEN NEW.current_amount = 0 THEN 'paid' ELSE 'open' END;
  ELSIF NEW.current_amount <> OLD.current_amount OR NEW.status <> OLD.status THEN
    NEW.current_amount := OLD.current_amount;
    NEW.status := OLD.status;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_debt_calculated_fields() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_debt_calculated_fields() TO service_role;
CREATE TRIGGER protect_debt_calculated_fields_trigger BEFORE UPDATE ON public.debts FOR EACH ROW EXECUTE FUNCTION public.protect_debt_calculated_fields();
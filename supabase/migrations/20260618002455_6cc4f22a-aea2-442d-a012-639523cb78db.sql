
-- Extend bank_connections for Pluggy
ALTER TABLE public.bank_connections
  ADD COLUMN IF NOT EXISTS pluggy_item_id text,
  ADD COLUMN IF NOT EXISTS institution_id text,
  ADD COLUMN IF NOT EXISTS institution_name text,
  ADD COLUMN IF NOT EXISTS institution_logo text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS bank_connections_pluggy_item_id_key
  ON public.bank_connections(pluggy_item_id) WHERE pluggy_item_id IS NOT NULL;

-- bank_accounts
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.bank_connections(id) ON DELETE CASCADE,
  couple_id uuid,
  user_id uuid NOT NULL,
  pluggy_account_id text NOT NULL UNIQUE,
  type text,
  subtype text,
  name text,
  balance numeric(14,2) DEFAULT 0,
  currency text DEFAULT 'BRL',
  account_number text,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "couple members manage bank_accounts" ON public.bank_accounts
  FOR ALL TO authenticated
  USING (couple_id IS NOT NULL AND public.is_couple_member(couple_id) OR user_id = auth.uid())
  WITH CHECK (couple_id IS NOT NULL AND public.is_couple_member(couple_id) OR user_id = auth.uid());
CREATE TRIGGER trg_bank_accounts_updated BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- bank_transactions
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  couple_id uuid,
  user_id uuid NOT NULL,
  pluggy_transaction_id text NOT NULL UNIQUE,
  description text,
  amount numeric(14,2) NOT NULL,
  currency text DEFAULT 'BRL',
  category text,
  pluggy_category text,
  date date NOT NULL,
  type text,
  imported_tx_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "couple members manage bank_transactions" ON public.bank_transactions
  FOR ALL TO authenticated
  USING (couple_id IS NOT NULL AND public.is_couple_member(couple_id) OR user_id = auth.uid())
  WITH CHECK (couple_id IS NOT NULL AND public.is_couple_member(couple_id) OR user_id = auth.uid());
CREATE INDEX IF NOT EXISTS bank_transactions_account_date_idx
  ON public.bank_transactions(account_id, date DESC);

-- synced_cards
CREATE TABLE IF NOT EXISTS public.synced_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.bank_connections(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  couple_id uuid,
  user_id uuid NOT NULL,
  pluggy_card_id text NOT NULL UNIQUE,
  card_name text,
  card_brand text,
  card_last_digits text,
  limit_amount numeric(14,2),
  available_limit numeric(14,2),
  current_bill numeric(14,2),
  closing_day int,
  due_day int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.synced_cards TO authenticated;
GRANT ALL ON public.synced_cards TO service_role;
ALTER TABLE public.synced_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "couple members manage synced_cards" ON public.synced_cards
  FOR ALL TO authenticated
  USING (couple_id IS NOT NULL AND public.is_couple_member(couple_id) OR user_id = auth.uid())
  WITH CHECK (couple_id IS NOT NULL AND public.is_couple_member(couple_id) OR user_id = auth.uid());
CREATE TRIGGER trg_synced_cards_updated BEFORE UPDATE ON public.synced_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- transactions: idempotency for Pluggy auto-import
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS pluggy_transaction_id text,
  ADD COLUMN IF NOT EXISTS imported_from text;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_pluggy_tx_key
  ON public.transactions(pluggy_transaction_id) WHERE pluggy_transaction_id IS NOT NULL;

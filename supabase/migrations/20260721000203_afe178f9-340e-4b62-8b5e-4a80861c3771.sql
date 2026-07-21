
ALTER TABLE public.bank_accounts
  ALTER COLUMN connection_id DROP NOT NULL,
  ALTER COLUMN pluggy_account_id DROP NOT NULL;

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'pluggy',
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS icon text;

ALTER TABLE public.bank_accounts
  DROP CONSTRAINT IF EXISTS bank_accounts_pluggy_account_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_pluggy_account_id_uniq
  ON public.bank_accounts(pluggy_account_id)
  WHERE pluggy_account_id IS NOT NULL;

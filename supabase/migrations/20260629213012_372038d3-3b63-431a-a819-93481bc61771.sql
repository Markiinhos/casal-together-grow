
DROP INDEX IF EXISTS public.financial_institutions_provider_extid_idx;
CREATE UNIQUE INDEX IF NOT EXISTS financial_institutions_provider_pluggy_idx
  ON public.financial_institutions (provider, pluggy_institution_id);

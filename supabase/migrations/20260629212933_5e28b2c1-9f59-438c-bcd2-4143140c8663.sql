
CREATE TABLE IF NOT EXISTS public.financial_institutions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'pluggy',
  pluggy_institution_id TEXT,
  external_id TEXT,
  name TEXT NOT NULL,
  official_name TEXT,
  image_url TEXT,
  primary_color TEXT,
  type TEXT,
  country TEXT DEFAULT 'BR',
  supports_open_finance BOOLEAN DEFAULT false,
  supports_credit_card BOOLEAN DEFAULT false,
  supports_checking BOOLEAN DEFAULT false,
  supports_investments BOOLEAN DEFAULT false,
  supports_loans BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_institutions_provider_extid_idx
  ON public.financial_institutions (provider, COALESCE(pluggy_institution_id, external_id));

GRANT SELECT ON public.financial_institutions TO authenticated, anon;
GRANT ALL ON public.financial_institutions TO service_role;

ALTER TABLE public.financial_institutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view institutions" ON public.financial_institutions
  FOR SELECT USING (true);

CREATE TRIGGER trg_fi_updated_at
  BEFORE UPDATE ON public.financial_institutions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

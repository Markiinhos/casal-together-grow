
-- Attach the existing generate_installments trigger
DROP TRIGGER IF EXISTS trg_generate_installments ON public.transactions;
CREATE TRIGGER trg_generate_installments
AFTER INSERT ON public.transactions
FOR EACH ROW
WHEN (NEW.total_installments IS NOT NULL AND NEW.total_installments > 1)
EXECUTE FUNCTION public.generate_installments();

-- Add paid_at column to installments for tracking
ALTER TABLE public.installments ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Ensure realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_cards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.installments;

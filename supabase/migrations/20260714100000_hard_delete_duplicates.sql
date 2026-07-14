-- 1. Identifica pagamentos de fatura duplicados (mesma fatura, mesmo valor, mesma data) e marca os extras como 'cancelled'
DO $$ 
DECLARE
  dup RECORD;
  tx_id UUID;
BEGIN
  -- Percorre todos os grupos que tem mais de 1 pagamento (is_card_payment = true)
  FOR dup IN 
    SELECT amount, date, COUNT(*) as qtd
    FROM public.transactions
    WHERE is_card_payment = true AND status != 'cancelled'
    GROUP BY amount, date
    HAVING COUNT(*) > 1
  LOOP
    -- Para cada grupo duplicado, vamos pular o primeiro (mais antigo) e cancelar os demais
    FOR tx_id IN 
      SELECT id FROM public.transactions 
      WHERE is_card_payment = true AND status != 'cancelled' 
        AND amount = dup.amount AND date = dup.date 
      ORDER BY created_at ASC 
      OFFSET 1
    LOOP
      UPDATE public.transactions SET status = 'cancelled' WHERE id = tx_id;
    END LOOP;
  END LOOP;
  
  -- Recalcula faturas por segurança
  FOR dup IN SELECT id FROM public.card_invoices LOOP
    PERFORM public.recalculate_card_invoice_totals(dup.id);
  END LOOP;
END $$;

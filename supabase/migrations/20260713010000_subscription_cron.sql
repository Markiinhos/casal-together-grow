-- Add pg_cron for daily subscription processing
-- Runs at 03:00 AM every day
SELECT cron.schedule(
  'process_subscriptions_daily',
  '0 3 * * *',
  $$ select process_subscription_charges(); $$
);

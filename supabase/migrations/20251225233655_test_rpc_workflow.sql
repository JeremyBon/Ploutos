-- Test migration to verify RPC workflow
-- This adds a simple comment to verify db push works

COMMENT ON FUNCTION public.get_total_amount_by_account_ids(uuid[]) IS 'Returns total amount per account with sign based on transaction type';

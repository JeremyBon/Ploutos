-- Fix get_budget_consumption to calculate NET spending (expenses - reimbursements)
-- Previously only counted 'credit' (expenses), ignoring 'debit' (reimbursements)

CREATE OR REPLACE FUNCTION public.get_budget_consumption(p_year integer, p_current_month integer)
 RETURNS TABLE("accountId" uuid, account_name text, category text, annual_budget double precision, spending_month double precision, spending_ytd double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        a."accountId",
        a.name AS account_name,
        a.category,
        b.annual_budget::double precision,
        COALESCE(SUM(CASE
            WHEN EXTRACT(MONTH FROM ts.date) = p_current_month
            THEN CASE WHEN ts.type = 'credit' THEN ts.amount ELSE -ts.amount END
            ELSE 0
        END), 0)::double precision AS spending_month,
        COALESCE(SUM(
            CASE WHEN ts.type = 'credit' THEN ts.amount ELSE -ts.amount END
        ), 0)::double precision AS spending_ytd
    FROM "Accounts" a
    LEFT JOIN "Budget" b
        ON a."accountId" = b."accountId"
        AND b.year = p_year
    LEFT JOIN "TransactionsSlaves" ts
        ON a."accountId" = ts."accountId"
        AND EXTRACT(YEAR FROM ts.date) = p_year
    WHERE a.is_real = false
        AND a.active = true
    GROUP BY a."accountId", a.name, a.category, b.annual_budget;
END;
$function$;

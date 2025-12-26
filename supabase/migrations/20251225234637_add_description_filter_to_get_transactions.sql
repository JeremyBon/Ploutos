-- Drop existing function to allow parameter rename
DROP FUNCTION IF EXISTS public.get_transactions(date, date, uuid, text, int, int);
DROP FUNCTION IF EXISTS public.get_transactions(date, date, uuid, text);
DROP FUNCTION IF EXISTS public.get_transactions(date, date, uuid);
DROP FUNCTION IF EXISTS public.get_transactions();

CREATE OR REPLACE FUNCTION public.get_transactions(
    p_date_from date DEFAULT NULL::date,
    p_date_to date DEFAULT NULL::date,
    p_account_id uuid DEFAULT NULL::uuid,
    p_description_filter text DEFAULT NULL::text,
    p_limit int DEFAULT 100,
    p_offset int DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    result JSON;
    total_count INT;
BEGIN
    -- Count total matching transactions
    SELECT COUNT(*)
    INTO total_count
    FROM "Transactions" t
    WHERE
        (p_date_from IS NULL OR t.date >= p_date_from)
        AND (p_date_to IS NULL OR t.date <= p_date_to)
        AND (
            p_account_id IS NULL
            OR t."accountId" = p_account_id
            OR EXISTS (
                SELECT 1 FROM "TransactionsSlaves" ts2
                WHERE ts2."masterId" = t."transactionId"
                AND ts2."accountId" = p_account_id
            )
        )
        AND (p_description_filter IS NULL OR t.description ILIKE '%' || p_description_filter || '%');

    -- Get paginated data
    SELECT json_agg(transaction_data)
    INTO result
    FROM (
        SELECT
            t."transactionId",
            t.created_at,
            t.updated_at,
            t.description,
            t.date,
            t.type,
            t.amount,
            t."accountId",
            ma.name AS "masterAccountName",
            ma.is_real AS "masterAccountIsReal",
            COALESCE(
                (
                    SELECT json_agg(
                        json_build_object(
                            'slaveId', ts."slaveId",
                            'type', ts.type,
                            'amount', ts.amount,
                            'date', ts.date,
                            'accountId', ts."accountId",
                            'masterId', ts."masterId",
                            'slaveAccountName', sa.name,
                            'slaveAccountIsReal', sa.is_real
                        )
                    )
                    FROM "TransactionsSlaves" ts
                    LEFT JOIN "Accounts" sa ON ts."accountId" = sa."accountId"
                    WHERE ts."masterId" = t."transactionId"
                ),
                '[]'::json
            ) AS "TransactionsSlaves"
        FROM "Transactions" t
        LEFT JOIN "Accounts" ma ON t."accountId" = ma."accountId"
        WHERE
            (p_date_from IS NULL OR t.date >= p_date_from)
            AND (p_date_to IS NULL OR t.date <= p_date_to)
            AND (
                p_account_id IS NULL
                OR t."accountId" = p_account_id
                OR EXISTS (
                    SELECT 1 FROM "TransactionsSlaves" ts2
                    WHERE ts2."masterId" = t."transactionId"
                    AND ts2."accountId" = p_account_id
                )
            )
            AND (p_description_filter IS NULL OR t.description ILIKE '%' || p_description_filter || '%')
        ORDER BY t.date DESC, t.created_at DESC
        LIMIT p_limit
        OFFSET p_offset
    ) AS transaction_data;

    RETURN json_build_object(
        'data', COALESCE(result, '[]'::json),
        'total', total_count
    );
END;
$function$;

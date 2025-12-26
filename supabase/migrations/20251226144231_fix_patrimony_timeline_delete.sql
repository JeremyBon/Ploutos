-- Fix DELETE statement in get_patrimony_timeline function
-- PostgreSQL requires a WHERE clause for DELETE statements

CREATE OR REPLACE FUNCTION get_patrimony_timeline(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSON
LANGUAGE plpgsql
AS $function$
DECLARE
  result JSON;
  current_month DATE;
  end_of_month TIMESTAMPTZ;
  bank_patrimony NUMERIC;
  cca_amount NUMERIC;
  pca_amount NUMERIC;
BEGIN
  -- Créer une table temporaire pour stocker les résultats
  CREATE TEMP TABLE IF NOT EXISTS timeline_results (
    month_date DATE,
    bank_patrimony NUMERIC,
    accounting_patrimony NUMERIC,
    cca_amount NUMERIC,
    pca_amount NUMERIC
  ) ON COMMIT DROP;

  -- Fixed: Added WHERE clause to DELETE statement
  DELETE FROM timeline_results WHERE true;

  -- Itérer sur chaque mois de la plage
  current_month := DATE_TRUNC('month', p_start_date);

  WHILE current_month <= p_end_date LOOP
    -- Fin du mois (dernier jour à 23:59:59)
    end_of_month := (DATE_TRUNC('month', current_month) + INTERVAL '1 month' - INTERVAL '1 second');

    -- 1. Patrimoine bancaire = somme des soldes des comptes réels actifs
    SELECT COALESCE(SUM(
      a.original_amount
      + COALESCE((
        SELECT SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE -t.amount END)
        FROM "Transactions" t
        WHERE t."accountId" = a."accountId" AND t.date <= end_of_month
      ), 0)
      + COALESCE((
        SELECT SUM(CASE WHEN ts.type = 'credit' THEN ts.amount ELSE -ts.amount END)
        FROM "TransactionsSlaves" ts
        JOIN "Transactions" t ON ts."masterId" = t."transactionId"
        WHERE ts."accountId" = a."accountId" AND t.date <= end_of_month
      ), 0)
    ), 0)
    INTO bank_patrimony
    FROM "Accounts" a
    WHERE a.is_real = true AND a.active = true;

    -- 2. CCA = Charges Constatées d'Avance (charges payées mais pas encore comptabilisées)
    -- Slaves credit sur comptes virtuels où master.date <= fin mois ET slave.date > fin mois
    SELECT COALESCE(SUM(ts.amount), 0)
    INTO cca_amount
    FROM "TransactionsSlaves" ts
    JOIN "Transactions" t ON ts."masterId" = t."transactionId"
    JOIN "Accounts" a ON ts."accountId" = a."accountId"
    WHERE a.is_real = false
      AND ts.type = 'credit'
      AND t.date <= end_of_month
      AND ts.date > end_of_month;

    -- 3. PCA = Produits Constatés d'Avance (revenus reçus mais pas encore comptabilisés)
    -- Slaves debit sur comptes virtuels où master.date <= fin mois ET slave.date > fin mois
    SELECT COALESCE(SUM(ts.amount), 0)
    INTO pca_amount
    FROM "TransactionsSlaves" ts
    JOIN "Transactions" t ON ts."masterId" = t."transactionId"
    JOIN "Accounts" a ON ts."accountId" = a."accountId"
    WHERE a.is_real = false
      AND ts.type = 'debit'
      AND t.date <= end_of_month
      AND ts.date > end_of_month;

    -- Insérer dans les résultats
    -- Patrimoine comptable = bancaire + CCA - PCA
    -- (CCA = actif en transit, PCA = passif en transit)
    INSERT INTO timeline_results VALUES (
      current_month,
      bank_patrimony,
      bank_patrimony + cca_amount - pca_amount,
      cca_amount,
      pca_amount
    );

    -- Mois suivant
    current_month := current_month + INTERVAL '1 month';
  END LOOP;

  -- Retourner les résultats en JSON
  SELECT json_agg(row_to_json(t))
  INTO result
  FROM (SELECT * FROM timeline_results ORDER BY month_date) t;

  RETURN COALESCE(result, '[]'::json);
END;
$function$;

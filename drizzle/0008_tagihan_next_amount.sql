-- A tagihan's amount now means "the next one", and is cleared once a payment is recorded.
-- Amounts on tagihan that were already paid are from before their first payment, so they are dropped.
UPDATE "bills" SET "amount" = NULL
WHERE EXISTS (SELECT 1 FROM "bill_payments" p WHERE p."bill_id" = "bills"."id" AND p."transaction_id" IS NOT NULL);

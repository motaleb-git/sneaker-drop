export const id = "003_stock_invariant";

const fn = `
CREATE OR REPLACE FUNCTION assert_drop_stock_invariant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target uuid;
BEGIN
  IF TG_TABLE_NAME = 'drops' THEN
    target := COALESCE(NEW.id, OLD.id);
  ELSE
    target := COALESCE(NEW.drop_id, OLD.drop_id);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM drops d
    WHERE d.id = target
      AND d.available_stock
        + (SELECT COUNT(*) FROM reservations r WHERE r.drop_id = d.id AND r.status = 'pending')
        + (SELECT COUNT(*) FROM purchases p WHERE p.drop_id = d.id)
        <> d.total_stock
  ) THEN
    RAISE EXCEPTION 'stock invariant violated for drop %', target
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;
`;

export const statements = [
  fn,
  `DROP TRIGGER IF EXISTS stock_invariant_drops ON drops`,
  `CREATE CONSTRAINT TRIGGER stock_invariant_drops
    AFTER INSERT OR UPDATE OR DELETE ON drops
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE PROCEDURE assert_drop_stock_invariant()`,
  `DROP TRIGGER IF EXISTS stock_invariant_reservations ON reservations`,
  `CREATE CONSTRAINT TRIGGER stock_invariant_reservations
    AFTER INSERT OR UPDATE OR DELETE ON reservations
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE PROCEDURE assert_drop_stock_invariant()`,
  `DROP TRIGGER IF EXISTS stock_invariant_purchases ON purchases`,
  `CREATE CONSTRAINT TRIGGER stock_invariant_purchases
    AFTER INSERT OR UPDATE OR DELETE ON purchases
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE PROCEDURE assert_drop_stock_invariant()`,
];

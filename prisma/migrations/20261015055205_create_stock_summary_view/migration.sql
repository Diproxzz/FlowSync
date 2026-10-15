CREATE OR REPLACE VIEW v_stock_summary AS
SELECT
  p.id AS product_id,
  p.code,
  p.name,
  COALESCE(SUM(CASE WHEN sm.type = 'OPENING' THEN sm.qty_kg ELSE 0 END), 0) AS opening,
  COALESCE(SUM(CASE WHEN sm.type = 'PURCHASE' THEN sm.qty_kg ELSE 0 END), 0) AS purchases,
  COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.qty_kg ELSE 0 END), 0) AS sales,
  COALESCE(SUM(CASE WHEN sm.type = 'ADJUSTMENT' THEN sm.qty_kg ELSE 0 END), 0) AS adjustments,
  (
    COALESCE(SUM(CASE WHEN sm.type = 'OPENING' THEN sm.qty_kg ELSE 0 END), 0) +
    COALESCE(SUM(CASE WHEN sm.type = 'PURCHASE' THEN sm.qty_kg ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.qty_kg ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN sm.type = 'ADJUSTMENT' THEN sm.qty_kg ELSE 0 END), 0)
  ) AS closing,
  p.pack_size_kg,
  CASE
    WHEN p.pack_size_kg IS NOT NULL AND p.pack_size_kg > 0 THEN
      ROUND(
        (
          COALESCE(SUM(CASE WHEN sm.type = 'OPENING' THEN sm.qty_kg ELSE 0 END), 0) +
          COALESCE(SUM(CASE WHEN sm.type = 'PURCHASE' THEN sm.qty_kg ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.qty_kg ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN sm.type = 'ADJUSTMENT' THEN sm.qty_kg ELSE 0 END), 0)
        ) / p.pack_size_kg, 2
      )
    ELSE 0
  END AS drums,
  p.std_purchase_rate,
  p.std_sale_rate,
  ROUND(
    (
      (
        COALESCE(SUM(CASE WHEN sm.type = 'OPENING' THEN sm.qty_kg ELSE 0 END), 0) +
        COALESCE(SUM(CASE WHEN sm.type = 'PURCHASE' THEN sm.qty_kg ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.qty_kg ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN sm.type = 'ADJUSTMENT' THEN sm.qty_kg ELSE 0 END), 0)
      ) * COALESCE(p.std_purchase_rate, 0)
    ), 2
  ) AS stock_value,
  ROUND(
    (
      COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.qty_kg ELSE 0 END), 0) * COALESCE(p.std_sale_rate, 0)
    ), 2
  ) AS sales_value,
  p.reorder_level_kg,
  CASE
    WHEN p.reorder_level_kg IS NOT NULL AND p.reorder_level_kg > 0 AND (
      COALESCE(SUM(CASE WHEN sm.type = 'OPENING' THEN sm.qty_kg ELSE 0 END), 0) +
      COALESCE(SUM(CASE WHEN sm.type = 'PURCHASE' THEN sm.qty_kg ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.qty_kg ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN sm.type = 'ADJUSTMENT' THEN sm.qty_kg ELSE 0 END), 0)
    ) <= p.reorder_level_kg THEN 'LOW STOCK'
    ELSE 'OK'
  END AS status
FROM products p
LEFT JOIN stock_movements sm ON sm.product_id = p.id
GROUP BY p.id, p.code, p.name, p.pack_size_kg, p.std_purchase_rate, p.std_sale_rate, p.reorder_level_kg;
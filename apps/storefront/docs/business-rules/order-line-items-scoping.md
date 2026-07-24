# Order line-item model

Orders use `items: OrderLineItem[]` as the authoritative product list. Each line stores a stable id, optional Catalog product/variant references, quantity, unit price, and a fallback product name. Legacy single-item fields remain derived only for compatibility.

## Catalog and Inventory boundary

Catalog products no longer define Materials Recipes or Stock links. Order creation and status transitions therefore do not reserve, consume, commit, or restore Stock automatically. Inventory adjustments remain explicit Stock operations.

This boundary keeps Catalog product configuration focused on sellable product data and prevents a disabled Inventory workflow from affecting Orders.

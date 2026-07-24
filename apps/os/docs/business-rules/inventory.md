# Inventory (Stock) — Business Rules

Inventory is an independent operational module. It manages branch stock items, quantity adjustments, transfers, archival, and audit events.

## Catalog and Orders

Catalog products do not contain Materials Recipes or Stock-item links. Orders do not reserve, deduct, or restore Stock automatically. Any Stock change must be recorded explicitly through Inventory actions.

`reservedQty` remains a manually maintained Stock-item field for legacy display compatibility; it is not derived from Orders.

## Stock items

A Stock item belongs to one branch and stores its category, available quantity, reserved quantity, unit, low-stock threshold, perishability, and optional expiry date. Owner and authorized Admin users can add, edit, archive, or delete Stock items while Inventory is enabled.

## Quantity adjustments

Losses, write-offs, expiry adjustments, sales, and restocks are explicit operations. Quantity-changing actions clamp at zero and record Stock audit events.

## Transfers

Transfers follow `requested → in_transit → received`, with cancellation allowed before receipt. Received and cancelled are terminal states. Quantity movement is owned by the transfer workflow, not Catalog or Orders.

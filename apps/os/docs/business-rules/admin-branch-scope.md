# Admin Branch Scope

## Locked rule

Admin branch scope applies to **order operations**, not to read visibility.

### Company-wide read access

An authorized Admin may read across all branches:

- Orders list and order history
- Order Details
- Customers and Customer Profile
- Customer reviews / feedback
- Order payment history that is part of readable Order detail
- Order activity / audit context exposed to the Orders workspace
- Role-relevant notifications
- Dashboard/order browsing filters

Selecting `All` or another branch for browsing must not change the Admin's operational authority.

### Branch-scoped order operations

An Admin may mutate an Order only when the Order belongs to the Admin's current dated operational branch.

This includes:

- creating an internal/manual Order
- confirming or cancelling a pending Storefront Order
- Process Order / payment confirmation
- assigning or reassigning a florist
- editing Order details
- advancing Order status
- other Admin-owned Order mutations

The browser/UI guard is not authoritative. The database must reject an Admin mutation when the Order branch differs from `private.current_staff_branch_id()`.

### Operational context

Production Admin sessions still require a valid dated working schedule and operational branch. That context exists to authorize Order processing; it must not be reused as a read filter.

### Other roles

- Owner: company-wide read according to configured section/capability access.
- Finance: company-wide Orders/Customers/Reviews read-only; Finance workspace authority remains Finance-only.
- HR: company-wide Orders/Customers/Reviews read-only.
- Florist: Order visibility is assignment/employee-scoped, not branch-scoped; an intentionally cross-branch assigned Order remains visible. Florist cannot mutate Orders.

# Phase 7 — Customers / CRM preparation

Phase 7 makes Business OS and Online Store use the same customer identity and intake rules before a live Supabase project exists.

## Canonical identity

`normalizedWhatsappNumber` is the unique CRM matching key. The shared normalizer maps common Indonesian formats such as `0812…`, `812…`, `+62 812…`, `0062 812…`, and `620812…` to one `62…` key. The same algorithm is implemented in TypeScript and in `private.normalize_whatsapp`.

## Existing customer rule

A Storefront checkout that matches an existing CRM customer does not overwrite established CRM values. Name is always preserved. Existing email, birthday, and preferred branch are preserved. New values for currently empty email/birthday/preferred branch are captured as `customerProfileSuggestions` on the order for staff review.

Admin intake may explicitly accept selected missing-profile suggestions.

## New customer rule

A new WhatsApp identity creates one CRM profile using the submitted name/contact data and intake source. Duplicate normalized WhatsApp identities are rejected on manual CRM create/edit.

## Historical order snapshot

CRM identity and order history are intentionally separate. Orders keep the order-time submitted name and WhatsApp formatting, plus submitted email (or established CRM email as a fallback). Later CRM edits never rewrite old order snapshots.

## Addresses

Delivery/recipient addresses remain order data in this phase. They are not automatically promoted to `customer_addresses` because floral orders are commonly sent to different recipients. The `customer_addresses` table stays available for a future explicit save-address feature.

## Prepared backend behavior

`20260724164009_customer_sync.sql` adds customer revisions, aligns backend WhatsApp normalization with the app, adds optimistic-concurrency CRM save/delete RPCs, and updates the prepared Storefront order RPC so existing customer data is not silently changed.

The public Storefront still has no direct SELECT/UPDATE access to `customers` or `customer_addresses`.

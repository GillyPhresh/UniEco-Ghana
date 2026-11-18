# Vendor subscriptions

Subscriptions remain 30-day, one-time Paystack payments. Verified student
vendors pay GH₵20; all other eligible vendor accounts use the GH₵50 business
rate. The one-time GH₵20 business registration fee is a separate flow. This
release does not add automatic billing, collect a payment method, or introduce
new marketplace restrictions.

The billing view only returns data for the authenticated owner of a vendor
account. The accepted amount is checked against both eligibility and the
authoritative ledger intent before the provider is called. Concurrent attempts
starting from the same ledger version share a key and a single-use provider
reference. The server checks earlier attempts before accepting another
payment, uses the existing private hosted-checkout table to resume a pending
reference, and waits for the established Paystack verification/webhook flow to
activate access and issue the financial records.

If staff need to investigate an old, unresumable, or ambiguous checkout, use
the payment reference in Management → Payments and verify it against Paystack.
Do not manually cancel or mark a payment as paid based only on a customer
screenshot. No production migration, cron change, or new secret is required.

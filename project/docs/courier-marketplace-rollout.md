# UniEco Delivery pilot

UniEco Delivery handles parcels from Marketplace orders. It does not book passenger rides, change checkout, collect order payment through couriers, or transfer funds to couriers. The offer fee is capped at the existing order delivery fee and the courier must accept the exact amount displayed. Operations must agree how and when that fee will be settled before publishing any offers.

## Before opening

1. Obtain approval for production migration `20261117150000_0205_courier_marketplace_dispatch.sql`. Apply only this migration to the intended production database after checking its prerequisites (0203/0204, trusted communication and administration routines, and the existing order fulfilment tables). Verify `SELECT public.courier_program_is_open();` returns `false`. Do not apply the test script to production.
2. Release the app and verify the closed state in Marketplace → Deliver with UniEco and Management → Delivery. Confirm the app does not show a courier request on pickup orders. Existing shop delivery remains available.
3. Before opening applications, confirm the operator or licensed partner with the [Postal and Courier Services Regulatory Commission](https://pcsrc.gov.gh/licensing-requirements/), driver checks and insurance, permitted parcel types and delivery area, a support escalation path, and how fees will be paid. Verify each applicant’s identity/phone and applicable vehicle documentation privately; do not collect ID photos over chat. Coordinate a pilot with one campus and participating verified shops before enabling live offers.

## Run an order

1. Once approved to operate, a super admin opens **Delivery → Courier operations** and reviews applications. A selected campus limits the offers a courier sees. For motorbike/car approvals, enter the effective expiry of the documents checked.
2. The buyer opens a delivery order and selects **Allow courier delivery**. The shop marks the parcel ready in its order, enters its pickup point, and selects the parcel size. Shop and buyer keep the original payment arrangement.
3. Operations reviews the request, confirms the route fits the pilot area and delivery budget, then publishes a fee. Offers expire after two hours; expired offers can be republished. Available couriers can accept one compatible job at a time and can release it before collection.
4. The courier sees the pickup address only after accepting. The shop shares the pickup code at collection. Then the courier sees the customer’s drop-off address. The buyer shares a separate code only when receiving the parcel and confirms receipt in the order. The app removes the duplicate pickup address and handoff codes at completion. A courier contacting support should give the order reference, not copy a customer address or PIN.
5. Operations verifies completed jobs and settles the agreed fees separately. The **Pause new work** switch stops new applications, order authorizations, requests, and claims; jobs already accepted can be completed. Use support for an in-transit issue; there is no unattended rerouting or refund.

## Regression check

On an isolated database with the production schema and no production data, apply 0205 and run `supabase/tests/courier_marketplace_dispatch.sql` with pgTAP. The synthetic applicants and order changes are rolled back. The test covers least-privilege access, inactive enrollment by default, payment-reminder suppression, consent, fee agreement, job release, scope by campus, staged addresses, rate-limited PINs, and end-to-end handoff without any new payment.

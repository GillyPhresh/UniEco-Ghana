# Referral product deferred

UniEco Ghana does not currently operate a referral programme, referral reward liability, wallet, credit balance, or payout system.

The prior referral pages and client methods were quarantined because they allowed browser-controlled referral creation and reward amounts. No `referrals`, `referral_rewards`, `wallets`, or `wallet_transactions` table belongs in the clean staging baseline.

A future referral product must be designed and implemented as a separate, server-authoritative capability. Before implementation, its qualification, attribution, reward issuance, expiry, reversal, fraud controls, accounting treatment, and any payout or credit rules must be explicitly approved. Browser-provided reward amounts must never be treated as financial authority.

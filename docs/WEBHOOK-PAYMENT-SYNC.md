# Why Some Fapshi Payments Stay "Pending" (Root Cause)

## What Happened

Four teams paid successfully on Fapshi, but only two were marked as **PAID** in our database. The other two stayed **INITIATED** until we fixed them manually. That means **our webhook never successfully updated those two payments**.

---

## How It’s Supposed to Work

1. **Registration** – We create a payment with `providerRef = CAMIHN-{teamId}-{timestamp}` and send that as `externalId` to Fapshi when creating the payment link.
2. **User pays** – Fapshi processes the payment.
3. **Webhook** – Fapshi sends **one** POST request to our webhook URL with the payment result (SUCCESSFUL / FAILED / EXPIRED).
4. **Our handler** – We read `externalId` (or `reference` / `transId`) from the body, look up the `Payment` by `providerRef`, set `Payment.status = SUCCESS` and `Team.status = PAID`.

If step 3 or 4 fails, we never get a second chance: **Fapshi does not retry webhooks** (“Fapshi sends only one webhook request per event”).

---

## Likely Causes (Why 2 Were Not Updated)

### 1. **Webhook Never Reached Our Server (Most Likely)**

- **Fapshi could not call our URL**  
  - Webhook URL in the Fapshi dashboard wrong (e.g. typo, old URL, missing path).  
  - Our app was down, restarting, or not yet deployed when the event fired.  
  - Network/firewall blocking Fapshi (e.g. only localhost, or security group blocking inbound).
- **We responded too slowly**  
  - Fapshi may timeout (e.g. 30s). If our handler or DB is slow, they might treat it as failure and still not retry.

**Result:** We never received the webhook for those two payments, so our DB was never updated.

---

### 2. **We Rejected or Errored (401 / 500)**

- **Signature verification (401)**  
  - We use `FAPSHI_WEBHOOK_SECRET` to verify `x-fapshi-signature`.  
  - If the secret doesn’t match what Fapshi uses, or the header is missing, we return **401** and do not update the payment.
- **Server error (500)**  
  - Any unhandled exception (DB error, bug, etc.) causes a 500.  
  - Fapshi still doesn’t retry.

**Result:** Webhook was sent, but we responded with an error, so we didn’t update the DB.

---

### 3. **Lookup Failed (Wrong or Missing Reference)**

We look up the payment by:

```ts
providerRef = payload.externalId ?? payload.reference ?? payload.transId ?? ""
// then find Payment where provider = "FAPSHI" and providerRef = that value
```

- **Fapshi is supposed to send** the same body as the [payment-status](https://docs.fapshi.com/en/api-reference/endpoint/payment-status) response, which includes **`externalId`** (our reference).
- If for some requests Fapshi **did not send** `externalId` (or sent it under a different key), we might use `reference` or `transId`.  
- **`transId`** is Fapshi’s own ID; we don’t store it in `providerRef`, so if only `transId` was present we would **not** find the payment and would return 200 without updating (we already log “No matching payment … Available fields”).

**Result:** We received the webhook but couldn’t match it to a row, so we didn’t update.

---

## Summary Table

| Cause                          | Webhook received? | Our response | DB updated? |
|--------------------------------|-------------------|-------------|-------------|
| URL wrong / server down / timeout | No                | –           | No          |
| 401 (bad signature)             | Yes               | 401         | No          |
| 500 (crash/DB error)           | Yes               | 500         | No          |
| Lookup fail (no externalId / wrong ref) | Yes        | 200         | No          |

So “why did this happen?” = **either we never got the webhook (1), we got it but rejected or crashed (2), or we got it but couldn’t find the payment (3)**. The two you fixed manually were almost certainly in one of these cases.

---

## What to Do Going Forward

1. **Webhook URL**  
   - In Fapshi dashboard, confirm the webhook URL is exactly your public base URL + path (e.g. `https://your-api.com/api/webhooks/fapshi`).  
   - No typo, no trailing slash if your app doesn’t expect it.

2. **Secret**  
   - Set `FAPSHI_WEBHOOK_SECRET` in your environment to the value Fapshi shows for that webhook.  
   - If you disable verification for testing, remember to re-enable and set the secret in production.

3. **Logging**  
   - We already log when no payment is found and include `reference`, `externalId`, `transId`.  
   - Keep these logs (or add a short-lived log of the full body if allowed by policy) so next time you can see exactly what Fapshi sent.

4. **Resilience**  
   - Because Fapshi doesn’t retry, consider a **backup**: e.g. a cron that lists INITIATED payments and calls Fapshi’s [payment-status](https://docs.fapshi.com/en/api-reference/endpoint/payment-status) by `transId` (if you store it when creating the payment) and then updates our DB. That way missed or failed webhooks can still be synced.

5. **Manual fix (already in place)**  
   - Use **admin “mark payment paid”** (by `providerRef` or `paymentId`) when you’ve confirmed success in Fapshi, so the dashboard and DB stay in sync even when the webhook failed.

---

## References

- Fapshi webhook: https://docs.fapshi.com/en/api-reference/endpoint/webhook  
- Payment status (same body as webhook): https://docs.fapshi.com/en/api-reference/endpoint/payment-status  
- Our handler: `src/app/api/webhooks/fapshi/route.ts`

# Firestore setup — indexes & TTL

The app talks to Firestore exclusively through the Admin SDK in server routes
(`src/lib/firebase-admin.ts`). A few queries and the cache-expiry mechanism
depend on server-side configuration that lives outside the application code.
This file documents that configuration and the commands to apply it.

Firebase project id: **`lucra-ce8de`** (unchanged after the Finava rebrand).

## Composite indexes

`src/lib/agentMemory.ts` runs two `tickerMemory` queries that require composite
indexes on `(ticker, createdAt)`:

- **`getTickerMemory`** — `where("ticker", "in", [...]).orderBy("createdAt", "desc")`
  to load the most-recent insights per ticker in a single batched read.
- **`saveTickerMemory`** — `where("ticker", "==", …).orderBy("createdAt", "asc").limit(n)`
  to fetch only the oldest rows that the bounded prune must delete.

Both are declared in [`firestore.indexes.json`](../firestore.indexes.json).
Deploy them with:

```bash
firebase deploy --only firestore:indexes --project lucra-ce8de
```

Confirm they exist and are `Enabled`:

```bash
gcloud firestore indexes composite list --project lucra-ce8de
```

## TTL policy on `agentCache`

`saveCache` writes an `expiresAt` **Firestore Timestamp** on every `agentCache`
document. Expired rows are treated as a cache miss on read, but they are **not**
deleted by the application — Firestore's native TTL policy reclaims them
server-side. Enable the policy once per project:

```bash
gcloud firestore fields ttl update expiresAt \
  --collection-group=agentCache \
  --project=lucra-ce8de \
  --enable-ttl
```

Verify it is active:

```bash
gcloud firestore fields ttl list --collection-group=agentCache --project=lucra-ce8de
```

Notes:

- Firestore TTL deletes run in the background and may lag the `expiresAt`
  instant by up to ~72h. That is why `checkCache` still filters expired rows on
  read — correctness never depends on the deletion having happened yet.
- The TTL field must be a `Timestamp`; storing an ISO string (the previous
  behaviour) makes the document ineligible for TTL. Do not revert `expiresAt`
  to a string.

## Security rules

`firestore.rules` denies all direct client access (every read/write goes through
the Admin SDK, which bypasses rules). Deploy with:

```bash
firebase deploy --only firestore:rules --project lucra-ce8de
```

# Security Specification — Adam-Smith Personal Finance

## 1. Data Invariants & Relationship Mapping

Master Source of Truth: `/users/{userId}` (where `uid == userId == request.auth.uid`).

1. **PII Isolation**: `/users/{userId}` stores private account metadata (`email`, `displayName`, budget preferences). Only the owner (`request.auth.uid == userId`) can read or write their own document. Listing `/users` is strictly denied to prevent user enumeration and PII scraping.
2. **Master Gate**: Every subcollection document under `/users/{userId}/transactions`, `/users/{userId}/budgets`, `/users/{userId}/allocations`, and `/users/{userId}/recurring` requires the parent `/users/{userId}` document to exist with `uid == request.auth.uid` for single-document operations (`get`, `create`, `update`, `delete`).
3. **Secure List Queries**: Every `allow list` rule enforces `isSignedIn() && request.auth.uid == userId && resource.data.ownerId == request.auth.uid` with zero `get()`/`exists()` calls to prevent O(n) cost explosions and unauthorized scraping.
4. **Verified Identity**: All writes require `request.auth.token.email_verified == true`.
5. **Temporal Integrity & Immutability**: `createdAt` must equal `request.time` on create and remain immutable on update. `updatedAt` must equal `request.time` on create and update. `ownerId` / `uid` are immutable after creation.
6. **Referential Integrity**: Creating a transaction referencing `allocationId` or `recurringId` requires that the referenced document exists under `/users/{userId}`.
7. **Terminal State Locking**: An `AnnualAllocation` with `status == 'completed'` is locked against any further updates.

## 2. The "Dirty Dozen" Adversarial Payloads

All 12 payloads below MUST fail with `PERMISSION_DENIED`:

1. **Cross-User Read (PII Leak)**: Authenticated User B requests `get` on `/users/userA`.
2. **User Enumeration (Blanket List)**: Authenticated User A requests `list` on `/users`.
3. **Identity Spoofing on Create**: User A attempts to create `/users/userA/transactions/tx1` with `ownerId: "userB"`.
4. **Shadow Field Injection (Create)**: User A creates a transaction containing an undeclared ghost field `isAdmin: true`.
5. **Shadow Update / Ghost Field Injection (Update)**: User A updates `/users/userA/transactions/tx1` adding `verifiedBySystem: true`.
6. **Unverified Email Write (Spoof Attack)**: User with `email_verified: false` attempts to create `/users/userA`.
7. **Resource Poisoning (Oversized Path ID)**: User A attempts to create `/users/userA/transactions/<200-char-invalid-id!@#>` with invalid characters/length.
8. **Value Poisoning (Negative/Huge Amount)**: User A creates or updates a transaction with `amount: -500` or `amount: "1000"` (wrong type).
9. **Oversized String DoW Attack**: User A updates `note` with a 500-character string exceeding `maxLength: 400`.
10. **Timestamp Spoofing**: User A creates a transaction supplying a client-forged `createdAt` timestamp instead of `serverTimestamp()`.
11. **Orphaned Relational Reference**: User A creates a transaction with `allocationId: "nonexistent-alloc"` that does not exist under `/users/userA/allocations`.
12. **Terminal State Violation**: User A attempts to update an `AnnualAllocation` whose `existing().status == 'completed'`.

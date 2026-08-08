# Bug Report

## BUG-01: Email format / password length validation missing on `dev`

**Severity:** Medium
**Found by:** Tester/QA Officer — Core System
**Found via:** TC-11, TC-12 (see test-cases-and-results.csv)
**Status:** Not a bug in the traditional sense — a merge-sequencing gap.

**Description:**
Registering with an invalid email format (e.g. `notanemail`) or a
password under 6 characters currently succeeds (`201 Created`) on the
`dev` branch, when it should be rejected with `400 Bad Request`.

**Root cause:**
This validation was implemented as part of the Backend/Database
Developer's task (`feature/backend-hardening` branch) but had not yet
been merged into `dev` at the time of this test run.

**Fix:**
Merge `feature/backend-hardening` into `dev`. The validation logic
already exists in `src/routes/auth.js` on that branch (email regex
check + password length check, both added alongside the password-reset
flow).

**Verification step once merged:**
Re-run TC-11 and TC-12 from `docs/test-plan/test-cases-and-results.csv`
and confirm both return `400 Bad Request`.

---

## Reporting template for new bugs

```
### BUG-XX: <short title>
Severity: Critical / High / Medium / Low
Found by:
Found via: <test case ID or manual exploration>
Status: Open / In Progress / Fixed / Won't Fix

Description:
Steps to reproduce:
Expected:
Actual:
Fix (once identified):
```

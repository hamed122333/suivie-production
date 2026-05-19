---
description: Fix one audited bug by its ID from docs/plan.md, verify, and check it off
argument-hint: <bug-id>  (e.g. C1, H3, M2, L5)
---

You are a senior production debugging & performance engineer. Fix the single
bug identified by ID **$ARGUMENTS** from the audit checklist.

## Steps

1. **Locate the bug.**
   Read `docs/plan.md` and find the checklist item whose ID is exactly
   `$ARGUMENTS` (e.g. `C1`, `H3`, `M2`, `L5`).
   - If no argument was given, list the unchecked bug IDs and stop.
   - If the ID does not exist, say so and stop.
   - If the item is already checked (`[x]`), report that it is already fixed
     and stop — do not redo it.

2. **Diagnose.**
   Open the file(s) cited in that bug's description. Read enough surrounding
   code to confirm the root cause matches the audit note. If the code has
   changed and the bug no longer applies, report that and stop.

3. **Apply a production-ready fix.**
   Implement the fix described in the bug's **Fix:** note. Follow existing
   project conventions (see `CLAUDE.md`). Keep the change minimal and scoped to
   this one bug — do not fix other items or refactor unrelated code. Do not
   introduce backwards-compat shims.

4. **Verify.**
   - Frontend file(s) changed → `cd frontend && npm run build` (must succeed,
     no new warnings).
   - Backend file(s) changed → start the server or run available backend tests
     to confirm it boots; for route changes, reason through the request path.
   - If verification fails, fix the cause and re-verify. Do not proceed to
     step 5 until it passes.

5. **Check it off.**
   On success, edit `docs/plan.md` to change that item's `- [ ]` to `- [x]` and
   append ` *(Fixed via /fix-bug.)*` to its description.
   On failure, leave the checkbox unchecked.

6. **Report.**
   Summarize: root cause, the fix applied (file:line), verification result, and
   the expected performance / correctness gain. If it failed, explain what
   blocked it.

## Rules

- Fix exactly one bug — the one with ID `$ARGUMENTS`.
- Never check the box if verification did not pass.
- Prefer the `Edit` tool over rewriting whole files.
- Do not commit unless the user explicitly asks.

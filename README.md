# UTM Builder

Replaces the University of Portsmouth marketing UTM tracker spreadsheet: enforced-logic
UTM creation, a reliable bulk builder (100+ rows as the normal case), and a shared,
searchable view of every UTM created.

Vanilla HTML/CSS/JS, no build step, no framework. Styled to match the
[Page Standards Checker](https://university-of-portsmouth-web-team.github.io/webpage-checker-tool/).

## Local development

No build step — just serve the folder and open it:

```bash
npx http-server -p 8420
# then open http://localhost:8420/index.html
```

By default the shared view is backed by `localStorage` (the `mockDataAccess` in
`js/dataAccess.js`), so it works with no backend at all — good enough to develop
and demo, but **not shared across users/machines**, since that's a browser-local store.

## Deploying for real (Cloudflare Pages + Functions + KV)

Chosen to match the Cloudflare Pages + Pages Functions + KV pattern already
running in this account's `jd-fpl` project — same maintenance model, no new
platform to learn, and it avoids putting a spreadsheet back in the critical
path (Google Sheets API / Apps Script were the alternative, but that's the
exact failure mode this project replaces).

1. `npx wrangler login` (once per machine).
2. `npx wrangler kv namespace create UTM_RECORDS`, then paste the returned id
   into `wrangler.toml`'s `[[kv_namespaces]] id = "..."`.
3. In `js/dataAccess.js`, change `const BACKEND = 'mock'` to `'cloudflare'`.
   This is the single-file swap the data-access layer exists for — nothing
   else in the app needs to change.
4. `npx wrangler pages deploy . --project-name=utm-builder`

`functions/api/utms.js` is the Pages Function backing `GET /api/utms` (list)
and `POST /api/utms` (append) against the KV namespace.

## File structure

```
index.html              Builder page: batch details + 6 multi-line UTM fields
shared.html              Shared view: searchable/filterable list of confirmed UTMs
css/styles.css           UoP brand tokens (colors, type, focus states) matching the Page Standards Checker
js/rules.js              Validation rule DATA + the validate() engine — swap point for the real rule set
js/generator.js          Row-alignment/broadcast/blank-line/duplicate logic + UTM string construction
js/dataAccess.js         list()/append() interface — swap point for the real backend
js/report.js             Results table, copy-single/copy-all, CSV export
js/app.js                Builder page wiring: form submit, confirmation dialog, focus trap
js/shared-app.js         Shared view wiring: load, filter, CSV export
js/utils.js              escapeHtml, CSV encoding, clipboard, file download, id generation
functions/api/utms.js    Cloudflare Pages Function: GET/POST against KV (only used when BACKEND = 'cloudflare')
wrangler.toml            KV namespace binding
tests/e2e.mjs            Playwright script exercising every Phase 4 test case below (dev-only, not deployed)
```

## Combination model

Row-aligned, matching the reference [Lupage UTM generator](https://www.lupagedigital.com/utm-generator/)'s
"add one per line" parallel-textarea pattern — **not** cartesian:

- Line 1 of every field combines into row 1, line 2 into row 2, and so on.
- A field with exactly one non-blank line is **broadcast** across every row.
- A field with a line count that is neither 1 nor the batch's row count is a
  **hard error** naming the field and the mismatch — the whole batch is
  blocked rather than silently padding, truncating, or guessing.
- Blank lines are stripped before counting, and the count of dropped blanks
  is reported in the results summary so silent input mistakes stay visible.
- Duplicates (same final UTM string, exact match) are flagged, not blocked —
  both within the current batch and against everything already in the shared
  view — since a legitimate re-run is sometimes intended.

## Validation rules — currently MOCK DATA

**The three spreadsheet tab exports were not supplied, so `js/rules.js` ships
with a placeholder rule set.** Every value in `MEDIUM_BY_PAID_ORGANIC`,
`TERM_RULES_BY_MEDIUM`, `SOURCE_RULES_BY_TERM`, and `CAMPAIGN_RULES` is
invented, clearly commented as such, and exists only to prove the validation
chain works end-to-end. **Replace those four exported constants with the real
lookups and nothing else in the app needs to change** — `validateRow()` and
every caller are written against the shape of the data, not its contents.

### Inferred structure (unconfirmed against the real sheet)

- **Paid/Organic → Medium** gating (`MEDIUM_BY_PAID_ORGANIC`) isn't one of the
  three named tabs — it's inferred from the brief's own example ("a paid
  campaign cannot carry an organic-only term"), i.e. that GA4 Mediums
  themselves are categorised Paid or Organic. Confirm this against the real
  sheet; the actual gating logic may live elsewhere.
- **`TERM_RULES_BY_MEDIUM`** is assumed to be the "Default Medium – Term" tab:
  for each Medium, which Campaign Terms are valid, plus a default. Not
  currently used in the UI (no "apply default" affordance yet) — flagging as
  a possible follow-up if the sheet's default is meant to pre-fill the field.
- **`SOURCE_RULES_BY_TERM`** is assumed to be the "Term Source" tab: for each
  Campaign Term, which Sources are valid.
- **`CAMPAIGN_RULES`** is assumed to be the "Campaign name, GA4 medium,
  content" tab: for a *known* Campaign name, which Mediums and Content values
  are permitted. Campaigns not listed are unrestricted by this tab — most
  campaign names won't be pre-registered, so this defaults permissive rather
  than blocking anything not explicitly listed. Confirm whether the real
  sheet intends this to be permissive-by-default or an exhaustive allow-list.
- The field table's notes column only calls out GA4 Medium, Campaign Term,
  and Source as needing to "respect" upstream rules — Campaign and Campaign
  Content are validated for required-ness and count alignment only, not
  against a lookup, except where `CAMPAIGN_RULES` explicitly restricts a
  known campaign's content values.

### Other decisions made without spreadsheet confirmation

- **UTM string construction** (param order, casing, encoding) is unknown —
  placeholdered as standard GA4 order (`utm_source`, `utm_medium`,
  `utm_campaign`, `utm_term`, `utm_content`), values lowercased, encoded via
  the URL API's standard query-string encoding. Any pre-existing `utm_*`
  params on a pasted Page URL are stripped before the new ones are applied.
- Fields 4–9 (Page URL through Campaign Content) are all treated as
  **required**, since the field table doesn't mark any as optional (unlike
  the Lupage reference, where Term/Content are optional).
- Dedup key is the exact generated UTM string (case-sensitive).

## Where this deviates from the brief

- **Hosting: Cloudflare Pages, not GitHub Pages.** The brief's stated stack
  requirement is "deployable to GitHub Pages," but the persistence
  requirement (a shared view across users/machines) needs a backend GitHub
  Pages cannot provide. You chose Cloudflare Pages + Functions + KV, matching
  the account's existing `jd-fpl` setup — noting it here since it overrides
  a stated non-functional requirement, not because it's still open.
- Everything else follows the brief as written.

## Handover checklist against the brief's Definition of Done

1. ✅ Field labels/order match the spreadsheet's wording exactly.
2. ✅ No invalid Paid/Organic combination can be produced — enforced by
   `validateRow()`'s chain, though **against mock data, not the real rules**.
3. ✅ Verified: a 150-row batch generates all 150 rows without loss (see
   `tests/e2e.mjs`, Test 4).
4. ✅ Verified: the confirmation text is exact, and Cancel writes nothing.
5. ✅ Confirmed UTMs appear in the shared view immediately (no page reload/extra step).
6. ✅ Shared view is searchable (free text) and filterable (Set Up By, Campaign, Date, Paid/Organic).
7. ✅ Verified via a keyboard-only Playwright pass — see Phase 4 below. Not
   independently verified with a real screen reader (VoiceOver/NVDA); the
   ARIA roles/labels/live-regions are in place but that's not a substitute
   for an actual AT pass.
8. ✅ Deployable as a static site; data access isolated behind `js/dataAccess.js`.
9. ✅ This section.

## Phase 4 — verification

Ran as an automated Playwright pass against a local static server
(`tests/e2e.mjs`, 21/21 checks passing):

- Valid paid combination generates a correct UTM with zero errors.
- A Paid batch carrying an organic-only Medium is blocked, with the error
  shown inline next to the GA4 Medium field, naming what's allowed.
- Unequal line counts (2 Campaign lines against 3 Page URL lines) block
  generation entirely, with a message naming the field and the mismatch.
- A 150-row batch generates all 150 rows with no loss.
- Within-batch duplicates are flagged; a row matching something already in
  the shared view is flagged as "Already exists in the shared view."
- Clicking Cancel on the confirmation dialog leaves `localStorage` untouched
  — nothing is written without the exact confirmation text and an explicit "Yes."
- Keyboard-only pass: skip link is the first focusable element, Tab order
  reaches Generate after the last field, the confirmation dialog moves focus
  in on open, traps Tab between Yes/Cancel, Escape closes it without writing,
  and focus returns to the opener. Invalid fields get `aria-invalid="true"`.
- Shared view: a confirmed UTM appears without a manual refresh, and
  filtering by Set Up By narrows the result set correctly.

**Not covered, and worth being explicit about:**
- No real screen reader was used (NVDA/VoiceOver) — only ARIA attributes and
  keyboard focus order were verified programmatically.
- No cross-browser testing beyond Chromium.
- The validation rules are mock data — correctness against the *real* sheet
  is entirely unverified until the CSV exports are supplied.
- No load-tested KV behaviour at very large record counts (the shared view
  stores one JSON array per KV key — fine at hundreds/low-thousands of
  records, but would need a different storage shape well beyond that).

To re-run the verification pass yourself:

```bash
npm install
npx http-server -p 8420 &
npm test
```

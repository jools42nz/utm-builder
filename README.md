# UTM Builder

Replaces the University of Portsmouth marketing UTM tracker spreadsheet: enforced-logic
UTM creation via cascading dropdowns, a reliable bulk builder (100+ rows as the normal
case), and a shared, searchable view of every UTM created.

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

Currently live at **https://utm-builder-608.pages.dev** — front end only; the
shared view there is still the `localStorage` mock (see step 2 below).

### Deploys are automatic

`.github/workflows/deploy.yml` runs `wrangler pages deploy` on every push to
`main`, using a Cloudflare API token stored as a GitHub Actions secret
(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — see repo Settings →
Secrets and variables → Actions). No manual deploy step, no token
copy-pasted anywhere, for any future change.

To turn on the real (non-mock) shared view:
1. `npx wrangler kv namespace create UTM_RECORDS`, then paste the returned id
   into `wrangler.toml`'s `[[kv_namespaces]] id = "..."` (already done for the
   live deploy above — namespace exists, just unused until step 2).
2. In `js/dataAccess.js`, change `const BACKEND = 'mock'` to `'cloudflare'`.
   This is the single-file swap the data-access layer exists for — nothing
   else in the app needs to change.
3. Push to `main` — the workflow above deploys it.

`functions/api/utms.js` is the Pages Function backing `GET /api/utms` (list)
and `POST /api/utms` (append) against the KV namespace.

(Manual deploy still works if you ever need it outside CI:
`npx wrangler login` once per machine, then
`npx wrangler pages deploy . --project-name=utm-builder`.)

## File structure

```
index.html              Builder page: batch details + a repeatable row table (1 row = 1 UTM)
shared.html              Shared view: searchable/filterable list of confirmed UTMs
admin.html               Admin page: add/remove permanent Campaign/Source/Content values — see "Authentication" below
login.html               Passphrase sign-in — see "Authentication" below
css/styles.css           UoP brand tokens (colors, type, focus states) matching the Page Standards Checker
js/rules.js              MEDIUM_TERM_MAP / TERM_SOURCE_MAP / CAMPAIGN_OPTIONS / CONTENT_OPTIONS, sourced from the spreadsheet's own lookup tabs — swap point for rule data
js/rulesOverrides.js     Merges admin-added values (from /api/rules-overrides) on top of js/rules.js's static lists — what the builder actually imports for Campaign/Source/Content
js/generator.js          UTM construction + per-row evaluation (required fields, defensive re-validation, duplicates)
js/dataAccess.js         list()/append() interface — swap point for the real backend
js/app.js                Builder page wiring: row table, cascading selects, duplicate row, bulk-add, confirmation dialog
js/shared-app.js         Shared view wiring: load, filter, CSV export
js/admin-app.js          Admin page wiring: add/remove overrides, calls /admin/api/rules
js/login.js              Posts a passphrase to /api/login, redirects on success
js/logout.js             Wires the header's "Log out" link to /api/logout
js/utils.js              escapeHtml, CSV encoding, clipboard, file download, id generation
functions/_middleware.js         Gates every request behind the two-tier login — see "Authentication" below
functions/_lib/session.js        Signed session-cookie helpers shared by the middleware, login, and admin API
functions/api/login.js           Checks a passphrase, sets the session cookie
functions/api/logout.js          Clears the session cookie
functions/api/utms.js            Cloudflare Pages Function: GET/POST against KV (only used when BACKEND = 'cloudflare')
functions/api/rules-overrides.js GET of admin-added values — every page's dropdowns merge these in
functions/admin/api/rules.js     GET/POST/DELETE of admin-added values, re-checks the admin session independently of the middleware
wrangler.toml            KV namespace binding (reused by the shared-view records and rule overrides, under different keys) — see it for the three auth secrets it needs
robots.txt               Disallows every crawler, named AI ones included — this is internal marketing data, not public content
llms.txt                 Same "don't crawl/index/train on this" request, in the llmstxt.org convention some AI agents check
tests/e2e.mjs            Playwright script exercising every Phase 4 test case below (dev-only, not deployed; doesn't cover auth — see "Not covered")
.github/workflows/deploy.yml   Auto-deploys to Cloudflare Pages on every push to main
```

## Authentication

Two-tier login gates the whole site: a **user passphrase** (Builder + Shared
view) and an **admin passphrase** (also unlocks `/admin`). Deliberately not
Cloudflare Access, not SSO, not per-person accounts — this app may move off
Cloudflare Pages to internal-firewall-only hosting, and this model is plain
app code with no dependency on whichever platform ends up serving it.
There's no username, no password reset flow, no user table: knowing a
passphrase *is* the access grant, same as a shared office door code.

### What the admin passphrase actually unlocks

Every "Other" field (Campaign, Source, Campaign Content) lets anyone type a
new value on the spot, but it never becomes a real dropdown option — the
next person hits "Other" again for the same recurring affiliate/campaign.
`/admin` fixes that: an admin picks the value once, on the page at `/admin`,
and it's permanently offered to everyone from then on.

**How it works:**
- `functions/_middleware.js` runs ahead of every request (the only way to
  gate plain static HTML on a Pages site — there's no per-page server
  render to hang a check on otherwise). No valid session → page requests
  redirect to `/login?redirect=<where you were going>`; API requests get a
  plain 401 JSON instead, so client-side `fetch` calls fail predictably
  rather than following a redirect into an HTML page.
- `/login` posts a passphrase to `functions/api/login.js`, which checks it
  against `ADMIN_PASSPHRASE` first, then `USER_PASSPHRASE`, and on a match
  sets a signed, `HttpOnly` session cookie (`functions/_lib/session.js`) —
  `{ role, exp }`, HMAC-signed with `SESSION_SECRET` so it can't be forged
  or edited client-side, valid for 7 days.
- `/admin*` additionally requires `role: "admin"` — a `user`-role session
  gets a plain "admin access required" page/response, not a redirect loop.
- `functions/admin/api/rules.js` independently re-checks the admin role
  itself (not just trusting that the middleware ran) — defence in depth,
  same principle as the old Cloudflare Access header check it replaced.

**One-time setup**, three secrets, none of them committed (`wrangler.toml`
just has a comment, not the values):
```bash
npx wrangler pages secret put USER_PASSPHRASE
npx wrangler pages secret put ADMIN_PASSPHRASE
npx wrangler pages secret put SESSION_SECRET   # e.g. `openssl rand -hex 32` — long, random, never typed by a person
```
Until all three are set, `/login` responds with "Sign-in is not configured
yet" instead of erroring.

**Honest limits of "stupid simple":**
- No per-person identity — everyone who knows the admin passphrase is
  indistinguishable to the app. `functions/admin/api/rules.js` records
  `addedBy` as whatever name the admin typed into the "Your name" field on
  `/admin`, not a verified identity — same honour-system trust as the
  Builder's existing "Set Up By" field.
- A leaked passphrase grants access until it's rotated (change the secret,
  redeploy) — there's no way to revoke one person without changing it for
  everyone, since there are no individual accounts to disable.
- No lockout, no rate limiting, no MFA. Acceptable for a tool that's not
  reachable from the public internet at all (behind the org firewall, or
  today, effectively self-selecting since the URL isn't advertised) — not
  a model to reuse for anything internet-facing.
- `/login` is public by necessity (you can't authenticate against a page
  you need to already be authenticated to reach) — so is every file under
  `/css/` and `/js/`, since the login page needs its own stylesheet and
  script and none of those files contain secrets, just UI code.

### Storage

Admin-added values live in the `UTM_RECORDS` KV namespace, under
`rules-overrides`. Each entry records `value`, `addedBy` (the typed name)
and `addedAt`. `functions/api/rules-overrides.js` (used by every page's
dropdowns) doesn't need its own auth check — it's already behind the same
middleware as everything else, unlike the old Cloudflare Access design
where it was deliberately left public because Access only covered `/admin*`.

### Not covered

- The existing Playwright suite (`tests/e2e.mjs`) runs against a plain
  static server with no Functions runtime, so it never exercises the
  middleware, login, or `/admin` at all — every one of its 55 checks loads
  pages directly, which only works locally because there's no gate to hit.
  The auth logic itself (`functions/_lib/session.js`'s HMAC sign/verify,
  tamper and wrong-secret rejection, `functions/_middleware.js`'s
  redirect/401/403 branching for anonymous/user/admin × page/API) was
  verified with standalone Node scripts calling the Functions directly with
  mock `Request`/`env` objects — not against a real Cloudflare Pages
  deployment, which behaves the same but is worth a first real login/logout
  pass after deploying before relying on it.
- No CSRF hardening beyond `SameSite=Lax` on the session cookie — an
  accepted risk for a small internal tool that (per the design above) isn't
  meant to be internet-facing at all.
- Medium→Term pairs aren't admin-addable, only Campaign/Source/Content
  (the three fields that already have an "Other" escape hatch). Could be
  extended the same way if a new Medium/Term combination is ever needed.

## Validation rules — sourced directly from the spreadsheet's own lookup tabs

`js/rules.js` is built directly from the three tabs that actually define
what's valid, supplied as separate `.xlsx` exports: **Term Source**
(`getSourcesForTerm`/`TERM_SOURCE_MAP`), **Default medium - term**
(`getTermsForMedium`/`MEDIUM_TERM_MAP`), and **Campaign name, GA4 medium,
cont[ent]** (`CAMPAIGN_OPTIONS`/`CONTENT_OPTIONS`). This replaced an earlier
version built by reverse-engineering actual *usage* in the main tracker
export (`JW__CSV_of_UTM_SheetCopy__Paste_of_UTM_Tracker.csv`, 8,509 real
rows) — usage under-represented what the tabs actually permit, since a
valid combination that was simply never used wouldn't show up. The tracker
export is no longer the source for validation rules; it's only referenced
below for the two UTM-construction fixes it revealed.

### The core mechanism — and why there's no Paid/Organic field

Campaign Term values are themselves prefixed `paid-` or `organic-`
(`organic-email`, `paid-search`, etc.) — **that prefix carries the
Paid/Organic meaning already**. An earlier version of this tool added a
separate "Paid / Organic" dropdown above the row table and used it to gate
which Mediums and Terms were offered. That was a misreading: nothing in the
spreadsheet's actual data supports a standalone Paid/Organic *input* — it's
just a label on the Term you've already picked. The field has been removed
entirely, from both the builder and the shared view (including the shared
view's filter row — there is no derived Paid/Organic field or filter
anywhere in this tool any more). **All cascading logic now lives solely in
the row fields**: Medium narrows Term, Term narrows Source. Campaign and
Campaign Content are flat, independent lists (see below) — not gated by
anything.

Two ppc Terms, `pmax` and `demand-gen`, don't carry either prefix — they're
Google Ads campaign types (Performance Max, Demand Gen), not a
paid/organic channel, and the spreadsheet's own tabs list them as bare
Terms. They have no row in the Term Source tab either, so their Source
dropdown offers only "Other" — an accurate reflection of reality, not a
gap: these campaign types don't have a further Source breakdown to pick
from.

From there:
- **GA4 Medium → Campaign Term** (`MEDIUM_TERM_MAP`, via `getTermsForMedium`):
  exactly the rows of the "Default medium - term" tab (12 Mediums,
  including `postal` — new in this pass, previously missing from the tool
  entirely). Options are alphabetical.
- **Campaign Term → Source** (`TERM_SOURCE_MAP`, via `getSourcesForTerm`):
  exactly the rows of the "Term Source" tab (34 Terms with defined
  Sources), alphabetical. This list is **not a hard block** — the Source
  dropdown always includes "Other (new source)…", which reveals a
  free-text field, since new affiliates/publishers/platforms appear
  regularly and the tab won't always be re-supplied the day a new one
  launches.
- **Campaign** (`CAMPAIGN_OPTIONS`, 277 names) and **Campaign Content**
  (`CONTENT_OPTIONS`, 1,289 values) are both flat, alphabetical `<select>`
  lists, taken directly from the "Campaign name, GA4 medium, cont[ent]"
  tab's Column A and Column C — **not** gated by Medium, Term, or each
  other, because that tab's own layout confirms they're three independent
  columns of valid values, not a row-paired Campaign→Medium→Content
  mapping. Both also offer "Other (new campaign)…" / "Other (new
  content)…" for values not yet in the list, and Campaign Content's select
  supports native in-browser search/type-ahead given how long the list is.

### Corrections applied on top of the raw tabs

The three tabs aren't perfectly self-consistent, and a few small,
deliberate fixes were applied rather than reproducing every inconsistency
verbatim:
- **Out-of-home hyphenation.** The "Default medium - term" tab spells this
  term two different ways in two different rows — `organic-out-of-home` /
  `paid-out-of-home` (its `video` row) vs `organic-outofhome` /
  `paid-outofhome` (implied by its `print` row and confirmed by the "Term
  Source" tab, which only defines sources for the no-hyphen spelling).
  Both `print` and `video` now use the no-hyphen spelling, so the Term
  always resolves to its real Source list instead of leaving one spelling
  variant orphaned with no Sources.
- **Affiliate row noise.** The "Default medium - term" tab's `affiliate`
  row also lists `sponsorship`, `uni-frog`, and a duplicate `paid-email`.
  All three were dropped: `uni-frog` is a well-established *Source* name
  used under several other Terms, not a Term itself; `sponsorship` doesn't
  follow the `paid-`/`organic-` naming every other Term uses and has no
  Source data anywhere; `paid-email` already correctly lives under the
  `email` Medium. This read as copy-paste noise in that one row, not a
  real category — worth a sanity check with whoever owns the sheet.
- **Affiliate additions.** Conversely, `paid-3rd-party-email` and
  `paid-3rd-party-listicle` both have real Source data in the "Term
  Source" tab (`the-student-room`, matching their sibling
  `paid-3rd-party-website`/`paid-3rd-party-virtual-event` terms) but were
  missing from the "Default medium - term" tab's `affiliate` row entirely
  — added back so they're reachable.
- **One placeholder dropped from Campaign.** The "Campaign name..." tab's
  Column A includes the literal row `"Please choose a campaign name"` —
  clearly the sheet's own dropdown placeholder text, not a real campaign —
  dropped as noise.

### Fixed, not replicated: two UTM construction bugs

The historical `Tracked URL` column is generated by string concatenation,
not proper URL construction, and it shows:
1. **A literal second `?`** appended when the Page URL already has a query
   string (e.g. a job-listing URL with an `?enc=...` tracking token becomes
   `...==?utm_campaign=...`) instead of `&`.
2. **Unencoded spaces** landing raw in the URL (`utm_content=...-details
   here`) instead of being percent-encoded.

New UTMs use the URL API instead, which handles both correctly (`&` when a
query string already exists, proper percent-encoding). This is a deliberate
improvement, not an oversight — flagging it because it means newly generated
UTMs are not byte-identical to how the old spreadsheet would have built the
same inputs.

### Confirmed from real data, not guessed

- **Param order**: `utm_campaign`, `utm_medium`, `utm_source`, `utm_term`,
  `utm_content` — read directly off hundreds of real `Tracked URL` values,
  not the `utm_source`-first convention this project originally guessed at.
- **Casing is preserved exactly as entered** (`Thinkpostgrad`, `NHS_app`,
  `QS Top Universities` all appear verbatim in real tracked URLs) — values
  are not lowercased.

## Interaction model: cascading selects, not free-text batches

This replaced the original free-text "6 parallel textareas, row-aligned"
design entirely, per explicit direction: Campaign, Medium, Campaign Term,
Source and Campaign Content are all `<select>` elements (Campaign and
Content flat and alphabetical; Medium/Term/Source cascading and
alphabetical), so an invalid Medium→Term→Source combination is structurally
unreachable rather than merely flagged after the fact. One row is one UTM;
the single-UTM and bulk paths are the same form and the same code path — a
"batch" of one row is just the single-UTM case. There is no Paid/Organic
input anywhere — see "The core mechanism" above.

- Picking a row's **Medium** narrows its **Campaign Term** options.
- Picking a row's **Campaign Term** narrows its **Source** options (plus
  "Other").
- **Campaign** and **Campaign Content** are flat lists, independent of
  every other field and of each other (plus "Other" on each) — deliberately
  not cascaded off anything.
- **+ Add row** adds one blank row; **+ Add multiple rows** bulk-seeds many
  rows from pasted URLs (one per line) — this is the bulk entry point,
  replacing the old parallel-textarea paste.
- **Duplicate** (per row) inserts an exact copy of that row — including any
  "Other" free-text values — directly after it, shifting later rows down by
  one. Replaced the old "Copy row 1's Campaign/Medium/Term/Source/Content to
  all rows" fill-down button, which only ever copied from row 1; duplicating
  any row and editing the copy covers the same bulk case without that
  restriction.
- Duplicates (same final UTM string) are flagged, not blocked — both within
  the batch and against everything already in the shared view — since a
  legitimate re-run is sometimes intended.
- A row's remaining required-field checks (Page URL format, nothing left
  blank) still run at Generate time, since cascading selects can't catch
  those.

## Where this deviates from the brief

- **Hosting: Cloudflare Pages, not GitHub Pages.** The brief's stated stack
  requirement is "deployable to GitHub Pages," but the persistence
  requirement (a shared view across users/machines) needs a backend GitHub
  Pages cannot provide. Cloudflare Pages + Functions + KV matches the
  account's existing `jd-fpl` setup.
- **No Paid/Organic input field, anywhere, including the shared view.** The
  brief's field table lists Paid/Organic as an input the user selects. Real
  usage data shows the Paid/Organic meaning already lives entirely inside
  the Campaign Term (its `paid-`/`organic-` prefix); a separate selector
  duplicating that, and using it to gate Medium/Term options, produced
  exactly the wrong behaviour (hiding real GA4 Mediums). The field, its
  derived shared-view column, and its shared-view filter have all been
  removed outright — Term's own prefix is the only signal, and it is not
  surfaced as a separate field or filter anywhere.
- **Source is guided, not gated; Campaign and Campaign Content are flat,
  ungated lists.** The field notes say Source "must respect Term/Medium
  rules" — implemented as a strong default (pick from the real list per
  Term) with an explicit "Other" escape hatch, rather than a hard block,
  since new affiliates/publishers/platforms appear constantly.
  Campaign and Campaign Content go further: they are **not** filtered by
  anything else (not Medium, not each other) — every known value is always
  offered, with "Other" for anything not yet listed. Blocking any of these
  outright would make the tool unable to record a genuinely new
  affiliate/publisher/campaign/content variant on day one of using it.
- Everything else follows the brief and the follow-up direction as given.

## Handover checklist against the brief's Definition of Done

1. ✅ Field labels/order match the spreadsheet's wording exactly, minus the
   Paid/Organic input — see "Where this deviates" above for why.
2. ✅ No invalid Medium → Term combination can be produced — structurally,
   via the cascading selects, not just flagged after entry. Campaign and
   Campaign Content are deliberately ungated (see "Where this deviates").
3. ✅ Verified: a 150-row batch generates all 150 rows without loss.
4. ✅ Verified: the confirmation text is exact, and Cancel writes nothing.
5. ✅ Confirmed UTMs appear in the shared view immediately (no reload/extra step).
6. ✅ Shared view mirrors the builder's fields exactly (including Campaign
   Content) and is searchable (free text) and filterable by all 5 UTM
   parameters (Campaign, GA4 Medium, Campaign Term, Source, Campaign
   Content) plus Page URL, Date, and Set Up By. No Paid/Organic field or
   filter anywhere — see "Where this deviates".
7. ✅ Verified via a keyboard-only Playwright pass. Not independently verified
   with a real screen reader (VoiceOver/NVDA) — ARIA roles/labels/live-regions
   are in place but that's not a substitute for an actual AT pass.
8. ✅ Deployable as a static site; data access isolated behind `js/dataAccess.js`.
9. ✅ This section, plus "Validation rules" above.

## Phase 4 — verification

Automated Playwright pass against a local static server (`tests/e2e.mjs`,
47/47 checks passing):

- No standalone Paid/Organic field exists anywhere in the form or the
  shared view.
- Campaign is a real `<select>`, alphabetically ordered, with "Other".
- Every real GA4 Medium (`ppc`, `affiliate`, `organic`, `audio`, etc.) is
  offered, alphabetically ordered, with no polarity gate at all; picking
  `email` offers both `paid-email` and `organic-email` in the same list.
- Picking a Term narrows Source to its real list from the "Term Source" tab,
  alphabetically ordered, plus "Other"; `ppc` + `paid-display` returns the
  full 26-item Source list.
- Campaign Content is a flat, alphabetically-ordered `<select>` that is
  identical regardless of which Campaign or Medium is selected (not gated
  by either), plus "Other".
- A valid row generates a UTM matching the confirmed real param
  order/casing exactly.
- Choosing "Other" for Campaign, Source, and Campaign Content all accept a
  brand-new value un-blocked.
- A row missing Page URL, or missing Campaign Content, is blocked with a
  named inline error.
- Bulk-add from pasted URLs creates one row per line.
- A 150-row batch (bulk-add, each row filled individually) generates all 150
  rows, all valid.
- Duplicating a row inserts an exact copy directly after it — including any
  "Other" free-text values — shifting later rows down by one, and renumbers
  correctly.
- Within-batch duplicates are flagged; a row matching the shared view is
  flagged "Already exists in the shared view."
- Cancel leaves `localStorage` untouched; the confirmation text matches
  exactly, character for character.
- Remove is disabled at 1 remaining row.
- Keyboard-only pass: skip link first, dialog traps focus, Escape closes
  without writing, focus returns to the opener.
- Shared view: a confirmed UTM appears without a manual refresh, mirrors
  the builder's fields exactly (including Campaign Content), and each of
  the 5 UTM-parameter filters plus Page URL narrows results correctly.

**Not covered, and worth being explicit about:**
- No real screen reader was used (NVDA/VoiceOver) — only ARIA attributes and
  keyboard focus order were verified programmatically.
- No cross-browser testing beyond Chromium.
- The corrections in "Corrections applied on top of the raw tabs" above
  (dropped/added affiliate Terms, out-of-home hyphenation) were judgement
  calls made from the tab data itself, not confirmed with whoever owns the
  actual sheet — worth a sanity check with them.
- No load-tested KV behaviour at very large record counts (the shared view
  stores one JSON array per KV key — fine at hundreds/low-thousands of
  records, but would need a different storage shape well beyond that).

To re-run the verification pass yourself:

```bash
npm install
npx playwright install chromium   # first time only
npx http-server -p 8420 &
npm test
```

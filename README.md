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

By default when developing locally with a plain static server, the shared view
is backed by `localStorage` (the `mockDataAccess` in `js/dataAccess.js`), so it
works with no backend at all — good enough to poke around the UI, but **not
shared across users/machines**, since that's a browser-local store. Set
`const BACKEND = 'mock'` in `js/dataAccess.js` to get this zero-setup mode back
for local work; the live deployment always runs with `BACKEND = 'cloudflare'`
(see below).

## Deploying for real (Cloudflare Pages + Functions + KV)

Chosen to match the Cloudflare Pages + Pages Functions + KV pattern already
running in this account's `jd-fpl` project — same maintenance model, no new
platform to learn, and it avoids putting a spreadsheet back in the critical
path (Google Sheets API / Apps Script were the alternative, but that's the
exact failure mode this project replaces).

Currently live at **https://utm-builder-2y2.pages.dev** — the shared view is
real: `js/dataAccess.js`'s `BACKEND` is `'cloudflare'`, so every signed-in
user reads and writes the same `UTM_RECORDS` KV namespace, not their own
browser's `localStorage`.

### Deploys are automatic

`.github/workflows/deploy.yml` runs `wrangler pages deploy` on every push to
`main`, using a Cloudflare API token stored as a GitHub Actions secret
(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — see repo Settings →
Secrets and variables → Actions). No manual deploy step, no token
copy-pasted anywhere, for any future change.

`functions/api/utms.js` is the Pages Function backing `GET /api/utms` (list)
and `POST /api/utms` (append) against the KV namespace.

(Manual deploy still works if you ever need it outside CI:
`npx wrangler login` once per machine, then
`npx wrangler pages deploy . --project-name=utm-builder`.)

## File structure

```
index.html              Builder page: batch details + a repeatable row table (1 row = 1 UTM)
shared.html              Shared view: searchable/filterable list of confirmed UTMs
admin.html               Admin page: manage users, add/remove permanent Campaign/Source/Content values — see "Authentication" below
login.html               Sign-in page — see "Authentication" below
account.html             "My account" page: any signed-in user can change their own password — see "Authentication" below
css/styles.css           UoP brand tokens (colors, type, focus states) matching the Page Standards Checker
js/rules.js              MEDIUM_TERM_MAP / TERM_SOURCE_MAP / CAMPAIGN_OPTIONS / CONTENT_OPTIONS, sourced from the spreadsheet's own lookup tabs — swap point for rule data
js/rulesOverrides.js     Merges admin-added values (from /api/rules-overrides) on top of js/rules.js's static lists — what the builder actually imports for Campaign/Source/Content
js/generator.js          UTM construction + per-row evaluation (required fields, defensive re-validation, duplicates)
js/dataAccess.js         list()/append() interface — swap point for the real backend
js/app.js                Builder page wiring: row table, cascading selects, duplicate row, bulk-add, confirmation dialog
js/shared-app.js         Shared view wiring: load, filter, CSV export
js/admin-app.js          Admin page wiring: manage users (calls /admin/api/users) and add/remove overrides (calls /admin/api/rules) — see "Authentication" below
js/login.js              Posts to /api/login, redirects to ?redirect= target on success
js/logout.js             Posts to /api/logout, then redirects to /login
js/account.js            "My account" wiring: greets the signed-in user, posts to /api/account to change their own password
js/utils.js              escapeHtml, CSV encoding, clipboard, file download, id generation
functions/_middleware.js         Gates every request behind a session; /admin* additionally requires the admin role — see "Authentication" below
functions/_lib/session.js        Signed session-cookie helpers (sign/verify, HMAC'd with SESSION_SECRET)
functions/_lib/users.js          Password hashing (PBKDF2) and the KV-backed user store
functions/api/login.js           Checks username/password, sets the session cookie
functions/api/logout.js          Clears the session cookie
functions/api/whoami.js          Returns the current session's { username, role }
functions/api/account.js         PUT: any signed-in account changes their own password (requires the current one) — see "Authentication" below
functions/api/utms.js            Cloudflare Pages Function: GET/POST against KV (only used when BACKEND = 'cloudflare')
functions/api/rules-overrides.js Public GET of admin-added values (no auth — every visitor's dropdowns need this)
functions/admin/api/rules.js     GET/POST/DELETE of admin-added values, admin-only — see "Authentication" below
functions/admin/api/users.js     GET/POST/PUT/DELETE of user accounts, admin-only — see "Authentication" below
scripts/seed-admins.mjs          One-time CLI to create the first admin account(s) — see "Authentication" below
wrangler.toml            KV namespace binding, reused by shared-view records, rule overrides and user accounts under different keys
robots.txt               Disallows every crawler, named AI ones included — this is internal marketing data, not public content
llms.txt                 Same "don't crawl/index/train on this" request, in the llmstxt.org convention some AI agents check
tests/e2e.mjs            Playwright script exercising every Phase 4 test case below (dev-only, not deployed)
.github/workflows/deploy.yml   Auto-deploys to Cloudflare Pages on every push to main
```

## Authentication

Real accounts, built entirely into the app — no Cloudflare Access, no SSO,
no 3rd party. This app may move off Cloudflare Pages to internal-firewall-
only hosting, and this model is plain app code with no dependency on
whichever platform ends up serving it. Two roles: exactly **3 admins**
expected, everyone else a general **user**. There's no self-service
signup — an admin creates every account by hand, from `/admin`.

**The whole site now requires signing in**, not just `/admin` — every page
and API route redirects to `/login` without a valid session, except
`/login` itself and static assets. This replaces an earlier Cloudflare
Access-based design for `/admin*` that was documented but never actually
configured on the live deployment, so `/admin` has effectively never been
gated for real until now.

### What the admin role unlocks

Every "Other" field (Campaign, Source, Campaign Content) lets anyone type a
new value on the spot, but it never becomes a real dropdown option — the
next person hits "Other" again for the same recurring affiliate/campaign.
`/admin` fixes that: an admin picks the value once, on the page at
`/admin`, and it's permanently offered to everyone from then on. Admins
also manage every account — see "Manage users" below.

**How it works:**
- Accounts live in the `UTM_RECORDS` KV namespace, under the `users` key —
  one JSON array, `{ username, passwordHash, role, addedBy, addedAt }` per
  person. Passwords are never stored in plain text: `functions/_lib/users.js`
  hashes them with PBKDF2 (100,000 iterations, random salt per password,
  Web Crypto — no external library).
- `functions/_middleware.js` runs ahead of every request (the only way to
  gate plain static HTML on a Pages site — there's no per-page server
  render to hang a check on otherwise). No valid session → page requests
  redirect to `/login?redirect=<where you were going>`; API requests get a
  plain 401 JSON instead, so client-side `fetch` calls fail predictably
  rather than following a redirect into an HTML page.
- `/login` posts `{ username, password }` to `functions/api/login.js`,
  which checks it against the KV user store and, on a match, sets a
  signed, `HttpOnly` session cookie (`functions/_lib/session.js`) —
  `{ username, role, exp }`, HMAC-signed with `SESSION_SECRET` so it can't
  be forged or edited client-side, valid for 7 days.
- `/admin*` additionally requires `role: "admin"` — a `user`-role session
  gets a plain "admin access required" page/response, not a redirect loop.
- `functions/admin/api/rules.js` and `functions/admin/api/users.js`
  independently re-check the admin role themselves (not just trusting that
  the middleware ran) — defence in depth.

### Manage users (on `/admin`)

Add, remove, or reset the password of any account. Server-side safeguards,
not just hidden in the UI: you can't remove your own account, and you
can't remove the last remaining admin. Removing someone takes effect on
their next request — their existing session cookie stops verifying,
same as any tampered cookie would.

New usernames must be a `@port.ac.uk` address (`functions/admin/api/users.js`
checks the format; no email is actually sent — it's a format check only, not
real verification). This only applies going forward: accounts created before
this requirement (`julian.wootton`, `ben.hunt`) keep working as-is.

### My account (on `/account`, any signed-in user)

A user doesn't need an admin to change their own password — `/account`'s
"Change password" form posts to `functions/api/account.js`, which requires
the account's *current* password before setting a new one. It only ever
touches the caller's own account: the username always comes from the
verified session, never from the request body, so there's no way to use
this endpoint to target anyone else's account. Not admin-gated — any role
can use it. An admin's own "Manage users" reset-password button is the
fallback for someone who's actually locked out and can't provide their
current password.

### One-time setup: the first 3 admins

The admin panel needs an admin to already exist before it can create
anyone — so the very first accounts can't come from the panel itself.
`scripts/seed-admins.mjs` handles that, once, from the command line:

```bash
node scripts/seed-admins.mjs julian.wootton@port.ac.uk:choose-a-real-password ben.hunt@port.ac.uk:another-real-password
npx wrangler kv key put --namespace-id=8bd051d983da479d87df405f8e088566 "users" --path=users-seed.json
rm users-seed.json
```

The script hashes each password with the exact same function the app
verifies against, writes the result to `users-seed.json`, and prints the
`wrangler` command to load it — reusing this app's existing `UTM_RECORDS`
KV namespace, no second namespace to create. **Only run this once, before
any accounts exist** — it overwrites the whole `users` key. Every account
after that goes through `/admin`'s "Manage users" section instead.

Also set the one secret this all depends on, never committed:
```bash
npx wrangler pages secret put SESSION_SECRET   # e.g. `openssl rand -hex 32` — long, random, never typed by a person
```
Until it's set, `/login` responds with "Sign-in is not configured yet"
instead of erroring.

**Until both of these are done on the live deployment, nobody can sign in
at all** — the whole site, not just `/admin`, redirects to `/login`. Do
this immediately after (or as part of) deploying this change, ideally
before it goes live.

### Storage

Admin-added dropdown values live in `UTM_RECORDS` under `rules-overrides`,
same as before. Each entry records `value`, `addedBy` (the signed-in
admin's username — a real account now, not a typed name or an email header)
and `addedAt`.

### Not covered

- The existing Playwright suite (`tests/e2e.mjs`) runs against a plain
  static server with no Functions runtime, so it never exercises the
  middleware, login, or `/admin` at all — every one of its 55 checks loads
  pages directly, which only works locally because there's no gate to hit.
  The auth logic itself — `functions/_lib/users.js`'s password hashing and
  verification, `functions/_lib/session.js`'s HMAC sign/verify, and
  `functions/_middleware.js` / `functions/admin/api/users.js`'s
  redirect/401/403 branching (including self-removal and last-admin
  protection) — was verified with standalone Node scripts calling the
  Functions directly against mock `Request`/`env`/KV objects, and the
  Admin page's "Manage users" UI against mocked `fetch` responses. None of
  it has run against a real Cloudflare Pages deployment yet — worth a
  careful first login/add-user/remove-user pass after deploying, ideally
  with a spare test account before touching a real admin's.
- No CSRF hardening beyond `SameSite=Lax` on the session cookie — an
  accepted risk for a small internal tool that isn't meant to be
  internet-facing.
- No password-strength checks beyond a minimum length (8 characters) — an
  admin who sets someone a weak password is trusted to know better, same
  spirit as the rest of this "manual, by hand" model.
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

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
css/styles.css           UoP brand tokens (colors, type, focus states) matching the Page Standards Checker
js/rules.js              MEDIUM_TERM_MAP / TERM_SOURCE_MAP / CAMPAIGN_OPTIONS / CONTENT_OPTIONS, derived from real historical data — swap point for rule data
js/generator.js          UTM construction + per-row evaluation (required fields, defensive re-validation, duplicates)
js/dataAccess.js         list()/append() interface — swap point for the real backend
js/app.js                Builder page wiring: row table, cascading selects, fill-down, bulk-add, confirmation dialog
js/shared-app.js         Shared view wiring: load, filter, CSV export
js/utils.js              escapeHtml, CSV encoding, clipboard, file download, id generation
functions/api/utms.js    Cloudflare Pages Function: GET/POST against KV (only used when BACKEND = 'cloudflare')
wrangler.toml            KV namespace binding
tests/e2e.mjs            Playwright script exercising every Phase 4 test case below (dev-only, not deployed)
.github/workflows/deploy.yml   Auto-deploys to Cloudflare Pages on every push to main
```

## Validation rules — derived from the real UTM tracker export

The three named lookup tabs (`Term Source`, `Default Medium – Term`,
`Campaign name/GA4 medium/content`) were never supplied directly. What was
supplied instead — `JW__CSV_of_UTM_SheetCopy__Paste_of_UTM_Tracker.csv`, the
main tracker tab itself — is better: 8,509 usable real historical rows (out
of 8,565; the rest were incomplete "Please complete all fields" placeholder
rows). `js/rules.js` is now built by reverse-engineering the actual lookup
relationships from that usage data, not by guessing.

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

The two terms that don't carry the prefix are hardcoded exceptions:
`performance-max` (Google Ads campaign type, inherently Paid) and a legacy
bare `affiliate` term (2 rows, both Paid) — the latter is otherwise excluded,
see below.

From there:
- **GA4 Medium → Campaign Term** (`MEDIUM_TERM_MAP`, via `getTermsForMedium`):
  each Medium offers the full set of Terms it was ever used with
  historically (both paid- and organic- prefixed together — there's no
  polarity split to navigate). Options are alphabetical.
- **Campaign Term → Source** (`TERM_SOURCE_MAP`, via `getSourcesForTerm`):
  each Term offers the Sources it was actually used with, alphabetical.
  This list is **not a hard block** — the Source dropdown always includes
  "Other (new source)…", which reveals a free-text field. Well over 100
  distinct Sources already exist and new affiliates/publishers/platforms
  appear regularly, so this needed to keep growing rather than freeze at
  what's in the CSV today.
- **Campaign** (`CAMPAIGN_OPTIONS`) and **Campaign Content**
  (`CONTENT_OPTIONS`) are both flat, alphabetical `<select>` lists —
  **not** gated by Medium, Term, or each other. This is a deliberate
  reversal of an earlier design that gated Content by Campaign+Medium
  together: real usage showed that gating hid valid content values that
  simply hadn't been used with a given campaign+medium pair yet, and the
  correct behaviour is to offer every known value regardless of what else
  is selected. Both also offer "Other (new campaign)…" / "Other (new
  content)…" for values not yet in the list, and Campaign Content's select
  supports native in-browser search/type-ahead given how long the list is.
  **These two lists are currently interim, not the authoritative source**:
  `CAMPAIGN_OPTIONS` has 158 of the real ~280 campaign names, and
  `CONTENT_OPTIONS` has 685 of the real 1,299 content values, both
  reverse-engineered from actual usage in the main tracker CSV rather than
  from the "Campaign name, GA4 medium, content" tab directly (see "Known
  gaps" below).

### Noise excluded

The historical data has real inconsistencies — it's a spreadsheet that
"breaks when users drag-and-drop or copy-paste," per the brief, and that
shows up as small counts of contradictory rows. These were treated as data
errors, not real rules, and dropped:
- `social` medium + `paid-social` term: 2 rows, against 1,894 `organic-social`
  rows under `social` and 408 `paid-social` rows under the dedicated `ppc`
  medium. Paid social is modelled as `ppc` + `paid-social` — the dominant,
  sensible convention — and `social` is Organic-only.
- `push`/`referral` mediums each had exactly 1 row tagged with the unrelated
  term `paid-display` — dropped as clear mis-entries.
- A bare `affiliate` Campaign Term (2 rows, term name identical to the
  medium name) was dropped as an inconsistent entry, not a real category.

A legacy medium value `organic` (30 rows, using `organic-search`/
`organic-email`/`organic-social`) was initially left out of the Medium list
entirely, on the theory that it duplicates what `email`/`social` already
cover. That was a step too far — real GA4 Mediums should stay visible and
selectable regardless of judgement calls about which one is "better," so
`organic` is back in the list with its historical Organic terms attached.

For Campaign Content specifically: a handful of rows had the literal string
`"Content"` as their content value (clearly someone typing into, or pasting
over, the column header) — dropped as obvious noise.

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
- **+ Add row** adds one blank row; **+ Add rows from a list of Page URLs**
  bulk-seeds many rows from pasted URLs (one per line) — this is the bulk
  entry point, replacing the old parallel-textarea paste.
- **Copy row 1's Campaign/Medium/Term/Source/Content to all rows** handles
  the common bulk case (many different Page URLs, one campaign/channel) in
  one click, without which setting Medium/Term/Source/Content on 150 rows by
  hand would be impractical.
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
  rules" — implemented as a strong default (pick from the real historical
  list per Term) with an explicit "Other" escape hatch, rather than a hard
  block, since new affiliates/publishers/platforms appear constantly.
  Campaign and Campaign Content go further: they are **not** filtered by
  anything else (not Medium, not each other) — every known value is always
  offered, with "Other" for anything not yet listed. Blocking any of these
  outright would make the tool unable to record a genuinely new
  affiliate/publisher/campaign/content variant on day one of using it.
- **`CAMPAIGN_OPTIONS` and `CONTENT_OPTIONS` are still interim, not the
  authoritative lists.** See "Known gaps — pending real tab data" below.
- Everything else follows the brief and the follow-up direction as given.

## Known gaps — pending real tab data

Everything in `js/rules.js` was reverse-engineered from actual *usage* in
the main tracker CSV export (8,509 rows), not from the three lookup tabs
that actually define what's *permitted* (`Default Medium – Term`,
`Term Source`, `Campaign name, GA4 medium, content`). Usage under-represents
permitted combinations — a valid Medium→Term or Term→Source pairing that
simply was never used in those 8,509 rows won't show up. Specific,
confirmed gaps as of this round:

- **Campaign Term is confirmed incomplete for some Mediums.** `referral`
  should also offer `organic-digital-publishing` and `organic-news`, and
  `ppc` should offer `demand-gen` as a Term (not just as a Source) alongside
  `paid-display, paid-search, paid-social, paid-video, pmax` — `pmax` is the
  correct Term name, not `performance-max`. These were **not** applied yet:
  adding a Term with no defined Source list would leave its Source dropdown
  empty, which is worse than the current known-incomplete state. Applying
  them correctly needs the real `Default Medium – Term` and `Term Source`
  tab exports.
- **Source is corrected for `paid-display` only.** The 26-item list for
  `ppc` + `paid-display` has been fixed to match exactly. Other Term→Source
  pairs have not been individually re-checked against the real `Term Source`
  tab and may be similarly incomplete.
- **`CAMPAIGN_OPTIONS` has 158 of the real ~280 campaign names** — the
  "Campaign name, GA4 medium, content" tab's Column A (cells A2–A292) is the
  authoritative source and hasn't been supplied.
- **`CONTENT_OPTIONS` has 685 of the real 1,299 content values** — the same
  tab's Column C (cells C2–C1299) is the authoritative source and hasn't
  been supplied.

To close these out completely, this tool needs: the full `Default Medium –
Term` tab, the full `Term Source` tab, and the "Campaign name, GA4 medium,
content" tab's Column A and Column C in full.

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
- Picking a Term narrows Source to its real historical list, alphabetically
  ordered, plus "Other"; `ppc` + `paid-display` returns the full corrected
  26-item Source list.
- Campaign Content is a flat, alphabetically-ordered `<select>` that is
  identical regardless of which Campaign or Medium is selected (not gated
  by either), plus "Other".
- A valid row generates a UTM matching the confirmed real param
  order/casing exactly.
- Choosing "Other" for Campaign, Source, and Campaign Content all accept a
  brand-new value un-blocked.
- A row missing Page URL, or missing Campaign Content, is blocked with a
  named inline error.
- Bulk-add from pasted URLs creates one row per line; fill-down correctly
  copies Campaign/Medium/Term/Source/Content to every other row.
- A 150-row batch (bulk-add + fill-down) generates all 150 rows, all valid.
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
- The excluded "noise" rows (small contradictory counts, see above) were
  judgement calls from usage patterns, not confirmation from whoever owns
  the actual sheet logic — worth a sanity check with them.
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

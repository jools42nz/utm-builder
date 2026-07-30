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
shared view there is still the `localStorage` mock (see "Turning on the real
shared view" below).

1. `npx wrangler login` (once per machine).
2. `npx wrangler kv namespace create UTM_RECORDS`, then paste the returned id
   into `wrangler.toml`'s `[[kv_namespaces]] id = "..."` (already done for the
   live deploy above — namespace exists, just unused until step 3).
3. In `js/dataAccess.js`, change `const BACKEND = 'mock'` to `'cloudflare'`.
   This is the single-file swap the data-access layer exists for — nothing
   else in the app needs to change.
4. `npx wrangler pages deploy . --project-name=utm-builder`

`functions/api/utms.js` is the Pages Function backing `GET /api/utms` (list)
and `POST /api/utms` (append) against the KV namespace.

## File structure

```
index.html              Builder page: batch details + a repeatable row table (1 row = 1 UTM)
shared.html              Shared view: searchable/filterable list of confirmed UTMs
css/styles.css           UoP brand tokens (colors, type, focus states) matching the Page Standards Checker
js/rules.js              MEDIUM_TERM_MAP / TERM_SOURCE_MAP, derived from real historical data — swap point for rule data
js/generator.js          UTM construction + per-row evaluation (required fields, defensive re-validation, duplicates)
js/dataAccess.js         list()/append() interface — swap point for the real backend
js/app.js                Builder page wiring: row table, cascading selects, fill-down, bulk-add, confirmation dialog
js/shared-app.js         Shared view wiring: load, filter, CSV export
js/utils.js              escapeHtml, CSV encoding, clipboard, file download, id generation
functions/api/utms.js    Cloudflare Pages Function: GET/POST against KV (only used when BACKEND = 'cloudflare')
wrangler.toml            KV namespace binding
tests/e2e.mjs            Playwright script exercising every Phase 4 test case below (dev-only, not deployed)
```

## Validation rules — derived from the real UTM tracker export

The three named lookup tabs (`Term Source`, `Default Medium – Term`,
`Campaign name/GA4 medium/content`) were never supplied directly. What was
supplied instead — `JW__CSV_of_UTM_SheetCopy__Paste_of_UTM_Tracker.csv`, the
main tracker tab itself — is better: 8,509 usable real historical rows (out
of 8,565; the rest were incomplete "Please complete all fields" placeholder
rows). `js/rules.js` is now built by reverse-engineering the actual lookup
relationships from that usage data, not by guessing.

### The core mechanism

Campaign Term values are themselves prefixed `paid-` or `organic-`
(`organic-email`, `paid-search`, etc.) — **that prefix is what enforces
Paid/Organic**, not a separate lookup table. Confirmed by checking every
term's actual Paid/Organic column value across the dataset: e.g. every
`paid-search` row we could attribute is `Paid` (589 explicit, 254 blank),
every `organic-email` row is `Organic` or blank, with no contradictions.
Two terms don't carry the prefix and were hardcoded as exceptions:
`performance-max` (Google Ads campaign type, inherently Paid) and a legacy
bare `affiliate` term (2 rows, both Paid) — the latter is otherwise excluded,
see below.

From there:
- **GA4 Medium → Campaign Term** (`MEDIUM_TERM_MAP`): each Medium only
  offers the Terms it was actually used with historically, split into a
  `Paid` and/or `Organic` bucket. A Medium with no historical rows of a
  given polarity doesn't offer that polarity at all — e.g. `ppc` has never
  been used for an Organic term, so Organic batches don't offer `ppc` as a
  Medium option.
- **Campaign Term → Source** (`TERM_SOURCE_MAP`): each Term offers the
  Sources it was actually used with, most-used first. This list is **not
  a hard block** — the Source dropdown always includes "Other (new
  source)…", which reveals a free-text field. 146 distinct Sources already
  exist and new affiliates/publishers/platforms appear regularly, so this
  needed to keep growing rather than freeze at what's in the CSV today.
- **Campaign** is free text with autocomplete suggestions (`KNOWN_CAMPAIGNS`,
  158 historical names) but no validation — 158 distinct campaign names with
  new ones created constantly is not a fixed vocabulary, so nothing here
  gates it.

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
- A legacy medium value `organic` (30 rows, using `organic-search`/
  `organic-email`/`organic-social`) is **excluded from the Medium list
  entirely** going forward. It duplicates what the dedicated `email`/`social`
  mediums already cover and looks like a superseded pattern from before those
  became separate mediums — keeping it would let users create the exact
  ambiguity ("which medium is this really?") this tool exists to prevent.
- A bare `affiliate` Campaign Term (2 rows, term name identical to the
  medium name) was dropped as an inconsistent entry, not a real category.

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
design entirely, per explicit direction: Medium, Campaign Term and Source
are `<select>` elements that filter each other live, so an invalid
combination is structurally unreachable rather than merely flagged after
the fact. One row is one UTM; the single-UTM and bulk paths are the same
form and the same code path — a "batch" of one row is just the single-UTM
case.

- **Paid/Organic** (batch-level) narrows the **GA4 Medium** options offered
  in every row.
- Picking a row's **Medium** narrows its **Campaign Term** options.
- Picking a row's **Campaign Term** narrows its **Source** options (plus
  "Other").
- **+ Add row** adds one blank row; **+ Add rows from a list of Page URLs**
  bulk-seeds many rows from pasted URLs (one per line) — this is the bulk
  entry point, replacing the old parallel-textarea paste.
- **Copy row 1's Campaign/Medium/Term/Source/Content to all rows** handles
  the common bulk case (many different Page URLs, one campaign/channel) in
  one click, without which setting Medium/Term/Source on 150 rows by hand
  would be impractical.
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
- **Source is guided, not gated.** The field notes say Source "must respect
  Term/Medium rules" — implemented as a strong default (pick from the real
  historical list for that Term) with an explicit "Other" escape hatch,
  rather than a hard block. Blocking outright would make the tool unable to
  record a genuinely new affiliate/publisher/platform on day one of using
  it, which happens often enough in the real data (146 distinct Sources
  already) that a closed list would fight the tool's own purpose.
- Everything else follows the brief and the follow-up direction as given.

## Handover checklist against the brief's Definition of Done

1. ✅ Field labels/order match the spreadsheet's wording exactly.
2. ✅ No invalid Paid/Organic → Medium → Term combination can be produced —
   structurally, via the cascading selects, not just flagged after entry.
3. ✅ Verified: a 150-row batch generates all 150 rows without loss.
4. ✅ Verified: the confirmation text is exact, and Cancel writes nothing.
5. ✅ Confirmed UTMs appear in the shared view immediately (no reload/extra step).
6. ✅ Shared view is searchable (free text) and filterable (Set Up By, Campaign, Date, Paid/Organic).
7. ✅ Verified via a keyboard-only Playwright pass. Not independently verified
   with a real screen reader (VoiceOver/NVDA) — ARIA roles/labels/live-regions
   are in place but that's not a substitute for an actual AT pass.
8. ✅ Deployable as a static site; data access isolated behind `js/dataAccess.js`.
9. ✅ This section, plus "Validation rules" above.

## Phase 4 — verification

Automated Playwright pass against a local static server (`tests/e2e.mjs`,
24/24 checks passing):

- Organic hides Paid-only Mediums (`ppc`, `affiliate`, `audio`); Paid hides
  Organic-only Mediums (`social`, `video`, `referral`).
- Picking `email` under Paid only offers the `paid-email` Term; its Source
  list is the real historical one for that Term.
- A valid row generates a UTM matching the confirmed real param
  order/casing exactly.
- Choosing "Other" for Source accepts a brand-new value un-blocked.
- A row missing Page URL is blocked with a named inline error.
- Bulk-add from pasted URLs creates one row per line; fill-down correctly
  copies Medium/Term/Source/Content to every other row.
- A 150-row batch (bulk-add + fill-down) generates all 150 rows, all valid.
- Within-batch duplicates are flagged; a row matching the shared view is
  flagged "Already exists in the shared view."
- Cancel leaves `localStorage` untouched; the confirmation text matches
  exactly, character for character.
- Remove is disabled at 1 remaining row.
- Keyboard-only pass: skip link first, dialog traps focus, Escape closes
  without writing, focus returns to the opener.
- Shared view: a confirmed UTM appears without a manual refresh.

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

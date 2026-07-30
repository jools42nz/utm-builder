import { validateRow } from './rules.js';

export const ROW_FIELD_KEYS = ['pageUrl', 'campaign', 'gaMedium', 'campaignTerm', 'source', 'campaignContent'];

export const FIELD_LABELS = {
  pageUrl: 'Page URL',
  campaign: 'Campaign',
  gaMedium: 'GA4 Medium',
  campaignTerm: 'Campaign Term',
  source: 'Source',
  campaignContent: 'Campaign Content',
};

// Real order confirmed from the historical "Tracked URL" column:
// utm_campaign, utm_medium, utm_source, utm_term, utm_content.
const UTM_PARAM_ORDER = ['campaign', 'medium', 'source', 'term', 'content'];
const UTM_PARAM_KEYS = {
  campaign: 'utm_campaign',
  medium: 'utm_medium',
  source: 'utm_source',
  term: 'utm_term',
  content: 'utm_content',
};

/**
 * Builds the final UTM URL for a row. Values are used exactly as entered —
 * the historical data preserves mixed case (e.g. "Thinkpostgrad") rather
 * than forcing lowercase, so this doesn't either. Any pre-existing utm_*
 * params on the Page URL are stripped first. Uses the URL API's normal
 * query-string handling, which correctly uses "&" (not a second "?") when
 * the Page URL already has a query string, and percent-encodes special
 * characters (including spaces) — the legacy spreadsheet formula did
 * neither, producing occasional malformed URLs; this deliberately doesn't
 * reproduce those two bugs. See README for that call-out.
 */
export function buildUtmUrl(pageUrl, row) {
  let url;
  try {
    url = new URL(pageUrl);
  } catch {
    return { error: `"${pageUrl}" is not a valid absolute URL — it must start with http:// or https://.` };
  }

  for (const key of Object.values(UTM_PARAM_KEYS)) {
    url.searchParams.delete(key);
  }

  const values = {
    campaign: row.campaign,
    medium: row.gaMedium,
    source: row.source,
    term: row.campaignTerm,
    content: row.campaignContent,
  };
  for (const key of UTM_PARAM_ORDER) {
    const value = values[key];
    if (value) url.searchParams.set(UTM_PARAM_KEYS[key], value);
  }

  return { url: url.toString() };
}

function checkRequiredFields(row) {
  const errors = [];
  for (const key of ROW_FIELD_KEYS) {
    if (!row[key] || !row[key].trim()) {
      errors.push({ field: key, message: `${FIELD_LABELS[key]} is required.` });
    }
  }
  return errors;
}

/**
 * Evaluates one row: required-field check, the Medium -> Term defensive
 * re-check (belt-and-braces — the cascading selects should already prevent
 * this), UTM construction, and duplicate flagging against both earlier
 * rows in this batch and the shared view's existing records.
 */
export function evaluateRow(row, seenInBatch, existingSet) {
  const requiredErrors = checkRequiredFields(row);
  if (requiredErrors.length > 0) {
    return { row, errors: requiredErrors, utm: null, isDuplicate: false, duplicateReason: null };
  }

  const ruleErrors = validateRow({ gaMedium: row.gaMedium, campaignTerm: row.campaignTerm });
  const built = buildUtmUrl(row.pageUrl, row);
  const errors = [...ruleErrors];
  if (built.error) errors.push({ field: 'pageUrl', message: built.error });

  const utm = built.url || null;
  let isDuplicate = false;
  let duplicateReason = null;

  if (utm && errors.length === 0) {
    if (seenInBatch.has(utm)) {
      isDuplicate = true;
      duplicateReason = `Same as row ${seenInBatch.get(utm) + 1} in this batch.`;
    } else if (existingSet.has(utm)) {
      isDuplicate = true;
      duplicateReason = 'Already exists in the shared view.';
    }
  }

  return { row, errors, utm, isDuplicate, duplicateReason };
}

/** Evaluates every row in the batch, tracking duplicates across the whole set. */
export function generateBatch(rows, existingUtms = []) {
  const seenInBatch = new Map();
  const existingSet = new Set(existingUtms);

  const results = rows.map((row, index) => {
    const result = evaluateRow(row, seenInBatch, existingSet);
    if (result.utm && result.errors.length === 0 && !seenInBatch.has(result.utm)) {
      seenInBatch.set(result.utm, index);
    }
    return { index, ...result };
  });

  return { results };
}

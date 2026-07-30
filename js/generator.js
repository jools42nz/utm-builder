import { validateRow } from './rules.js';

export const FIELD_KEYS = ['pageUrl', 'campaign', 'gaMedium', 'campaignTerm', 'source', 'campaignContent'];

export const FIELD_LABELS = {
  pageUrl: 'Page URL',
  campaign: 'Campaign',
  gaMedium: 'GA4 Medium',
  campaignTerm: 'Campaign Term',
  source: 'Source',
  campaignContent: 'Campaign Content',
};

const UTM_PARAM_ORDER = ['source', 'medium', 'campaign', 'term', 'content'];
const UTM_PARAM_KEYS = {
  source: 'utm_source',
  medium: 'utm_medium',
  campaign: 'utm_campaign',
  term: 'utm_term',
  content: 'utm_content',
};

/**
 * Splits each field's raw textarea value into trimmed, non-blank lines.
 * Returns the parsed lines per field plus a count of blank lines dropped,
 * so the caller can report silently-dropped input.
 */
export function parseFields(rawFields) {
  const lines = {};
  const blankLinesDropped = {};
  for (const key of FIELD_KEYS) {
    const allLines = (rawFields[key] || '').split('\n').map((l) => l.trim());
    const nonBlank = allLines.filter((l) => l.length > 0);
    lines[key] = nonBlank;
    blankLinesDropped[key] = allLines.length - nonBlank.length;
  }
  return { lines, blankLinesDropped };
}

/**
 * Checks that every field's line count either matches the batch's row count
 * (the max across all fields) or is exactly 1 (broadcast to every row), or
 * is 0 (reported as a "required" error, not a count-mismatch error).
 * Returns {rowCount, countErrors} — countErrors is empty when generation
 * can proceed.
 */
export function checkRowCounts(lines) {
  const counts = FIELD_KEYS.map((key) => lines[key].length);
  const rowCount = Math.max(...counts, 0);
  const countErrors = [];

  for (const key of FIELD_KEYS) {
    const count = lines[key].length;
    if (count === 0) {
      countErrors.push({ field: key, message: `${FIELD_LABELS[key]} is required — add at least one value.` });
    } else if (count !== 1 && count !== rowCount) {
      countErrors.push({
        field: key,
        message: `${FIELD_LABELS[key]} has ${count} line(s) but this batch needs ${rowCount} (or exactly 1, to use the same value for every row).`,
      });
    }
  }

  return { rowCount, countErrors };
}

/** Broadcasts single-value fields across rowCount rows; other fields pass through unchanged. */
export function buildRows(lines, rowCount) {
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    const row = {};
    for (const key of FIELD_KEYS) {
      row[key] = lines[key].length === 1 ? lines[key][0] : lines[key][i];
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Builds the final UTM URL for a row. Removes any pre-existing utm_* params
 * from the Page URL before applying the new ones, so a pasted URL that
 * already carries UTMs doesn't end up with duplicates.
 *
 * PLACEHOLDER construction rules (real spreadsheet rules not supplied yet):
 * standard GA4 param order (source, medium, campaign, term, content),
 * values lowercased, encoded via the URL API's standard query encoding.
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
    source: row.source,
    medium: row.gaMedium,
    campaign: row.campaign,
    term: row.campaignTerm,
    content: row.campaignContent,
  };
  for (const key of UTM_PARAM_ORDER) {
    const value = values[key];
    if (value) url.searchParams.set(UTM_PARAM_KEYS[key], value.toLowerCase());
  }

  return { url: url.toString() };
}

/**
 * Runs the full batch: parses fields, checks row-count alignment, validates
 * the Paid/Organic → Medium → Term → Source → Campaign chain per row, builds
 * UTM URLs for valid rows, and flags duplicates (both within this batch and
 * against already-confirmed records passed in `existingUtms`).
 *
 * Returns {ok, formErrors, blankLinesDropped, rowCount, results} where
 * `ok` is false if the batch couldn't be generated at all (count mismatch),
 * and `results` is an array of per-row {index, row, errors, utm, isDuplicate, duplicateReason}.
 */
export function generateBatch(rawFields, batch, existingUtms = []) {
  const { lines, blankLinesDropped } = parseFields(rawFields);
  const { rowCount, countErrors } = checkRowCounts(lines);

  if (countErrors.length > 0) {
    return { ok: false, formErrors: countErrors, blankLinesDropped, rowCount, results: [] };
  }

  const rows = buildRows(lines, rowCount);
  const seenInBatch = new Map();
  const existingSet = new Set(existingUtms);

  const results = rows.map((row, index) => {
    const ruleErrors = validateRow({ paidOrganic: batch.paidOrganic, ...row });
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
      if (!seenInBatch.has(utm)) seenInBatch.set(utm, index);
    }

    return { index, row, errors, utm, isDuplicate, duplicateReason };
  });

  return { ok: true, formErrors: [], blankLinesDropped, rowCount, results };
}

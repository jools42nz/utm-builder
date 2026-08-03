/**
 * Merges admin-added dropdown values (see admin.html / functions/admin/api/rules.js)
 * on top of js/rules.js's static lists. Swap point for the builder's Campaign,
 * Source and Campaign Content options — everything else in js/rules.js
 * (Medium, Term, validateRow) is unaffected and re-exported as-is.
 */
import { MEDIUM_OPTIONS, TERM_OPTIONS, CAMPAIGN_OPTIONS, CONTENT_OPTIONS, getTermsForMedium, getSourcesForTerm as getBaseSourcesForTerm, validateRow } from './rules.js';

export { MEDIUM_OPTIONS, TERM_OPTIONS, getTermsForMedium, validateRow };

function alphaSort(list) {
  return [...list].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

let extraCampaigns = [];
let extraContent = [];
let extraSourcesByTerm = {};

/** Fetches admin-added values once at startup. Fails silently (base lists only) with no backend — e.g. local dev without `wrangler pages dev`. */
export async function loadRuleOverrides() {
  try {
    const res = await fetch('/api/rules-overrides');
    if (!res.ok) return;
    const overrides = await res.json();
    extraCampaigns = overrides.campaigns || [];
    extraContent = overrides.content || [];
    extraSourcesByTerm = overrides.sources || {};
  } catch (err) {
    console.warn('Could not load admin rule overrides — using the base rule lists only:', err);
  }
}

export function getCampaignOptions() {
  return alphaSort([...new Set([...CAMPAIGN_OPTIONS, ...extraCampaigns])]);
}

export function getContentOptions() {
  return alphaSort([...new Set([...CONTENT_OPTIONS, ...extraContent])]);
}

export function getSourcesForTerm(term) {
  return alphaSort([...new Set([...getBaseSourcesForTerm(term), ...(extraSourcesByTerm[term] || [])])]);
}

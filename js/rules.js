/**
 * Validation rule data, mirroring the UTM tracker spreadsheet's three lookup
 * tabs: "Term Source", "Default Medium – Term", and
 * "Campaign name, GA4 medium, content".
 *
 * MOCK DATA — the real spreadsheet exports have not been supplied yet.
 * Every value below is a placeholder. Replace the four exported constants
 * with the real lookups and the rest of the app needs no changes — this
 * file is the single swap point for the rule set.
 *
 * Inferred structure (not confirmed against the sheet — see README "Handover"):
 * - MEDIUM_BY_PAID_ORGANIC: which GA4 Mediums belong to Paid vs Organic.
 *   Inferred from the brief's own example ("a paid campaign cannot carry an
 *   organic-only term") — the sheet doesn't name a tab for this, so this is
 *   an assumption, not a direct copy of a tab.
 * - TERM_RULES_BY_MEDIUM: the "Default Medium – Term" tab — for each
 *   Medium, which Campaign Terms are valid, and a default.
 * - SOURCE_RULES_BY_TERM: the "Term Source" tab — for each Campaign Term,
 *   which Sources are valid.
 * - CAMPAIGN_RULES: the "Campaign name, GA4 medium, content" tab — for a
 *   known Campaign name, which Mediums and Content values are permitted.
 *   Campaigns not listed here are unrestricted by this tab (permissive
 *   default), since most campaigns won't be pre-registered.
 */

export const PAID_ORGANIC_OPTIONS = ['Paid', 'Organic'];

export const MEDIUM_BY_PAID_ORGANIC = {
  Paid: ['cpc', 'paid-social', 'display', 'video'],
  Organic: ['organic-social', 'email', 'referral', 'organic'],
};

export const TERM_RULES_BY_MEDIUM = {
  cpc: { allowedTerms: ['brand', 'nonbrand', 'competitor'], defaultTerm: 'nonbrand' },
  'paid-social': { allowedTerms: ['awareness', 'engagement', 'conversion'], defaultTerm: 'awareness' },
  display: { allowedTerms: ['retargeting', 'prospecting'], defaultTerm: 'prospecting' },
  video: { allowedTerms: ['preroll-retargeting', 'preroll-prospecting'], defaultTerm: 'preroll-prospecting' },
  'organic-social': { allowedTerms: ['none'], defaultTerm: 'none' },
  email: { allowedTerms: ['newsletter', 'nurture'], defaultTerm: 'newsletter' },
  referral: { allowedTerms: ['partner'], defaultTerm: 'partner' },
  organic: { allowedTerms: ['none'], defaultTerm: 'none' },
};

export const SOURCE_RULES_BY_TERM = {
  brand: ['google', 'bing'],
  nonbrand: ['google', 'bing'],
  competitor: ['google'],
  awareness: ['facebook', 'instagram', 'linkedin', 'tiktok'],
  engagement: ['facebook', 'instagram', 'linkedin'],
  conversion: ['facebook', 'instagram'],
  retargeting: ['google-display', 'meta-audience-network'],
  prospecting: ['google-display'],
  'preroll-retargeting': ['youtube'],
  'preroll-prospecting': ['youtube'],
  none: ['facebook', 'instagram', 'linkedin', 'tiktok', 'organic-search', 'direct'],
  newsletter: ['crm', 'mailchimp'],
  nurture: ['crm', 'mailchimp'],
  partner: ['partner-site'],
};

export const CAMPAIGN_RULES = {
  // Example of a pre-registered campaign restricting its own mediums/content.
  // Campaign names not listed here are unrestricted by this tab.
  'open-day-2026': {
    allowedMediums: ['cpc', 'paid-social', 'email'],
    allowedContent: ['hero-banner', 'text-link', 'carousel'],
  },
};

/**
 * Validates one row's Paid/Organic → Medium → Term → Source → Campaign
 * chain. Returns an array of {field, message} errors; empty if valid.
 * `field` matches the six textarea field keys used throughout the app:
 * pageUrl, campaign, gaMedium, campaignTerm, source, campaignContent.
 */
export function validateRow({ paidOrganic, campaign, gaMedium, campaignTerm, source, campaignContent }) {
  const errors = [];

  const alignedMediums = MEDIUM_BY_PAID_ORGANIC[paidOrganic] || [];
  if (!alignedMediums.includes(gaMedium)) {
    errors.push({
      field: 'gaMedium',
      message: `"${gaMedium}" is not a valid GA4 Medium for ${paidOrganic}. Allowed: ${alignedMediums.join(', ')}.`,
    });
  }

  const mediumRule = TERM_RULES_BY_MEDIUM[gaMedium];
  if (!mediumRule) {
    errors.push({
      field: 'gaMedium',
      message: `"${gaMedium}" is not a recognised GA4 Medium. Allowed: ${Object.keys(TERM_RULES_BY_MEDIUM).join(', ')}.`,
    });
  } else if (!mediumRule.allowedTerms.includes(campaignTerm)) {
    errors.push({
      field: 'campaignTerm',
      message: `"${campaignTerm}" is not a valid Campaign Term for medium "${gaMedium}". Allowed: ${mediumRule.allowedTerms.join(', ')}.`,
    });
  }

  const allowedSources = SOURCE_RULES_BY_TERM[campaignTerm];
  if (!allowedSources) {
    errors.push({
      field: 'campaignTerm',
      message: `"${campaignTerm}" is not a recognised Campaign Term, so no Source rule applies.`,
    });
  } else if (!allowedSources.includes(source)) {
    errors.push({
      field: 'source',
      message: `"${source}" is not a valid Source for term "${campaignTerm}". Allowed: ${allowedSources.join(', ')}.`,
    });
  }

  const campaignRule = CAMPAIGN_RULES[campaign];
  if (campaignRule) {
    if (campaignRule.allowedMediums && !campaignRule.allowedMediums.includes(gaMedium)) {
      errors.push({
        field: 'gaMedium',
        message: `Campaign "${campaign}" only allows medium(s): ${campaignRule.allowedMediums.join(', ')}.`,
      });
    }
    if (campaignRule.allowedContent && campaignContent && !campaignRule.allowedContent.includes(campaignContent)) {
      errors.push({
        field: 'campaignContent',
        message: `Campaign "${campaign}" only allows content value(s): ${campaignRule.allowedContent.join(', ')}.`,
      });
    }
  }

  return errors;
}

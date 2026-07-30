/**
 * Validation rule data, derived from the real UTM tracker export
 * ("JW__CSV_of_UTM_SheetCopy__Paste_of_UTM_Tracker.csv" — 8,509 usable
 * historical rows out of 8,565, after dropping incomplete "Please complete
 * all fields" placeholder rows).
 *
 * The three named lookup tabs (Term Source, Default Medium – Term,
 * Campaign name/GA4 medium/content) were not supplied directly — this data
 * is reverse-engineered from actual historical usage instead. See the
 * "Validation rules" section of README.md for exactly what was included,
 * excluded as noise, and inferred outright.
 *
 * The core mechanism confirmed against the data: Campaign Term names are
 * themselves prefixed "paid-" or "organic-" (e.g. "organic-email",
 * "paid-search") — that prefix, not a separate lookup, is what enforces
 * Paid/Organic. Each GA4 Medium only supports the Terms it was actually
 * used with historically, split by that prefix; each Term only supports
 * the Sources it was actually used with. Two terms without a prefix
 * ("performance-max", legacy bare "affiliate") are hardcoded exceptions
 * documented below.
 */

// medium -> { Paid: [...terms], Organic: [...terms] }. Every GA4 Medium is
// always selectable — Paid/Organic never hides a Medium, it only narrows
// which Campaign Terms are offered for it (a missing bucket here means that
// medium has no historical Terms of that polarity, so the Term dropdown
// will be empty/disabled rather than the Medium itself being unavailable).
export const MEDIUM_TERM_MAP = {
  email: { Paid: ['paid-email'], Organic: ['organic-email'] },
  social: { Organic: ['organic-social'] },
  organic: { Organic: ['organic-search', 'organic-email', 'organic-social'] },
  ppc: { Paid: ['paid-search', 'paid-social', 'paid-display', 'paid-video', 'performance-max'] },
  affiliate: { Paid: ['paid-3rd-party-website', 'paid-news', 'paid-digital-publishing', 'paid-3rd-party-virtual-event', 'paid-web-forum'] },
  print: { Paid: ['paid-print', 'paid-outofhome'], Organic: ['organic-print', 'organic-out-of-home'] },
  video: { Organic: ['organic-video'] },
  referral: { Organic: ['organic-3rd-party-website', 'organic-web-forum', 'organic-3rd-party-virtual-event'] },
  sms: { Paid: ['paid-whatsapp', 'paid-sms'], Organic: ['organic-sms'] },
  push: { Paid: ['paid-push-notification'], Organic: ['organic-push-notification'] },
  audio: { Paid: ['paid-audio'] },
};

// term -> [...sources], most-used first. Not treated as a closed list in
// the UI — Source also offers "Other (new source)" since new affiliates,
// publishers and platforms appear regularly and shouldn't be blocked.
export const TERM_SOURCE_MAP = {
  'paid-email': ['think-pg', 'careers-development-institute', 'uk-uni-search', 'reed', 'uni-taster-days', 'prospects', 'studyportals', 'sprint-education', 'the-student-room', 'pfc', 'ucas', 'unicompare', 'findaphd', 'uni-frog', 'total-jobs', 'jobs-ac-uk'],
  'organic-email': ['staff-newsletter', 'student-newsletter', 'one-off-email', 'global-enquiry-nurture', 'rao-subject-nurture', 'bonjoro', 'alumni-email', 'pg-nurture-applicant', 'pg-nurture-fast-track', 'alumni-newsletter', 'sport-nurture-enquirer', 'pg-nurture-event', 'ug-nurture-aed', 'rao-he-advisers-nurture', 'staff-email-signature', 'pg-nurture-enquirer', 'ug-nurture-influencer', 'student-enewsletter', 'uni-taster-days', 'rao-pre16-nurture', 'rao-post16-nurture', 'admissions', 'ug-nurture-offerholder', 'ug-ucas-journey', 'clearing-nurture', 'sprint-education', 'alumni-one-off-email', 'ug-nurture-open-day', 'rao-post16-acquisition', 'linkedin', 'rao-he-advisers-conference'],
  'organic-social': ['instagram', 'linkedin', 'facebook', 'twitter', 'unibuddy', 'linktree', 'tiktok', 'the-student-room', 'direct-message', 'you-tube', 'discord', 'staff-share'],
  'paid-social': ['meta', 'tiktok', 'linkedin', 'facebook-and-instagram', 'facebook', 'snapchat', 'unicompare', 'idp', 'instagram', 'prospects', 'studyportals', 'quantcast'],
  'paid-search': ['google', 'bing', 'performance-max', 'pmax', 'demand-gen', 'chatgpt'],
  'paid-display': ['idp', 'pmax', 'quantcast', 'studyportals', 'demand-gen', 'picnic', 'NHS_app', 'programmatic', 'unicompare', 'uni_open_days', 'uni-frog', 'pearson', 'ucas', 'fone-media', 'amazon', 'open-days-com', 'google', 'cohort', 'findamasters'],
  'paid-video': ['you-tube', 'itvx', 'disney', 'prime'],
  'performance-max': ['pmax'],
  'paid-3rd-party-website': ['masterscompare', 'Thinkpostgrad', 'complete-university-guide', 'whatuni-cug', 'uni-frog', 'findamasters', 'prospects', 'unicompare', 'findaphd', 'uni-taster-days', 'postgraduatestudentships', 'idp', 'postgraduatesearch', 'open-days-com', 'postgrad-com', 'what-uni', 'idp-hotcourses', 'jobs-ac-uk', 'study-international', 'Coursefindr', 'masters-portal', 'uk-uni-search', 'Politics-Home', 'study-portals', 'biomedical-scientist', 'ucas'],
  'paid-news': ['qa-magazine', 'pfc', 'the-guardian', 'navy-news', 'portsmouth-visitor-guide'],
  'paid-digital-publishing': ['National World', 'venatus-premium-takeover', 'venatus-reward-video', 'venatus-billboard'],
  'paid-3rd-party-virtual-event': ['uni-frog'],
  'paid-web-forum': ['the-student-room'],
  'organic-print': ['course-postcard', 'prospectus', 'course-guide', 'postcard', 'pull-up-banner', 'poster', 'course-leaflet', 'letter', 'brochure', 'graduation-programme', 'visit-day-guide', 'research-degrees-brochure', 'rao-schools-guide', 'advisers-poster', 'uni_open_days'],
  'paid-print': ['lyme-regis-fossil-festival', 'southsea-lifestyle', 'national-world-portsmouth', 'national-world-south', 'national-world-north', 'pfc', 'find-a-uni-guide', 'south-hampshire-college-group'],
  'paid-outofhome': ['6-sheet', 'billboards', '48-sheet', 'phone-kiosk'],
  'organic-out-of-home': ['applicant-experience-day-brochure'],
  'organic-video': ['you-tube', 'campus-plasma-screen', 'campus-computer-background'],
  'organic-3rd-party-website': ['qs-top-universities', 'uk-uni-search', 'uni-frog', 'uni-taster-days', 'ucas', 'tsr', 'study-link', 'unicompare', 'Springpod', 'student-crowd', 'QS Top Universities'],
  'organic-web-forum': ['the-student-room'],
  'organic-3rd-party-virtual-event': ['open-day', 'Vepple'],
  'paid-whatsapp': ['purlos'],
  'paid-sms': ['unicompare', 'ucas'],
  'organic-sms': ['one-off-sms', 'pg-nurture-event', 'ug-nurture-applicant', 'ug-nurture-aed'],
  'paid-push-notification': ['unicompare', 'studyportals', 'uni-frog'],
  'organic-push-notification': ['rao-post16-acquisition', 'cambridge_education_group'],
  'paid-audio': ['radio', 'spotify'],
};

// Campaign names are free text (158 distinct historical values with no
// fixed vocabulary — new ones are created constantly, which is the whole
// point of the tool). This list only powers autocomplete suggestions, not
// validation, to help avoid accidental near-duplicate campaign names.
export const KNOWN_CAMPAIGNS = ['E17-degree', 'UG2025_CCI', 'UG2025_HSS', 'alumni-birthday-card', 'alumni-blogs', 'alumni-emails', 'alumni-event', 'alumni-fast-track', 'alumni-fundraising-futures-fund', 'alumni-graduation', 'alumni-postgraduate-promo', 'alumni-uop-social', 'alumni-update-details', 'bal-current-students', 'bal-socials', 'brand-uop', 'brand-uop-pfc', 'brand-uop-solve', 'degree-guides', 'global-partner', 'global2023-uop-jan-start', 'global2023-uop-main-cycle', 'global2024-uop-jan-start', 'global2024-uop-main-cycle', 'global2025-hss', 'global2025-uop-main-cycle', 'global2026-hss', 'global2026-uop-Jan-start', 'global2026-uop-main-cycle', 'global2026-uop-may-start', 'hss-socials', 'innovation-connect', 'internal-comms-staff', 'internal-comms-student', 'internal-comms-student-welcome-2024', 'new-course', 'pg2023-cci', 'pg2023-hss', 'pg2023-sah', 'pg2023-tec', 'pg2023-uop', 'pg2023-uop-jan-start', 'pg2023-uop-main-cycle', 'pg2023-uop-open-eve', 'pg2023-uop-pgr', 'pg2023-uop-pgr-bursaries', 'pg2024-alumni-uop-open-eve', 'pg2024-bal', 'pg2024-hss', 'pg2024-sah', 'pg2024-uop', 'pg2024-uop-bursaries', 'pg2024-uop-jan-start', 'pg2024-uop-main-cycle', 'pg2024-uop-open-eve', 'pg2024-uop-pgr', 'pg2024-uop-pgr-bursaries', 'pg2025', 'pg2025-bal', 'pg2025-cci', 'pg2025-hss', 'pg2025-sah', 'pg2025-uop', 'pg2025-uop-fast-track', 'pg2025-uop-main-cycle', 'pg2025-uop-open-eve', 'pg2025-uop-pgr', 'pg2025-uop-pgr-bursaries', 'pg2026', 'pg2026-bal', 'pg2026-cci', 'pg2026-hss', 'pg2026-sah', 'pg2026-tec', 'pg2026-uop', 'pg2026-uop-pgr', 'pg2026-uop-pgr-bursaries', 'pg2027', 'plastics-policy', 'rao-post16-bal', 'rao-post16-cci', 'rao-post16-hss', 'rao-post16-sah', 'rao-post16-teachers-and-advisers', 'rao-post16-tec', 'rao-post16-uop', 'rao-post16-uop-getting-started', 'rao-post16-uop-personal-statement-hub', 'rao-pre16-teachers-and-advisers', 'rao-pre16-uop-nurture', 'rao-teachers-and-advisers', 'rao-teachers-and-advisers-cpd-hub', 'rao-teachers-and-advisers-he-advisers-conference', 'recruitment-awareness', 'sah-2026', 'sah-print-2025', 'sah-socials', 'short-courses', 'sport-current-members', 'sport-prospective-members', 'study-while-working-da', 'studying-while-working2023-da', 'studying-while-working2023-latw', 'studying-while-working2024', 'studying-while-working2024-da', 'studying-while-working2024-latw', 'studying-while-working2025-da', 'ug-ongoing', 'ug2023-hss', 'ug2023-sah', 'ug2023-tec', 'ug2023-uop', 'ug2023-uop-clearing', 'ug2023-uop-openday', 'ug2023-uop-openday-influencers', 'ug2024-bal', 'ug2024-cci', 'ug2024-hss', 'ug2024-sah', 'ug2024-tec', 'ug2024-uop', 'ug2024-uop-aed', 'ug2024-uop-clearing', 'ug2024-uop-influencers', 'ug2024-uop-main-cycle', 'ug2024-uop-main-cycle-influencers', 'ug2024-uop-openday', 'ug2025-bal', 'ug2025-bal-clearing', 'ug2025-cci-clearing', 'ug2025-hss-clearing', 'ug2025-sah-clearing', 'ug2025-tec-clearing', 'ug2025-uop', 'ug2025-uop-clearing', 'ug2025-uop-clearing-crm', 'ug2025-uop-clearing-influencers', 'ug2025-uop-clearing-web', 'ug2025_sah', 'ug2026--uopl-sc-educator-targeting', 'ug2026-clearing', 'ug2026-offer-holder', 'ug2026-sah', 'ug2026-uop-openday', 'ug2026-uopl-oed', 'ug2026-uopl-open-day', 'ug2026_bal', 'ug2026_cci', 'ug2026_hss', 'ug2026_mailchimp', 'ug2026_sah', 'ug2026_tec', 'ug2026_uop', 'ug2027-uop-openday', 'ug2027-uop-prospectus', 'uop-social', 'uop-social-community', 'uop-social-student-generated'];

// A small number of legacy terms exist in the historical data but are
// deliberately excluded going forward — see README "Validation rules" for
// why each one was dropped (noise, not a real category).

/** Every selectable GA4 Medium, in a fixed display order. Always all shown — Paid/Organic narrows Campaign Term, not this list. */
export const MEDIUM_OPTIONS = Object.keys(MEDIUM_TERM_MAP);

/** Campaign Terms valid for a given Medium + Paid/Organic combination — empty if that medium has no historical Terms of that polarity. */
export function getTermsForMedium(medium, paidOrganic) {
  const rule = MEDIUM_TERM_MAP[medium];
  return rule ? rule[paidOrganic] || [] : [];
}

/** Known Sources for a given Campaign Term (not exhaustive — see "Other"). */
export function getSourcesForTerm(term) {
  return TERM_SOURCE_MAP[term] || [];
}

/**
 * Defensive validation of a fully-assembled row, re-checking the same
 * Medium -> Term chain the cascading selects already enforce. Kept because
 * rows can in principle be constructed programmatically (e.g. future CSV
 * import), so this is the backstop, not the primary UX.
 */
export function validateRow({ paidOrganic, gaMedium, campaignTerm }) {
  const errors = [];

  const validTerms = getTermsForMedium(gaMedium, paidOrganic);
  if (!validTerms.includes(campaignTerm)) {
    errors.push({
      field: 'campaignTerm',
      message:
        validTerms.length > 0
          ? `"${campaignTerm}" is not a valid Campaign Term for medium "${gaMedium}" (${paidOrganic}). Allowed: ${validTerms.join(', ')}.`
          : `"${gaMedium}" has no ${paidOrganic} Campaign Terms. Choose a different Medium, or switch Paid/Organic.`,
    });
  }

  return errors;
}

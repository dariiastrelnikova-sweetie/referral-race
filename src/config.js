/*
 * Everything you need to fill in lives here. Nothing else in the app is
 * campaign-specific.
 */

// Where both "Submit a referral" buttons go.
//
// NOTE: this is the Ashby app root, so it drops people on their Ashby dashboard
// rather than on a referral form. If Ashby exposes a direct referral-form link,
// use that instead — ideally the pre-filled variant, because the coins script
// only credits a referral when "Credited To" is set on the application.
export const ASHBY_REFERRAL_URL = 'https://app.ashbyhq.com/'

// Campaign dates, shown in the footer.
//
// NOTE: CAMPAIGN_START is the date the campaign is announced as starting.
// LB_CONFIG.START_DATE in apps-script/leaderboard_api.gs is the date the
// leaderboard actually counts from, and it is still 2026-09-01. Bring the two
// into line before launch, or the board will open showing points earned before
// the campaign began.
// Leave CAMPAIGN_END empty until it is decided; the footer drops the range
// rather than printing a placeholder.
export const CAMPAIGN_START = '29 September'
export const CAMPAIGN_END = ''

// Who people ask about the campaign.
export const CONTACT = 'Dariia Strelnikova (Slack)'

// The Apps Script web app URL (…/exec). Set VITE_LEADERBOARD_URL in .env.
// When it is empty the app falls back to the bundled mock data and shows a
// small dev badge, so the site is reviewable before the endpoint exists.
export const LEADERBOARD_URL = import.meta.env.VITE_LEADERBOARD_URL || ''

// The public leaderboard spreadsheet — used when the site is hosted somewhere
// other than Apps Script (a custom domain), where google.script.run does not
// exist and the Apps Script endpoint is behind Solidgate SSO.
//
// Set VITE_PUBLIC_SHEET_ID; the ID is the part of the sheet's URL between /d/
// and /edit. The tab defaults to «Рейтинг», which apps-script/publish_public.gs
// refreshes hourly from the private working sheet.
//
// Careful with the tab name: an unknown one does NOT error — Google quietly
// answers with the first sheet in the document instead. useLeaderboard.js
// checks the column shape and fails loudly rather than rendering it.
export const PUBLIC_SHEET_ID = import.meta.env.VITE_PUBLIC_SHEET_ID || ''
export const PUBLIC_SHEET_TAB = import.meta.env.VITE_PUBLIC_SHEET_TAB || 'Рейтинг'

// How many rows the leaderboard shows before "Show full leaderboard".
export const TOP_N = 10

// How often the open page re-fetches the standings (ms). The endpoint is cached
// server-side for 60s, so this is cheap.
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000

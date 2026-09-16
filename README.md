# Refer & Race

Internal one-page site for the Solidgate referral campaign. Vue 3 + Vite, no router, no state
library, no UI kit — Vue is the only runtime dependency.

The whole site is **served by Apps Script**, from the same project that's bound to the coins
spreadsheet. That means:

- Access is gated by **Solidgate Google sign-in** — only employees can open the page. There is no
  public URL and no shared secret.
- The page and its data are same-origin, so there's no CORS and no endpoint to configure.
- There is **nothing else to host**. The deploy target is the Apps Script project.

The sheet itself stays private, and candidate names never leave it.

---

## Running it locally

Requires Node 20+.

```bash
npm install
npm run dev    # http://localhost:5173, runs on mock data
npm run build  # produces dist/apps-script/index.html
```

Locally there's no `google.script.run`, so the app falls back to `src/mock/leaderboard.json` and
shows a small "Sample data" note under the table. That's the intended way to work on the design.

## First-time clasp setup

Deployment goes through [clasp](https://github.com/google/clasp), Google's Apps Script CLI. Pasting
into the Apps Script editor is not an option — it silently truncates large files (a 220 kB page went
in and 33 kB came out, cut through the middle with the closing tags still attached, so it looked
fine).

One-time, in order:

1. **Enable the Apps Script API** for your account at
   <https://script.google.com/home/usersettings> — flip *Google Apps Script API* to **On**.
   Without this every clasp command fails with a 403.
2. **Sign in**: `npx clasp login`. Opens a browser; approve with your Solidgate account.
3. **Get the script ID**: Apps Script editor → ⚙ **Project Settings** → *IDs* → **Script ID**.
4. **Link the project**, which also pulls the existing files down:

   ```bash
   npx clasp clone <SCRIPT_ID> --rootDir gas
   ```

   `gas/` is a local mirror of the Apps Script project. It's gitignored — it's a working copy, not
   source. The source of truth stays `apps-script/leaderboard_api.gs` and the Vite build.
5. Confirm `gas/Code.js` exists. That's the coins script, and the deploy refuses to run without it.

## Releasing

```bash
npm run deploy
```

Builds, pulls, stages, pushes, cuts a version, and points the existing deployment at it — the web app
URL never changes.

Note for anyone following clasp guides online: this project uses **clasp 3.x**, where the commands
differ from the v2 ones most tutorials show. `clasp deploy` now creates a *new* deployment with a
*new URL*. Updating in place is `create-version` then `redeploy <id> -V <version>`, which is what
`scripts/deploy.mjs` does.

### The one dangerous thing about clasp

`clasp push` makes the remote project *match the local folder*, which means it **deletes remote files
that aren't present locally**. The coins script lives in the same project. If you pushed a `gas/`
folder that didn't contain `Code.js`, you would delete the script that credits everyone's referrals.

`scripts/deploy.mjs` guards against this: it always runs `clasp pull` first, and hard-fails if
`gas/Code.js` isn't there afterwards. Don't run a bare `npx clasp push` — use `npm run deploy`.

### HtmlService will corrupt your page unless you do two things

This cost a long debugging session; don't undo either of these.

**HtmlService does not serve your HTML.** It serialises the page into
`document.write()` calls inside its sandbox iframe, and it builds that payload with a JavaScript
string replace. Two consequences:

1. **No long lines.** A single very long line gets cut partway through, leaving an unterminated
   string literal, and the page dies with `Failed to execute 'write' on 'Document': Unexpected end
   of input`. Minified Vue is one ~150,000-character line, so it died at ~34 kB every time — which
   looks exactly like a truncated upload and sent me chasing paste limits, chunked files and clasp
   before I measured it. `esbuild.lineLimit` and `cssMinify: false` in `vite.config.js` keep every
   line under 500 characters.

2. **No `$` replacement patterns.** In a JS replacement string, `$&`, `` $` ``, `$'`, `$1` and `$$`
   are special and get substituted away. Minified Vue contains `$&&` (a syntax error once mangled)
   and `"-$1"` inside its hyphenate function — that second one would not even crash, it would
   silently break prop hyphenation. So `scripts/build-apps-script.mjs` base64-encodes the bundle and
   a small loader decodes it at runtime: base64 is `[A-Za-z0-9+/=]` only, so no `$` (or `<`, quote,
   or backslash) survives to be misread.

If the page ever renders as a blank black screen again, open it and check the console for
`Failed to execute 'write'` — that is this problem coming back.

### Why the build looks the way it does

`vite.config.js` forces a single IIFE chunk with no code splitting and assets inlined, because
HtmlService serves exactly one file — there is nowhere to put `/assets/app.js`. Then
`scripts/build-apps-script.mjs` folds the CSS and JS into the HTML and moves the script to the end
of `<body>`.

Two traps in that script, both already handled, both worth not reintroducing:

- The script tag **must** end up at the end of `<body>`. Vite emits it in `<head>`, which is fine
  for a deferred module but fatal for an inline classic script — it would run before
  `<div id="app">` exists and the app would silently never mount.
- The bundle **must** be injected via a replacer *function*, never a replacement string. In a
  replacement string `$&`, `` $` ``, `$'` and `$1` are special patterns, and minified Vue contains
  `$&&` — which silently corrupts the bundle into a syntax error.

## Things to fill in

All of these live in [`src/config.js`](src/config.js), marked `TODO`:

| Constant | What it is |
|---|---|
| `ASHBY_REFERRAL_URL` | The Ashby referral form both "Submit a referral" buttons open. Use the pre-filled link if you have one — the coins script only credits a referral when **Credited To** is set on the Ashby application. An empty Credited To earns the referrer nothing. |
| `CAMPAIGN_START` / `CAMPAIGN_END` | Dates shown in the footer. |
| `CONTACT` | Slack channel or HR partner for the footer. |

Plus `VITE_LEADERBOARD_URL` in `.env` — see below.

---

## Setting it up in Apps Script

Everything lives in the Apps Script project already bound to the coins spreadsheet — the same one
that contains `ashby_referral_coins.gs`. Two files go in: the server code, and the built page.

What this gets you:

- The spreadsheet stays private. Sharing settings don't change.
- Column D (candidate names) is **never read**. The code only ever requests columns A and C, so
  candidate personal data cannot reach the page even by accident.
- Only signed-in Solidgate accounts can open the site.

### Step 1 — add the server code

1. Open the coins spreadsheet → **Extensions → Apps Script**.
2. **+** next to *Files* → **Script**, name it `leaderboard_api`.
3. Delete the stub `function myFunction() {}` and paste the whole contents of
   [`apps-script/leaderboard_api.gs`](apps-script/leaderboard_api.gs). **Save.**

This file only reads. It does not touch `poll()`, `setup()`, the triggers, or the hidden
`__processed_app_ids` tab.

### Step 2 — add the page

1. **+** next to *Files* → **HTML**, name it exactly **`index`** (Apps Script adds the `.html`).
2. Run `npm run build` locally, open `dist/apps-script/index.html`, copy all of it.
3. Select everything in the Apps Script `index` file, paste over it. **Save.**

The name matters: `doGet()` calls `HtmlService.createHtmlOutputFromFile('index')`.

### Step 3 — authorise it once

1. Function dropdown at the top → **`testLeaderboard`** → **Run**.
2. Google asks for permission the first time → **Review permissions** → your account →
   **Advanced → Go to (project name)** → **Allow**.
3. **Execution log** should show `Рефереров: N` and the top 10.

> Run **`testLeaderboard`** — not `setup`. `setup` belongs to the coins script: it tears down and
> recreates the Ashby polling triggers, and running it by accident can leave the project with no
> triggers at all.

If the totals look wrong, run **`lbDiagnose`** — it reports whether a gap against the «Рейтинг» tab
comes from name-spelling variants, from points stored as text (which `QUERY` silently ignores and
this code counts), or from rows added since you last looked. `lbDiagnoseName("кратюк")` prints every
exact spelling of one name in quotes, so stray spaces and casing become visible. `lbListVariants()`
dumps every duplicate-spelling group at once.

### Step 4 — deploy

1. **Deploy → New deployment** (or **Manage deployments** if none exists yet).
2. Gear next to *Select type* → **Web app**.
3. Fill in:
   - **Description**: `Refer & Race`
   - **Execute as**: **Me (your@solidgate.com)** — this is what lets the page read the private
     sheet on a visitor's behalf without them needing sheet access.
   - **Who has access**: **Anyone within Solidgate**
4. **Deploy**, then copy the **Web app URL**. That's the link you share internally.

> **On access.** "Anyone within Solidgate" means the visitor must be signed in to a Solidgate Google
> account. That's the access control — not a secret URL. It also rules out hosting the page anywhere
> else: a separately-hosted page cannot fetch this endpoint, because a cross-origin `fetch` can't
> carry Google's session cookies and unauthenticated requests get redirected to a login screen.
> Serving the page from Apps Script is what makes the whole thing work.

## Script settings

At the top of `apps-script/leaderboard_api.gs`:

All globals in this file are prefixed `LB_`. **Do not remove the prefixes.** Apps Script gives every
`.gs` file in a project one shared global scope, so a bare `var CONFIG` here silently overwrites the
coins script's own `CONFIG`, and `setup()` / `poll()` then fail with
`Cannot read properties of undefined`.

| Setting | Default | Notes |
|---|---|---|
| `REPORT_TAB` | `''` | Empty = first tab, same convention as the coins script. |
| `HEADER_ROWS` | `2` | «Employer Brand» has a two-row header. |
| `START_DATE` | `null` | `null` counts every row. Set to e.g. `'2026-09-05'` to count only rows dated on or after that day. |
| `CACHE_SECONDS` | `60` | Responses are cached server-side, so page views don't hammer the sheet. |

**On `START_DATE`:** it's `null` because the plan is to clear the sheet before the campaign goes
live, so every remaining row belongs to the race. If you'd rather keep the history in the sheet,
set `START_DATE` to the campaign start instead — otherwise the standings will include everyone's
balance from the old store/coins programme and the race is decided before it begins.

## How fresh the numbers are

Three separate delays stack up:

1. The Ashby → Sheets script runs at roughly **07:00, 11:00, 15:00 and 19:00**, so a checkpoint
   cleared at 19:30 doesn't reach the sheet until the next morning. This is by far the largest gap.
2. The endpoint caches its response for **60 seconds**.
3. The open page re-fetches every **5 minutes** (and immediately when you switch back to the tab).

So "updates automatically" on the page is honest about the sheet, not about Ashby. If someone
reports that their points "haven't appeared yet", point 1 is almost always the answer.

## Notes for whoever picks this up next

- Data reaches the page through `google.script.run.LB_getLeaderboard()`. `LB_getLeaderboard` has to
  stay a top-level function in the script project — `google.script.run` can only call globals.
  A `fetch()` path still exists in `useLeaderboard.js` as a fallback for separate hosting; it is not
  used in the normal setup.
- Tied point totals share a position and skip the next one (1, 2, 2, 4). The sheet produces a lot
  of ties, and ranking by row order would invent an order that isn't really there. The collapsed
  top-10 view also extends past 10 rows when the tenth position is tied, so a tie group is never
  cut in half — showing one person on 300 points while hiding two others on 300 points reads as
  favouritism. Within a tie, order is alphabetical, so it won't match the «Рейтинг» tab's own
  arbitrary ordering. That's expected.
- Referrers are grouped by name text, because the sheet has no employee ID — only a display name
  in column A. Names are normalised (trimmed, inner whitespace collapsed, case-insensitive) before
  grouping, but two genuinely different spellings of the same person will still count as two
  people. If that shows up, fix the spelling in the sheet.
- Outside Apps Script there is no `google.script.run`, so the app runs on
  `src/mock/leaderboard.json` and shows a small "Sample data" note under the table. That's the
  intended way to work on the design offline. The mock deliberately mirrors the real point spread,
  ties included.
- Section links scroll via JS rather than plain `href="#id"` navigation, because fragment
  navigation resolves against the sandbox iframe's own URL inside HtmlService.
- Styling follows the brand book: **Onest** for headings, **Inter** for body copy and the table,
  everything left-aligned, sentence case. Colour is monochrome apart from a deliberate F1 accent
  layer (`--paint-red`, the podium metals, the green flag) defined in
  [`src/styles/tokens.css`](src/styles/tokens.css). Keep new colour inside those tokens.

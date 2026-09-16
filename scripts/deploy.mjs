/*
 * Pushes the built page and the server code to the Apps Script project, then
 * updates the EXISTING deployment so the web app URL stays the same.
 *
 * Written against clasp 3.x, where the commands differ from the v2 ones most
 * guides describe: `deploy` creates a NEW deployment (and a new URL), so
 * updating in place is `create-version` followed by `redeploy <id> -V <version>`.
 *
 * The important safety property: `clasp push` makes the remote project match the
 * local folder, which means it DELETES remote files that aren't present locally.
 * The coins script (Code.gs) lives in that same project. So this always pulls
 * first and refuses to push if Code.gs didn't come down — better to stop than to
 * wipe the script that credits everyone's referrals.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const gasDir = join(root, 'gas')
const built = join(root, 'dist', 'apps-script', 'index.html')

const run = (args, { quiet = false } = {}) =>
  execFileSync('npx', ['clasp', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: quiet ? 'pipe' : 'inherit',
  })

const die = (msg) => {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

if (!existsSync(join(root, '.clasp.json'))) {
  die('No .clasp.json — the project isn\'t linked. See "First-time clasp setup" in README.md.')
}
if (!existsSync(built)) die('No dist/apps-script/index.html — run `npm run build` first.')

console.log('\n→ Pulling the current project (this is what protects Code.gs)…')
run(['pull'])

if (!existsSync(join(gasDir, 'Code.js'))) {
  die(
    'Refusing to push: gas/Code.js is missing after the pull.\n' +
      '  Pushing now would DELETE the coins script from the project.\n' +
      '  Check `npx clasp pull` before trying again.',
  )
}

// If the deployed coins script has drifted from ours, someone edited it in the
// Apps Script editor. Pushing would silently discard their change.
const remoteCoins = readFileSync(join(gasDir, 'Code.js'), 'utf8')
const localCoins = readFileSync(join(root, 'apps-script', 'coins.gs'), 'utf8')
if (remoteCoins !== localCoins) {
  console.log(
    '\n⚠  gas/Code.js differs from apps-script/coins.gs — the deployed coins script\n' +
      '   was edited outside this repo. About to overwrite it with ours.\n' +
      '   Ctrl-C now if that is wrong; diff them first with:\n' +
      '     diff gas/Code.js apps-script/coins.gs\n',
  )
}

console.log('→ Staging the build…')
writeFileSync(join(gasDir, 'index.html'), readFileSync(built, 'utf8'))
writeFileSync(
  join(gasDir, 'leaderboard_api.js'),
  readFileSync(join(root, 'apps-script', 'leaderboard_api.gs'), 'utf8'),
)
writeFileSync(
  join(gasDir, 'publish_public.js'),
  readFileSync(join(root, 'apps-script', 'publish_public.gs'), 'utf8'),
)
// The coins script is version-controlled here too. It has to be staged AFTER
// the pull, or the pull would overwrite local edits with the deployed copy.
writeFileSync(join(gasDir, 'Code.js'), readFileSync(join(root, 'apps-script', 'coins.gs'), 'utf8'))

/*
 * Remove anything left over from earlier attempts. This matters more than it
 * looks: Apps Script gives every file in a project ONE shared global scope, so a
 * second copy of the leaderboard code — say `leaderboard_api.gs` alongside
 * `leaderboard_api` — means two `doGet` definitions, and whichever loads last
 * silently wins. Keep exactly one.
 */
const KEEP = new Set([
  'Code.js',
  'appsscript.json',
  'index.html',
  'leaderboard_api.js',
  'publish_public.js',
])
for (const f of readdirSync(gasDir)) {
  if (KEEP.has(f)) continue
  unlinkSync(join(gasDir, f))
  console.log(`  removing stray ${f}`)
}

console.log('→ Pushing…')
run(['push', '--force'])

console.log('→ Cutting a version…')
const versionOut = run(['create-version', `build ${new Date().toISOString()}`], { quiet: true })
process.stdout.write(versionOut)
// Output is a human sentence like "Created version 7." — take the last number.
const versionNumbers = [...versionOut.matchAll(/(\d+)/g)].map((m) => m[1])
const version = versionNumbers[versionNumbers.length - 1]
if (!version) die(`Could not read the new version number from:\n${versionOut}`)

console.log(`→ Updating the deployment to version ${version}…`)
const list = run(['deployments'], { quiet: true })
// Entries look like: "- AKfycb…  @7 - description". @HEAD is the dev sandbox,
// never the shared URL, so it's not a candidate.
const ids = [...list.matchAll(/([A-Za-z0-9_-]{20,})\s+@(\d+|HEAD)/g)]
  .filter((m) => m[2] !== 'HEAD')
  .map((m) => m[1])
const unique = [...new Set(ids)]

if (unique.length === 1) {
  run(['redeploy', unique[0], '-V', version, '-d', `build ${new Date().toISOString()}`])
  console.log('\n✓ Deployed. The web app URL is unchanged.\n')
} else {
  console.log(
    `\n✓ Pushed and versioned (v${version}), but ${
      unique.length === 0 ? 'no existing deployment was found' : `${unique.length} deployments exist`
    }.` +
      '\n  Point the right one at the new version yourself:' +
      '\n    npx clasp deployments' +
      `\n    npx clasp redeploy <deploymentId> -V ${version} -d "manual"\n` +
      '\n  Deployment list was:\n' +
      list,
  )
}

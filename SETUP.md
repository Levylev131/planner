# One-time setup

This app stores events in a GitHub Gist and syncs both phones/computers to it — same pattern as your Grocery List app. Do these steps yourself in PowerShell — this keeps your token out of the chat with Claude entirely.

Updates aren't instant: each device polls the gist every 6 seconds, so an event you add typically shows up on your partner's screen within about 5-10 seconds.

## 1. Create a token (scoped to Gists only, nothing else)

Open this link (pre-fills the minimal "gist" scope):
https://github.com/settings/tokens/new?scopes=gist&description=Shared%20Calendar

- Expiration: "No expiration" (so the calendar keeps working long-term without you having to redo this)
- Click **Generate token**, then copy it (GitHub only shows it once)

**Security note:** this token can only create/read/edit your Gists — it cannot touch your repos or anything else on your account. It will end up readable in this app's client-side code once hosted, since there's no server to hide it behind. That's a deliberate, accepted trade-off for keeping this simple (no backend to run/pay for). If you're ever worried about it, revoke/regenerate it anytime from https://github.com/settings/tokens.

## 2. Create the gist that will hold the calendar

In PowerShell, in this folder:

```powershell
$TOKEN = "paste-your-token-here"
$body = @{
  description = "Shared Calendar data"
  public = $false
  files = @{ "calendar.json" = @{ content = '{"events":[]}' } }
} | ConvertTo-Json -Depth 5

$resp = Invoke-RestMethod -Uri "https://api.github.com/gists" -Method Post `
  -Headers @{ Authorization = "token $TOKEN"; Accept = "application/vnd.github+json" } `
  -Body $body

Write-Host "GIST_ID:" $resp.id
```

Copy the printed `GIST_ID`.

## 3. Fill in `app.js`

Open `app.js` and set the two constants near the top:

```js
const TOKEN = "paste-your-token-here";
const GIST_ID = "paste-the-id-from-step-2";
```

## 4. Try it locally

```powershell
python -m http.server 8080
```

Open http://localhost:8080 in a browser. Add an event, refresh — it should still be there (confirms the gist sync works). Open a second tab to watch an event you add in one appear in the other after a few seconds.

## 5. Host it so both phones can reach it (tell Claude when ready)

Local hosting only works on your own PC. For real phone access from anywhere (not just your home Wi-Fi), this needs to be pushed to a GitHub repo with GitHub Pages or Netlify turned on — ask Claude to do this once steps 1-4 work, since creating a repo and making it public/deployed is worth confirming first.

## Customizing

- **Categories/colors:** edit the `CATEGORIES` array near the top of `app.js` — add, remove, rename, or recolor as you like.
- **App name/icon:** edit `manifest.json` and swap the files in `icons/` (currently placeholders copied from the Grocery List app).
- **Sync speed:** change `POLL_MS` in `app.js` (currently 6000ms) if you want faster/slower checks — lower means quicker updates but more API calls against GitHub's rate limit.

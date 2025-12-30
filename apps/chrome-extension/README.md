# Summarize (Chrome Extension)

Chrome Side Panel UI for `summarize` (streams summaries into a real Chrome Side Panel).

Docs + setup: `https://summarize.sh`

## Build

- From repo root: `pnpm install`
- Dev: `pnpm -C apps/chrome-extension dev`
- Prod build: `pnpm -C apps/chrome-extension build`

## Install in Chrome (Unpacked)

Step-by-step (non-technical):

1) Build the extension:
   - `pnpm -C apps/chrome-extension build`
2) Open Chrome → go to `chrome://extensions`
   - Or Chrome menu → Extensions → “Manage Extensions”
3) Turn on **Developer mode** (top-right toggle).
4) Click **Load unpacked**.
5) Select the folder: `apps/chrome-extension/.output/chrome-mv3`
6) You should now see “Summarize” in the extensions list.
7) (Optional) Pin the extension (puzzle icon → pin), then click it to open the Side Panel.

Developer mode is required for loading unpacked extensions.

## Install the Daemon (Pairing)

The extension talks to a tiny local daemon that runs on your machine.

1) Install `summarize` (choose one):
   - `npm i -g @steipete/summarize` (requires Node.js 22+)
   - `brew install steipete/tap/summarize` (macOS arm64)
2) Open the Side Panel. You’ll see a **Setup** screen with a token and an install command.
3) Open Terminal:
   - macOS: Applications → Utilities → Terminal
   - Windows: Start menu → Terminal (or PowerShell)
   - Linux: your Terminal app
4) Paste the command from the Setup screen and press Enter.
   - Installed binary: `summarize daemon install --token <TOKEN>`
   - Repo/dev checkout: `pnpm summarize daemon install --token <TOKEN> --dev`
5) Back in Chrome, the Setup screen should disappear once the daemon is running.
6) Verify / troubleshoot:
   - `summarize daemon status`
   - `summarize daemon restart`

## Length Presets

- Presets match CLI: `short|medium|long|xl|xxl` (or custom like `20k`).
- Tooltips show target + range + paragraph guidance.
- Source of truth: `packages/core/src/prompts/summary-lengths.ts`.

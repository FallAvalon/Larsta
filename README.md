# Larsta

[Русская версия](README.ru.md)

A self-hosted character chat app for your computer and phone. React, TypeScript, Vite, Node.js, and SQLite, with OpenRouter for model access.

The public source starts with an empty library. The optional character in `examples/character-v2.json` is a synthetic library guide created for the example and tests. No personal conversations, characters, uploads, credentials, or saved settings are included.

## Start

Install Node.js **22.13 or newer**, with npm. From the project folder:

```sh
npm ci
npm run build
npm start
```

On Windows you can double-click `start.cmd`; on Linux run `bash start.sh`. These scripts install dependencies when needed, build, and start the server. Keep the terminal open; stop with Ctrl+C.

1. Open `http://localhost:3000` and enter the connection code printed in the terminal.
2. In **Settings → Model**, enter your OpenRouter API key, select a model, and save. No model is selected automatically. Availability, prices, and limits depend on the provider.
3. Create a character, or import the example JSON from `examples/`. Open the character and start a chat.
4. Select **English** or **Русский** in **Settings → Appearance → Interface language**. The initial language follows your browser. Language and appearance are saved on each device; character descriptions and conversations retain their original text.

For a phone on the same trusted Wi-Fi network, open the LAN address printed by the server and enter the same code. Allow Node.js through the firewall for your private network if necessary. The computer must remain running. Local connections use HTTP: do not expose the port or connection code to the internet. Connected devices share full access; see [SECURITY.md](SECURITY.md).

## Features

- Character library with favorites, search, tags, portraits, and Character Card V2 JSON import/export. Images are uploaded separately; JSON exports do not embed them. Some advanced V2 extensions are preserved without being executed.
- Multiple personas, a default for new chats, and an independent persona copy in each story.
- Streamed replies, editable messages, response variants, regeneration guidance, continuation, branching, and undo with a preserved branch.
- Per-chat model settings, bounded context, optional reasoning display, paginated history, and restored reading position.
- Mobile navigation, borderless menus, adjustable typography and colors, interaction animations, and reduced-motion support.
- Server-side OpenRouter credentials, persistent device sessions, resumable generation subscriptions, automatic backups, and offline restore.

The model catalog can be refreshed in settings; a manually entered ID is also supported. Larsta never silently substitutes another model ID. The optional OpenCode compatibility profile changes client attribution headers; provider access rules still apply. An auxiliary model field remains in the data format for compatibility but is not called.

## Data and backups

Runtime data is created in `data/`: `larsta.sqlite` (and SQLite sidecars), `uploads/`, `backups/`, and `server-secrets.json`. Treat the whole folder as private. Drafts, reading positions, language, and appearance are stored in browser storage. Selected story context is sent to the configured model provider.

Automatic backups include the database and uploads, but exclude server secrets. Before an update, stop Larsta and keep a private copy of `data/`. Schema migrations create a checked backup before modifying an existing database.

After building:

```sh
npm run backup -- list
npm run backup -- create
npm run backup -- verify BACKUP_ID
npm run backup -- restore BACKUP_ID --confirm
```

Stop the server before `create` or `restore`. Restore preserves previous data in a separate recovery folder. Do not publish backups.

Optional environment variables: `PORT` (default `3000`), `LARSTA_DATA_DIR` (default `data`), and `OPENROUTER_API_KEY` (overrides the saved key). Do not commit environment files or secrets.

## Development and checks

```sh
npm run dev
npm run check
npm test
npm run build
node --test tests/publication.test.mjs
```

Browser checks in `tests/ui-*.mjs` use isolated temporary data and a fake provider. Install Playwright separately, then run a script after building, for example `node tests/ui-language.mjs`. The scripts use Chrome by default; `LARSTA_BROWSER_CHANNEL` overrides the browser channel. `LARSTA_PLAYWRIGHT_MODULE` can point to an existing Playwright module. Screenshots in `test-results/` are local artifacts excluded from publication.

## Publish a clean copy

Never push an installed app folder wholesale. The repository uses a deny-by-default Git allowlist and a separate audit:

```sh
npm run public:check -- --private-dir data
npm run public:prepare -- --out /path/to/new-public-folder --private-dir data
```

The destination must be new and outside the installation. Preparation copies only allowed source files and the synthetic example, then audits the result. With `--private-dir`, the audit compares locally against private names, identifiers, keys, settings, and text fingerprints without printing their values. Inspect the copy and staged files before publishing. Use a new Git history if an old history might contain private data. See [SECURITY.md](SECURITY.md).

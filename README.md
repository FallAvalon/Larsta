# Larsta

[Русская версия](README.ru.md)

A self-hosted character chat app for your computer and phone. React, TypeScript, Vite, Node.js, and SQLite, with OpenRouter, LM Studio, Ollama, OmniRoute, Polza.ai, and custom OpenAI-compatible APIs.

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
2. In **Settings → Model**, edit the existing OpenRouter connection or **Add** another provider. Save the connection, select it and a model, then **Save changes**. No model is selected automatically. Availability, prices, and limits depend on the provider.
3. Create a character, or import the example JSON from `examples/`. Open the character and start a chat.
4. Select **English** or **Русский** in **Settings → Appearance → Interface language**. The initial language follows your browser. Language and appearance are saved on each device; character descriptions and conversations retain their original text.

For a phone on the same trusted Wi-Fi network, open the LAN address printed by the server and enter the same code. Allow Node.js through the firewall for your private network if necessary. The computer must remain running. Local connections use HTTP: do not expose the port or connection code to the internet. Connected devices share full access; see [SECURITY.md](SECURITY.md).

## Features

- Character library with favorites, search, tags, portraits, and Character Card V2 JSON import/export. Images are uploaded separately; JSON exports do not embed them. Some advanced V2 extensions are preserved without being executed.
- Multiple personas, a default for new chats, and an independent persona copy in each story.
- Streamed replies, editable messages, response variants, regeneration guidance, continuation, branching, and undo with a preserved branch.
- Independent providers and models for each chat, bounded context, optional reasoning display, paginated history, and restored reading position.
- Mobile navigation, borderless menus, adjustable typography and colors, interaction animations, and reduced-motion support.
- Spacious message editing and a keyboard-aware regeneration panel with draft recovery and one-use guidance.
- Live two-line reasoning preview, Markdown-formatted thoughts on an expanded gray surface, and a floating collapse control for the latest open reasoning block.
- Compact chat headers and a mobile chat-list header that hides on downward reading and returns on upward scrolling. Search, active filters, and input focus keep the panel visible.
- Multiple connections to the same provider, server-side credentials, connection and generation tests, persistent device sessions, resumable generation subscriptions, automatic backups, and offline restore.

The model catalog can be refreshed in settings; a manually entered ID works even when the catalog is unavailable. Larsta never silently substitutes another provider or model ID. The optional OpenCode compatibility profile changes attribution headers for OpenRouter only; provider access rules still apply. An auxiliary model field remains in the data format for compatibility but is not called.

## Providers and models

Every connection has its own name, base URL, authentication settings, key, and compatibility options. You can add two OpenRouter connections with different keys or several local servers. These presets are starting points; every URL can be edited:

| Provider | Default API base URL | Default authentication |
| --- | --- | --- |
| [OpenRouter](https://openrouter.ai/docs/api_reference/overview) | `https://openrouter.ai/api/v1` | Bearer key |
| [LM Studio](https://lmstudio.ai/docs/developer/openai-compat) | `http://localhost:1234/v1` | None; enable Bearer if required by your server |
| [Ollama](https://docs.ollama.com/api/openai-compatibility) | `http://localhost:11434/v1` | None |
| [OmniRoute](https://github.com/cheaper-inference/OmniRoute) | `http://localhost:20128/v1` | None; configure a key if your deployment requires one |
| [Polza.ai](https://polza.ai/docs/api-reference/introduction) | `https://polza.ai/api/v1` | Bearer key |
| OpenAI-compatible | Your API base URL | Configurable |

Requests come from the Larsta server. **localhost means the computer running Larsta**, including when you use a phone. For a model server on another computer, use its LAN address and enable access in that server. Local model servers must be running and have an appropriate model available; Larsta does not install or download models.

Enter the API root, including any prefix such as `/v1` or `/api/v1`, without `/chat/completions` or `/models`. Larsta preserves custom prefixes and does not guess them. Keys belong in the key field, never in the URL. TLS verification stays enabled and requests do not follow redirects.

**Test connection** checks the catalog without generating text. OpenRouter and Polza.ai keys are also checked with `/key`. Other APIs may expose a public catalog, so a reachable catalog does not prove model access or a valid key. **Test generation** sends a short synthetic request to the exact model ID you enter; the provider may charge for it. It does not use your character or conversation and does not save messages. A reasoning model can exhaust the small test token limit before producing text. Tests use the form's current values and do not save the connection.

Under **Compatibility**, choose the output limit field (`max_tokens`, `max_completion_tokens`, or none), whether to send temperature, and the reasoning format. OpenRouter routing fields and attribution headers are sent only for OpenRouter connections. Unknown model metadata is not treated as unsupported parameters or a zero price. Catalog prices retain their currency, including RUB for Polza.ai. They are provider estimates, not a Larsta billing calculation.

In a chat, open **Model and responses → This chat**, select a provider and model, and save. **Global** resumes inheritance. Branches retain the chat's settings, and response variants retain their provider attribution. Changing providers does not reset the story. Remove a connection only after replacing it in global settings and any chats pinned to it; deleting it never removes historical messages.

Generation uses the selected configuration from the start of the request. Editing or deleting a connection in use is blocked until its response stops. Catalogs are cached separately per connection and credentials. A catalog outage does not delay generation with a manual ID, and interrupted or rejected generations are never automatically retried with another model. Invalid provider keys do not sign you out of Larsta.

## Data and backups

Runtime data is created in `data/`: `larsta.sqlite` (and SQLite sidecars), `uploads/`, `backups/`, and `server-secrets.json`. Treat the whole folder as private. Drafts, reading positions, language, and appearance are stored in browser storage. Selected story context is sent to the configured model provider.

Automatic backups include the database, provider configurations and uploads, but exclude server secrets. Before an update, stop Larsta and keep a private copy of the application and **all of `data/` outside the installation**, including `server-secrets.json`. Verify restoration in a separate directory before replacing your installation. Do not copy a running SQLite database without its committed WAL data.

The provider update migrates schema 6 to 7 additively, after a checked pre-migration backup. Existing OpenRouter settings and saved keys are retained. Chats with their own old model ID are pinned to the migrated OpenRouter connection; chats inheriting the global model continue to inherit. Characters, personas, message IDs, variants, branches, uploads and device sessions are preserved. Secret-file migration is idempotent. Older Larsta versions reject the newer database: roll back with the matching private application/data copy, not by opening the new database in old code.

After building:

```sh
npm run backup -- list
npm run backup -- create
npm run backup -- verify BACKUP_ID
npm run backup -- restore BACKUP_ID --confirm
```

Stop the server before `create` or `restore`. Restore preserves previous data in a separate recovery folder. Do not publish backups.

Optional environment variables: `PORT` (default `3000`), `LARSTA_DATA_DIR` (default `data`), and `OPENROUTER_API_KEY` (overrides the saved key for the original OpenRouter connection at the OpenRouter origin only). Additional OpenRouter accounts use their own saved keys. Environment-controlled keys are identified in the editor; change the environment and restart Larsta to replace them. Do not commit environment files or secrets.

## Development and checks

```sh
npm run dev
npm run check
npm test
npm run build
node --test tests/publication.test.mjs
npm run test:ui
```

Browser checks in `tests/ui-*.mjs` use isolated temporary data and fake providers; they never call a real model account. Playwright is a development dependency. After building, run all browser suites with `npm run test:ui`, or one script such as `node tests/ui-providers.mjs`. The scripts use installed Chrome by default. Alternatively run `npx playwright install chromium` and set `LARSTA_BROWSER_CHANNEL=chromium` (`$env:LARSTA_BROWSER_CHANNEL='chromium'` in PowerShell). `LARSTA_PLAYWRIGHT_MODULE` can point to another installed Playwright module. Screenshots in `test-results/` are local artifacts excluded from publication. Automated protocol tests do not certify every live provider or replace visual review.

## Publish a clean copy

Never push an installed app folder wholesale. The repository uses a deny-by-default Git allowlist and a separate audit:

```sh
npm run public:check -- --private-dir data
npm run public:prepare -- --out /path/to/new-public-folder --private-dir data
```

The destination must be new and outside the installation. Preparation copies only allowed source files and the synthetic example, then audits the result. With `--private-dir`, the audit compares locally against private names, identifiers, keys, settings, and text fingerprints without printing their values. Inspect the copy and staged files before publishing. Use a new Git history if an old history might contain private data. See [SECURITY.md](SECURITY.md).

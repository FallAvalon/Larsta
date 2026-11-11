# Security and private data

Larsta is a personal, self-hosted application for a trusted home network. It is not a multi-user hosting service.

- Every connected device can access all characters, chats, settings, and generation credentials.
- The default local connection uses HTTP. Do not expose the port or connection code to the public internet.
- Provider keys are stored on the server in `data/server-secrets.json`, separately from SQLite. The file uses atomic replacement and restrictive file creation permissions; on Windows, also restrict access to the data folder with account permissions. This is a private local file, not an encrypted credential vault. Keys are never returned by settings/provider APIs or saved in browser storage.
- Credentials are bound to a connection ID and endpoint origin. Changing the origin requires explicitly replacing or removing its saved key. The original OpenRouter environment override applies only to its original connection at the OpenRouter origin. Outgoing requests do not follow redirects or disable TLS verification. Provider URLs cannot contain credentials, query strings or fragments.
- Only connected devices can manage providers or run tests. Connection tests do not generate text. Generation tests send a synthetic prompt to the configured endpoint and may incur provider charges; they do not include characters or conversation history. A public model catalog does not validate model access or billing availability.
- Provider errors expose controlled descriptions and bounded status/network codes, not raw upstream messages or echoed prompts/keys. A provider authentication failure is separate from Larsta session authentication.
- Prompts and selected conversation context are sent to the model provider. Review the provider's data policy before sending sensitive information.
- Automatic backups contain conversations and uploaded images. Keep them private. They exclude the server secrets file.
- Before an upgrade, stop the server and keep a full private application/data copy outside the installation, including server secrets. Verify restoration in an isolated directory. Database backups alone cannot restore credentials. Restoring an older database leaves the current secrets file in place; orphaned key entries are not used without a matching connection ID and origin.

## Publishing a fork

Never publish a working installation wholesale. Use `npm run public:prepare -- --out /path/to/new-public-folder --private-dir /path/to/private-data` to make a new, allowlisted copy. The destination must not exist and must be outside this installation.

The preparation script rejects runtime data, uploaded images, backups, logs, generated builds, local reports, symlinks, unexpected binary files, and credential-like tokens. When `--private-dir` is supplied, it also compares against private identifiers, saved provider names/addresses/model IDs, all saved provider keys regardless of token prefix, and content fingerprints locally. The report prints file names and rule categories, never private matches.

Before every push, inspect the staged file list and run `npm run public:check`. A `.gitignore` cannot remove data from existing Git history. If a credential was ever published, revoke it immediately; deleting the latest file is insufficient.

Report suspected vulnerabilities without attaching private databases, connection codes, keys, or personal conversations. Use GitHub private vulnerability reporting if it is enabled for the repository.

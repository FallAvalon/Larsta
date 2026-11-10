# Security and private data

Larsta is a personal, self-hosted application for a trusted home network. It is not a multi-user hosting service.

- Every connected device can access all characters, chats, settings, and generation credentials.
- The default local connection uses HTTP. Do not expose the port or connection code to the public internet.
- The OpenRouter key is stored on the server in `data/server-secrets.json`. It is never returned through the settings API. Restrict access to the data folder.
- Prompts and selected conversation context are sent to the model provider. Review the provider's data policy before sending sensitive information.
- Automatic backups contain conversations and uploaded images. Keep them private. They exclude the server secrets file.

## Publishing a fork

Never publish a working installation wholesale. Use `npm run public:prepare -- --out /path/to/new-public-folder --private-dir /path/to/private-data` to make a new, allowlisted copy. The destination must not exist and must be outside this installation.

The preparation script rejects runtime data, uploaded images, backups, logs, generated builds, local reports, symlinks, unexpected binary files, and credential-like tokens. When `--private-dir` is supplied, it also compares against private identifiers and content fingerprints locally. The report prints file names and rule categories, never private matches.

Before every push, inspect the staged file list and run `npm run public:check`. A `.gitignore` cannot remove data from existing Git history. If a credential was ever published, revoke it immediately; deleting the latest file is insufficient.

Report suspected vulnerabilities without attaching private databases, connection codes, keys, or personal conversations. Use GitHub private vulnerability reporting if it is enabled for the repository.

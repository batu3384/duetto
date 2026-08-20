# Wiki source (not published)

Markdown here is synced to [GitHub Wiki](https://github.com/batu3384/duetto/wiki). This file is **excluded** from sync.

## Publish

```bash
./scripts/sync-wiki.sh
```

Requires [GitHub CLI](https://cli.github.com/) authenticated (`gh auth login`).

## First-time setup

If the wiki repo does not exist yet:

1. Open https://github.com/batu3384/duetto/wiki
2. Click **Create the first page** → title **Home** → save once (can be empty)
3. Run `./scripts/sync-wiki.sh`

## What gets synced

- All `*.md` in this folder **except** `README.md`
- `_Sidebar.md` → wiki sidebar
- `--delete` removes wiki pages removed from source

## Do not edit wiki on GitHub directly

Changes will be overwritten on next sync. Edit here, then run the script.

# Moore's Body Shop Payroll — build, install, and updates

Desktop payroll for **Moore's Body Shop** (`com.mooresbodyshop.payroll`). First version: **1.0.0**.

Payroll files are **never** stored next to the `.exe` or in Program Files. They live in the shop owner's Windows profile:

```
%APPDATA%\MooresBodyShop\payroll\
```

That is `app.getPath('appData') + '/MooresBodyShop/payroll/'`, typically:

```
C:\Users\<owner>\AppData\Roaming\MooresBodyShop\payroll\
```

| File | What it is |
| --- | --- |
| `employees.json.enc` | Encrypted employee + payweek database |
| `settings.json` | Update URL, last check, startup-check flag only. **No SSNs.** |
| `backups\employees-YYYYMMDD-HHMMSS.json.enc` | Automatic copies after every successful save (newest 20 kept) |

Uninstalling the app does **not** delete this folder. Reinstalling finds the existing data. Auto-update replaces app binaries only and must never wipe `%APPDATA%\MooresBodyShop\`.

---

## Develop and run

Requires Node.js 18+ (Node 20 or 22 recommended). From this folder:

```
npm install
npm start
```

`npm start` runs `electron .`

The UI talks to the main process only through a `contextBridge` preload. The renderer has `nodeIntegration` off and `contextIsolation` on.

---

## Build Windows installers

```
set CSC_IDENTITY_AUTO_DISCOVERY=false
npm run dist
```

`npm run dist` builds locally and does **not** upload (`--publish never`). It still writes `latest.yml` into `dist\`.

`npm run release` builds and uploads the Setup `.exe`, `.blockmap`, and `latest.yml` to GitHub Releases using `GH_TOKEN`.

### GitHub token (do not commit this)

The token must live on **this PC only**. It is never packed into the payroll `.exe`.

**Best place (project, gitignored):**

```
C:\Users\Wesle\Desktop\Development\MooresPayroll\moores-bodyshop-payroll\.env
```

```
GH_TOKEN=paste_the_token_here
```

**Or Windows user env var (once, all new terminals):**

1. Start → “environment variables” → Environment Variables
2. Under **User variables** → New
3. Name: `GH_TOKEN`
4. Value: the personal access token
5. OK, then open a **new** terminal

Classic PAT needs `public_repo` (or `repo` if the GitHub repo is private). Fine-grained PAT needs Contents **Read and write** on `scra976/moores-bodyshop-payroll`.

Do not put the token in `package.json`, Settings, or chat. If it was pasted anywhere public, revoke it and make a new one.

### electron-builder config (already in `package.json`)

- **appId:** `com.mooresbodyshop.payroll`
- **productName:** `Moore's Body Shop`
- **asar:** `true`
- **extraResources:** none (no employee data in the package)
- **win targets:** NSIS x64 + portable x64
- **NSIS:** `oneClick: false`, `perMachine: false` (per-user under Local AppData is OK)
- **NSIS artifact:** `MooresBodyShop-Payroll-Setup-${version}.exe`
- **portable artifact:** `MooresBodyShop-Payroll-Portable-${version}.exe`
- **publish:** generic HTTP provider

```json
"publish": [
  {
    "provider": "generic",
    "url": "https://github.com/scra976/moores-bodyshop-payroll/releases/latest/download/"
  }
]
```

Default update feed (also shown in Settings):

```
https://github.com/scra976/moores-bodyshop-payroll/releases/latest/download/
```

### Output of `npm run dist`

```
dist\
  latest.yml
  MooresBodyShop-Payroll-Setup-1.0.0.exe
  MooresBodyShop-Payroll-Setup-1.0.0.exe.blockmap
  MooresBodyShop-Payroll-Portable-1.0.0.exe
```

`latest.yml` is what electron-updater fetches. Open it and confirm `path:` matches the Setup `.exe` you upload (not the portable build).

---

## Host updates (generic HTTP)

electron-updater uses a **generic** provider. Any HTTPS static host works: Cloudflare R2, S3, GitHub Releases, or the shop website.

Attach these three files to a GitHub Release (tag `v1.0.1`) and mark it as the latest release:

```
latest.yml
MooresBodyShop-Payroll-Setup-1.0.1.exe
MooresBodyShop-Payroll-Setup-1.0.1.exe.blockmap
```

Feed URL (trailing slash required):

```
https://github.com/scra976/moores-bodyshop-payroll/releases/latest/download/
```

Do **not** upload `employees.json.enc`, backups, or any live payroll files.

### Bump a release

1. Edit `version` in `package.json` (semver, e.g. `1.0.2` → `1.0.3`).
2. `npm run release` (needs `GH_TOKEN` in `.env` or a user environment variable).
3. Confirm the new GitHub Release has `latest.yml`, the Setup `.exe`, and the `.blockmap`.
4. Installed copies: Settings → **Check for updates** → **Download and install** → **Restart and apply**.

To build without uploading: `npm run dist`.

The installer / updater must not migrate or delete `%APPDATA%\MooresBodyShop\`. After 1.0.1 installs over 1.0.0, employees and payweeks stay put.

### Check-for-update behavior

- Current version is read from `package.json` / `app.getVersion()`.
- Channel in the UI is **stable**. The feed file is still `latest.yml` (electron-updater generic default).
- **Check on startup** defaults to **off**. The app does not auto-download unless the owner clicks **Download and install**.
- Offline or 404 → **No update server reachable**. Payroll keeps working with no internet.
- Downloads go to Electron's updater cache (`%APPDATA%\Moore's Body Shop\`), **not** the payroll data folder.

---

## Encryption and backups

When Windows DPAPI is available (`safeStorage.isEncryptionAvailable()`), `employees.json.enc` is encrypted for the current Windows user.

If encryption is unavailable, files still go in `%APPDATA%\MooresBodyShop\payroll\` and Settings shows:

```
OS encryption unavailable — data is in your user folder only
```

Encrypted backups **cannot** be opened by a different Windows user or PC. To move the shop, use **Export decrypted JSON backup** (confirm prompt — the file contains SSNs) and keep that file off shared drives.

Every successful save:

1. Writes a temp file in the same folder
2. Flushes to disk
3. Replaces `employees.json.enc`
4. Copies a timestamped backup
5. Deletes backups beyond the newest 20

---

## Acceptance checks

- Install the Setup exe on a clean Windows user profile. Add an employee, transfer a timesheet, close, reopen — data still there.
- Install 1.0.1 over 1.0.0 (or use the updater). Employees and payweeks remain. Data folder path unchanged.
- Uninstall leaves AppData. Reinstall finds existing data.
- App works with the network disabled.
- SSNs are masked in the UI except while that field is focused. They are not written to update logs.
- Settings → Check for updates against a missing URL shows a friendly error and does not crash.

---

## Seed data

If `employees.json.enc` does not exist, the app creates one sample employee: **Alex J Harper**, hourly $22.50, weekly, Single or MFS, VA withhold, Active, 821 Kabrich Street, Blacksburg VA 24060, hire 2026-09-01, empty payweeks. No SSN is stored in source control.

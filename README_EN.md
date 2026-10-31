# omp-antigravity-auth

[English](README_EN.md) · [简体中文](README.md)

Google Antigravity / Gemini refresh token importer and extension for [Oh My Pi (omp)](https://omp.sh).

Directly import Google OAuth refresh tokens into OMP's local credential store without interactive browser authentication.

## Installation

### Via OMP Plugin (Recommended)

```bash
omp plugin install github:Bowen-0x00/omp-antigravity-auth
```

Local link (for development):

```bash
omp plugin link /path/to/omp-antigravity-auth
```

Uninstall:

```bash
omp plugin uninstall omp-antigravity-auth
```

### Alternative: Script Installation

Copy the standalone extension to `~/.omp/agent/extensions/` using the provided script:

- **Windows**: Run `install.bat`
- **Linux / macOS**: `bash install.sh`

## Quick Start

### 1. In OMP Session (Slash Command)

```text
/ag-import [file|text]
```

- `/ag-import ./antigravity_accounts.json` — Import from JSON export file
- `/ag-import user@gmail.com 1//0xxxx...` — Import from email and refresh token
- `/ag-import` — Automatically scans `Downloads` for the newest `antigravity_accounts_*.json`
- `/ag-list` — List registered Antigravity accounts in OMP
- `/ag-verify [index]` — Force token refresh and check connectivity

### 2. Standalone CLI

```bash
# Import JSON file
omp-ag-auth import ./antigravity_accounts.json

# Import raw string (space separated)
omp-ag-auth import "user@gmail.com 1//0xxxx..."

# Delimited text (pipe / tab / colon)
omp-ag-auth import "user@gmail.com|...|refresh_token:1//0xxxx..."

# Auto-detect latest export in Downloads
omp-ag-auth import

# Dry run (validate only, no changes written)
omp-ag-auth import ./antigravity_accounts.json --dry-run

# List stored accounts
omp-ag-auth list

# Verify token
omp-ag-auth verify
```

## Supported Formats

### JSON Array (Antigravity Manager Export)

```json
[
  {
    "email": "user@gmail.com",
    "refresh_token": "1//0xxxx..."
  }
]
```

### Single JSON Object

```json
{
  "email": "user@gmail.com",
  "refresh_token": "1//0xxxx..."
}
```

### Raw Text / Delimited Lines

Supports space, tab, pipe (`|`), or dash (`----`) separated lines, and multi-line batches:

```text
user1@gmail.com 1//0xxxx1
user2@gmail.com|...|refresh_token:1//0xxxx2
user3@gmail.com----...----1//0xxxx3
```

## CLI Reference

```text
Usage: omp-ag-auth [command] [options] [arguments...]

Commands:
  import [target]       Import accounts from JSON file, text file, or raw string
  list                  List stored google-antigravity accounts in OMP
  verify [index]        Test & force-refresh token for an account
  help, -h, --help      Show help message
  version, -v           Show version

Options:
  --dry-run             Validate without saving to OMP
  --project <id>        Set Google Cloud Project ID (default: "aicode-consumers")
  --verify              Verify token immediately after importing
```

## License

[MIT](LICENSE)

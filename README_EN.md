# 🚀 omp-antigravity-auth

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: OMP](https://img.shields.io/badge/Platform-Oh%20My%20Pi%20(omp)-purple.svg)](https://omp.sh)
[![Node: >=18.0.0](https://img.shields.io/badge/Node->=18.0.0-green.svg)](https://nodejs.org)

[**中文说明**](README.md) | **English Documentation**

**omp-antigravity-auth** is a dedicated account credential and Google `refresh_token` (RT) importer and in-session extension for **Oh My Pi (omp)**.

It solves common friction points when managing or acquiring Google accounts—such as **CAPTCHA challenges, device verification blocks, geographical availability restrictions, and IP risk controls**. By directly importing Google OAuth `refresh_token` credentials into OMP's local store, OMP can smoothly rotate and utilize models like Gemini 3.1 Pro and Gemini 2.5 Flash without browser-based login loops.

---

## ✨ Features

- 📥 **Flexible Format Parser**:
  - **Antigravity Tool Export Format**: Native parsing of `antigravity_accounts_*.json` (both array and single object).
  - **Space / Tab Delimited**: `account@gmail.com 1//0xxxx...`
  - **Merchant Pipe Format**: `Account|Password|Recovery|2FA|Year|Country refresh_token:1//0xxxx...`
  - **Merchant Dash Format**: `Account----Password----Recovery----1//0xxxx...`
  - **Bulk Multi-line Paste**: Filters out comment lines, empty lines, deduplicates by email, and extracts valid pairs.
- 🔍 **Smart File Detection**: Automatically looks for the newest `antigravity_accounts_*.json` in Downloads and the current directory when no arguments are passed.
- ⚡ **Dual Operational Modes**:
  - **OMP In-Session Extension**: Type `/ag-import`, `/ag-list`, `/ag-verify` directly inside an active OMP conversation.
  - **Standalone Terminal CLI**: Use `omp-ag-auth` from any shell or automation workflow.
- 🛡️ **Native OMP Integration**: Compiles standard `omp auth import` documents, updates OMP's SQLite credential database, and triggers automatic token exchange and rotation.

---

## 📦 Installation

### Method 1: One-Click Script (Recommended)

Clone the repository and run the setup script to copy the extension into `~/.omp/agent/extensions/`:

- **Windows**: Double-click `install.bat`
- **Linux / macOS**:
  ```bash
  chmod +x install.sh
  ./install.sh
  ```

---

### Method 2: Global CLI Installation

```bash
cd D:/Project/omp-antigravity-auth
npm install
npm run build
npm link
```
After linking, `omp-ag-auth` can be invoked globally in any terminal.

---

### Method 3: Manual Extension Copy

Copy `extension/omp-antigravity-auth.ts` to your OMP extensions folder:
- **Windows**: `%USERPROFILE%\.omp\agent\extensions\`
- **Linux/macOS**: `~/.omp/agent/extensions/`

---

## 💡 Usage

### 1. In OMP Sessions (Slash Commands)

Inside any interactive `omp` session, use:

| Command | Description | Example |
| :--- | :--- | :--- |
| `/ag-import [target]` | Import account from a file path or direct string | `/ag-import C:\Users\Bowen\Downloads\antigravity_accounts_2026-10-31.json` |
| `/ag-import` | Scans for the latest Antigravity export file in Downloads | `/ag-import` |
| `/ag-list` | Display all configured Google Antigravity accounts in OMP | `/ag-list` |
| `/ag-verify [index]` | Force a token refresh to check account connectivity | `/ag-verify 1` |

> `/import-ag` is registered as an alias for `/ag-import`.

---

### 2. Standalone Terminal CLI

#### Import from Antigravity Tool JSON File
```bash
omp-ag-auth import C:\Users\Bowen\Downloads\antigravity_accounts_2026-10-31.json
```

#### Import from Raw Email and Token String
```bash
omp-ag-auth import "sample@gmail.com 1//0mock_antigravity_token_example..."
```

#### Import Merchant Export Line
```bash
omp-ag-auth import "sample@gmail.com|pass123|recovery@gmail.com|2FA|2024|US refresh_token:1//0mock_antigravity_token..."
```

#### Auto-Detect Latest Download
If run without arguments, it will automatically search your `Downloads` directory for matching `antigravity_accounts_*.json` files:
```bash
omp-ag-auth import
```

#### Dry Run Validation
Parse and validate accounts without committing changes to OMP:
```bash
omp-ag-auth import "account@gmail.com 1//0..." --dry-run
```

#### List Stored Accounts
```bash
omp-ag-auth list
```

#### Verify Connection
```bash
omp-ag-auth verify
```

---

## 📋 Supported Formats

### 1. Antigravity Tool Export (JSON Array)
```json
[
  {
    "email": "myaccount@gmail.com",
    "refresh_token": "1//0mock_antigravity_refresh_token_example..."
  }
]
```

### 2. Single JSON Object
```json
{
  "email": "myaccount@gmail.com",
  "refresh_token": "1//0mock_antigravity_refresh_token_example..."
}
```

### 3. Multi-line Merchant Text
```text
account1@gmail.com 1//0xxxxxx1
account2@gmail.com|password|recovery@gmail.com|2FA refresh_token:1//0xxxxxx2
account3@gmail.com----pass----1//0xxxxxx3
```

---

## ⚠️ Notes & Tips

1. **Proxy Environment**:
   When exchanging tokens, `omp` communicates with `https://oauth2.googleapis.com/token`. Ensure your terminal has proxy settings configured (`HTTP_PROXY` / `HTTPS_PROXY`) if Google services are restricted in your region.

2. **Age Verification**:
   Newly created accounts might trigger an `ineligibleTiers` status until age verification is completed. Log in to the Google account and visit [https://myaccount.google.com/age-verification](https://myaccount.google.com/age-verification).

3. **Backup Credentials**:
   You can export and back up all existing model credentials at any time:
   ```bash
   omp auth export > backup_credentials.json
   ```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

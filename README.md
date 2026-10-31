# 🚀 omp-antigravity-auth

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: OMP](https://img.shields.io/badge/Platform-Oh%20My%20Pi%20(omp)-purple.svg)](https://omp.sh)
[![Node: >=18.0.0](https://img.shields.io/badge/Node->=18.0.0-green.svg)](https://nodejs.org)

**English** | [**中文说明**](README.md) | [**English Documentation**](README_EN.md)

**omp-antigravity-auth** 是专为 **Oh My Pi (omp)** 打造的 Google Antigravity (Gemini) 账号凭据与 `refresh_token` (RT) 一键导入管理工具及会话扩展。

解决购买或管理 Google 账号时频繁遭遇的**网页登录验证码人机、设备验证、地区受限以及 IP 风控**等痛点。直接通过 Google OAuth `refresh_token` 导入凭据池，让 OMP 无缝轮换使用 Gemini 3.1 Pro、Gemini 2.5 Flash 等反重力模型。

---

## ✨ 核心特性

- 📥 **多格式智能解析**：
  - **Antigravity Tool 导出格式**：直接解析 `antigravity_accounts_*.json`（数组或单对象）。
  - **空格 / 制表符分隔**：`account@gmail.com 1//0xxxx...`
  - **号商竖线分隔格式**：`账号|密码|辅助邮箱|2FA|年份|国家 refresh_token：1//0xxxx...`
  - **号商横线分隔格式**：`账号----密码----辅助邮箱----1//0xxxx...`
  - **批量多行粘贴**：自动过滤注释与无效行，智能提取其中的邮箱与 Refresh Token 并去重。
- 🔍 **智能文件检测**：在未指定参数时，自动扫描“下载”与工作目录中最新的 `antigravity_accounts_*.json` 文件并提示导入。
- ⚡ **双模使用体验**：
  - **OMP 会话扩展**：在 OMP 会话中直接键入 `/ag-import`、`/ag-list`、`/ag-verify`。
  - **独立终端命令行**：通过 `omp-ag-auth` 在任何命令行或自动化脚本中使用。
- 🛡️ **原生无缝接入**：自动生成 `omp auth import` 标准结构，写入 OMP 凭据数据库，触发 OMP 内部原生 Token 轮换与自动换取机制。

---

## 📦 安装指南

### 方法一：一键脚本安装（推荐）

克隆或下载本仓库后，直接运行对应的安装脚本，自动将扩展安装至 `~/.omp/agent/extensions/`：

- **Windows**：双击运行 `install.bat`
- **Linux / macOS**：
  ```bash
  chmod +x install.sh
  ./install.sh
  ```

---

### 方法二：全局 CLI 安装

```bash
cd D:/Project/omp-antigravity-auth
npm install
npm run build
npm link
```
安装后即可在任意终端直接运行 `omp-ag-auth`。

---

### 方法三：手动安装扩展

将 `extension/omp-antigravity-auth.ts` 复制到 OMP 扩展目录即可：
- Windows: `%USERPROFILE%\.omp\agent\extensions\`
- Linux/macOS: `~/.omp/agent/extensions/`

---

## 💡 使用说明

### 1. 在 OMP 会话中使用（斜杠命令）

在 `omp` 交互式会话中直接使用以下命令：

| 命令 | 说明 | 示例 |
| :--- | :--- | :--- |
| `/ag-import [目标]` | 一键导入账号文件或文本内容 | `/ag-import C:\Users\Bowen\Downloads\antigravity_accounts_2026-10-31.json` |
| `/ag-import` | 未带参数时，自动查找 Downloads 中的最新 Antigravity 导出文件 | `/ag-import` |
| `/ag-list` | 查看当前 OMP 中已注册的所有 Antigravity 账号 | `/ag-list` |
| `/ag-verify [序号]` | 强制向 Google 发起 Token 刷新测试账号有效性 | `/ag-verify 1` |

> `/import-ag` 为 `/ag-import` 的同义别名。

---

### 2. 在独立终端中使用（CLI）

#### 导入 Antigravity Tool 导出的 JSON 文件
```bash
omp-ag-auth import C:\Users\Bowen\Downloads\antigravity_accounts_2026-10-31.json
```

#### 导入空格分隔的账号与 Token
```bash
omp-ag-auth import "sample@gmail.com 1//0mock_antigravity_token_example..."
```

#### 导入号商整行数据
```bash
omp-ag-auth import "sample@gmail.com|pass123|recovery@gmail.com|2FA|2024|US refresh_token:1//0mock_antigravity_token..."
```

#### 自动检测最近下载的文件
如果直接运行 `omp-ag-auth import`（不带参数），工具将自动在“下载”目录搜索形如 `antigravity_accounts_*.json` 的文件并提示导入：
```bash
omp-ag-auth import
```

#### 预检测试（Dry Run）
只解析并验证账号有效性，不向 OMP 实际写入凭据：
```bash
omp-ag-auth import "account@gmail.com 1//0..." --dry-run
```

#### 列出已有账号
```bash
omp-ag-auth list
```

#### 验证账号连接状态
```bash
omp-ag-auth verify
```

---

## 📋 支持的输入格式示例

### 1. Antigravity Tool 导出的 JSON 数组
```json
[
  {
    "email": "myaccount@gmail.com",
    "refresh_token": "1//0mock_antigravity_refresh_token_example..."
  }
]
```

### 2. 单个 JSON 对象
```json
{
  "email": "myaccount@gmail.com",
  "refresh_token": "1//0mock_antigravity_refresh_token_example..."
}
```

### 3. 多行号商混合文本（支持从剪贴板整段粘贴）
```text
account1@gmail.com 1//0xxxxxx1
account2@gmail.com|password|recovery@gmail.com|2FA refresh_token:1//0xxxxxx2
account3@gmail.com----pass----1//0xxxxxx3
```

---

## ⚠️ 常见问题与避坑指南

1. **终端网络代理**：
   导入凭据后，`omp` 会在后台向 Google OAuth 端点 (`https://oauth2.googleapis.com/token`) 请求 Access Token。请确保当前终端可以访问 Google 服务（如配置系统代理或设置 `HTTP_PROXY` / `HTTPS_PROXY`）。

2. **年龄验证（Age Verification）**：
   新购买的 Google 账号在首次调用反重力 API 时，可能会提示未成年限制错误。请在浏览器中登录该账号并访问 [https://myaccount.google.com/age-verification](https://myaccount.google.com/age-verification) 完成年龄确认。

3. **如何备份现有凭据**：
   在做大批量导入前，可随时备份 OMP 中已有的所有模型授权：
   ```bash
   omp auth export > backup_credentials.json
   ```

---

## 📄 开源许可证

本项目采用 [MIT License](LICENSE) 开源许可证。

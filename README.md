# omp-antigravity-auth

[English](README_EN.md) · [简体中文](README.md)

Google Antigravity / Gemini refresh token 凭据导入工具与 [Oh My Pi (omp)](https://omp.sh) 会话扩展。

支持直接将 Google OAuth refresh token 导入 OMP 本地凭据库，无需交互式浏览器登录。若仅提供 refresh token，会自动从 Google 校验并解析对应的 Gmail 邮箱。

## 安装

### OMP 一键安装（推荐）

```bash
omp plugin install github:Bowen-0x00/omp-antigravity-auth
```

本地开发链接：

```bash
omp plugin link /path/to/omp-antigravity-auth
```

卸载：

```bash
omp plugin uninstall omp-antigravity-auth
```

### 备选：脚本安装

也可以直接运行仓库自带的安装脚本，将单文件扩展复制到 `~/.omp/agent/extensions/`：

- **Windows**: 双击运行 `install.bat`
- **Linux / macOS**: `bash install.sh`

## 快速使用

### 1. 在 OMP 会话中使用（斜杠命令）

```text
/ag-import [文件路径 | 文本内容]
```

- `/ag-import 1//0xxxx...` — 直接输入 refresh token（自动解析对应 Gmail 邮箱）
- `/ag-import ./antigravity_accounts.json` — 导入 Antigravity 导出的 JSON 文件
- `/ag-import user@gmail.com 1//0xxxx...` — 导入单个账号与 refresh token
- `/ag-import` — 未指定参数时，自动扫描“下载”目录最新的 `antigravity_accounts_*.json` 并导入
- `/ag-list` — 列出当前 OMP 中已注册的所有 Antigravity 账号
- `/ag-verify [序号]` — 强制刷新 Token 并检验可用性
- `/ag-remove [序号 | 邮箱]` — 从 OMP 凭据库中删除指定账号

### 2. 独立终端中使用（CLI）

```bash
# 仅凭 refresh token 导入（自动解析邮箱）
omp-ag-auth import "1//0xxxx..."

# 导入 JSON 导出文件
omp-ag-auth import ./antigravity_accounts.json

# 导入单行文本（空格分隔）
omp-ag-auth import "user@gmail.com 1//0xxxx..."

# 导入分隔符文本（支持管道符、分号、制表符等）
omp-ag-auth import "user@gmail.com|...|refresh_token:1//0xxxx..."

# 未带参数：自动检测下载文件夹中的最新导出文件
omp-ag-auth import

# 预检模式（仅解析校验，不写入 OMP）
omp-ag-auth import ./antigravity_accounts.json --dry-run

# 列出已保存账号
omp-ag-auth list

# 验证 Token 连通性
omp-ag-auth verify

# 删除指定账号（支持序号或邮箱）
omp-ag-auth remove 1
omp-ag-auth remove user@gmail.com
```

## 支持的输入格式

### 仅 Refresh Token

直接输入 `1//0...` 字符串，工具将自动从 Google 解析并补全真实邮箱：

```text
1//0xxxx...
```

### JSON 数组（Antigravity Manager 导出格式）

```json
[
  {
    "email": "user@gmail.com",
    "refresh_token": "1//0xxxx..."
  }
]
```

### 单个 JSON 对象

```json
{
  "email": "user@gmail.com",
  "refresh_token": "1//0xxxx..."
}
```

### 文本 / 多行批量数据

支持空格、制表符、竖线（`|`）、横线（`----`）分隔，支持多行批量粘贴：

```text
user1@gmail.com 1//0xxxx1
user2@gmail.com|...|refresh_token:1//0xxxx2
user3@gmail.com----...----1//0xxxx3
```

## CLI 命令参数

```text
Usage: omp-ag-auth [command] [options] [arguments...]

Commands:
  import [target]       从文件、多行文本或单行字符串导入账号
  list                  查看 OMP 中已存储的 google-antigravity 账号
  remove <index|email>  删除指定账号（支持 1-based 序号或邮箱）
  verify [index]        测试并强制刷新账号 Token
  help, -h, --help      查看帮助
  version, -v           查看版本

Options:
  --dry-run             仅校验解析，不写入 OMP 凭据库
  --project <id>        指定 Google Cloud Project ID（默认: "aicode-consumers"）
  --verify              导入完成后立即验证 Token
```

## 许可证

[MIT](LICENSE)

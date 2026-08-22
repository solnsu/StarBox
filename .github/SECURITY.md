# StarBox 安全政策 / Security Policy

更新日期 / Last updated: 2026-08-21

## 中文

### 支持版本

StarBox 当前处于早期开发阶段。安全修复默认只应用于最新公开版本，不保证旧版本继续获得安全更新。用户应从项目主页下载最新版本，并在升级前自行备份本地数据。

| 版本 | 安全支持 |
| --- | --- |
| 最新公开版本 | 支持 |
| 更早版本 | 不保证支持 |

### 报告安全问题

如果发现 StarBox 存在安全漏洞，请不要创建公开 Issue，也不要在论坛、社交媒体或其他公开渠道披露漏洞细节。

请发送邮件至：`soln0708@163.com`

报告中建议包含：

- 受影响的 StarBox 版本；
- 操作系统及版本；
- 漏洞描述和可能影响；
- 可重复执行的复现步骤或最小复现示例；
- 相关日志、截图或错误信息；
- 已知的临时缓解措施或修复建议。

请勿在报告中发送真实的访问令牌、刷新令牌、ID Token、本地 API 密钥、认证文件、主密钥或其他用户敏感数据。必要时请使用已撤销的测试凭据，并对日志和截图进行脱敏。

### 处理流程

收到报告后，我们将尽力：

1. 确认已收到报告；
2. 评估漏洞的可复现性、影响范围和严重程度；
3. 在需要时与报告者沟通补充信息；
4. 开发、测试并发布修复；
5. 在修复可用后协调公开披露。

具体响应和修复时间取决于问题复杂度、第三方依赖和外部服务。本文不构成固定响应时限或服务级别承诺。

### 披露原则

在修复发布或双方商定公开时间之前，请对漏洞信息保密。未经授权访问他人账户、凭据、设备或数据，破坏服务可用性，进行社会工程、钓鱼、拒绝服务、自动化大规模扫描或数据外传，不属于善意安全研究范围。

安全研究者应遵守适用法律及第三方服务条款，并仅使用自己拥有或获得明确授权的账户、设备和数据。StarBox 无法授权针对 OpenAI、ChatGPT、Codex、GitHub、Unsplash 或其他第三方系统的测试。

### 安全边界

StarBox 会在本机处理认证凭据、本地 API 密钥、请求日志和生成内容。发现以下问题时建议通过本政策报告：

- 未授权读取或导出本地凭据；
- 加密存储或主密钥保护失效；
- 本地 API 认证绕过；
- 远程代码执行、命令注入或路径穿越；
- 跨账号数据泄露；
- 安装包、更新或依赖供应链风险；
- 可导致敏感数据发送到非预期接收方的问题。

第三方服务自身的问题应同时按照相应服务提供者的安全报告流程提交。

## English

### Supported versions

StarBox is currently in early development. Security fixes are generally applied only to the latest public release, and older versions are not guaranteed to receive security updates. Users should obtain the latest version from the project website and back up local data before upgrading.

| Version | Security support |
| --- | --- |
| Latest public release | Supported |
| Earlier releases | Not guaranteed |

### Reporting a vulnerability

If you discover a security vulnerability in StarBox, do not create a public issue or disclose the details through forums, social media, or other public channels.

Email reports to: `soln0708@163.com`

A useful report should include:

- the affected StarBox version;
- the operating system and version;
- a description of the vulnerability and its potential impact;
- reproducible steps or a minimal proof of concept;
- relevant logs, screenshots, or error messages; and
- any known mitigation or suggested fix.

Do not include real access tokens, refresh tokens, ID tokens, local API keys, authentication files, master keys, or other user-sensitive data. Use revoked test credentials where necessary and redact logs and screenshots.

### Response process

After receiving a report, we will make reasonable efforts to:

1. acknowledge receipt;
2. evaluate reproducibility, impact, and severity;
3. request additional information when needed;
4. develop, test, and release a fix; and
5. coordinate public disclosure after a fix is available.

Response and remediation time depends on complexity, third-party dependencies, and external services. This policy does not establish a guaranteed response time or service-level agreement.

### Disclosure and research boundaries

Keep vulnerability information confidential until a fix is released or a disclosure date is mutually agreed. Good-faith research does not include unauthorized access to another person’s accounts, credentials, devices, or data; disruption of service availability; social engineering; phishing; denial-of-service activity; large-scale automated scanning; or data exfiltration.

Researchers must comply with applicable law and third-party service terms and use only accounts, devices, and data they own or are expressly authorized to test. StarBox cannot authorize testing against OpenAI, ChatGPT, Codex, GitHub, Unsplash, or any other third-party system.

### Security scope

StarBox locally processes authentication credentials, local API keys, request logs, and generated content. Relevant reports include:

- unauthorized access to or export of local credentials;
- failure of encrypted storage or master-key protection;
- bypass of local API authentication;
- remote code execution, command injection, or path traversal;
- cross-account data exposure;
- installer, update, or dependency supply-chain risks; and
- unintended transmission of sensitive data to an unexpected recipient.

Issues in third-party services should also be reported through the applicable provider’s security process.

Project website: https://github.com/solnsu/StarBox  
Security contact: soln0708@163.com


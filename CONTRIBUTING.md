# Contributing to StarBox

[English](#english) | [简体中文](#简体中文)

## English

Thank you for helping improve StarBox.

### Before contributing

- Use GitHub Issues for reproducible bugs, focused feature proposals, and implementation discussions.
- Report security vulnerabilities privately by following [SECURITY.md](./SECURITY.md). Do not open a public issue for a vulnerability.
- Remove access tokens, refresh tokens, account identifiers, local databases, logs containing private prompts, and other sensitive data from reports and test fixtures.

### Development workflow

1. Fork the repository and create a focused branch.
2. Install dependencies with `npm ci`.
3. Make a narrowly scoped change and add or update tests when behavior changes.
4. Run `npm test`, `npm run typecheck`, and `npm run build`.
5. Open a pull request describing the problem, the solution, and verification performed.

By intentionally submitting a contribution for inclusion in StarBox, you agree that the contribution is provided under the [Apache License 2.0](./LICENSE), as described in Section 5 of that license.

The Apache License does not grant permission to use the StarBox name, logo, or official release identifiers to imply endorsement or official status. See [NOTICE](./NOTICE).

## 简体中文

感谢你参与改进 StarBox。

### 贡献前须知

- 可通过 GitHub Issues 提交可复现的问题、范围明确的功能建议和实现讨论。
- 安全漏洞请按照 [SECURITY.md](./SECURITY.md) 私下报告，不要公开创建漏洞 Issue。
- 提交报告和测试数据前，请删除访问令牌、刷新令牌、账号标识、本地数据库、包含私人提示词的日志及其他敏感信息。

### 开发流程

1. Fork 仓库并创建范围明确的分支。
2. 使用 `npm ci` 安装依赖。
3. 完成聚焦的修改；行为发生变化时，应增加或更新测试。
4. 运行 `npm test`、`npm run typecheck` 和 `npm run build`。
5. 创建 Pull Request，说明问题、解决方案和已完成的验证。

当你主动提交内容并同意将其纳入 StarBox 时，即表示你同意按照 [Apache License 2.0](./LICENSE) 提供该贡献，具体以该许可证第 5 条为准。

Apache-2.0 不授予使用 StarBox 名称、Logo 或官方发行标识来暗示官方认可或官方身份的权利，详见 [NOTICE](./NOTICE)。

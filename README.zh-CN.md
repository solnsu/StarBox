# StarBox

[English](./README.md) | [简体中文](./README.zh-CN.md)

StarBox 是一款本地运行的 ChatGPT/Codex 账号管理桌面应用，支持 Windows 与 macOS。

你可以使用 StarBox 管理多个账号、查看额度和可用模型、统计请求与 Token 消耗，并通过本地网关调用模型或进行图片创作。账号凭证、使用记录和创作内容均保存在本机。

## 操作手册

[查看 StarBox 操作手册](https://rcnavw2rdmby.feishu.cn/wiki/MkwFwO2bjiJQF6kJ9tZcaNJanud?from=from_copylink)

## 界面预览

![StarBox 界面预览 1](./starbox-preview-1.png)
![StarBox 界面预览 2](./starbox-preview-2.png)
![StarBox 界面预览 3](./starbox-preview-3.png)

## 下载

[下载 StarBox 最新版本](https://github.com/solnsu/StarBox/releases/latest)

- Windows：支持 64 位系统
- macOS：支持 Apple Silicon 与 Intel 芯片

## 开源

StarBox 源代码采用 [Apache License 2.0](./LICENSE) 开源。按照许可证条款，可以在 Linux、Windows、macOS 及其他平台上使用、修改、分发和商业使用。

不得使用 StarBox 名称、Logo 或官方发行标识来暗示官方认可或官方身份。归属和品牌说明见 [NOTICE](./NOTICE)，参与贡献请参阅 [CONTRIBUTING.md](./.github/CONTRIBUTING.md)。

## 从源码构建

建议使用 Node.js 22，并单独安装 [OpenAI Codex CLI](https://github.com/openai/codex)。

```bash
npm ci
npm test
npm run build
```

## 致谢

StarBox 的开发离不开优秀的开源项目和技术。详情请参阅[致谢名单](./docs/ACKNOWLEDGEMENTS.md)与[第三方软件声明](./docs/legal/THIRD_PARTY_NOTICES.md)。

## 社区致谢

感谢 [Linux.do](https://linux.do/) 社区对本项目的推广、反馈与支持。

## 法律、隐私与安全

- [最终用户许可协议（中英双语）](./docs/legal/EULA.txt)
- [最终用户许可协议（英文）](./docs/legal/EULA_EN.txt)
- [隐私政策](./docs/legal/PRIVACY.md)
- [安全政策与漏洞报告](./.github/SECURITY.md)

StarBox 是独立开发的第三方项目，与 OpenAI 不存在隶属、赞助、授权或官方合作关系。“OpenAI”、“ChatGPT”和“Codex”是其各自权利人的商标。

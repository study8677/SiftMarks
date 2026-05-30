# SiftMarks

[English](./README.md) | 简体中文

[![CI](https://github.com/Lling0000/SiftMarks/actions/workflows/ci.yml/badge.svg)](https://github.com/Lling0000/SiftMarks/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-16a34a.svg)](./LICENSE)
![Local-first](https://img.shields.io/badge/local--first-SQLite-2563eb.svg)
![MCP](https://img.shields.io/badge/MCP-ready-7c3aed.svg)

**面向 Chrome 的本地优先书签救援工具和 AI 记忆层。**

你的浏览器书签很可能已经是你拥有的最大私人知识库，但浏览器通常只把它当成标题、URL 和文件夹的列表。SiftMarks 把这份被忽略的浏览器状态，变成一个本地、可审查、可交给 AI 使用的记忆层。

它会导入真实的 Chrome 书签树，发现重复链接、含糊标题、失效状态和文件夹漂移，让你像审查 Pull Request 一样审查整理建议，把已接受的改动同步回 Chrome，并通过 MCP 把清理后的书签库交给 Claude、Cursor、Windsurf 等 AI 工具使用。

它不是要替代浏览器，也不会在后台悄悄重排你的书签。它的目标是让你已经保存过的知识重新可搜索、可审计，并成为私有 AI 上下文。

![SiftMarks 仪表盘](./docs/screenshots/dashboard.png)

[观看 20 秒演示视频](./docs/demo/siftmarks-demo.mp4)

## 为什么需要它

浏览器书签很适合在当下保存意图，却不擅长长期保留上下文。经历过几次导入、迁移和深夜随手收藏后，书签栏通常会变成重复 URL、模糊标题、失效链接和没人记得规则的文件夹集合。

SiftMarks 适合这些人：

- 收集文档、Issue、仓库、MCP 工具的开发者
- 保存论文、文章、数据集和参考资料的研究者
- 跟踪竞品、内部工具和市场资料的创业者、运营者
- 明明记得“我保存过”，但想不起准确标题的人

## 它能做什么

| 能力 | 状态 |
| --- | --- |
| Chrome 书签导入 | 通过本地 Web 应用或 Chrome 扩展可用 |
| 本地书签库 | 默认 SQLite 数据库在 `~/.siftmarks/siftmarks.sqlite` |
| 关键词搜索 | 使用 SQLite FTS，可直接使用 |
| 记忆搜索 | Web 搜索页已提供；配置 Provider 并生成 embedding 后使用向量信息，否则回退到关键词式结果 |
| Bookmark Rescue | 生成可审查的整理建议，包括重复、模糊标题、失效状态、标签和移动建议 |
| 同步回 Chrome | 通过扩展把已接受的重命名、移动、重复合并、失效删除同步回浏览器 |
| AI 元数据 | 默认 Mock；OpenAI 兼容和 Ollama 兼容 Provider 可生成摘要、标签、embedding、标题、AI 整理建议和分类移动 |
| MCP Server | 让 Claude、Cursor、Windsurf 等 MCP 客户端搜索、读取、总结、保存和整理书签 |

## 为什么不是浏览器自带书签搜索？

当你记得准确标题或 URL 时，Chrome 书签搜索很好用。但它解决不了书签长期维护的问题：

| 浏览器原生书签 | SiftMarks |
| --- | --- |
| 搜标题、URL、文件夹 | 搜本地索引、标签、摘要和生成的元数据 |
| 只展示当前混乱状态 | 生成可审查的整理建议 |
| 只能在浏览器 UI 内使用 | 通过 MCP 暴露给 AI 工具 |
| 编辑会直接发生 | 先在 SiftMarks 接受建议，再确认同步回 Chrome |
| 浏览器同步偏一体化 | 本地 SQLite 可检查；只有你选择同步回 Chrome 且 Chrome Sync 开启时，浏览器侧变化才会被 Chrome 同步 |

SiftMarks 不是要替代 Chrome 书签，而是让已有书签重新可恢复、可搜索、可作为 AI 上下文使用。

## 快速开始

环境要求：

- Node.js 18+
- npm
- 如需扩展导入和同步回 Chrome，需要 Google Chrome

```bash
git clone https://github.com/Lling0000/SiftMarks.git
cd SiftMarks
npm install
npm run build:packages
npm run dev
```

打开本地面板：

[http://localhost:4399](http://localhost:4399)

SiftMarks 默认把数据保存在本地：

```text
~/.siftmarks/siftmarks.sqlite
```

使用示例书签文件试跑，不影响真实书签库：

```bash
SIFTMARKS_HOME=/tmp/siftmarks-demo npm run cli -- init
SIFTMARKS_HOME=/tmp/siftmarks-demo npm run cli -- import examples/bookmarks.html
SIFTMARKS_HOME=/tmp/siftmarks-demo npm run cli -- search "mcp"
SIFTMARKS_HOME=/tmp/siftmarks-demo npm run cli -- rescue
```

## Chrome 使用流程

### 1. 启动本地应用

```bash
npm run build:packages
npm run dev
```

打开：

```text
http://localhost:4399
```

### 2. 加载 Chrome 扩展

扩展会连接本地服务 `http://localhost:4399`。

1. 打开 `chrome://extensions`。
2. 开启 **开发者模式**。
3. 点击 **加载未打包的扩展程序**。
4. 选择 `apps/chrome-extension`。
5. 点击浏览器中的 SiftMarks 扩展图标。

### 3. 导入书签

在扩展中点击 **Import All Browser Bookmarks**，或者在 Web 应用中导入浏览器导出的 `bookmarks.html` 文件。

通过扩展导入时，SiftMarks 会保留 Chrome 书签 ID，这也是后续能把已接受整理建议同步回原始浏览器书签的前提。

### 4. 审查整理建议

打开：

```text
http://localhost:4399/rescue
```

生成建议，检查 before/after JSON，接受可信的改动，忽略不需要的改动。SiftMarks 把书签整理做成 Pull Request 式流程：在你明确同步前，不会改动 Chrome。

### 5. 同步已接受改动回 Chrome

在扩展中点击 **Sync Back to Chrome**。扩展会在修改浏览器书签前弹出确认。

支持同步回 Chrome 的操作：

- 重命名已接受的书签
- 移动已接受的书签到目标文件夹
- 删除被选中合并的重复书签
- 删除被标记为失效的书签
- 在移动或删除后清理重复 URL 和空文件夹

如果你开启了 Chrome Sync，Chrome 可能会把这些浏览器侧变化同步到 Google 账号。

## MCP Server

SiftMarks 可以通过 MCP 把本地书签库暴露给 AI 客户端。

构建服务：

```bash
npm run build:packages
```

手动启动：

```bash
npm run cli -- mcp
```

Claude Desktop 配置示例：

```json
{
  "mcpServers": {
    "siftmarks": {
      "command": "node",
      "args": ["/absolute/path/to/SiftMarks/apps/mcp-server/dist/index.js"]
    }
  }
}
```

可用 MCP 工具：

| 工具 | 用途 |
| --- | --- |
| `search_bookmarks` | 搜索已保存书签 |
| `read_bookmark` | 读取单个书签详情 |
| `list_tags` | 列出标签和数量 |
| `list_folders` | 列出文件夹和数量 |
| `find_related_bookmarks` | 查找相关页面 |
| `summarize_collection` | 按标签或文件夹总结集合 |
| `save_bookmark` | 保存新书签 |
| `run_bookmark_rescue` | 生成整理建议 |
| `get_bookmark_stats` | 获取书签库统计 |

## 使用截图

### 像审查 Pull Request 一样整理书签

在真正改动 Chrome 前，先接受、忽略或批量应用整理建议。

![书签整理审查](./docs/screenshots/rescue.png)

### 浏览干净的本地书签库

按状态、文件夹、重复情况、缺失元数据和保存上下文筛选书签。

![书签库](./docs/screenshots/library.png)

### 按你记得的内容搜索

关键词搜索可以立即使用。配置 Provider 并生成摘要、embedding 后，可切换到记忆搜索。

![书签搜索](./docs/screenshots/search.png)

### 把书签连接到 AI 工具

通过 MCP 把本地书签库接入 Claude、Cursor、Windsurf 等客户端。

![MCP 配置](./docs/screenshots/mcp.png)

更多截图见 [`docs/screenshots`](./docs/screenshots)。

## AI Provider

SiftMarks 默认处于 **Mock** 模式。Mock 模式不会调用外部 AI API。

| 模式 | 开启能力 |
| --- | --- |
| **Mock** | 本地测试、FTS 索引、规则整理，不发生外部 AI 调用 |
| **OpenAI Compatible** | 通过 OpenAI、Azure OpenAI、Groq、Together 或兼容接口生成摘要、标签、embedding、标题、AI 整理建议和分类 |
| **Ollama Compatible** | 通过 Ollama 风格接口使用本地模型生成摘要、标签、embedding 和分类 |

可以在 Web 面板的 **Settings** 页面配置 Provider。只有在你配置 Provider 并触发索引、分类、AI Rescue 等 AI 动作后，才会发生外部或本地模型调用。

## 隐私模型

SiftMarks 默认本地优先：

- 不需要账号。
- 书签数据默认保存在本地 SQLite。
- Chrome 扩展只连接 `localhost:4399`。
- 应用不发送遥测数据。
- API Key 作为本地设置保存，不写入日志。
- 除非你显式配置 Provider，否则外部 AI 调用关闭。
- 同步回 Chrome 是显式操作，并且有确认步骤。

实际数据流见 [`docs/PRIVACY.md`](./docs/PRIVACY.md)。

## CLI

先构建：

```bash
npm run build:packages
```

然后使用本地 CLI：

```bash
npm run cli -- init
npm run cli -- stats
npm run cli -- doctor
npm run cli -- search "mcp browser automation"
npm run cli -- rescue
npm run cli -- export ./siftmarks-export.json
```

导入浏览器导出的书签 HTML：

```bash
npm run cli -- import ./bookmarks.html
```

为书签生成摘要、标签和 embedding：

```bash
npm run cli -- index --limit 100
```

默认 Mock Provider 下，索引会重建本地搜索数据，不会把书签发送给外部模型。

## 项目结构

```text
siftmarks/
  apps/
    web/              本地 Next.js 面板和 API
    cli/              命令行工具
    mcp-server/       MCP stdio 服务
    chrome-extension/ Chrome 导入和同步扩展

  packages/
    shared/           共享类型和工具函数
    db/               SQLite schema 和数据访问
    core/             导入、搜索、救援、整理逻辑
    ai/               Mock、OpenAI 兼容、Ollama Provider
    indexer/          FTS、摘要、标签、embedding
```

## 开发

```bash
npm install
npm run build:packages
npm run build
npm run typecheck
```

如果你想做实验但不想碰真实书签库：

```bash
SIFTMARKS_HOME=/tmp/siftmarks-test npm run cli -- init
```

## 当前状态和路线图

SiftMarks 当前已经包含本地面板、Chrome 扩展导入、已接受改动同步回 Chrome、SQLite 本地存储、FTS 关键词搜索、记忆搜索模式、整理建议、AI 摘要/标签/分类流程、MCP Server 和 CLI 工作流。

后续计划见 [`docs/ROADMAP.md`](./docs/ROADMAP.md)。近期方向包括更顺手的语义搜索、更好的文件夹策略控制、Firefox 支持和可选的网页全文本地归档。

## 贡献

欢迎贡献。请先阅读 [`CONTRIBUTING.md`](./CONTRIBUTING.md)，里面有环境设置、开发命令和项目边界。

## License

MIT。见 [`LICENSE`](./LICENSE)。

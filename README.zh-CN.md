# SiftMarks

[English](./README.md) | 简体中文

**把混乱的浏览器书签，变成你的本地 AI 记忆库。**

> 清理书签栏。按记忆搜索。把你的私人知识库交给 AI 工具使用。

SiftMarks 是一个本地优先的书签管理工具，适合那些“收藏很多，但真正要找时总是找不到”的人。它可以导入 Chrome 书签，清理重复链接和混乱文件夹，让书签库变得可搜索，并通过 MCP 把你保存过的知识交给 Claude、Cursor、Windsurf 等 AI 工具使用。

它的目标很简单：书签不应该是杂物堆，而应该像记忆一样能被找回。

SiftMarks 适合开发者、研究者、运营者、创业者，以及所有把浏览器当第二大脑、但早已被书签淹没的人。

## 预览

![SiftMarks 仪表盘](./docs/screenshots/dashboard.png)

## 演示视频

观看 20 秒产品演示：

[![观看 SiftMarks 演示视频](./docs/screenshots/dashboard.png)](./docs/demo/siftmarks-demo.mp4)

<video src="./docs/demo/siftmarks-demo.mp4" controls width="100%"></video>

如果当前 Markdown 查看器不渲染内嵌视频，可以直接打开 [`docs/demo/siftmarks-demo.mp4`](./docs/demo/siftmarks-demo.mp4)。

## 使用截图

### 像审查 Pull Request 一样整理书签

在真正改动 Chrome 之前，你可以先接受、忽略或批量应用整理建议。

![书签整理审查](./docs/screenshots/rescue.png)

### 浏览干净的本地书签库

按状态、文件夹、重复情况、缺失摘要和保存上下文筛选书签。

![书签库](./docs/screenshots/library.png)

### 按你记得的内容搜索

现在可以按关键词搜索；配置 AI Provider 后，可以继续扩展为更接近“记忆”的搜索方式。

![书签搜索](./docs/screenshots/search.png)

### 把书签连接到 AI 工具

通过 MCP 把本地书签库接入 Claude、Cursor、Windsurf 等 AI 客户端。

![MCP 配置](./docs/screenshots/mcp.png)

## 它能做什么

- **导入浏览器书签**：通过本地 Web 应用或 Chrome 扩展导入书签。
- **按含义或关键词搜索**：不必精确记住标题，也能找到以前保存过的页面。
- **拯救混乱书签栏**：识别重复链接、模糊标题、失效链接和文件夹混乱。
- **先审查再应用**：像代码审查一样，先看清理建议，再决定是否接受。
- **同步整理结果回 Chrome**：通过扩展把已接受的整理结果写回浏览器。
- **自动生成标签和摘要**：支持 Mock、OpenAI 兼容接口、Ollama 本地模型。
- **提供 MCP Server**：让 AI 客户端可以搜索、读取、保存和总结你的书签。
- **默认本地存储**：使用 SQLite，无需账号，默认不上传数据。

## 为什么需要 SiftMarks

浏览器书签很容易保存，但很难长期使用。几个月之后，书签栏里通常会堆满导入文件夹、重复链接、含糊标题、空文件夹和再也想不起用途的页面。

SiftMarks 把书签整理做成一个清晰流程：

1. 导入真实的浏览器书签状态。
2. 生成清理建议。
3. 审查并接受你认可的改动。
4. 通过 Chrome 扩展应用回浏览器。
5. 保留一个可搜索、可给 AI 使用的本地知识库。

## 快速开始

环境要求：

- Node.js 18+
- npm
- 如需导入或同步浏览器书签，需要 Google Chrome

```bash
npm install
npm run build
npm run dev
```

打开本地面板：

[http://localhost:4399](http://localhost:4399)

SiftMarks 默认把数据库保存在：

```text
~/.siftmarks/siftmarks.sqlite
```

## 推荐使用流程

### 1. 启动本地应用

```bash
npm run dev
```

然后打开：

```text
http://localhost:4399
```

Web 面板包含：

- **Import**：导入书签 HTML 文件，或检测本地浏览器。
- **Library**：按文件夹、标签、状态浏览书签。
- **Search**：搜索已保存页面。
- **Rescue**：审查书签整理建议。
- **Settings**：配置 AI Provider。
- **MCP**：查看 AI 客户端接入示例。

### 2. 加载 Chrome 扩展

扩展会连接本地服务 `http://localhost:4399`。

1. 打开 `chrome://extensions`。
2. 开启 **开发者模式**。
3. 点击 **加载未打包的扩展程序**。
4. 选择：

```text
apps/chrome-extension
```

加载完成后，点击浏览器里的 SiftMarks 扩展图标。

### 3. 导入 Chrome 书签

在扩展里点击：

```text
一键导入浏览器书签
```

它会读取当前 Chrome 书签，并导入到本地 SiftMarks 数据库。

### 4. 生成整理建议

打开：

```text
http://localhost:4399/rescue
```

点击生成，或在扩展里运行书签整理。SiftMarks 会生成类似这样的建议：

- 把书签移动到更清晰的文件夹
- 重命名含糊标题
- 检测重复 URL
- 标记失效链接
- 添加标签

你可以先审查建议，接受想要的改动，再同步回 Chrome。

### 5. 同步回 Chrome

在扩展里点击：

```text
同步回 Chrome
```

扩展会通过 Chrome Bookmarks API 应用已接受的改动，并可以进一步：

- 合并重复 URL
- 移除空文件夹
- 把零散文件夹收敛到可读的顶层分类

Chrome 会在修改书签前弹出确认框。如果你开启了 Chrome Sync，这些变化可能会同步到你的 Google 账号。

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

为书签生成摘要、标签和索引：

```bash
npm run cli -- index --limit 100
```

默认情况下，SiftMarks 使用 Mock AI Provider，因此不会把数据发送到外部 AI 服务。只有你显式配置 Provider 后，才会调用外部或本地模型。

## MCP Server

SiftMarks 可以通过 MCP 把你的书签库提供给 AI 客户端。

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

## AI Provider

SiftMarks 支持三种 AI 模式：

| 模式 | 适合场景 |
| --- | --- |
| **Mock** | 默认模式，不调用外部 AI，适合本地测试 |
| **OpenAI Compatible** | OpenAI、Azure OpenAI、Groq、Together 或兼容接口 |
| **Ollama Compatible** | 通过 Ollama 使用本地模型 |

可以在 Web 面板的 **Settings** 页面配置。

除非你显式配置 AI Provider，否则 SiftMarks 不会发起外部 AI 调用。

## 隐私模型

SiftMarks 默认本地优先：

- 不需要账号。
- 书签数据默认保存在本地 SQLite。
- Chrome 扩展只连接本机 `localhost:4399`。
- 应用不发送遥测数据。
- API Key 不会被记录到日志。
- 外部 AI 调用默认关闭。

注意：当你把整理结果应用回 Chrome 时，如果 Chrome Sync 已开启，Chrome 自身可能会把书签变化同步到你的 Google 账号。

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
    indexer/          FTS、摘要、标签、Embedding
```

## 开发

常用命令：

```bash
npm install
npm run dev
npm run build:packages
npm run build
npm run typecheck
```

如果你想做测试或实验，但不想碰真实书签库，可以指定临时目录：

```bash
SIFTMARKS_HOME=/tmp/siftmarks-test npm run cli -- init
```

## 当前状态

SiftMarks 当前已经包含：

- 本地 Web 面板
- Chrome 扩展导入
- 已接受整理建议同步回 Chrome
- SQLite 本地存储
- 关键词搜索和 FTS 索引
- 重复检测
- 整理建议
- AI 摘要和标签
- MCP Server
- CLI 工作流

后续可以继续增强语义搜索、文件夹策略编辑、Firefox 支持和网页全文本地归档。

## License

MIT

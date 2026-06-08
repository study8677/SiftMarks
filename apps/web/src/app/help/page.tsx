import Link from 'next/link';

const helpItems = [
  {
    title: '配置 AI 接入中心',
    desc: '设置 OpenAI、MiniMax、DeepSeek、Ollama 等 AI 服务，让 SiftMarks 可以生成摘要、标签和分类建议。',
    href: '/settings',
  },
  {
    title: '导入浏览器书签',
    desc: '上传 bookmarks.html 或通过插件同步浏览器书签。',
    href: '/import',
  },
  {
    title: '查看整理建议',
    desc: '生成失效链接、重命名、分类和标签建议，审核后再应用。',
    href: '/rescue',
  },
  {
    title: '连接 MCP 服务',
    desc: '把本地书签库连接到 AI 客户端，让外部工具搜索和读取书签。',
    href: '/mcp',
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-[22px] font-bold tracking-tight text-[#101828]">帮助与反馈</h1>
        <p className="mt-1 text-sm text-[#475467]">快速找到常用入口，并把问题反馈给维护者。</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {helpItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border border-[#dfe6f2] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)] hover:border-[#b9d3ff]"
          >
            <h2 className="font-semibold text-[#101828]">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#667085]">{item.desc}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-xl border border-[#dfe6f2] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <h2 className="font-semibold text-[#101828]">反馈方式</h2>
        <p className="mt-2 text-sm leading-6 text-[#667085]">
          当前是本地开发版。遇到问题时，可以先记录当前页面、操作步骤和错误提示；需要排查时优先查看本地终端和浏览器控制台。
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/settings" className="rounded-lg bg-[#1463ff] px-4 py-2 text-sm font-semibold text-white">
            检查 AI 配置
          </Link>
          <Link href="/mcp" className="rounded-lg border border-[#dfe6f2] px-4 py-2 text-sm font-semibold text-[#344054]">
            查看 MCP 配置
          </Link>
        </div>
      </section>
    </div>
  );
}

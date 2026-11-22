import React, { useState } from 'react';
import { Check, Copy, FileCode2, GitPullRequestDraft, PlugZap, Terminal } from 'lucide-react';
import { ClientAdapterKind } from '../hooks/useDeviceController';
import { BACKEND_CONTRACT_QUESTIONS, PR_DRAFT_MARKDOWN } from '../client/prQuestions';

interface ContractPrViewProps {
  adapterKind: ClientAdapterKind;
  onChangeAdapter: (kind: ClientAdapterKind) => void;
  telemetryRunning: boolean;
  telemetryTickCount: number;
}

export const ContractPrView: React.FC<ContractPrViewProps> = ({
  adapterKind,
  onChangeAdapter,
  telemetryRunning,
  telemetryTickCount,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyPr = async () => {
    try {
      await navigator.clipboard.writeText(PR_DRAFT_MARKDOWN);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for restricted clipboard environments
      const textarea = document.createElement('textarea');
      textarea.value = PR_DRAFT_MARKDOWN;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Swappable Client Adapter Proof */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#151A21]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <PlugZap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                单一可替换客户端验证（IDeviceClient）
              </h2>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              主窗口、系统托盘与 OSD 全部复用同一套状态中心和 <span className="font-mono-num">IDeviceClient</span> 接口。可在此切换至实机命名管道客户端以验证接入失败提示与重试流程。
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-[#0F1319]">
            <button
              type="button"
              onClick={() => onChangeAdapter('demo')}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                adapterKind === 'demo'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-blue-600 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              DemoDeviceClient（演示数据）
            </button>
            <button
              type="button"
              onClick={() => onChangeAdapter('named-pipe')}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                adapterKind === 'named-pipe'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-blue-600 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              NamedPipeDeviceClient（实机通道）
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 text-xs md:grid-cols-3 dark:border-slate-800">
          <div>
            <div className="text-slate-500 dark:text-slate-400">生产端 Windows 架构</div>
            <div className="mt-1 font-medium text-slate-900 dark:text-slate-100">
              C# .NET 8 LTS + 原生 WPF（按需销毁主窗）
            </div>
            <p className="mt-0.5 text-slate-500 dark:text-slate-400">
              关闭窗口释放 UI 树，仅留单进程 Win32 托盘 + 命名管道异步监听（空闲 ~12–22 MB / ~0% CPU）
            </p>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">遥测订阅门控状态</div>
            <div className="mt-1 font-mono-num font-medium text-slate-900 dark:text-slate-100">
              {telemetryRunning ? '运行中' : '已暂停（当前不在性能页或已最小化至托盘）'}
            </div>
            <p className="mt-0.5 font-mono-num text-slate-500 dark:text-slate-400">
              累计演示采样次数：{telemetryTickCount}
            </p>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">实机命名管道契约</div>
            <div className="mt-1 font-mono-num font-medium text-slate-900 dark:text-slate-100">
              \\.\pipe\MechrevoControl.Dove4.V1
            </div>
            <p className="mt-0.5 text-slate-500 dark:text-slate-400">
              UTF-8 JSON Lines · 携带 protocolVersion / requestId / revision
            </p>
          </div>
        </div>
      </section>

      {/* Windows Native C# .NET 8 Double-Click Build & Launch Guide */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#151A21]">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Windows 本地双击可执行演示版构建说明（C# .NET 8 单进程）
          </h2>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          仓库已同步包含极低资源占用的原生 Windows 单进程前端工程（<span className="font-mono-num">windows-app/</span>），与本在线演示共用同一套 <span className="font-mono-num">IDeviceClient</span> 接口与状态机逻辑。在任意 Windows 10/11 机器（无需管理员权限、不依赖无界 14 MAX 真机）均可一键打包成双击即开的 <span className="font-mono-num">.exe</span>：
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono-num text-xs leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-[#0B0E13] dark:text-slate-200">
{`# 1. 进入 windows-app 目录或直接双击 windows-app/build-demo.bat
dotnet publish windows-app/MechrevoControl.Frontend.csproj -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -o dist-win

# 2. 双击运行单文件演示版（普通用户权限）
dist-win\\MechrevoControl.Frontend.exe`}
        </pre>
      </section>

      {/* Backend Contract Open Questions & PR Draft */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#151A21]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <GitPullRequestDraft className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                待与后端 Agent 核对的接口字段与行为（草稿 PR 清单）
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              当前仓库尚未发现后端提交的 <span className="font-mono-num">contracts/</span> 定义；以下 7 项已同步写入 <span className="font-mono-num">docs/frontend-pr-draft.md</span>，可直接复制进草稿 PR。
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopyPr}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 whitespace-nowrap"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? '已复制 PR 草案 Markdown' : '复制草稿 PR 内容'}
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 pr-3 font-medium whitespace-nowrap">编号 / 优先级</th>
                <th className="py-2 px-3 font-medium">核对项与前端假设</th>
                <th className="py-2 pl-3 font-medium">需后端确认</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
              {BACKEND_CONTRACT_QUESTIONS.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="py-3 pr-3 whitespace-nowrap">
                    <div className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                      {item.id}
                    </div>
                    <div
                      className={`mt-0.5 text-[11px] font-medium ${
                        item.priority === '必须先定'
                          ? 'text-red-600 dark:text-red-400'
                          : item.priority === '联调确认'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {item.priority} · {item.category}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{item.title}</div>
                    <p className="mt-1 leading-relaxed text-slate-500 dark:text-slate-400">
                      {item.frontendAssumption}
                    </p>
                  </td>
                  <td className="py-3 pl-3 leading-relaxed text-slate-700 dark:text-slate-300">
                    {item.questionForBackend}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <FileCode2 className="h-3.5 w-3.5 shrink-0" />
          <span>完整草稿 PR 模板与核对清单已写入仓库 docs/frontend-pr-draft.md，供拉回本地分支提交草稿 PR 使用。</span>
        </div>
      </section>
    </div>
  );
};

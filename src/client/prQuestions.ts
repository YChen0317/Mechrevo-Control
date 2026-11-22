export interface ContractQuestion {
  id: string;
  category: string;
  title: string;
  frontendAssumption: string;
  questionForBackend: string;
  priority: '必须先定' | '联调确认' | '后续阶段';
}

export const BACKEND_CONTRACT_QUESTIONS: ContractQuestion[] = [
  {
    id: 'Q-01',
    category: '传输与握手',
    title: '命名管道名称、JSON-Lines 封包格式与协议版本协商',
    frontendAssumption:
      '暂定命名管道 \\\\.\\pipe\\MechrevoControl.Dove4.V1，双向 UTF-8 JSON 每行一条，每条请求携带 protocolVersion ("1.0.0") 与 requestId，服务重启返回新的 serviceInstanceId。',
    questionForBackend:
      '后端计划使用的正式管道名称、ACL 安全描述符（当前交互用户如何放行写权限）及 protocolVersion 校验策略（主版本不匹配时的精确错误码）是否已确定？',
    priority: '必须先定',
  },
  {
    id: 'Q-02',
    category: '切档读回与超时',
    title: 'setPerformanceMode 的超时时间窗与读回不一致字段',
    frontendAssumption:
      '前端在调用 setPerformanceMode("balanced" | "performance") 期间锁定操作，不提前更新 confirmedHardwareMode；超时返回 TIMEOUT 且不自动重放，读回不符返回 READBACK_MISMATCH 并附 requestedValue / actualReadbackValue。',
    questionForBackend:
      '后端写后读回的最大等待时长（例如 1500ms / 3000ms）是多少？若超时后固件实际延迟生效，是否保证立即通过 subscribeStatus 推送更高 revision 的最新快照？',
    priority: '必须先定',
  },
  {
    id: 'Q-03',
    category: '遥测门控节能',
    title: '窗口关闭至托盘时如何通知后端暂停高频遥测',
    frontendAssumption:
      '前端在主窗口销毁或切离「概览与性能」页时调用 setTelemetryActive(false)，避免后台轮询唤醒 CPU 与 EC。',
    questionForBackend:
      '后端是否支持按连接粒度声明遥测订阅级别（例如 idle_events_only vs active_telemetry），以及多客户端并发连接时如何取并集？',
    priority: '必须先定',
  },
  {
    id: 'Q-04',
    category: '未校准传感器与零值',
    title: '风扇原始值、EC 温区 TSR4、USB-C VBUS 的字段结构与过期标记',
    frontendAssumption:
      '缺失字段严格返回 null（前端显示「不可用」），真实零值返回 0；未校准读数放在 rawSensors 数组并附 source、calibrated: false、isStale。',
    questionForBackend:
      '后端是否同意用 rawSensors 数组承载未校准通道，待单位验证后再升级到带单位字段？单传感器超时时是否保留旧值并设 isStale: true，还是直接置 null？',
    priority: '联调确认',
  },
  {
    id: 'Q-05',
    category: '策略与硬件档位双轨',
    title: '「智能选档」「日用流畅」互斥切换与恢复失败语义',
    frontendAssumption:
      'Snapshot 同时返回 selectedPolicy（manual/smart/daily_smooth）与 hardwareMode（balanced/performance）；启用日用流畅自动暂停智能选档；切离日用流畅前若回滚原值失败返回 RESTORE_FAILED 并保持最后确认状态。',
    questionForBackend:
      '当用户处于「日用流畅」直接点击手动「性能」档时，是由后端在一次原子命令中先回滚再切档，还是要求前端先显式调用 restoreDailySmooth() 再调用 setPerformanceMode()？',
    priority: '联调确认',
  },
  {
    id: 'Q-06',
    category: '热键动作归属与去重',
    title: 'OemWMIEvent 动作执行方与前端会话动作库边界',
    frontendAssumption:
      '触摸板 (0x30/0x31) 仅做状态刷新与 OSD 提示；麦克风 (0xA1) 等需用户会话执行的动作由后端提供的 C# 库在前端单进程托盘中宿主；关闭本 App OSD 开关不影响热键动作本身。',
    questionForBackend:
      '后端提供的用户会话动作库（音频静音、刷新率切换）计划通过 NuGet/ProjectReference 的什么接口暴露给前端托盘进程？重连后 subscribeHotkey 是否严格不补放历史事件？',
    priority: '联调确认',
  },
  {
    id: 'Q-07',
    category: '充电阈值只读期',
    title: '电池限充字段 MICP/MXCP/EBCM 零值与不可用区分',
    frontendAssumption:
      '首版 batteryChargeLimit.writable = false，前端只读展示原始值 0 并说明“待实机停充与恢复默认验证”，不开放阈值滑块。',
    questionForBackend:
      '后续实机验证通过后，限充能力选项是离散预设（如 60/80/100%）还是连续阈值区间，是否需要额外返回“恢复原厂默认 0”的显式动作？',
    priority: '后续阶段',
  },
];

export const PR_DRAFT_MARKDOWN = `## [Draft PR] feat(frontend): 无界 14 MAX 单进程 Windows 控制台演示版与 IDeviceClient 契约

### 本次交付概览
- **前端单进程架构**：主窗口、系统托盘与 OSD 统一收拢在一个普通权限前端进程中。关闭主窗口即卸载主界面并调用 \`setTelemetryActive(false)\` 暂停高频遥测，后台仅保留托盘与事件监听，压低前台与后台资源占用。
- **可替换设备客户端**：全部界面、托盘与 OSD 仅依赖 \`IDeviceClient\`（\`getCapabilities\` / \`getSnapshot\` / \`setPerformanceMode\` / \`subscribeStatus\` / \`subscribeHotkey\`），演示版注入 \`DemoDeviceClient\`，后端就绪后仅需替换为 \`NamedPipeDeviceClient\`。
- **严格读回确认状态机**：切换「平衡 / 性能」时先进入等待读回态，绝不提前乐观修改已确认档位；支持完整演示 **切换成功、写后读回不一致、权限不足、设备忙、超时** 以及 **服务断线/重连** 场景。
- **策略与硬件档位双轨呈现**：「智能选档」与「日用流畅」默认按后端能力门控锁定，界面独立呈现「用户选择的策略」与「硬件实际档位」（如 \`日用流畅 · 硬件平衡档\`），并支持在演示调试台解锁验证应用与恢复失败边界。
- **双轨构建产物**：
  1. 在线/本地浏览器可立即交互试用的完整桌面模拟演示版（\`npm install && npm run dev\`）。
  2. Windows 原生极低占用 **C# .NET 8 WPF 单进程源码骨架**（位于 \`windows-app/\`），包含 \`build-demo.bat\` 一键生成可双击运行的单文件 \`.exe\`。

### 需与后端 Agent 核对的接口字段与行为
${BACKEND_CONTRACT_QUESTIONS.map(
  (q) =>
    `- **${q.id} [${q.priority}] ${q.title}**\n  - 前端当前假设：${q.frontendAssumption}\n  - 请后端确认：${q.questionForBackend}`,
).join('\n')}

### 本地运行与双击启动说明
- **Windows 原生演示版（推荐极低占用）**：在 Windows 10/11 安装 .NET 8 SDK 后，双击 \`windows-app/build-demo.bat\` 生成单文件可执行程序，双击输出目录中的 \`MechrevoControl.Demo.exe\` 即可运行（无需管理员权限，不依赖目标机型）。
- **前端交互演示预览**：执行 \`npm install && npm run dev\` 后在浏览器访问 \`http://localhost:3000\`，点击右侧「演示调试台」可逐项核验插电/离电、切档成功/失败、服务断线、热键 OSD 及能力门控。
`;

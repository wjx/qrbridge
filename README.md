# qrbridge

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_Xruru7cg3G7DfUddcVjaRyMLPkvN)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.

<a href="https://v0.app/chat/api/kiro/clone/wjx/qrbridge" alt="Open in Kiro"><img src="https://pdgvvgmkdvyeydso.public.blob.vercel-storage.com/open%20in%20kiro.svg?sanitize=true" /></a>

## Windows 桌面版

桌面版使用 Electron，本地打包 Generate 和 Scan 界面，无需浏览器、Node 服务或 Redis 即可使用。
Generate 支持输入文本或选择文件、自动分片生成二维码、翻页和自动播放，可离线使用。
支持屏幕／窗口缩略图选择、摄像头扫码、分片自动合并、缺失分片提示、复制结果和收集完成后自动停止捕获。
扫码内容仅保存在内存中，关闭程序后清除；桌面版不提供云端 Session。

### 开发与打包

构建环境：Windows x64、Node.js 24、pnpm 10.25.0。首次安装依赖及打包需要联网。

```powershell
pnpm install --frozen-lockfile
pnpm desktop:start
```

生成 Windows 安装程序：

```powershell
pnpm desktop:dist
```

产物（版本号随 `package.json` 变化）：

- `release/QRBridge-Setup-0.1.1-x64.exe`：安装版。
- `release/QRBridge-Portable-0.1.1-x64.exe`：免安装版，双击运行。
安装后的用户无需安装 Node.js，屏幕扫码可离线使用。
安装包默认未签名，正式发布时应配置代码签名证书。

也可在 GitHub Actions 手动运行 **Windows desktop**，或推送 `desktop-v*` 标签触发构建，
从该次运行的 `QRBridge-Windows-x64` artifact 下载安装包。此流程只生成构建产物，不自动发布 Release。

### 使用

默认打开 **Scan**；点击顶部 **Generate** 可生成二维码：输入文本、设置每片字符数，然后点击 **Generate QR Codes**。
传输文件时，选择 **File**，点击 **Choose a file** 选择文件，再点击 **Generate QR Codes**。
网页和桌面版均支持任意类型文件（包括空文件），不设固定文件大小上限（实际受设备内存和性能影响）；文件只在本地读取，不上传服务器。
接收端需使用更新后的 QR Bridge **Scan** 扫完全部二维码，校验通过后点击 **Download File**，按原文件名保存原始二进制内容。
支持乱序和重复扫描；缺片时不能下载，混入另一文件或文本的二维码会提示先清除结果。完整性校验失败需清除后重新扫描。
文件结果不保存到云端 Session。文件越大，二维码越多；默认每片 500 字符时，100 KiB 文件约需 365 片，建议优先传小文件。

多片二维码可手动翻页，或点击 **Auto Play** 并设置播放速度，供另一台设备扫描。
生成二维码后，可通过 **QR size** 滑块设置 256–1536px 的目标尺寸（显示值为适应可用空间后的实际尺寸）。点击 **Fullscreen** 全屏展示，保留翻页、播放／暂停、速度及尺寸控制；按 Esc 或点击 **Exit Fullscreen** 退出。全屏与普通视图分别保留尺寸设置，二维码始终保留白色边框。
播放速度支持 0.25、0.5、1、2、3、5 秒，默认仍为 2 秒。屏幕扫描每 100ms 尝试识别一次（最多约 10 次/秒），上一次识别未结束时跳过本次，避免任务堆积。
清晰画面可尝试 0.5 或 0.25 秒档位；如果漏片较多，可框选二维码区域或调慢播放速度。实际吞吐量取决于设备解码耗时和识别率。
切换回 **Scan** 会清空生成页面的输入和二维码；切换到 **Generate** 会停止当前扫描，已收集的扫描结果仍保留到关闭程序或手动清除。

1. 打开 QR Bridge，点击 **Capture Screen**。
2. 在缩略图列表中选择包含二维码的屏幕或窗口；关闭选择器或点击 Cancel 可取消。
3. 在捕获预览上拖动框选二维码区域（包含四周白边），松开后开始识别；也可点击 **Use Full Window** 扫描整个窗口。框选期间暂停识别。
4. 依次展示各分片。二维码位置变化时点击 **Reselect Area** 重新框选，或 **Use Full Window** 恢复全窗口扫描；重新框选时可点击 **Cancel Selection** 保留原选区。收集完整后自动停止捕获，点击 **Copy Text** 复制合并内容。
5. 扫描下一份内容前点击 **Clear Results**；也可通过 **Stop Capture** 手动停止。每次重新捕获都需要重新选择扫描区域或全窗口。

框选只限制识别范围，系统仍捕获整个所选窗口。选区按原始视频坐标裁剪后再缩放，避免先缩小整个窗口而丢失二维码细节。

窗口最小化、受保护的视频内容或某些远程桌面环境可能无法提供有效画面；可尝试选择整个屏幕。

### 结构与验证

- `desktop/`：本地界面入口、Electron 主进程和屏幕选择器。
- `scripts/prepare-desktop.cjs`：仅将桌面运行所需文件复制到 `desktop-app/`，不包含云端配置或 Next.js 服务。
- `electron-builder.yml`：Windows x64 NSIS 安装包配置。
- `pnpm exec tsc --noEmit`：类型检查；`pnpm desktop:build`：离线界面构建。
- `node --test tests/file-transfer.test.cjs`：文件往返、乱序、空文件、损坏与混片、大小限制及文本兼容测试。
- `pnpm desktop:test`：捕获授权、取消、重复请求、关闭窗口释放与导航限制测试。

Windows 实机验收应覆盖：双屏选择、窗口选择、取消选择后重新捕获、手动停止、分片合并与自动停止、
复制文本、关闭程序后捕获释放、断网启动和生成二维码、分片翻页与自动播放，以及 Generate / Scan 切换。
框选验收还应覆盖反向拖动、边界外松手、过小选区、预览窗口缩放、重新框选及取消、恢复全窗口和重新捕获后选区重置。
Linux 环境中的验证不能替代 Windows 实机验收。

## 剪贴板反馈补播

1. 显示端生成二维码，勾选 **Use clipboard feedback to replay missing codes**，点击 **Auto Play**。
2. 扫描端勾选 **Send scan progress through clipboard** 后开始扫描。每次进度变化会把当前缺失分片指令写入剪贴板（覆盖原剪贴板内容）。
3. 显示端每 500ms 读取反馈，当前一轮结束后只循环尚未收到的二维码；收齐后自动停止播放。没有反馈时继续原有轮播。

两端需使用新版 QR Bridge，并能共享剪贴板（例如远程桌面的剪贴板同步）。桌面版支持后台剪贴板读写。浏览器受剪贴板权限、页面焦点和安全上下文限制；自动读写失败时，可在扫描端点击 **Copy Feedback** 或选中反馈文本复制，在显示端粘贴后点击 **Apply Feedback**。

每次生成都会创建独立传输标识，其他传输和过期进度不会改变当前补播列表。新二维码包含 QRBR1 传输封装；新版仍可扫描旧二维码，但旧二维码不支持反馈补播。若要清空接收进度重新传输，请在显示端重新生成二维码。

## 一键构建 Windows EXE（支持 Ubuntu）

预先安装 Node.js 22.12+（推荐 24，包含 npm/npx），在项目目录运行：

```bash
pnpm desktop:exe
```

也可以从任意目录直接运行脚本：

```bash
node /home/j/src/qrbridge/scripts/build-exe.cjs
```

脚本在安装依赖前校验 pnpm 版本；若本机版本不匹配，会通过 npx 使用项目指定的 pnpm 10.25.0，不修改全局 pnpm。首次获取该版本需要网络。
脚本自动安装锁定版本的依赖、构建最新桌面资源、打包 Windows x64 便携版。
若未安装 pnpm，或旧版 pnpm 拒绝启动项目，可直接运行 `node scripts/build-exe.cjs`。不要使用 `--force` 重写锁文件。
输出为 `release/QRBridge-Portable-<版本>-x64.exe`，失败时返回非零退出码。
脚本不自动拉取代码；需要更新时先执行 `git pull --ff-only`。

Ubuntu 无需 Wine，会跳过 EXE 图标和元数据编辑。此命令只生成便携版；
安装版仍使用 `pnpm desktop:dist`，在 Ubuntu 上需要 Wine。
脚本优先查找当前安装版本的 Electron 缓存，不存在时由打包工具下载；首次安装依赖及下载需要网络。
可通过 `QRBRIDGE_ELECTRON_ZIP` 指定对应版本的 Windows x64 Electron ZIP 路径。

扫描统计只计算首次接收的分片，重复扫码不增加有效速度。Elapsed / Completed in 从第一片接收开始计时（包含暂停时间），完成后冻结；有效速度排除暂停时间。切换页签保留统计，Clear Results 重置统计。

### 自动调速（第一阶段）

生成内容后，先在接收端开启 **Send scan progress through clipboard**，确保进度能通过共享剪贴板传回发送端；在发送端勾选 **Adaptive speed**（自动开启读取反馈），再点击 **Auto Play**。同一份传输的单张容量保持固定。

- 从 500ms 起步，每 5 秒评估；只评估已展示且至少等待 1.5 秒的分片，未展示内容不计入失败。两个健康窗口后逐档提速，最快 200ms；接收率或有效吞吐下降时降速，并留出恢复观察期。
- 5 秒没有新增接收确认会逐步降速，最慢 2000ms。重复、过期或不属于本次传输的反馈不会刷新进度。暂停期间不判超时，恢复后重新观察；末尾少量缺片采用至少 500ms 的间隔。
- **Acknowledged payload / Effective throughput** 统计被确认一次的载荷字节和播放期间平均 B/s，不重复计算补发，也不含二维码协议头。文本按 UTF-8 计数，文件按实际传输的编码载荷计数（包含编码开销，并非原文件字节数）。完成后冻结，重新生成或清空时重置。
- 关闭自动调速可恢复手动档位；关闭剪贴板反馈会同时关闭自动调速。反馈被其他剪贴板内容覆盖时会保守降速，可重新开启接收端反馈或手动粘贴进度恢复。

短传输可能在调速前完成。实际收益需比较同一份数据在固定 250ms 与自动模式下完整收齐的耗时，不能保证自动模式总是更快。

接收端 **Live speed** 按最近 3 秒首次收到的载荷字节计算，每 500ms 刷新，自动使用 B/s 或 KiB/s（1 KiB = 1024 B）；重复扫描不计数，停收后在 3 秒内降至 0。**Average speed** 按有效扫描时间计算（包含首片前的扫描等待，排除暂停和框选时间），收齐后显示冻结的 **Final average**。文本按 UTF-8 字节计数，文件按编码载荷计数，不含二维码协议头。分片进度、剩余时间及完成耗时继续保留。

### 难扫分片的掩码补发

启用剪贴板反馈并自动播放时，发送端会对完整展示多次、等待反馈后仍缺失的分片轮换二维码掩码。首次使用编码器自动选择的图案，后续最多轮换 8 种；两次切换至少间隔 2 秒。最后仅剩一张缺片时也会继续尝试，不依赖页码变化。没有反馈或已确认收到的分片不会触发轮换，重新生成或清空会重置重试状态。

只改变编码图案：分片编号、内容、纠错等级、该分片网格大小、显示尺寸和四周白边均保持一致，不自动调整尺寸或位置，不会因为掩码补发超出原先选区。此功能与自动调速独立，使用手动速度档位自动播放时也生效；不同掩码的实机识别效果仍需验证。

## SSH 执行模式（桌面版）

桌面版顶部可以切换 **文件传输模式** / **执行模式**。文件传输模式保留原有 Generate / Scan 流程，不监听或执行命令。执行模式需要显式点击 **启用执行模式**：剪贴板仅用于接收端 → 发送端；握手、任务状态、命令输出全部通过发送端二维码返回。

### 首次配置

1. 在发送端安装 OpenSSH 客户端，确保 `ssh` 在 PATH 中。在该用户的 `~/.ssh/config`（Windows 通常为 `%USERPROFILE%\.ssh\config`）配置目标别名，例如：

   ```sshconfig
   Host dev-server
       HostName 192.168.1.20
       User developer
       IdentityFile ~/.ssh/id_ed25519
   ```

   先在发送端终端运行 `ssh dev-server hostname`，完成主机指纹核对并确认无交互登录可用。应用使用 `BatchMode=yes`、`StrictHostKeyChecking=yes`，不会弹出密码输入或自动信任未知主机。带口令的密钥需要预先通过 SSH agent 解锁。目标主机可以使用其默认远端 shell；第一版不提供 PTY、stdin、交互终端或交互式 sudo。
2. 两端打开执行模式，选择各自的发送端 / 接收端角色。展开 **显示本机配对密钥**，将一端生成的 64 位十六进制密钥填到另一端。只需在首次配对时同步，后续保存在本机。
3. 发送端填写允许使用的 SSH Host 别名，每行一个（字母、数字、下划线、连字符），启用执行模式。SSH 地址、用户名和私钥留在发送端 SSH 配置中。
4. 接收端设置 MCP 端口（默认 `3210`），启用执行模式，点击 **选择屏幕 / 窗口**，框选发送端二维码区域或使用全窗口。先收齐握手二维码，获得可用目标列表。
5. 可先使用 **手动执行** 提交 `hostname` 验证，再连接 MCP。保持扫码，任务状态和最终结果会自动归档；收完一份消息后继续扫描下一份。剪贴板会被持续更新为命令与缺片反馈的统一消息。

### MCP 接入

接收端展开 **MCP 客户端连接配置** 查看实际 URL 和独立的 Bearer token。客户端选择 **Streamable HTTP**，使用该 URL，并设置 `Authorization` 请求头。示例配置形状如下，外层配置字段按客户端调整：

```json
{
  "url": "http://127.0.0.1:3210/mcp",
  "headers": { "Authorization": "Bearer <接收端界面显示的令牌>" }
}
```

服务仅监听 `127.0.0.1`，只在接收端执行模式运行；不接受浏览器 Origin。MCP 客户端须与接收端桌面程序运行在同一台机器上，并支持自定义认证头。实现使用官方 MCP SDK 的无状态 Streamable HTTP JSON 响应。

- `ssh_targets()`：返回已通过二维码接收的目标别名。
- `ssh_submit({ target, command, timeoutMs?, requestId? })`：提交任务并立即返回 `jobId` 和 `queued` 状态。默认超时 30 秒，可设 1–300 秒。客户端重试提交时应复用 `requestId`，相同 ID 不会重复执行；相同 ID 配不同命令会被拒绝。
- `ssh_status({ jobId })`：查询本地缓存的状态、`stdout`、`stderr`、`exitCode` 和 `truncated`；依靠持续扫码接收更新，不长时间阻塞 MCP 调用。

`queued` 表示只在接收端排队；`accepted` / `running` 表示发送端已记录或开始执行；`completed` 表示 SSH 返回了退出码（退出码非零仍可能是 completed）；`failed` 表示已知启动或目标配置错误；`unknown` 表示不能确定远端执行结果。SSH 连接中断、超时、发送端运行中重启，或者下发后两分钟仍无回执，都会产生 unknown。**unknown 不代表远端已停止，不要自动换新 ID 重跑。** 继续扫码可能恢复结果，必要时在发送端核查远端进程。

### 传输、持久化与限制

- 单任务串行；结果未确认前发送端不接受下一次执行。任务与剪贴板确认在同一条经过 HMAC 认证的消息中发送，避免互相覆盖。两端系统时间应同步（允许约两分钟偏差）。配对密钥用于认证，不加密剪贴板或二维码内容。
- 结果分片支持乱序、重复、缺片重传，并复用现有自动调速与二维码掩码重试控制器。执行消息使用独立的 `QREX1` 标识，不混入文件传输协议。
- stdout 与 stderr 合计最多保留前 **32 KiB**，超出部分继续读取但丢弃，结果显示 `truncated: true`；最终结果一次性回传，不提供实时日志、取消任务或大输出文件导出。
- 执行任务先写入本地记录，再启动 SSH；重发同一 ID 只取已有状态。记录保存在 Electron `userData` 目录的 `execution.json`，包含配对配置、MCP 令牌、命令和输出；与原有仅内存保存的文件传输结果不同。重启会保留结果，并把发送端未完成任务标为 unknown，不自动重跑。最多保存 1000 个任务，达到上限拒绝新任务；归档及重新配对前需先核查未完成任务，删除记录后不能继续沿用旧配对密钥。
- 正在执行或发送端结果尚未确认时，退出执行模式和正常关闭窗口会被阻止；保持两端运行直到结果确认。异常退出仍可能留下远端进程。退出执行模式后可切回文件传输模式。
- SDK 随桌面应用打包，终端用户无需安装 Node.js；发送端仍需要可用的 OpenSSH 客户端。

验证：`pnpm desktop:test` 包含单向通道往返、丢片、重复请求、认证、重启恢复、SSH 超时与输出限制，以及官方 MCP 客户端连接测试；`pnpm exec tsc --noEmit` 和 `pnpm desktop:build` 验证类型和打包。Windows 实机仍需验收实际剪贴板同步、窗口捕获、二维码识别、SSH 配置和 MCP 客户端连接。

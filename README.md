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
Generate 支持输入文本、自动分片生成二维码、翻页和自动播放，可离线使用。
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
多片二维码可手动翻页，或点击 **Auto Play** 并设置播放速度，供另一台设备扫描。
播放速度支持 0.5、1、2、3、5 秒，默认仍为 2 秒。屏幕扫描每 100ms 尝试识别一次（最多约 10 次/秒），上一次识别未结束时跳过本次，避免任务堆积。
清晰画面可尝试 0.5 秒档位；如果漏片较多，可框选二维码区域或调慢播放速度。实际吞吐量取决于设备解码耗时和识别率。
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
- `pnpm desktop:test`：捕获授权、取消、重复请求、关闭窗口释放与导航限制测试。

Windows 实机验收应覆盖：双屏选择、窗口选择、取消选择后重新捕获、手动停止、分片合并与自动停止、
复制文本、关闭程序后捕获释放、断网启动和生成二维码、分片翻页与自动播放，以及 Generate / Scan 切换。
框选验收还应覆盖反向拖动、边界外松手、过小选区、预览窗口缩放、重新框选及取消、恢复全窗口和重新捕获后选区重置。
Linux 环境中的验证不能替代 Windows 实机验收。

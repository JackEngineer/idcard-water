# 技术验证记录

记录日期为 2026-11-13。本记录区分自动化检查、合成浏览器联调和原生平台验收。未经运行的项目不记为通过。

## 执行边界

用户选择本会话逐项实施。源码由单一写入者完成。分支为 `feat/offline-watermark`，没有执行提交、推送、PR 或公开发布。测试、截图和示例只使用虚构信息。

## Throughput checkpoint

- [x] Blocking first steps. Rust 工具链、字体与颜色验证先于图片功能开发。
- [x] Independent workstreams. 依赖下载可以并行，源码按核心、桌面、交互的依赖顺序完成。
- [x] Shared mutable state. 单个工作线程持有图片会话。预览队列按会话合并，导出与会话写操作互斥。
- [x] Smallest safe decomposition. 核心、原生适配、交互分别验证，不增加通用编辑器、云服务或持久化层。

## 已观察环境

- Apple Silicon，macOS 开发主机，Darwin 27.0.0。
- Rust 1.100.0，包含 rustfmt 和 Clippy。
- Node.js v22.23.2，npm 10.9.8。
- Apple Command Line Tools，ExifTool 13.55。
- 已安装 `aarch64-apple-darwin` 与 `x86_64-apple-darwin` 标准库。安装目标不等于对应机器运行通过。

初次安装曾遇到 Rust TLS 连接关闭和 Cargo HTTP/2 传输失败。Rustup 改用 curl 后端，Cargo 关闭 HTTP multiplexing 并保留 TLS 验证，之后下载和构建完成。

## 字体与颜色参考

Noto Sans CJK SC Regular 固定于 `notofonts/noto-cjk` 提交 `f8d157532fbfaeda587e826d4cd5b21a49186f7c`，路径为 `Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf`。

SHA-256 为 `2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b`。字体原文许可证保留于 `assets/fonts/LICENSE`，字体未修改，运行时不请求远程字体。

颜色验证使用已知 RGB 色块、灰度 JPEG、带 Gray ICC 的 PNG，以及 Display P3 PNG。macOS 的 P3 输入使用系统 Display P3 配置，通过 `sips --matchTo` 与系统 sRGB 配置独立生成参考结果。系统配置仅在本机测试使用，不复制进仓库。

初次 P3 参考图片的配置未被 ColorSync 识别，导致参考没有发生转换。修正参考素材后，moxcms 与 ColorSync 的 RGB 比较在每通道 3 的容差内通过，没有为迁就参考而修改生产颜色逻辑。

## 自动化结果

最近完整运行的 `cargo test --workspace --locked` 通过 26 项测试，零失败。

- 核心 15 项。覆盖字符与数值边界、中文栅格化、重复覆盖、八种 EXIF 方向、透明铺白、P3 和灰度转换、损坏 ICC、格式与资源限制、原图不变、PNG 像素和 JPEG 尺寸、确认缩略图及原像素细节。
- 桌面 11 项。覆盖原子导入、最多两张、输入快照、路径不暴露、不覆盖原图和已有结果、符号链接、失败重试不重复成功项、移除不复活输入、预览替换、导出互斥和工作线程失败恢复。

最近完整前端运行通过 15 项测试，零失败。另通过 TypeScript 类型检查、ESLint、Vite 生产构建及 `npm run check:privacy`。

前端回归验证曾捕获并修复延迟启动结果清空新导入图片、无效水印显示持续加载、全失败批次被描述为部分成功，以及失败项缺少输入文件名。测试还覆盖旧预览完成、对象 URL 清理、导出冻结参数和取消目录选择。

静态隐私检查验证生产 CSP、本地资源、空通用权限能力、无前端网络及持久化 API、未初始化禁止插件，以及 WebView2 离线安装模式。该检查不是完整运行时隐私证明。

## 实际输出与独立检查

`src-tauri/examples/verify_images.rs` 通过真实 `Service` 生成虚构的正反面样本，分别导出 JPEG 和 PNG。独立 ExifTool 检查先确认输入确实具有 GPS、方向、XMP、IPTC、注释和未加水印缩略图，再检查四份实际输出。检查通过，未复制这些源元数据。

重复命令为 `npm run verify:fixtures`。生成图片和源路径仅保存于被忽略的 `.verification` 目录。字体和示例文字均不是实际接收方或真实证件。

## 浏览器联调边界

`tests/browser.html` 明示合成验收，文件选择和取消使用测试替身。Vite 通过回环地址代理到独立 Rust 验证服务，水印图片和导出文件由真实 Rust `Service` 生成，不是前端叠字。

已操作中文多行预览、单张 JPEG 导出、两张 PNG 导出、第三张入口禁用、缺字错误、原像素细节，以及窄屏布局。100% 细节图像实测为 900 × 600 CSS 像素。375 像素视口的文档宽度为 375 像素，设置与导出入口可滚动到达。检查时未见浏览器控制台错误。

文件夹取消联调时，`start_export` 网络请求数在操作前后均为 0，界面没有成功报告并回到可编辑状态。该结果只覆盖明示的文件选择替身。

浏览器结果不替代 Tauri 原生文件选择、原生拖入、保存授权、跨进程网络观察或断网验收。

## 原生与发行边界

Apple Silicon 调试应用已经构建并以独立原生进程启动。初次包为临时签名，不含 Developer ID 或 Apple 公证。原生 UI 自动化被 macOS 辅助访问权限阻止，没有绕过权限或把未执行的流程算作通过。

最终包的架构、许可资源和校验和记录于 [发行检查表](release-checklist.md)。Windows 干净环境、Intel 实机、完整原生断网流程、缓存和日志取证、WebView 子进程网络捕获仍未验收。GitHub 工作流只在本地创建，未推送或执行。

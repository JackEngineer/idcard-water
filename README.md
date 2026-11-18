# 证件水印

在本机给身份证正反面等敏感照片添加用途水印。图片解码、中文排版、预览和导出均由 Rust 完成，不上传图片或水印文本。

当前为 `0.1.0` 开发版本，不是已完成跨平台验收的公开发行版。macOS 开发包已在 Apple Silicon 上构建并启动。原生选图、拖入和保存的完整验收受辅助访问权限限制。Windows 安装包、Intel 实机及干净环境离线安装尚未验收。

## 给照片添加水印

1. 打开桌面应用，点击 **选择图片**，或将照片拖入窗口。一次最多保留两张静态 JPEG 或 PNG 图片。
2. 在 **水印内容** 填写接收方、具体事项和日期。可点击 **填入用途模板** 和 **插入日期**。占位文字不是实际水印。
3. 检查合成预览。使用 **100% 细节** 查看原分辨率局部，确认文字覆盖且必要信息仍可辨认。
4. 选择 JPEG 或 PNG，点击 **导出当前图片** 或 **导出全部 2 张**，再选择保存文件夹。
5. 检查导出报告和实际图片，再发送给可信的接收方。失败项可沿用原批次水印重试。

原图不被覆盖。同名结果自动增加编号，已有文件、目录和符号链接不被替换。取消保存位置选择不会导出图片。

右上角的外观开关可选 **跟随系统**、**浅色** 或 **深色**，选择只在本次运行中有效，重新打开应用后恢复跟随系统。

## 输入与输出限制

- 输入仅支持静态 JPEG、PNG。HEIC、PDF、APNG、MPF 和 MPO 不支持。
- 每张输入最多 50 MiB、6400 万像素。解码器分配上限为 512 MiB，这不是进程总内存上限。大图仍可能消耗较多内存。
- 水印最多 200 个 Unicode 标量值、4 行。默认透明度 24%、角度 −30°、字号为短边的 3.5%。缺字或无法完整排版时禁止导出。
- 应用按 EXIF 方向校正图片，将受支持的 RGB 或灰度 ICC 配置转换到 sRGB。透明部分铺白。损坏或不支持的色彩配置报错，不静默忽略。
- 输出保持方向校正后的显示尺寸。JPEG 质量为 95，仍有有损编码。PNG 无损保存合成后的 RGB 像素，不表示保留输入文件的原始编码或全部色深。
- 输出重新编码，不复制原图的 EXIF、GPS、XMP、IPTC、注释或嵌入缩略图。

水印可能被编辑或移除，不能阻止转发，也不保证法律效力。应用不承诺安全擦除内存。系统云同步、备份、交换内存、截图及系统崩溃转储不受应用控制。详见 [隐私说明](docs/privacy.md)。

## 本地开发

需要 Node.js 22、npm、Rust 1.100.0，以及对应平台的 Tauri 2 构建环境。macOS 需要 Xcode Command Line Tools。Windows 需要 Visual Studio C++ Build Tools 和 Windows SDK。开发与构建首次下载依赖需要网络，不能与用户图片处理混为一谈。

安装前端依赖。

```bash
npm ci
```

启动原生桌面开发窗口。

```bash
npm run tauri -- dev
```

仅预览网页界面时，导入和导出会禁用。

```bash
npm run dev
```

测试只使用虚构素材。运行全部 Rust 测试。

```bash
cargo test --workspace --locked
```

检查 Rust 格式和原生代码。

```bash
cargo fmt --all -- --check
```

```bash
cargo clippy --workspace --all-targets --features desktop --locked -- -D warnings
```

检查前端和生产运行策略。

```bash
npm run typecheck && npm run lint && npm test && npm run build && npm run check:privacy
```

使用 ExifTool 独立检查真实合成导出。先在本机安装 ExifTool。

```bash
npm run verify:fixtures
```

## 生成开发包

先生成依赖许可证汇总。

```bash
node scripts/collect-licenses.mjs
```

在 macOS 安装另一架构的 Rust 标准库。

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

构建 universal macOS 开发应用。

```bash
npm run tauri -- build --debug --target universal-apple-darwin --bundles app
```

在 Windows x64 构建离线安装器。此命令尚未在本项目的 Windows 环境运行验证。

```bash
npm run tauri -- build --target x86_64-pc-windows-msvc --bundles nsis
```

Windows 配置使用 WebView2 `offlineInstaller`，构建时需要取得运行时安装器，用户安装时不应再下载运行时。该配置不能替代缺少 WebView2 的干净系统断网首装验收。

开发包未使用 Developer ID 签名或 Apple 公证，系统可能阻止打开。不要为运行开发包关闭系统安全设置。公开分发前必须完成 [发行检查](docs/verification/release-checklist.md)。

## 项目资料

- [产品设计](docs/superpowers/specs/2026-11-13-idcard-water-design.md)。
- [实施计划](docs/superpowers/plans/2026-11-13-idcard-water-implementation.md)。
- [技术验证记录](docs/verification/technical-baseline.md)。
- [第三方许可](THIRD_PARTY_NOTICES.md)。字体和可获得的依赖许可原文随桌面包提供。应用源代码许可证尚未指定，公开仓库不自动授予开源许可。

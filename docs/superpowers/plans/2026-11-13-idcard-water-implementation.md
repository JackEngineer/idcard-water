# Idcard Water Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` for inline execution, or use `subagent-driven-development` when the user chooses task-by-task delegation. Steps use checkbox (`- [ ]`) syntax for tracking. These skills are available without a `superpowers:` prefix in this session.

**Goal:** 为 macOS 和 Windows 用户提供完全本地处理的身份证图片水印工具，完成导入、中文水印预览和不覆盖原图的安全导出。

**Architecture:** 独立 Rust crate 负责图片解码、颜色与方向归一化、中文水印和编码。Tauri 2 负责原生文件授权、会话、串行任务与导出文件写入。React 界面仅展示派生预览、发送配置并呈现任务结果，不读取原图或实现第二套水印算法。

**Tech Stack:** Tauri 2、Rust、React、TypeScript、Vite、image、fontdue、moxcms、tempfile、Vitest、Testing Library、ExifTool。

---

## 执行依据和当前状态

实施依据是用户已确认的 [首版设计](../specs/2026-11-13-idcard-water-design.md)。本计划不扩大到 HEIC、OCR、裁剪、拼图、PDF、账号或云服务。

2026-11-13 制定计划时检查的环境如下。后续实施成绩以本节状态表及 [技术验证记录](../../verification/technical-baseline.md) 为准，不把预期结果当作验收成绩。

- 仓库没有提交，只有设计文档。不得假定 `HEAD` 或 `origin/main` 已存在。
- 当前机器为 macOS。Node.js 为 v22.23.2，npm 为 10.9.8，Apple 命令行工具存在。
- `rustc`、`cargo`、`rustup` 和 `exiftool` 尚未安装。
- 尚未提供 Windows 干净安装验收环境、Apple 签名身份或 Windows 签名证书。
- 下列源码、测试和命令均为实施内容，尚未创建或运行。预期结果不是当前测试成绩。

本计划的实施已获用户“本会话逐项实施”授权。提交、推送、创建 PR、发布安装包或使用发行凭据仍需用户明确授权。不得因计划中的验收或提交检查点自动执行这些动作。

### 实施状态，2026-11-13

下方复选项保留原始实施步骤，不作为全平台验收记录。当前结果如下。

| 任务 | 当前结果 |
| --- | --- |
| 1 | Rust 1.100.0、中文字体和独立 macOS ColorSync 颜色参考已验证。 |
| 2 至 5 | 图片核心已实现，15 项测试通过，实际 JPEG 和 PNG 导出已接受独立元数据检查。 |
| 6 至 8 | 桌面会话、串行工作线程、预览合并和不覆盖导出已实现，11 项测试通过。 |
| 9 至 10 | 中文界面及原生适配已实现，15 项前端测试通过。合成浏览器验收调用真实 Rust 服务，但使用文件选择替身。原生全流程仍未验收。 |
| 11 | 生产配置与源码静态隐私检查通过。说明和本地 CI 工作流已创建。完整断网、网络捕获、缓存及日志取证尚未完成。 |
| 12 | Apple Silicon macOS 开发应用已构建并启动。双架构构建及交付记录以发行检查表为准。Windows、Intel 实机、干净系统首装和公开发行签名未验收。 |

实现时将预览组件保留在 `Editor.tsx`，导出文件写入保留在 `session.rs`，没有为单一调用拆出空壳模块。原生拖入通知改用窄用途 Channel，不授予前端通用事件监听权限。以上调整不增加产品范围。

开发依赖下载需要联网。应用运行时不主动外联。只有合成图片可以用于开发、截图、自动测试和 CI，禁止使用真实身份证。

## 文件职责

以下均为拟创建的文件，不代表已经存在。先创建核心 crate，再连接桌面层，避免核心测试被桌面运行时阻塞。

| 文件 | 职责 |
| --- | --- |
| `Cargo.toml` | Rust workspace。起初只有核心 crate，桌面任务开始时再加入 `src-tauri`。 |
| `rust-toolchain.toml` | 环境准备后记录实际使用的 Rust 版本及格式检查组件。 |
| `package.json`、`package-lock.json` | 前端与 Tauri CLI 依赖、开发及检查命令。 |
| `index.html`、`vite.config.ts`、`tsconfig.json`、`tsconfig.app.json` | 前端构建与本地开发入口。 |
| `eslint.config.js` | TypeScript 与 React 的静态检查。 |
| `.gitignore` | 忽略构建产物、私密环境文件、临时图片与本机验收材料。 |
| `crates/watermark-core/Cargo.toml` | 与 Tauri 无关的图像核心依赖。 |
| `crates/watermark-core/src/lib.rs` | 导出核心使用者需要的类型与函数。 |
| `crates/watermark-core/src/model.rs` | 水印输入、校验后的配置、输出类型和错误码。 |
| `crates/watermark-core/src/decode.rs` | 格式识别、输入限制、方向处理和白色铺底。 |
| `crates/watermark-core/src/color.rs` | ICC 解析和 sRGB 颜色归一化。 |
| `crates/watermark-core/src/text.rs` | 本地字体、字符覆盖检查和多行排版。 |
| `crates/watermark-core/src/render.rs` | 居中完整水印、重复网格、旋转和透明度合成。 |
| `crates/watermark-core/src/output.rs` | JPEG、PNG 编码，以及适应窗口和细节预览。 |
| `crates/watermark-core/tests/support/mod.rs` | 生成虚构测试图片及读取测试字体。 |
| `crates/watermark-core/tests/contract.rs` | 输入与配置的公开行为测试。 |
| `crates/watermark-core/tests/rendering.rs` | 水印、方向、颜色、预览与编码测试。 |
| `assets/fonts/NotoSansCJKsc-Regular.otf` | 随应用携带的水印字体。 |
| `assets/fonts/LICENSE`、`THIRD_PARTY_NOTICES.md` | 字体原始许可、来源与依赖许可说明。 |
| `src-tauri/Cargo.toml`、`src-tauri/build.rs` | 桌面 crate 依赖与构建。 |
| `src-tauri/tauri.conf.json`、`src-tauri/capabilities/main.json` | 本地资源、窗口、CSP、能力权限及打包配置。 |
| `src-tauri/src/main.rs`、`src-tauri/src/lib.rs` | 桌面启动与命令登记。 |
| `src-tauri/src/session.rs` | 不超过两张图片的会话、输入快照与授权记录。 |
| `src-tauri/src/jobs.rs` | 单个图像工作线程、预览合并和导出互斥。 |
| `src-tauri/src/commands.rs` | 有限用途 IPC 与安全错误映射。 |
| `src-tauri/src/export.rs` | 导出快照、逐项结果和禁止覆盖的文件写入。 |
| `src-tauri/tests/session.rs`、`src-tauri/tests/export.rs` | 会话授权、忙碌状态、重试和文件安全测试。 |
| `src/main.tsx`、`src/App.tsx` | 中文单窗口应用入口。 |
| `src/features/editor/model.ts` | 前端类型、状态转换和过期结果拒绝。 |
| `src/features/editor/native.ts` | 对 Tauri IPC 的集中适配。 |
| `src/features/editor/Editor.tsx` | 图片切换、水印表单、导入和导出。 |
| `src/features/editor/Preview.tsx` | 适应窗口、细节区域和对象 URL 生命周期。 |
| `src/features/editor/editor.css` | 布局、键盘焦点、忙碌和错误状态样式。 |
| `src/features/editor/model.test.ts`、`src/features/editor/Editor.test.tsx` | 状态与用户可见交互测试。 |
| `src/test/setup.ts` | 前端测试环境。 |
| `scripts/make-fixtures.mjs` | 通过核心测试产物与 ExifTool 生成带敏感元数据的合成样本。 |
| `scripts/check-export-metadata.mjs` | 用独立工具检查实际导出文件的敏感元数据。 |
| `scripts/check-runtime-policy.mjs` | 检查打包资源、权限和未引入的联网插件。 |
| `docs/verification/technical-baseline.md` | 技术验证记录、实际系统版本及选型结果。 |
| `docs/verification/release-checklist.md` | 各平台安装、离线、签名和隐私验收证据索引。 |
| `docs/privacy.md`、`README.md` | 本地处理承诺、限制和使用说明。 |
| `.github/workflows/check.yml` | 只用合成素材执行 Rust、前端与平台构建检查。 |

不为每个界面按钮建立服务层，不引入数据库、全局状态库、路由或通用图片插件系统。

## 核心接口约定

任务 2 定义并导出以下契约。后续任务不得各自发明字段名或另开一套输入校验。

| 名称 | 契约 |
| --- | --- |
| `WatermarkDraft` | `text: String`、`opacity: f32`、`angle_deg: f32`、`size_ratio: f32`、`color: [u8; 3]`。 |
| `WatermarkSpec::try_from` | 将 `WatermarkDraft` 转换为校验后的只读配置，返回 `CoreError`。 |
| `NormalizedImage` | 方向正确、已铺白底、sRGB 的 RGB8 像素。提供 `dimensions()` 和只读 `pixels()`。 |
| `WatermarkFont::bundled()` | 读取随包字体，返回可排版和栅格化的字体对象，不查找系统字体或网络字体。 |
| `decode(bytes: &[u8])` | 返回 `Result<NormalizedImage, CoreError>`，不接受路径，不写磁盘。 |
| `render(image, spec, font)` | 参数分别为上述三个类型的共享引用，返回 `Result<WatermarkedImage, CoreError>`。不修改输入。 |
| `WatermarkedImage` | 只有成功的水印合成过程能够构造。提供 `dimensions()` 和只读 `pixels()`，不公开像素构造器。 |
| `OutputFormat` | 只有 `Jpeg` 和 `Png`，JPEG 质量固定为 95。 |
| `encode(image, format)` | 接收 `&WatermarkedImage` 和 `OutputFormat`，返回编码后的 `Vec<u8>`，不复制源图附加数据。 |
| `PreviewTarget` | `Fit { max_edge: u32 }` 或 `Detail { x: u32, y: u32, width: u32, height: u32 }`。 |
| `preview(image, target)` | 接收 `&WatermarkedImage`，返回 PNG 预览字节。越界细节区域返回错误。 |
| `CoreError` | `UnsupportedFormat`、`AnimatedInput`、`InputTooLarge`、`ImageTooLarge`、`DecodeFailed`、`ColorProfileFailed`、`EmptyText`、`TextTooLong`、`TooManyLines`、`InvalidStyle`、`MissingGlyph`、`LayoutDoesNotFit`、`InvalidPreview`、`EncodeFailed`。 |

未填写水印时的输入缩略图只在桌面层作为导入确认用途生成，不产生 `WatermarkedImage`，不能传给 `encode`。界面不能要求核心跳过水印校验后直接导出。

## 任务 1. 准备工具链并完成技术验证

**文件。** 创建 `rust-toolchain.toml`、`docs/verification/technical-baseline.md`，下载字体到 `assets/fonts/` 并保留 `LICENSE`。本任务不运行覆盖式应用脚手架，不覆盖已经存在的文档或 `.git`。

- [ ] 从 Rust 官方安装入口 `https://rustup.rs/` 准备稳定版工具链。下载脚本放入单独的新临时目录，先检查内容，再执行。不要从下载目录启动 Python、Node 或项目构建。原生依赖和 ExifTool 按本机实际包管理器准备，不假定 Homebrew 已安装。
- [ ] 检查工具版本。记录命令输出，不填写猜测的 Rust 或 ExifTool 版本。

```bash
rustc --version && cargo --version && node --version && npm --version && exiftool -ver
```

预期是五个工具均返回版本，没有 `command not found`。这是进入后续构建任务的前置条件，不是当前已通过的检查。

- [ ] 在项目中锁定实际安装的 Rust 版本，并添加 `rustfmt`、`clippy` 组件。下载字体时记录确切来源提交和 SHA-256，不使用可变分支名充当可复现来源。字体下载只能包含字体与许可，不执行字体仓库脚本。
- [ ] 在核心 crate 的最小测试中，加载目标字体并栅格化“仅供办理入职使用”。验证每个非空白字符的 `has_glyph` 为真。使用 fontdue 的 `from_bytes`、`has_glyph` 和 `rasterize`，不要在字体不兼容时静默更换字体。
- [ ] 验证 `moxcms::ColorProfile::new_from_slice`、`new_srgb` 与 `create_transform_8bit` 能处理测试 ICC。用明确的 RGB8 布局执行变换。sRGB 输入做恒等检查，非 sRGB 合成色块与独立颜色管理工具生成的参考结果比较。CMYK 或损坏配置不能被误当作 RGB 配置。
- [ ] 记录文件尺寸、像素尺寸、方向处理、中文排版和颜色转换的结果。若出现字体格式或颜色管理不兼容，先解决这一项再继续，不把它隐藏到发行阶段。禁止在本轮规划中把这些实验标记为通过。

**检查点。** Rust 与元数据工具可用，目标字体可实际渲染，颜色转换有独立参照。只在此前提满足后进入任务 2。用户未授权提交时，只保留本地文件和测试记录。

## 任务 2. 建立核心 crate 和可校验的水印配置

**文件。** 创建根 `Cargo.toml`、`crates/watermark-core/Cargo.toml`、`src/lib.rs`、`src/model.rs`、`tests/contract.rs` 和 `.gitignore`。本节的 `src` 与 `tests` 均指核心 crate 下的对应目录。

- [ ] 根 workspace 初始只包含 `crates/watermark-core`，不要引用尚不存在的桌面 crate。核心只启用 JPEG、PNG 编解码功能。依赖解析后提交候选包括 `Cargo.lock`，不使用默认开启的全部图片格式来扩大输入范围。

```toml
[workspace]
members = ["crates/watermark-core"]
resolver = "2"
```

- [ ] 写配置行为测试，先运行，确认缺少实现导致失败。默认值为透明度 `0.24`、角度 `-30.0`、字号比例 `0.035`、颜色 `[80, 80, 80]`。文本初始为空，默认配置不能直接用于导出。

```rust
use watermark_core::{CoreError, WatermarkDraft, WatermarkSpec};

#[test]
fn rejects_empty_watermark() {
    let draft = WatermarkDraft::default();
    assert!(matches!(
        WatermarkSpec::try_from(draft),
        Err(CoreError::EmptyText)
    ));
}

#[test]
fn accepts_chinese_with_date() {
    let draft = WatermarkDraft {
        text: "仅供测试单位办理测试业务使用\n2026-11-13".into(),
        ..WatermarkDraft::default()
    };
    assert!(WatermarkSpec::try_from(draft).is_ok());
}

#[test]
fn rejects_non_finite_style() {
    let draft = WatermarkDraft {
        text: "仅供测试使用".into(),
        opacity: f32::NAN,
        ..WatermarkDraft::default()
    };
    assert!(matches!(
        WatermarkSpec::try_from(draft),
        Err(CoreError::InvalidStyle)
    ));
}
```

```bash
cargo test -p watermark-core --test contract
```

- [ ] 定义接口表中的类型和错误码。原始参数与校验后的配置分开。校验顺序固定为换行归一化、文本非空、字符数、用户输入行数和数值范围。
- [ ] 配置校验的关键规则如下。使用 `text.chars().count()`，不使用 UTF-8 字节长度，也不按 JavaScript UTF-16 单元计数。透明度允许 `0.10..=0.60`，角度允许 `-60.0..=60.0`，字号比例允许 `0.01..=0.12`。这些是控件与 Rust 共用的首版取值范围。

```rust
let text = draft.text.replace("\r\n", "\n").replace('\r', "\n");
if text.trim().is_empty() {
    return Err(CoreError::EmptyText);
}
if text.chars().count() > 200 {
    return Err(CoreError::TextTooLong);
}
if text.split('\n').count() > 4 {
    return Err(CoreError::TooManyLines);
}
if !draft.opacity.is_finite()
    || !draft.angle_deg.is_finite()
    || !draft.size_ratio.is_finite()
    || !(0.10..=0.60).contains(&draft.opacity)
    || !(-60.0..=60.0).contains(&draft.angle_deg)
    || !(0.01..=0.12).contains(&draft.size_ratio)
{
    return Err(CoreError::InvalidStyle);
}
```

- [ ] 增加恰好 200 字、201 字、4 行、5 行、CRLF、纯空白、无穷值和数值边界测试，重新运行同一测试命令。预期全部通过。

**检查点。** 非法配置不能进入合成函数，配置错误不包含用户文本。使用者不能通过 JSON 反序列化直接构造校验后的 `WatermarkSpec`。

## 任务 3. 实现受限图片解码和归一化

**文件。** 创建核心 `src/decode.rs`、`src/color.rs`、`tests/support/mod.rs`，扩展 `tests/contract.rs` 与 `tests/rendering.rs`。

- [ ] 在 `tests/support/mod.rs` 定义 `rgb_png(width, height) -> Vec<u8>`，用 `image::RgbImage::from_pixel` 与 `DynamicImage::write_to` 生成纯色合成 PNG。输入不是下载的证件，也不包含真实身份信息。

```rust
use std::io::Cursor;
use image::{DynamicImage, ImageFormat, Rgb, RgbImage};

pub fn rgb_png(width: u32, height: u32) -> Vec<u8> {
    let pixels = RgbImage::from_pixel(width, height, Rgb([240, 240, 240]));
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::ImageRgb8(pixels)
        .write_to(&mut bytes, ImageFormat::Png)
        .expect("synthetic PNG encoding");
    bytes.into_inner()
}
```

- [ ] 写识别和资源限制测试并先运行。测试数据以内容为准，不能通过改扩展名骗过格式识别。

```rust
mod support;
use watermark_core::{decode, CoreError};

#[test]
fn rejects_non_images() {
    assert!(matches!(decode(b"not an image"), Err(CoreError::UnsupportedFormat)));
}

#[test]
fn rejects_input_above_fifty_mib() {
    let bytes = vec![0u8; 50 * 1024 * 1024 + 1];
    assert!(matches!(decode(&bytes), Err(CoreError::InputTooLarge)));
}

#[test]
fn decodes_synthetic_png_without_resizing() {
    let decoded = decode(&support::rgb_png(320, 200)).unwrap();
    assert_eq!(decoded.dimensions(), (320, 200));
}
```

```bash
cargo test -p watermark-core --test contract
```

- [ ] 实现内容识别，只接受静态 JPEG 和 PNG。PNG 通过 `PngDecoder::is_apng()` 拒绝 APNG，即使它的第一帧可以解码。JPEG 还应检查 MPF 多图索引，拒绝 MPO 等多图输入，不能因解码器只返回第一张就把它当作静态单图。超过 50 MiB 的输入应在解析之前拒绝。用检查溢出的乘法确认宽乘高不超过 64,000,000，并在解码前将解码器分配上限设为 512 MiB，不依赖 `image` 默认限制。该分配上限不是整个进程的内存承诺。
- [ ] 在消费解码器之前读取方向和 ICC。应用全部八种 EXIF 方向，包括镜像。先得到正确颜色，再以白色背景合成透明通道。透明像素的 RGB 隐藏值不能直接作为不透明输出像素。
- [ ] `color.rs` 使用任务 1 验证的 moxcms 调用，将可处理的嵌入配置转换为 sRGB。无配置的 RGB 或灰度输入按 sRGB 处理。无法支持的颜色模型、损坏配置或转换失败返回 `ColorProfileFailed`，不能静默忽略。
- [ ] 加入八方向四色角点样本、透明 PNG、灰度 JPEG、sRGB 与非 sRGB ICC、损坏头部、6400 万像素边界及超限头部测试。角点期望由测试固定，不调用待测方向算法计算期望。超限头部测试不得实际分配巨大像素缓冲。

```bash
cargo test -p watermark-core --test rendering
```

**检查点。** 核心只产生方向正确、白底、sRGB 的 RGB8 图像。任何失败都不写文件。首版实际支持的颜色模型写入技术验证记录。

## 任务 4. 完成中文排版、完整覆盖和统一合成

**文件。** 创建核心 `src/text.rs`、`src/render.rs`，扩展 `src/model.rs`、`tests/rendering.rs` 和字体许可说明。

- [ ] 先写可见结果测试。测试比较合成图与输入像素，验证输入不变，不能只断言函数返回 `Ok`。

```rust
mod support;
use watermark_core::{decode, render, WatermarkDraft, WatermarkFont, WatermarkSpec};

#[test]
fn burns_chinese_watermark_without_changing_source() {
    let source = decode(&support::rgb_png(1200, 800)).unwrap();
    let before = source.pixels().to_vec();
    let spec = WatermarkSpec::try_from(WatermarkDraft {
        text: "仅供测试单位办理测试业务使用".into(),
        ..WatermarkDraft::default()
    }).unwrap();
    let font = WatermarkFont::bundled().unwrap();
    let output = render(&source, &spec, &font).unwrap();
    assert_eq!(output.dimensions(), (1200, 800));
    assert_eq!(source.pixels(), before.as_slice());
    assert_ne!(output.pixels(), source.pixels());
}
```

```bash
cargo test -p watermark-core --test rendering burns_chinese_watermark_without_changing_source
```

- [ ] 使用随包字体逐字符检查覆盖。空白和换行单独处理。缺字返回 `MissingGlyph`，不使用 fontdue 的默认缺字字形冒充成功。
- [ ] 按图像短边和 `size_ratio` 计算字号。排版先保留用户换行，再按可用宽度自动折行。以字体实际 advance 和行高计算字块，不能按字符数估算宽度。计算旋转后的包围盒，保证中心至少一整组水印放得下；否则返回 `LayoutDoesNotFit`。
- [ ] 将文字先栅格化成局部透明度遮罩。中心字块置于图像中心，再按字块尺寸和字号相关间隔向四周重复。旋转应用于遮罩采样，不反复复制和旋转整张大图。每个像素只按实际遮罩覆盖率与配置透明度合成，避免重叠导致透明度失控。
- [ ] 增加至少一个中心区域改变、多个远离中心的区域改变、非零角度、多行、不同尺寸相对比例、缺字和无法完整排版测试。不要把“像素有任何变化”当作全图重复覆盖的充分证据。

**检查点。** 实际 PNG 合成图可见中文重复水印，中心有完整用途声明。展示合成样本给用户确认默认效果。此阶段不使用前端 Canvas 绘制水印。

## 任务 5. 完成编码与预览，并验证敏感元数据不外带

**文件。** 创建核心 `src/output.rs`、`scripts/make-fixtures.mjs`、`scripts/check-export-metadata.mjs`，扩展核心测试与技术验证记录。

- [ ] 先写重新解码导出结果的测试。PNG 应保持合成后的 RGB 像素，JPEG 应保持显示尺寸并带有水印，不能用 JPEG 与原始像素逐字节相等作为标准。

```rust
mod support;
use watermark_core::{decode, encode, preview, render, OutputFormat, PreviewTarget};
use watermark_core::{WatermarkDraft, WatermarkFont, WatermarkSpec};

#[test]
fn png_export_keeps_composited_pixels() {
    let source = decode(&support::rgb_png(600, 400)).unwrap();
    let spec = WatermarkSpec::try_from(WatermarkDraft {
        text: "仅供测试使用".into(),
        ..WatermarkDraft::default()
    }).unwrap();
    let marked = render(&source, &spec, &WatermarkFont::bundled().unwrap()).unwrap();
    let bytes = encode(&marked, OutputFormat::Png).unwrap();
    let exported = image::load_from_memory(&bytes).unwrap().into_rgb8();
    assert_eq!(exported.dimensions(), marked.dimensions());
    assert_eq!(exported.as_raw().as_slice(), marked.pixels());
    let detail = preview(&marked, PreviewTarget::Detail {
        x: 0, y: 0, width: 600, height: 400,
    }).unwrap();
    let inspected = image::load_from_memory(&detail).unwrap().into_rgb8();
    assert_eq!(inspected.as_raw().as_slice(), marked.pixels());
}
```

```bash
cargo test -p watermark-core --test rendering
```

- [ ] 编码器只接受 `WatermarkedImage`。PNG 从新像素编码，JPEG 使用质量 95。不得把输入解码器、源 EXIF、XMP 或 ICC 字节传入输出编码器。需要标准 sRGB 标记时，只使用程序生成的固定信息。
- [ ] `Fit` 先合成再缩小，不能先缩小输入再重新排版。`Detail` 从同一个合成结果中取像素区域。返回 PNG 字节，校验非零尺寸和区域边界。适应窗口预览初始最长边为 1600 像素，细节检查按显示区域请求原分辨率像素，不一次传输整张超大 PNG 给界面。
- [ ] 用合成 JPEG 与缩略图生成带 GPS、EXIF 方向、XMP 和未加水印缩略图的输入。先用 ExifTool 确认输入确实含这些字段，再测试输出。原始样本和输出保存在被忽略的本机验收目录，不进入 Git。
- [ ] 元数据脚本用 `execFile` 调用 ExifTool，不拼接 shell。以下是检查单个实际输出文件的完整判定逻辑，文件路径从命令行参数读取。

```javascript
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const file = process.argv[2];
assert.ok(file, "Provide one synthetic exported image");
const run = promisify(execFile);
const { stdout } = await run("exiftool", [
  "-json", "-G1", "-EXIF:all", "-XMP:all", "-IPTC:all",
  "-ThumbnailImage", "-PreviewImage", file,
]);
const [record] = JSON.parse(stdout);
assert.ok(record && typeof record.SourceFile === "string");
const { SourceFile, ...sensitiveTags } = record;
assert.deepEqual(sensitiveTags, {}, "Export contains source metadata");
console.log("PASS: no source EXIF, XMP, IPTC or embedded preview");
```

- [ ] 将该判定同时用于 JPEG 和 PNG 导出。另行检查标准图像头和允许的 sRGB 信息，不将必需的尺寸字段误当作敏感元数据。用独立工具打开实际文件，确认水印和方向正确。

**检查点。** 输入存在敏感字段的前提已证明，实际输出不携带这些字段。截图、文件和检查输出构成验收材料。不能只通过搜索 JPEG 字节中是否存在某个字符串来宣称元数据已清除。

## 任务 6. 建立 Tauri 桌面边界和会话授权

**文件。** 创建桌面 crate、Tauri 配置和 capabilities、前端最小构建配置、`src-tauri/src/session.rs`、`commands.rs` 与 `tests/session.rs`。将 `src-tauri` 加入根 workspace。

- [ ] 手工建立 Tauri 2 的 React 与 TypeScript 项目结构，不在已有目录执行会清空文件的脚手架。保留设计、计划和 `.git`。将依赖写入两个锁文件，不加入 HTTP、shell、文件系统前端插件或更新插件。
- [ ] 固定前端命令。至少提供以下脚本，并创建与脚本匹配的配置文件。

```json
{
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 1420 --strictPort",
    "build": "tsc --noEmit -p tsconfig.app.json && vite build",
    "typecheck": "tsc --noEmit -p tsconfig.app.json",
    "test": "vitest run",
    "lint": "eslint src --max-warnings=0",
    "tauri": "tauri"
  }
}
```

- [ ] 为会话写失败测试。测试覆盖同时最多两张、三张拒绝且不静默替换、移除后可重新导入、读取失败不登记会话、界面结果不包含路径或原图字节、导出忙碌时不能替换输入。输入批次若任一文件无效，整批不加入会话，并分别指出错误。
- [ ] 在 Rust 端接收原生文件选择与原生拖入事件。登记已授权路径后读取输入快照。即使文件在读取时增长，也用有界读取拒绝超过 50 MiB 的结果，不能只依赖先前的文件大小。显示名只取文件名，前端只拿随机会话 ID、显示名和归一化尺寸。
- [ ] 建立以下 IPC。方法名、字段名与 TypeScript 适配一致。图像响应使用 `tauri::ipc::Response` 返回二进制，不将大图片转换为 JSON 数字数组或 Base64。

| 命令 | 输入 | 结果 |
| --- | --- | --- |
| `choose_images` | 无路径参数 | 原生选择并导入，返回当前 `SessionView[]`。 |
| `get_sessions` | 无 | 当前 `SessionView[]`。 |
| `remove_image` | `sessionId` | 更新后的 `SessionView[]`。 |
| `request_preview` | `sessionId`、`revision`、可空 `watermark`、`target` | 限定用途的 PNG 二进制。空水印只允许缩略确认，不允许细节导出路径。 |
| `choose_export_directory` | 无路径参数 | 已授权目录令牌，取消返回空结果。 |
| `start_export` | 会话 ID 集合、配置快照、格式、目录令牌 | 含批次 ID 的逐项结果。 |
| `retry_export` | 已有 `batchId` 与新目录令牌 | 仅重试失败项，沿用该批次快照。 |

- [ ] `SessionView` 固定为 `id`、`displayName`、`width`、`height`。所有对外对象采用 camelCase。预览目标的判别字段固定为 `kind`，值为 `fit` 或 `detail`，适应窗口参数名为 `maxEdge`。水印字段为 `text`、`opacity`、`angleDeg`、`sizeRatio`、`color`。格式值为 `jpeg` 或 `png`。导出报告包含 `batchId` 与 `results`，成功项为 `sessionId`、`status: "success"`、`outputName`，失败项为 `sessionId`、`status: "failed"`、`errorCode`、`message`。Rust 错误映射为稳定错误码和中文说明，不返回底层包含完整路径的错误字符串。
- [ ] 打包配置仅加载本地资源。CSP 允许 Tauri 所需的本地 IPC、样式和 Blob 预览，拒绝外部脚本、远程图片、远程字体和任意导航。开发服务器例外只存在于开发配置，不进入生产策略。CSP 不能用简单的 `connect-src 'none'` 把 IPC 一并禁用。

```bash
cargo test -p idcard-water --test session
```

```bash
npm run typecheck
```

**检查点。** 原生窗口能启动，输入选择和两张图片会话真实可用。没有任意路径读取命令，未引入通用前端文件读写权限。核心测试仍然可以独立运行。

## 任务 7. 串行执行图像任务并拒绝过期结果

**文件。** 创建 `src-tauri/src/jobs.rs`，扩展 `session.rs`、`commands.rs` 和会话测试。

- [ ] 写任务顺序与忙碌状态测试。用户可观察的规则是只接纳当前预览、导出不重复、失败后可继续操作，而不是某个私有 helper 被调用几次。
- [ ] 使用一个图像工作线程执行有界输入读取、原尺寸解码、合成和编码。原生窗口线程、文件选择回调、拖入回调与异步 IPC 等待不得直接执行大文件读取或 CPU 密集的图片工作。预览请求按会话和版本合并，只保留尚未开始的最新需求，队列不能无限增长。
- [ ] 将导出定义成一次受控状态转换。开始时获取图片和参数快照，再进入忙碌状态。接受导出后暂时拒绝新的编辑与重复导出，结束或出错时恢复可编辑状态。不要持有会话锁执行文件选择、合成或磁盘写入。
- [ ] 已开始的预览可以完成，但结果必须关联请求版本。用户移除图片、切换细节区域或更新配置后，旧结果不能显示。取消排队任务时释放引用，窗口关闭时停止接收新任务并清理队列。
- [ ] 用受控延迟测试制造旧请求晚返回、新请求早返回、导出中连续点击和工作失败场景。实际窗口上测试大图时仍可移动窗口、切换非编辑说明区域和响应关闭操作。需要测量时间或内存时，先使用 `benchmark-checklist`，记录输入、机器和测量方法，不能提前写入臆测速度。

```bash
cargo test -p idcard-water --test session
```

**检查点。** 图像处理串行、界面仍响应、过期预览不回写，导出快照不依赖后续界面状态。测试失败时修复状态规则，不能只增加等待时间掩盖竞争。

## 任务 8. 实现不覆盖原图的逐项导出

**文件。** 创建 `src-tauri/src/export.rs` 和 `src-tauri/tests/export.rs`，扩展命令与结果模型。

- [ ] 先测试实际文件系统结果。合成源图执行前后字节必须一致。已有目标文件的内容必须保持不变，新结果追加编号。两张图部分成功时，成功文件仍存在，失败结果可重试。
- [ ] 只对经过 `render` 和 `encode` 的结果执行写入。原图读取路径的真实身份保留在 Rust 会话中；导出不得写向任何源图路径。已有文件、目录、硬链接或符号链接一律不能被覆盖。
- [ ] 写入通过用户选择的目录令牌查找真实目录。文件名只能由原文件名的文件名部分生成，不能把水印文本、路径分隔符或前端传入的任意路径拼入目标。默认后缀为 `_watermarked`，冲突时使用编号。
- [ ] 使用同目录临时文件，只写入已加水印编码字节。以下关键写入规则用于实现 `export.rs` 的内部 `write_unique`，不向前端开放该通用写文件方法。

```rust
use std::fs::File;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use tempfile::NamedTempFile;

fn write_unique(dir: &Path, stem: &str, ext: &str, bytes: &[u8]) -> io::Result<PathBuf> {
    let mut temp = NamedTempFile::new_in(dir)?;
    temp.write_all(bytes)?;
    temp.as_file().sync_all()?;
    for suffix in 0..10_000u32 {
        let name = if suffix == 0 {
            format!("{stem}_watermarked.{ext}")
        } else {
            format!("{stem}_watermarked_{suffix}.{ext}")
        };
        let target = dir.join(name);
        match temp.persist_noclobber(&target) {
            Ok(file) => {
                let _: File = file;
                return Ok(target);
            }
            Err(error) if error.error.kind() == io::ErrorKind::AlreadyExists => {
                temp = error.file;
            }
            Err(error) => return Err(error.error),
        }
    }
    Err(io::Error::new(io::ErrorKind::AlreadyExists, "No available output name"))
}
```

- [ ] 对 `stem` 和 `ext` 的来源约束在调用边界测试。`persist_noclobber` 不能被描述为所有平台都保证原子性。失败清理属于尽力而为，不能承诺断电后绝无残留。不要退回普通 `rename` 或 `write` 作为碰撞备用路径。
- [ ] 增加已有文件、目标为链接、目标目录不可写、设备消失模拟、写入注入失败、相同名字的两张输入和取消目录选择测试。可重试错误映射为中文说明，不泄露完整路径。没有创建链接权限的测试环境必须记录未覆盖，不能默默算通过。
- [ ] 批次记录保留原配置快照、会话 ID 和逐项状态，任务结束后释放原图字节和像素的额外引用。`retry_export` 只接受已有批次标识，不接受新水印配置。移除会话会使该图片的重试失效并释放数据，不能靠历史批次继续持有被移除的图片。用户改参数后使用新的 `start_export`，不得复用旧成功状态。重试入口明确写明沿用原批次配置。

```bash
cargo test -p idcard-water --test export
```

**检查点。** 同名竞态下也不覆盖文件，原图内容不变，部分成功如实呈现，取消没有输出，失败重试不偷偷更换水印。

## 任务 9. 建立前端状态和 IPC 适配

**文件。** 创建 `src/features/editor/model.ts`、`native.ts`、`model.test.ts` 和前端测试配置。

- [ ] 定义与 Rust 一致的 `SessionView`、`WatermarkDraft`、`OutputFormat`、`PreviewTarget`、`ExportReport`。JSON 使用 camelCase，格式值使用 `jpeg` 和 `png`。领域配置中的角度、字号与透明度转换只发生在适配边界，不能在多个组件重复换算。
- [ ] 以区分联合表示 `empty`、`importing`、`editing`、`exporting`，不要同时保存多个可矛盾的 `isBusy`、`isExporting` 和 `canEdit`。派生按钮可用状态。导出快照作为批次值保存，不引用可编辑表单对象。
- [ ] 首先为过期预览写失败测试，再实现纯状态更新。以下类型和函数作为 `model.ts` 的公开状态契约，组件通过它处理已完成预览。

```typescript
export type PreviewState = {
  revision: number;
  status: "idle" | "loading" | "ready" | "failed";
  url: string | null;
};

export function receivePreview(
  state: PreviewState,
  revision: number,
  url: string,
): PreviewState {
  if (revision !== state.revision) return state;
  return { revision, status: "ready", url };
}
```

```typescript
import { expect, test } from "vitest";
import { receivePreview, type PreviewState } from "./model";

test("an old preview cannot replace the current revision", () => {
  const state: PreviewState = { revision: 4, status: "loading", url: null };
  expect(receivePreview(state, 3, "blob:old")).toEqual(state);
  expect(receivePreview(state, 4, "blob:current")).toEqual({
    revision: 4,
    status: "ready",
    url: "blob:current",
  });
});
```

```bash
npm test -- src/features/editor/model.test.ts
```

- [ ] `native.ts` 集中调用任务 6 的七个 IPC 命令，不让组件访问文件路径。预览二进制转换为 PNG Blob。被丢弃、替换、移除或卸载的对象 URL 必须释放，不能因拒绝旧结果而泄漏 URL。
- [ ] 为日期插入、导出快照与重试关系增加测试。日期只在用户点击时插入本地日期，不使用会跨日期变化的渲染时计算，也不使用 UTC 日期冒充本地日期。

**检查点。** IPC 字段和 Rust 一致，旧结果不回写，快照不变，空水印不能启用导出，前端校验只是提示，Rust 校验仍是权威。

## 任务 10. 完成可操作的中文桌面界面

**文件。** 创建 `src/App.tsx`、`Editor.tsx`、`Preview.tsx`、`editor.css`、`Editor.test.tsx` 与应用入口。

- [ ] 先用 Testing Library 写用户可见行为测试。通过注入的原生适配器模拟选择、预览和导出结果，不在组件中根据环境变量制造一套生产旁路。用户可观察的标签至少包含“选择图片”“水印内容”“插入今天日期”“导出当前图片”“导出全部”和“移除图片”。
- [ ] 页面使用图片列表、主预览和参数区。窗口较窄时参数区换行或折叠，不让主要导出入口被挤出窗口。所有输入有标签，错误可读，键盘能完成主要流程。未输入水印时明确区分“原图确认预览”和带水印预览。
- [ ] 实现多行文本、颜色、透明度、角度、字号、输出格式和日期插入。显示范围及单位，初始值与 Rust 一致。占位示例不是输入内容。文字计数按 Unicode 标量值，Rust 返回的错误码映射到相关控件。
- [ ] 预览提供适应窗口和原像素细节区域检查。处理请求带递增版本，更新中显示状态，旧预览不得冒充当前配置。细节区域请求受核心边界检查，窗口缩放不改变水印布局。
- [ ] 导出期间禁用修改参数、导入、移除和重复导出。可以查看隐私说明和任务状态。取消目录选择回到编辑态，不显示成功。两张图片的结果分别显示，失败项提供沿用快照的重试动作。
- [ ] 单独测试原生适配器返回错误、缺字、文字超限、第三张导入、选择取消、慢预览、部分导出成功和对象 URL 清理。删除真实身份证路径、敏感内容和个人接收方文本，不把它们用于界面截图。

```bash
npm run typecheck
```

```bash
npm test -- src/features/editor/Editor.test.tsx
```

```bash
npm run lint
```

**检查点。** 在真实 Tauri 窗口完成一张和两张图片的全流程，展示截图供用户确认。浏览器里的模拟界面测试不代替原生文件选择、拖入与保存检查。

## 任务 11. 验证运行时隐私并补齐说明

**文件。** 创建 `scripts/check-runtime-policy.mjs`、`docs/privacy.md`、`README.md`、`.github/workflows/check.yml`，扩展验收记录。

- [ ] 策略脚本检查生产 Tauri 配置和打包前端。禁止远程脚本、字体、图片、导航和未批准的 HTTP、shell、文件系统前端插件。不要仅用全仓库搜索 `https` 判定违规，文档和许可证中的合法来源链接不是运行时联网。
- [ ] 用合成图片实际运行应用，检查应用数据目录、缓存目录、临时目录和日志。不得发现由应用写出的原图、预览、水印文本或完整路径。导出临时文件若存在，只能位于用户选择的目录，内容必须已经加水印。
- [ ] 断网完成启动、导入、中文水印、预览、细节检查和导出。联网观察时将应用进程行为与操作系统服务区分，记录应用是否主动连接外部服务。一次无连接的观察不等于普遍安全证明。
- [ ] 文档明确支持 JPEG、PNG 和两张输入，披露 HEIC、颜色模型、资源上限、重新编码和系统同步限制。说明水印可被编辑，不能宣称“绝对安全”“不可去除”或赋予法律效力。
- [ ] CI 只使用合成素材，执行 Rust 核心与桌面测试、格式检查、Clippy、前端测试和构建。在没有授权推送之前，只创建本地工作流文件，不假装已经在 GitHub 执行。字体与依赖许可证进入安装包；公开仓库不自动意味着代码已有开源许可证，应用许可证应在公开发行前由用户决定。

```bash
cargo fmt --all -- --check
```

```bash
cargo clippy --workspace --all-targets --locked -- -D warnings
```

```bash
cargo test --workspace --locked
```

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

**检查点。** 核心、桌面、前端和独立元数据检查全部有结果，隐私声明与实际行为一致。构建过程下载依赖不应被混同为用户图片处理外联。

## 任务 12. 完成 macOS 与 Windows 安装包验收

**文件。** 更新 `src-tauri/tauri.conf.json`、字体许可打包配置、CI 构建矩阵及 `docs/verification/release-checklist.md`。

- [ ] 为 macOS Apple Silicon、Intel 和 Windows x64 生成包。macOS 可先生成 universal 包，再在两类机器或等效已确认环境上分别运行验证。不能只检查目标三元组就宣称真实机型已支持。
- [ ] Windows 配置 WebView2 的 `offlineInstaller`，不是 `downloadBootstrapper` 或 `embedBootstrapper`。在缺少运行时的干净 Windows 环境中断网安装并首次启动。GitHub 托管 runner 已有 WebView2 时，不满足这项首次安装验收。
- [ ] 本地开发包可先不签名，但必须标明状态。公开发行前处理 macOS Developer ID、Apple 公证和 stapling，评估 Windows 签名。凭据通过受保护的环境提供，不写入代码、日志或仓库。使用凭据和发布均等待用户授权。
- [ ] 在每个平台按以下表格逐项记录系统版本、架构、安装包校验和、操作结果和证据。没有环境的一项记为未验收，不能记为通过。

| 场景 | 通过条件 |
| --- | --- |
| 首次离线安装和启动 | 无需应用下载额外运行时即可打开窗口。 |
| 文件选择与拖入 | 支持一张和两张输入，第三张明确拒绝。 |
| 中文水印与多行 | 实际导出中文字形正确，中心用途声明完整。 |
| 方向和颜色 | 横竖、镜像和 ICC 样本符合预设参考结果。 |
| 预览和细节检查 | 当前配置的布局与导出一致，旧结果不回写。 |
| 同名和链接目标 | 已有对象与原图不变，导出使用新名字或明确失败。 |
| 取消和失败重试 | 不误报成功，部分结果与快照重试一致。 |
| 大图和错误输入 | 窗口可响应，超限及损坏输入不导致崩溃。 |
| 元数据与本地痕迹 | 实际输出无源敏感元数据，应用不留原图或预览副本。 |
| 关闭和再次打开 | 不恢复图片、水印、接收方或最近文件。 |

- [ ] 记录 Windows 与 macOS 实际支持的最低已验收版本，不提前承诺未测试版本。构建日志、测试成绩、签名状态和安装验收分开记录。
- [ ] 向用户交付安装包和证据后停止，等待发行授权。默认不推送、不创建 release、不合并，不以“检查通过”替代用户授权。

**检查点。** 已验收的平台可以明确宣布可用。Windows、签名或特定架构缺少证据时，准确列出限制，不把首版称作已完成跨平台公开发行。

## 顺序与提交检查点

任务依次执行。任务 3 和 4 需要任务 2 的领域类型，任务 5 需要合成结果，任务 6 需要核心接口，任务 7 与 8 共同支持界面，任务 10 依赖上述链路，任务 12 最后执行。它们不是可以不加约束地同时写入同一套文件的独立项目。

每个任务均按失败测试、最小实现、同一测试通过、实际结果检查的顺序完成。测试断言用户可观察的行为，不能只验证私有调用次序。运行任何测速前先加载 `benchmark-checklist`，需要运行真实应用时加载 `run`，不能用浏览器 mock 代替 Tauri 实机验收。

建议在任务 2、5、8、10、12 的检查点形成可审阅改动。未经授权不执行 `git commit`。获得提交授权后，先查看 `git status` 和暂存内容，排除照片、凭据和本机材料。执行所需代码整理与检查后再提交。

提交信息遵守用户当前指定的归属行。

```text
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

第一份提交尚不存在，所以不得先运行依赖 `HEAD` 的比较、变基或 worktree 操作。不得自动切换或清理用户工作目录。

## 设计覆盖索引

| 已确认要求 | 实施任务 |
| --- | --- |
| 中文单窗口、无命令行使用门槛 | 6、9、10。 |
| macOS 两类架构与 Windows x64 | 1、12。 |
| 一到两张输入、不能静默替换 | 6、10。 |
| 静态 JPEG、PNG 与 HEIC 披露 | 3、10、11。 |
| 50 MiB、6400 万像素与串行处理 | 3、6、7、12。 |
| 中文、多行、默认样式、完整居中与重复覆盖 | 1、2、4、10。 |
| EXIF 八方向、透明铺白与 sRGB | 1、3、5、12。 |
| 同一渲染路径、适应窗口与细节预览 | 4、5、7、9、10。 |
| 空文本、缺字、超长和布局失败阻止导出 | 2、4、5、10。 |
| 导出快照、过期结果、互斥与失败重试 | 7、8、9、10。 |
| JPEG 95、PNG 与不改变显示尺寸 | 5。 |
| 敏感元数据与未加水印缩略图不外带 | 5、11、12。 |
| 原图不变、同名竞态、链接与取消 | 8、12。 |
| 原生授权、有限 IPC、不暴露源路径与像素 | 6、9、11。 |
| 不外联、不持久化、不恢复历史和本机残留说明 | 6、10、11、12。 |
| 字体离线可用与许可随包分发 | 1、4、11、12。 |
| 合成测试、独立检查、真实窗口与干净安装 | 1、5、10、11、12。 |
| 禁止自动提交、推送和发布 | 执行依据、各检查点及任务 12。 |

## 实施中必须保留的证据

技术验证记录包含实际工具链、字体来源、颜色转换基准、资源限制和未支持情况。隐私证据包含输入确实存在敏感字段的检查，以及导出文件的独立检查。

安装验收记录每个平台的包、校验和、系统版本、架构、签名状态、断网首次安装及全流程结果。用户可见交互提供真实窗口截图。材料只用合成信息，不能泄露桌面上的私人文件。

环境、签名或测试机缺失时继续完成不依赖它们的任务，并将未完成的验收逐项列出。不得只交付容易完成的平台后省略另一个平台。

## 参考资料

- [已确认的产品设计](../specs/2026-11-13-idcard-water-design.md)。
- [Tauri 入门](https://v2.tauri.app/start/)。
- [Windows WebView2 安装模式](https://v2.tauri.app/distribute/windows-installer/)。
- [macOS 签名与公证](https://v2.tauri.app/distribute/sign/macos/)。
- [image 解码器接口](https://docs.rs/image/latest/image/trait.ImageDecoder.html)。
- [PNG 动画检测和元数据](https://docs.rs/image/latest/image/codecs/png/struct.PngDecoder.html)。
- [moxcms ICC 与变换接口](https://docs.rs/moxcms/latest/moxcms/struct.ColorProfile.html)。
- [fontdue 字符覆盖与栅格化](https://docs.rs/fontdue/latest/fontdue/struct.Font.html)。
- [tempfile 禁止覆盖持久化](https://docs.rs/tempfile/latest/tempfile/struct.NamedTempFile.html)。
- [EXIF 元数据字段](https://exiftool.org/TagNames/EXIF.html)。

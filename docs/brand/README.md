# OCCO brand assets

English · [简体中文](#occo-品牌素材)

OCCO means **OpenCode COmplete**. Its mark turns a fragment into a complete letter: a separate segment closes the final O. The two C letters stay open.

## Choose an asset

“Light” assets are for light backgrounds; “dark” assets are for dark backgrounds. SVGs have transparent backgrounds unless they are social cards. All SVG lettering is outlined, so no font installation is required.

| Use | Files |
| --- | --- |
| Wordmark | [Light](wordmark-light.svg) · [Dark](wordmark-dark.svg) |
| Single-color wordmark | [Black](wordmark-mono-black.svg) · [White](wordmark-mono-white.svg) |
| Standalone icon | [Light](icon-light.svg) · [Dark](icon-dark.svg) · [Black](icon-mono-black.svg) · [White](icon-mono-white.svg) |
| Avatar, 512 × 512 PNG | [Light](icon-light.png) · [Dark](icon-dark.png) |
| Shared README header | [Light](header-light.svg) · [Dark](header-dark.svg) |
| Social preview, 1280 × 640 PNG | [PNG](social.png) |
| Editable social preview | [SVG](social.svg) |

Upload a social PNG in the repository's social preview settings. The input line is a typography illustration, not an application screenshot. Use the existing terminal captures to show the actual interface.

## Names and copy

- Display name: **OCCO**. Full name: **OpenCode COmplete**.
- Package, directory, and existing command names: `occo`.
- Display tagline: **Empower OpenCode with autoCOmplete.**

Both README languages use the same English header. Brand layouts have two lines: the OCCO wordmark and the tagline. Keep the full name in explanatory text, not as an extra line in the artwork.

Emphasize the **O** and **C** in OpenCode and the uppercase **CO** in autoCOmplete with the accent color and bold weight. Together they spell OCCO. Keep natural letter spacing. Accessible text uses normal spelling: “Empower OpenCode with autocomplete.”

Keep product copy short and concrete: what to type, what appears, and what Enter does. Describe suggestions as coming from the current conversation and saved prompts. Avoid claims of intelligence or guaranteed compatibility.

## Color and spacing

| Role | Light background | Dark background |
| --- | --- | --- |
| Background | `#FAFAF9` | `#18181B` |
| Primary ink | `#18181B` | `#FAFAF9` |
| Completion accent | `#0F766E` | `#5EEAD4` |
| Secondary text | `#57575E` | `#A6A6AE` |

Use the accent for the completion segment and the four tagline letters, not the whole wordmark or sentence. In the tagline, keep the emphasized letters at 100% opacity and the remaining text at 65%. The plugin interface continues to use the active OpenCode theme.

Keep clear space of at least one quarter of the mark's height on every side, measured from the visible shape. Minimum display sizes: icon **24 × 24 px**; wordmark **120 px wide**. README headers fit within the available width and switch variants with the page theme.

The wordmark uses custom geometry: a 12-unit stroke and 94-unit letter-center spacing. The standalone icon uses the same stroke. Do not retype the wordmark with a font; use the supplied paths.

The tagline uses **Bahnschrift Regular**, with **Bahnschrift Bold** for the four emphasized letters. In the 560 × 185 header, the tagline is 30 px, the wordmark's visible width is 92% of the tagline's, and the visible shapes are separated by 24 px. Both lines align at their visible left edges. Scale this complete lockup uniformly for other uses; the social card uses a 1.6× scale. Lettering is outlined in the supplied SVGs.

Use a system sans-serif stack for other supporting text: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif`.

Do not stretch or rotate the mark, close the C letters, remove the gaps in the final O, add glow or gradients, or place a low-contrast variant on a busy background. Keep the wordmark and tagline separate from real screenshots.

SVGs are the editable masters. Preserve their view boxes and outlined lettering. Export social cards and avatars at the dimensions listed above, without editor metadata. Assets use the project's [MIT license](../../LICENSE).

---

## OCCO 品牌素材

OCCO 的全称是 **OpenCode COmplete**。最后一个 O 由主体和独立弧段组成，表达“从片段到完整”；两个 C 保留开口。

### 选择素材

上表提供全部下载链接。`light` 用于浅色背景，`dark` 用于深色背景；`mono-black` 和 `mono-white` 是单色版本。除社交预览图外，SVG 背景透明，全部文字已转为路径，无需安装字体。

- **README**：中英文共用英文页头，用 `<picture>` 随页面主题切换深浅版本。
- **头像**：使用 512 × 512 PNG；独立图标也提供 SVG。
- **社交预览**：将统一的英文 1280 × 640 PNG 上传至仓库的社交预览设置。图中的输入行是排版示意，展示真实界面时使用现有终端截图。
- **编辑源文件**：使用 SVG，保留画布比例和文字路径；导出 PNG 时使用上述尺寸，不附加编辑器元数据。

### 名称与文案

展示名称使用 **OCCO**，全称使用 **OpenCode COmplete**。包名、目录名和已有命令保持 `occo`。

统一英文展示短句：**Empower OpenCode with autoCOmplete.**

品牌展示采用两行：OCCO 字标和标语，不再单独展示全称行。全称保留在说明文字中。

使用青绿色和加粗字重强调 OpenCode 的 **O、C** 与 autoCOmplete 中的大写 **C、O**，依次拼出 OCCO。保持自然字间距；替代文字使用正常拼写的完整句子：Empower OpenCode with autocomplete.

文案直接说明输入什么、出现什么、按 Enter 做什么。建议来源表述为“当前对话和已保存的提示词”，不添加智能化或兼容性保证。

### 配色与使用规范

使用上表中的墨黑、暖白和青绿。青绿强调补全弧段和标语中的四个字母，不用于填满整个字标或整句标语。标语中的强调字母保持 100% 不透明度，其余文字使用 65% 不透明度。插件界面继续跟随 OpenCode 主题。

图形四周至少保留可见图形高度四分之一的留白。图标最小 **24 × 24 px**，字标最小宽度 **120 px**。

字标使用原创几何字形，基础笔画宽度为 12，字母中心距为 94；独立图标使用相同笔画。字标始终使用提供的路径，不用字体重新输入。

标语使用 **Bahnschrift Regular**，四个强调字母使用 **Bahnschrift Bold**。在 560 × 185 页头中，标语字号为 30 px，字标可见宽度是标语的 92%，两行可见轮廓之间留 24 px，并按可见左边缘对齐。其他场景对整个组合等比缩放，社交图使用 1.6 倍比例。SVG 中的文字已转为路径；其他辅助文字使用系统无衬线字体。

不要拉伸、旋转、封闭 C 的开口、移除最后一个 O 的间隙，或添加发光和渐变。避免低对比度背景；不要将字标和短句覆盖在实机截图上。素材沿用项目的 [MIT 许可证](../../LICENSE)。

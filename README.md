# 智贸出海 · B2B 视频服务立项资料表

一份纯前端单页应用,用引导式问答收集 B2B 工厂客户的立项资料(7 阶段 / 44 节点),离线生成 **Markdown 立项资料表(.md)** + **ZIP 附件包**,客户下载后邮件回传。

> 输出的 `.md` 文件已针对**飞书在线文档 / Notion / Obsidian / 大模型阅读**做格式优化:多级标题、加粗强调、GFM 表格、有序/无序列表、引用块。客户可直接拖入飞书在线文档查看,或丢给大模型用作脚本生成的全局变量(VAR_PRODUCTS / VAR_HARD_POWER 等)输入。

---

## 技术栈

全部走 CDN,无构建步骤。`git push` → GitHub Pages 即上线。

| 库 | 用途 |
|---|---|
| Alpine.js 3.x | 响应式状态、联动、动态列表 |
| JSZip | 附件打包 |
| SortableJS | 节点 28 业务流转节点拖拽 |
| idb-keyval | IndexedDB 简化封装(草稿文件 Blob) |

> 已不再依赖 pdf-lib / fontkit / 中文字体文件(纯文本 .md 直接输出)。

---

## 目录

```
DailyWidget/
├── index.html                # 单页入口
├── README.md                 # 本文件
├── TEST_CASES.md             # 手工验收用例
└── src/
    ├── config/               # fields.js(44 节点) / stages.js / app.js / countries.js
    ├── core/                 # store.js / draft.js / validation.js / linkage.js
    ├── generators/           # markdown.js / zip.js
    └── styles/               # base.css / form.css / components.css
```

---

## 本地预览

```powershell
# 任意静态服务器即可
python -m http.server 8765
# 或 VSCode Live Server 扩展,右键 index.html → Open with Live Server
```

打开 http://127.0.0.1:8765

---

## 部署到 GitHub Pages

1. 初始化仓库
   ```powershell
   cd e:\aistudiobuild\DailyWidget
   git init
   git add .
   git commit -m "Initial commit: B2B video service project material form"
   ```
2. 创建 GitHub 仓库并推送:
   ```powershell
   git remote add origin https://github.com/<your-org>/<repo>.git
   git push -u origin main
   ```
3. 在 GitHub 仓库 → **Settings → Pages** → Source 选 `main` 分支 / `/ (root)`,保存。
4. 1 分钟内 `https://<your-org>.github.io/<repo>/` 可访问。
5. 自定义域名:`Settings → Pages → Custom domain` 填域名,并在 DNS 提供商加 CNAME 指向 `<your-org>.github.io`。

---

## 配置项

集中在 [src/config/app.js](src/config/app.js):

| 项 | 默认值 | 说明 |
|---|---|---|
| `draftKey` | `chuangrui_draft_v1` | localStorage 键 |
| `fileStoreName` | `chuangrui_files_v1` | IndexedDB 存储名 |
| `draftMaxAgeDays` | 30 | 草稿过期天数 |
| `autoSaveDebounceMs` | 5000 | 自动保存防抖间隔 |
| `markdown.fileNamePattern` | `智贸出海_{companyZh}_{YYYYMMDD}.md` | Markdown 文件名模板 |
| `zip.fileNamePattern` | `智贸出海附件_{companyZh}_{YYYYMMDD}.zip` | ZIP 文件名模板 |

修改字段 → 改 [src/config/fields.js](src/config/fields.js)(一份 schema 同时驱动渲染 / 校验 / 联动 / Markdown / ZIP)。

---

## Markdown 输出结构

生成的 `.md` 文件按以下层级组织,飞书在线文档导入后即可获得带大纲的结构化文档:

```
# 智贸出海 · B2B 视频服务立项资料表        (H1 封面)
## 📑 目录                                   (H2)
## 阶段 1 · 企业身份识别                      (H2)
### 1. 公司中文名称 *                        (H3 字段)
### 2. 公司英文名称 *                        (H3 字段)
...
## 阶段 7 · 联络与数字化触点                  (H2)
## 📎 附件清单                               (H2)
```

呈现策略:
- **基础控件**(text/select/radio/...)→ 段落
- **textarea**(多行文本)→ 引用块 `>`,保留换行
- **dynamic-list / multi-select / tag-input** → 无序列表
- **sortable-list**(业务流转)→ 有序列表
- **dynamic-card**(产品/案例/对接人...)→ 简单卡用 GFM 表格;含 textarea/file 的复杂卡逐张展开为 H4 子标题 + 加粗 key/value
- **composite**(复合字段)→ 加粗 key/value 列表
- **matrix-2d**(市场区域 × 主推产品)→ GFM 表格
- **cert-grid / tag-multi-with-attachment** → GFM 表格
- **file** → ZIP 路径引用 + 原文件名 inline code
- **help 提示** → `> 💡 **填写提示**:...`

---

## 已知限制

1. **草稿仅在当前浏览器+设备**,不跨端同步。换设备需要重填或客户自行邮件传送中间稿(非本期目标)。
2. **附件总量 > 500MB** 可能触发浏览器 IndexedDB 配额上限,提示用户分次下载或减小图片。
3. **不做后端提交**:客户在浏览器内生成 Markdown + ZIP,自行邮件发回。`APP_CONFIG.submitEndpoint` 留空,后续如要对接 API 接口在这里填即可。
4. **Markdown 表格列宽**:GFM 表格列宽由阅读器决定,飞书在线文档中超长单元格会自动换行(已用 `<br>` 提前断行优化)。

---

## 关键流程

```
[填写 44 题] → [自动草稿(localStorage + IndexedDB)] → [完成填写]
   ↓                                                    ↓
[联动孤儿清理]                                      [全量校验]
                                                       ↓
                                       [生成 ZIP(分 7 阶段子目录)]
                                                       ↓
                                       [生成 Markdown(引用 ZIP 路径)]
                                                       ↓
                                       [浏览器下载 → 客户邮件回传]
```

---

## 维护提示

- 修字段时,改 `fields.js` 后无需改组件代码(组件按 `component` 字段分发)
- 新增组件类型时,在 [src/core/store.js](src/core/store.js) 的 `emptyValueFor` 加 case + [index.html](index.html) 的渲染分发加 `<template x-if>` 块 + 对应 CSS + [src/generators/markdown.js](src/generators/markdown.js) 的 `renderField` 分发
- 调整 Markdown 排版:改 [src/generators/markdown.js](src/generators/markdown.js) 即可,不影响 ZIP 与表单

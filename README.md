# 跨迅科技 · B2B 视频服务立项资料表

一份纯前端单页应用,用引导式问答收集 B2B 工厂客户的立项资料(7 阶段 / 46 节点),离线生成 **PDF 立项资料表** + **ZIP 附件包**,客户下载后邮件回传。

> ⚠️ PRD 标题写"阿里国际站金品诚企申报",但实际产出是跨迅科技给 B2B 工厂客户做视频服务时的**立项资料表**。后续脚本生成的全局变量(VAR_PRODUCTS / VAR_HARD_POWER 等)直接从这份表的输出消费。

---

## 技术栈

全部走 CDN,无构建步骤。`git push` → GitHub Pages 即上线。

| 库 | 用途 |
|---|---|
| Alpine.js 3.x | 响应式状态、联动、动态列表 |
| pdf-lib + @pdf-lib/fontkit | PDF 生成 + 中文字体子集嵌入 |
| JSZip | 附件打包 |
| SortableJS | 节点 28 业务流转节点拖拽 |
| idb-keyval | IndexedDB 简化封装(草稿文件 Blob) |

---

## 目录

```
DailyWidget/
├── index.html                # 单页入口
├── README.md                 # 本文件
├── TEST_CASES.md             # 手工验收用例
├── assets/
│   ├── fonts/                # ⚠️ 需放置思源黑体子集 — 见下方"中文字体"
│   └── icons/                # 认证图标(M2 后未使用,可后期接入)
└── src/
    ├── config/               # fields.js(46 节点) / stages.js / app.js / countries.js
    ├── core/                 # store.js / draft.js / validation.js / linkage.js
    ├── generators/           # pdf.js / zip.js
    └── styles/               # base.css / form.css / components.css
```

---

## 中文字体(上线必做)

PDF 生成依赖 [src/config/app.js](src/config/app.js) 中 `pdf.fontPath` 指向的字体文件。仓库**默认不带字体**(避免 Git 体积)。

### 准备字体

下载思源黑体 Regular,推荐子集化(否则 PDF 会很大):

1. 下载完整字体:[Noto Sans SC Regular](https://fonts.google.com/noto/specimen/Noto+Sans+SC) → 取 `.otf`
2. 用 [Fontmin](https://ecomfe.github.io/fontmin/) 或 [font-subset](https://github.com/Pomax/Font.js) 生成 GB2312 / 常用 8000 字子集
3. 输出文件命名 `NotoSansSC-Regular-subset.otf`,放到 `assets/fonts/`

### 字段表里可能出现的中文字符

为了让子集覆盖全表内容,扫描以下文件中的所有 label / placeholder / help / options:
- `src/config/fields.js`
- `src/config/stages.js`
- `src/config/countries.js`

把这些汉字 + 常用 5000 字 + 标点符号一起喂给 Fontmin。

### 兜底

如果不做子集化、直接用完整 `NotoSansSC-Regular.otf`(~10MB),生成的 PDF 也能正常显示,只是体积更大。

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
2. 把 `assets/fonts/NotoSansSC-Regular-subset.otf` 放到位再提交。
3. 创建 GitHub 仓库并推送:
   ```powershell
   git remote add origin https://github.com/<your-org>/<repo>.git
   git push -u origin main
   ```
4. 在 GitHub 仓库 → **Settings → Pages** → Source 选 `main` 分支 / `/ (root)`,保存。
5. 1 分钟内 `https://<your-org>.github.io/<repo>/` 可访问。
6. 自定义域名:`Settings → Pages → Custom domain` 填域名,并在 DNS 提供商加 CNAME 指向 `<your-org>.github.io`。

---

## 配置项

集中在 [src/config/app.js](src/config/app.js):

| 项 | 默认值 | 说明 |
|---|---|---|
| `draftKey` | `chuangrui_draft_v1` | localStorage 键 |
| `fileStoreName` | `chuangrui_files_v1` | IndexedDB 存储名 |
| `draftMaxAgeDays` | 30 | 草稿过期天数 |
| `autoSaveDebounceMs` | 5000 | 自动保存防抖间隔 |
| `pdf.fontPath` | `assets/fonts/NotoSansSC-Regular-subset.otf` | 中文字体路径 |
| `pdf.fileNamePattern` | `跨迅科技_{companyZh}_{YYYYMMDD}.pdf` | PDF 文件名模板 |
| `zip.fileNamePattern` | `金品诚企附件_{companyZh}_{YYYYMMDD}.zip` | ZIP 文件名模板 |

修改字段 → 改 [src/config/fields.js](src/config/fields.js)(一份 schema 同时驱动渲染 / 校验 / 联动 / PDF / ZIP)。

---

## 已知限制

1. **草稿仅在当前浏览器+设备**,不跨端同步。换设备需要重填或客户自行邮件传送中间稿(非本期目标)。
2. **附件总量 > 500MB** 可能触发浏览器 IndexedDB 配额上限,提示用户分次下载或减小图片。
3. **不做后端提交**:客户在浏览器内生成 PDF + ZIP,自行邮件发回。`APP_CONFIG.submitEndpoint` 留空,后续如要对接 API 接口在这里填即可。
4. **PDF 版式**:首版按推荐骨架,客户首次试用后可根据反馈微调 [src/generators/pdf.js](src/generators/pdf.js) 的版面常量。

---

## 关键流程

```
[填写 46 题] → [自动草稿(localStorage + IndexedDB)] → [完成填写]
   ↓                                                    ↓
[联动孤儿清理]                                      [全量校验]
                                                       ↓
                                       [生成 ZIP(分 7 阶段子目录)]
                                                       ↓
                                       [生成 PDF(嵌中文字体,引用 ZIP 路径)]
                                                       ↓
                                       [浏览器下载 → 客户邮件回传]
```

---

## 维护提示

- 修字段时,改 `fields.js` 后无需改组件代码(组件按 `component` 字段分发)
- 新增组件类型时,在 [src/core/store.js](src/core/store.js) 的 `emptyValueFor` 加 case + [index.html](index.html) 的渲染分发加 `<template x-if>` 块 + 对应 CSS
- 排查 PDF 中文乱码:浏览器 DevTools → Network → 检查 `assets/fonts/...` 是否 200

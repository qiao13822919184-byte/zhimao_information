放置文件:NotoSansSC-Regular-subset.otf

下载思源黑体 / Noto Sans SC Regular,生成 GB2312 + 节点字段中文字符的子集后,
按上述文件名命名并放在本目录。详见仓库根 README.md → "中文字体(上线必做)"。

如果不做子集化,直接放完整 NotoSansSC-Regular.otf 也可,但需把
src/config/app.js 里的 pdf.fontPath 改为对应文件名。

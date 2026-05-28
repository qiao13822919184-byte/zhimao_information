// PDF 生成:智贸出海 B2B 视频服务立项资料表。
// pdf-lib + fontkit 嵌入中文字体(思源黑体子集);若字体缺失则中止并提示用户。
//
// 版式:封面页 → 目录页 → 7 阶段内容页(每阶段 H1 + 字段 H2 + 内容)→ 附件清单页。
// 内容渲染策略:基础类型 key:value;dynamic-card 转表格;matrix-2d 转表格;
// 文件字段输出"已上传:N 个,详见 ZIP 子目录 0x_xxx/"。

import { FIELDS, getField } from '../config/fields.js';
import { STAGES, stageById } from '../config/stages.js';
import { APP_CONFIG } from '../config/app.js';
import { isFileRef } from '../core/draft.js';

const PAGE = { width: 595.28, height: 841.89 }; // A4 portrait
const MARGIN = { top: 56, bottom: 56, left: 48, right: 48 };
const FONT_SIZE = { title: 22, h1: 16, h2: 13, body: 10.5, small: 9 };
const LINE_GAP = 1.35;
const COLOR = {
    primary: { r: 200 / 255, g: 16 / 255, b: 46 / 255 },
    text: { r: 0.12, g: 0.14, b: 0.2 },
    soft: { r: 0.36, g: 0.4, b: 0.48 },
    rule: { r: 0.88, g: 0.9, b: 0.93 },
    rowAlt: { r: 0.97, g: 0.97, b: 0.99 },
};

function pad(n) { return String(n).padStart(2, '0'); }
function ymd() {
    const d = new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
function nowText() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function safeFsName(s) {
    return String(s || '').replace(/[\\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80);
}

// 加载字体二进制(失败抛错;UI 层捕获后给用户友好提示)
async function loadFontBytes() {
    const url = APP_CONFIG.pdf.fontPath;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`中文字体加载失败:${url} 返回 ${res.status}。请确认 assets/fonts/ 下已放置思源黑体子集。`);
    }
    return await res.arrayBuffer();
}

// PDF Drawer:封装一个分页+游标排版器
class Drawer {
    constructor(pdfDoc, font, boldFont) {
        this.pdf = pdfDoc;
        this.font = font;
        this.boldFont = boldFont || font;
        this.page = null;
        this.y = 0;
        this.pageNo = 0;
        this.pageBreaks = []; // 用于目录页回填页码 [{ stageId, page }]
        this._newPage();
    }
    _newPage() {
        this.page = this.pdf.addPage([PAGE.width, PAGE.height]);
        this.y = PAGE.height - MARGIN.top;
        this.pageNo += 1;
    }
    ensureSpace(h) {
        if (this.y - h < MARGIN.bottom) this._newPage();
    }
    // 估算行高
    lineH(size) { return size * LINE_GAP; }

    // 文本宽度(当字体不支持某字符时,fontkit 子集会回退;这里只做估算)
    textWidth(text, size, font) {
        const f = font || this.font;
        try { return f.widthOfTextAtSize(text, size); }
        catch { return text.length * size * 0.55; }
    }

    // 自动换行:按字符排版(中文友好)
    wrap(text, size, maxWidth, font) {
        const f = font || this.font;
        const lines = [];
        const paragraphs = String(text ?? '').split(/\r?\n/);
        for (const p of paragraphs) {
            if (p === '') { lines.push(''); continue; }
            let cur = '';
            for (const ch of p) {
                const next = cur + ch;
                if (this.textWidth(next, size, f) > maxWidth && cur) {
                    lines.push(cur);
                    cur = ch;
                } else {
                    cur = next;
                }
            }
            if (cur) lines.push(cur);
        }
        return lines;
    }

    drawText(text, opts = {}) {
        const size = opts.size || FONT_SIZE.body;
        const color = opts.color || COLOR.text;
        const font = opts.bold ? this.boldFont : this.font;
        const x = opts.x ?? MARGIN.left;
        const maxW = opts.maxWidth ?? (PAGE.width - MARGIN.left - MARGIN.right);
        const lines = this.wrap(text, size, maxW, font);
        const lh = this.lineH(size);
        for (const line of lines) {
            this.ensureSpace(lh);
            this.page.drawText(line, { x, y: this.y - size, size, font, color: rgbColor(color) });
            this.y -= lh;
        }
    }
    space(h) { this.y -= h; if (this.y < MARGIN.bottom) this._newPage(); }
    rule() {
        this.ensureSpace(8);
        this.page.drawLine({
            start: { x: MARGIN.left, y: this.y },
            end: { x: PAGE.width - MARGIN.right, y: this.y },
            thickness: 0.6, color: rgbColor(COLOR.rule),
        });
        this.y -= 8;
    }
    h1(text) {
        this.space(6);
        this.ensureSpace(FONT_SIZE.h1 * 1.6);
        this.drawText(text, { size: FONT_SIZE.h1, bold: true, color: COLOR.primary });
        this.rule();
    }
    h2(text) {
        this.space(4);
        this.drawText(text, { size: FONT_SIZE.h2, bold: true, color: COLOR.text });
    }
    kv(k, v) {
        const text = `${k}:${v ?? ''}`;
        this.drawText(text, { size: FONT_SIZE.body });
    }
    bullet(text) {
        this.drawText(`• ${text}`, { size: FONT_SIZE.body });
    }
    note(text) {
        this.drawText(text, { size: FONT_SIZE.small, color: COLOR.soft });
    }

    // 简单表格:headers + rows;自动换行,跨页时重绘表头
    table(headers, rows, colWidths) {
        const rowPad = 4;
        const drawRow = (cells, isHeader, alt) => {
            const lineH = this.lineH(FONT_SIZE.body);
            const wrapped = cells.map((c, i) => this.wrap(String(c ?? ''),
                FONT_SIZE.body, colWidths[i] - rowPad * 2,
                isHeader ? this.boldFont : this.font));
            const nLines = Math.max(1, ...wrapped.map((w) => w.length));
            const rowH = nLines * lineH + rowPad * 2;
            this.ensureSpace(rowH);
            // 背景
            if (alt) {
                this.page.drawRectangle({
                    x: MARGIN.left, y: this.y - rowH,
                    width: PAGE.width - MARGIN.left - MARGIN.right, height: rowH,
                    color: rgbColor(COLOR.rowAlt),
                });
            } else if (isHeader) {
                this.page.drawRectangle({
                    x: MARGIN.left, y: this.y - rowH,
                    width: PAGE.width - MARGIN.left - MARGIN.right, height: rowH,
                    color: rgbColor({ r: 0.94, g: 0.95, b: 0.97 }),
                });
            }
            // 文本
            let xc = MARGIN.left;
            for (let i = 0; i < cells.length; i++) {
                let yc = this.y - rowPad - FONT_SIZE.body;
                for (const ln of wrapped[i]) {
                    this.page.drawText(ln, {
                        x: xc + rowPad, y: yc, size: FONT_SIZE.body,
                        font: isHeader ? this.boldFont : this.font,
                        color: rgbColor(COLOR.text),
                    });
                    yc -= lineH;
                }
                xc += colWidths[i];
            }
            // 上下边线
            this.page.drawLine({
                start: { x: MARGIN.left, y: this.y },
                end: { x: PAGE.width - MARGIN.right, y: this.y },
                thickness: 0.5, color: rgbColor(COLOR.rule),
            });
            this.y -= rowH;
            this.page.drawLine({
                start: { x: MARGIN.left, y: this.y },
                end: { x: PAGE.width - MARGIN.right, y: this.y },
                thickness: 0.5, color: rgbColor(COLOR.rule),
            });
        };
        drawRow(headers, true, false);
        rows.forEach((r, i) => drawRow(r, false, i % 2 === 1));
        this.space(6);
    }
}

function rgbColor(c) { return { type: 'RGB', red: c.r, green: c.g, blue: c.b }; }

// ---- 字段值转可读文本 ----
function fmtVal(v) {
    if (v == null || v === '') return '—';
    if (Array.isArray(v)) return v.length ? v.join(' / ') : '—';
    if (typeof v === 'boolean') return v ? '是' : '否';
    return String(v);
}

function fileSummary(v, fieldLabel, manifest, fieldId) {
    const list = manifest.filter((m) => m.fieldId === fieldId);
    if (list.length === 0) {
        if (Array.isArray(v) && v.length > 0) return `已上传 ${v.length} 个文件(详见 ZIP)`;
        if (isFileRef(v)) return `已上传:${v.name}(详见 ZIP)`;
        return '—';
    }
    const dirs = Array.from(new Set(list.map((m) => m.zipPath.split('/')[0])));
    return `已上传 ${list.length} 个文件 → ZIP/${dirs.join(', ')}`;
}

// 渲染一个字段
function renderField(d, field, value, manifest) {
    d.h2(`${field.order}. ${field.label}${field.required ? ' *' : ''}`);

    switch (field.component) {
        case 'text': case 'textarea': case 'select': case 'radio':
        case 'date': case 'time': case 'color': case 'url': case 'email':
        case 'tel': case 'number': case 'year': case 'slider': case 'switch':
            d.drawText(fmtVal(value));
            break;

        case 'multi-select':
        case 'tag-input':
        case 'sortable-list':
        case 'dynamic-list':
            d.drawText(fmtVal(value));
            break;

        case 'country-select': {
            const v = value;
            d.drawText(v ? String(v) : '—');
            break;
        }

        case 'file': {
            d.drawText(fileSummary(value, field.label, manifest, field.id));
            break;
        }

        case 'composite': {
            const obj = value || {};
            for (const sub of field.subFields || []) {
                if (sub.showWhen) {
                    const c = obj[sub.showWhen.field];
                    if (c !== sub.showWhen.equals) continue;
                }
                let txt;
                if (sub.type === 'file') {
                    txt = fileSummary(obj[sub.id], sub.label, manifest, field.id);
                } else if (Array.isArray(obj[sub.id])) {
                    txt = obj[sub.id].length ? obj[sub.id].join(' / ') : '—';
                } else if (typeof obj[sub.id] === 'boolean') {
                    txt = obj[sub.id] ? '是' : '否';
                } else {
                    txt = fmtVal(obj[sub.id]);
                }
                d.kv(sub.label, txt);
            }
            break;
        }

        case 'dynamic-card': {
            const arr = Array.isArray(value) ? value : [];
            if (arr.length === 0) { d.note('(未填写)'); break; }
            // 紧凑表格:列 = cardTemplate 中的非 file/dynamic-card 字段
            const cols = (field.cardTemplate || []).filter(
                (s) => s.type !== 'file' && s.type !== 'dynamic-card'
            );
            const headers = ['#', ...cols.map((c) => c.label)];
            const totalW = PAGE.width - MARGIN.left - MARGIN.right;
            const idxW = 24;
            const colW = (totalW - idxW) / Math.max(1, cols.length);
            const widths = [idxW, ...cols.map(() => colW)];
            const rows = arr.map((card, i) => [
                String(i + 1),
                ...cols.map((c) => {
                    const v = card?.[c.id];
                    if (Array.isArray(v)) return v.join('/');
                    if (typeof v === 'boolean') return v ? '✓' : '';
                    return fmtVal(v);
                }),
            ]);
            d.table(headers, rows, widths);
            // 文件 / 嵌套 dynamic-card 子字段单独列出
            for (const sub of field.cardTemplate || []) {
                if (sub.type === 'file') {
                    d.note(`${sub.label} → ${fileSummary(null, sub.label, manifest, field.id)}`);
                } else if (sub.type === 'dynamic-card') {
                    d.note(`${sub.label}:共 ${arr.reduce((acc, c) => acc + (Array.isArray(c?.[sub.id]) ? c[sub.id].length : 0), 0)} 项(详见原始数据)`);
                }
            }
            break;
        }

        case 'cert-grid':
        case 'tag-multi-with-attachment': {
            const arr = Array.isArray(value) ? value : [];
            if (arr.length === 0) { d.note('(未选)'); break; }
            const cols = (field.itemFields || []).filter((s) => s.type !== 'file');
            const headers = ['项', ...cols.map((c) => c.label), '附件'];
            const totalW = PAGE.width - MARGIN.left - MARGIN.right;
            const keyW = 80, attW = 90;
            const colW = (totalW - keyW - attW) / Math.max(1, cols.length);
            const widths = [keyW, ...cols.map(() => colW), attW];
            const rows = arr.map((item) => {
                const fileLabel = (field.itemFields || []).find((s) => s.type === 'file');
                const fileVal = fileLabel ? item[fileLabel.id] : null;
                return [
                    String(item.key || '—'),
                    ...cols.map((c) => fmtVal(item[c.id])),
                    isFileRef(fileVal) ? '✓ 见 ZIP' : '—',
                ];
            });
            d.table(headers, rows, widths);
            break;
        }

        case 'matrix-2d': {
            const obj = value && typeof value === 'object' ? value : {};
            const cells = Object.keys(obj);
            if (cells.length === 0) { d.note('(未标记)'); break; }
            // 提取行/列
            const rows = new Set(); const cols = new Set();
            for (const k of cells) {
                const [r, c] = k.split('__||__');
                rows.add(r); cols.add(c);
            }
            const rowArr = field.rows || Array.from(rows);
            const colArr = Array.from(cols);
            const headers = ['市场区域', ...colArr];
            const totalW = PAGE.width - MARGIN.left - MARGIN.right;
            const colW = (totalW - 80) / Math.max(1, colArr.length);
            const widths = [80, ...colArr.map(() => colW)];
            const tableRows = rowArr
                .filter((r) => Array.from(cols).some((c) => obj[`${r}__||__${c}`]))
                .map((r) => [
                    r,
                    ...colArr.map((c) => {
                        const cell = obj[`${r}__||__${c}`];
                        if (!cell) return '';
                        const v = cell[(field.cellField?.id) || 'note'];
                        return v ? String(v) : '✓';
                    }),
                ]);
            d.table(headers, tableRows, widths);
            break;
        }

        case 'multi-select-with-detail': {
            const obj = value || {};
            const keys = Object.keys(obj);
            if (keys.length === 0) { d.note('(未选)'); break; }
            for (const key of keys) {
                const opt = (field.options || []).find((o) => o.key === key);
                d.kv(opt?.label || key, fmtVal(obj[key]?.detail));
            }
            break;
        }

        case 'category-tree': {
            const lines = typeof value === 'string'
                ? value.split('\n').map((s) => s.trim()).filter(Boolean)
                : Array.isArray(value) ? value : [];
            if (lines.length === 0) { d.note('(未填)'); break; }
            for (const ln of lines) d.bullet(ln);
            break;
        }

        default:
            d.note(`(组件 ${field.component} 未渲染)`);
    }

    if (field.help) d.note(field.help);
    d.space(4);
}

// 主入口
export async function buildPdf(values, manifest, companyZh) {
    if (!window.PDFLib) throw new Error('pdf-lib 未加载');
    if (!window.fontkit) throw new Error('fontkit 未加载');

    const { PDFDocument } = window.PDFLib;
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(window.fontkit);

    const fontBytes = await loadFontBytes();
    const font = await pdfDoc.embedFont(fontBytes, { subset: true });
    const boldFont = font; // 思源黑体 Regular 兼任(单一权重子集已够立项资料)

    const d = new Drawer(pdfDoc, font, boldFont);

    // ---- 封面 ----
    d.y = PAGE.height - 220;
    d.drawText('智贸出海', { size: 28, bold: true, color: COLOR.primary });
    d.space(12);
    d.drawText('B2B 视频服务立项资料表', { size: FONT_SIZE.title, bold: true });
    d.space(40);
    d.drawText(`客户公司:${companyZh || '—'}`, { size: FONT_SIZE.h2 });
    d.drawText(`申报日期:${new Date().toISOString().slice(0, 10)}`, { size: FONT_SIZE.h2 });
    d.drawText(`生成时间:${nowText()}`, { size: FONT_SIZE.body, color: COLOR.soft });

    // ---- 目录页 ----
    d._newPage();
    d.drawText('目录', { size: FONT_SIZE.h1, bold: true, color: COLOR.primary });
    d.rule();
    for (const s of STAGES) {
        d.drawText(`阶段 ${s.id} · ${s.name}`, { size: FONT_SIZE.body });
    }
    d.space(8);
    d.note('附件清单详见末页;原始文件请同时查看 ZIP 包。');

    // ---- 各阶段内容 ----
    for (const s of STAGES) {
        d._newPage();
        d.h1(`阶段 ${s.id} · ${s.name}`);
        const stageFields = FIELDS.filter((f) => f.stage === s.id).sort((a, b) => a.order - b.order);
        for (const f of stageFields) {
            renderField(d, f, values[f.id], manifest);
        }
    }

    // ---- 附件清单页 ----
    d._newPage();
    d.h1('附件清单');
    if (!manifest || manifest.length === 0) {
        d.note('(无附件)');
    } else {
        const totalW = PAGE.width - MARGIN.left - MARGIN.right;
        const widths = [40, 130, 220, totalW - 40 - 130 - 220];
        const rows = manifest.map((m, i) => [
            String(i + 1),
            stageById(m.stage)?.name || `阶段${m.stage}`,
            m.zipPath,
            m.originalName,
        ]);
        d.table(['#', '阶段', 'ZIP 路径', '原文件名'], rows, widths);
    }

    // ---- 页脚:在每页底部加页码 ----
    const totalPages = pdfDoc.getPageCount();
    for (let i = 0; i < totalPages; i++) {
        const p = pdfDoc.getPage(i);
        p.drawText(`${i + 1} / ${totalPages}`, {
            x: PAGE.width - MARGIN.right - 50,
            y: 28,
            size: FONT_SIZE.small,
            font, color: rgbColor(COLOR.soft),
        });
        p.drawText('智贸出海 · B2B 视频服务立项资料表', {
            x: MARGIN.left, y: 28,
            size: FONT_SIZE.small, font, color: rgbColor(COLOR.soft),
        });
    }

    const bytes = await pdfDoc.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const fileName = APP_CONFIG.pdf.fileNamePattern
        .replace('{companyZh}', safeFsName(companyZh || '客户'))
        .replace('{YYYYMMDD}', ymd());

    return { blob, fileName };
}

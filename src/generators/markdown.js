// Markdown 生成:智贸出海 B2B 视频服务立项资料表(替代 PDF)。
// 输出针对飞书在线文档优化,同时保证大模型可结构化读取:
// - 多级标题 (#, ##, ###)
// - 加粗 (**...**) 强调字段名/关键值
// - GFM 表格(dynamic-card / matrix-2d / cert-grid / 附件清单)
// - 有序/无序列表
// - 引用块 (>) 用于 help 提示
// - 表格内换行用 <br>;管道符 | 转义为 \|

import { FIELDS } from '../config/fields.js';
import { STAGES, stageById } from '../config/stages.js';
import { APP_CONFIG } from '../config/app.js';
import { COUNTRIES } from '../config/countries.js';
import { isFileRef } from '../core/draft.js';

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

// 国家 code → "中文 / English";若不在表内原样返回
function countryLabel(code) {
    if (!code) return '';
    const c = COUNTRIES.find((x) => x.code === code);
    return c ? `${c.zh} / ${c.en}` : String(code);
}

// 单元格转义:替换换行为 <br>,转义管道符
function cellEscape(s) {
    if (s == null) return '';
    return String(s)
        .replace(/\r?\n/g, '<br>')
        .replace(/\|/g, '\\|');
}

// 普通文本中:管道符不需转义,但保留换行为正常的 markdown 段落
function isEmpty(v) {
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'string') return v.trim() === '';
    if (typeof v === 'object' && !isFileRef(v)) return Object.keys(v).length === 0;
    return false;
}

// 通用值 → 文本(非表格语境)
function fmtValue(v, subType) {
    if (isEmpty(v)) return '—';
    if (typeof v === 'boolean') return v ? '是' : '否';
    if (Array.isArray(v)) return v.map((x) => fmtValue(x, subType)).join(' / ');
    if (subType === 'country-select') return countryLabel(v);
    return String(v);
}

// 文件值 → 文本(非表格)
function fmtFile(v) {
    if (Array.isArray(v) && v.length > 0) {
        return v.map((r) => isFileRef(r) ? `\`${r.name}\`` : '').filter(Boolean).join('、');
    }
    if (isFileRef(v)) return `\`${v.name}\``;
    return '—';
}

// 文件汇总(对应 PDF 的 fileSummary,带 ZIP 路径)
function fileSummary(value, manifest, fieldId) {
    const list = manifest.filter((m) => m.fieldId === fieldId);
    if (list.length === 0) {
        if (Array.isArray(value) && value.length > 0) return `已上传 ${value.length} 个文件(详见 ZIP)`;
        if (isFileRef(value)) return `已上传:\`${value.name}\`(详见 ZIP)`;
        return '—';
    }
    const dirs = Array.from(new Set(list.map((m) => m.zipPath.split('/')[0])));
    const names = list.map((m) => `\`${m.originalName}\``).join('、');
    return `已上传 **${list.length}** 个文件 → ZIP 目录:\`${dirs.join('、')}\`<br>文件:${names}`;
}

// ---------- 表格构造 ----------
function buildTable(headers, rows) {
    const lines = [];
    lines.push('| ' + headers.map(cellEscape).join(' | ') + ' |');
    lines.push('| ' + headers.map(() => '---').join(' | ') + ' |');
    for (const r of rows) {
        lines.push('| ' + r.map(cellEscape).join(' | ') + ' |');
    }
    return lines.join('\n');
}

// dynamic-card 在 MD 中的呈现:
// - 当 cardTemplate 字段较少(<=4 列且无 textarea/file)→ 单一表格紧凑呈现
// - 否则:逐张卡 ### 子标题 + key/value 列表(可读性更佳)
function renderDynamicCard(field, arr, manifest) {
    if (!Array.isArray(arr) || arr.length === 0) return '> *(未填写)*';

    const tpl = field.cardTemplate || [];
    const hasComplex = tpl.some((s) => s.type === 'textarea' || s.type === 'file' || s.type === 'dynamic-card');
    const out = [];

    if (!hasComplex && tpl.length > 0 && tpl.length <= 4) {
        const cols = tpl;
        const headers = ['#', ...cols.map((c) => c.label)];
        const rows = arr.map((card, i) => [
            String(i + 1),
            ...cols.map((c) => {
                const v = card?.[c.id];
                if (c.type === 'country-select') return countryLabel(v);
                if (Array.isArray(v)) return v.join(' / ');
                if (typeof v === 'boolean') return v ? '是' : '否';
                if (isEmpty(v)) return '—';
                return String(v);
            }),
        ]);
        out.push(buildTable(headers, rows));
        return out.join('\n');
    }

    // 复杂卡:逐张展开
    arr.forEach((card, i) => {
        out.push(`#### ${field.label} #${i + 1}`);
        out.push('');
        for (const sub of tpl) {
            const v = card?.[sub.id];
            if (sub.type === 'file') {
                const list = manifest.filter((m) =>
                    m.fieldId === field.id && m.zipPath.includes(`卡${i + 1}`)
                        && m.zipPath.includes(safeFsName(sub.label))
                );
                if (list.length > 0) {
                    const names = list.map((m) => `\`${m.originalName}\``).join('、');
                    out.push(`- **${sub.label}**:已上传 ${list.length} 个文件 → ${names}`);
                } else {
                    out.push(`- **${sub.label}**:${fmtFile(v)}`);
                }
                continue;
            }
            if (sub.type === 'dynamic-card') {
                const nested = Array.isArray(v) ? v : [];
                out.push(`- **${sub.label}**:共 ${nested.length} 项`);
                nested.forEach((n, j) => {
                    out.push(`    - **#${j + 1}**`);
                    for (const sub2 of sub.cardTemplate || []) {
                        const v2 = n?.[sub2.id];
                        if (sub2.type === 'file') {
                            out.push(`        - ${sub2.label}:${fmtFile(v2)}`);
                        } else {
                            out.push(`        - ${sub2.label}:${fmtValue(v2, sub2.type)}`);
                        }
                    }
                });
                continue;
            }
            if (sub.type === 'textarea') {
                if (isEmpty(v)) {
                    out.push(`- **${sub.label}**:—`);
                } else {
                    out.push(`- **${sub.label}**:`);
                    String(v).split(/\r?\n/).forEach((line) => {
                        if (line.trim()) out.push(`    > ${line}`);
                    });
                }
                continue;
            }
            out.push(`- **${sub.label}**:${fmtValue(v, sub.type)}`);
        }
        out.push('');
    });
    return out.join('\n');
}

// composite:子字段列表
function renderComposite(field, value, manifest) {
    const obj = value || {};
    const out = [];
    for (const sub of field.subFields || []) {
        if (sub.showWhen) {
            const c = obj[sub.showWhen.field];
            if (c !== sub.showWhen.equals) continue;
        }
        const v = obj[sub.id];
        if (sub.type === 'file') {
            // 用 manifest 拿对应路径
            const list = manifest.filter((m) =>
                m.fieldId === field.id && m.zipPath.includes(safeFsName(sub.label))
            );
            if (list.length > 0) {
                const names = list.map((m) => `\`${m.originalName}\``).join('、');
                out.push(`- **${sub.label}**:已上传 ${list.length} 个文件 → ${names}`);
            } else {
                out.push(`- **${sub.label}**:${fmtFile(v)}`);
            }
            continue;
        }
        if (sub.type === 'dynamic-card') {
            const nested = Array.isArray(v) ? v : [];
            out.push(`- **${sub.label}**:共 ${nested.length} 项`);
            nested.forEach((n, j) => {
                out.push(`    - **#${j + 1}**`);
                for (const sub2 of sub.cardTemplate || []) {
                    out.push(`        - ${sub2.label}:${fmtValue(n?.[sub2.id], sub2.type)}`);
                }
            });
            continue;
        }
        if (sub.type === 'textarea' && !isEmpty(v)) {
            out.push(`- **${sub.label}**:`);
            String(v).split(/\r?\n/).forEach((line) => {
                if (line.trim()) out.push(`    > ${line}`);
            });
            continue;
        }
        out.push(`- **${sub.label}**:${fmtValue(v, sub.type)}`);
    }
    return out.length > 0 ? out.join('\n') : '> *(未填写)*';
}

// cert-grid / tag-multi-with-attachment:表格
function renderCertGrid(field, value, manifest) {
    const arr = Array.isArray(value) ? value : [];
    if (arr.length === 0) return '> *(未选)*';
    const cols = (field.itemFields || []).filter((s) => s.type !== 'file');
    const fileSub = (field.itemFields || []).find((s) => s.type === 'file');
    const headers = ['项', ...cols.map((c) => c.label)];
    if (fileSub) headers.push(fileSub.label);
    const rows = arr.map((item) => {
        const row = [item.key || '—', ...cols.map((c) => fmtValue(item[c.id], c.type))];
        if (fileSub) {
            const v = item[fileSub.id];
            row.push(isFileRef(v) ? `\`${v.name}\` ✓ 见 ZIP` : '—');
        }
        return row;
    });
    return buildTable(headers, rows);
}

// matrix-2d:行 × 列表格(行=固定 rowOptions,列=动态来源 node18)
function renderMatrix(field, value) {
    const obj = value && typeof value === 'object' ? value : {};
    const cells = Object.keys(obj);
    if (cells.length === 0) return '> *(未标记)*';
    const rowSet = new Set();
    const colSet = new Set();
    for (const k of cells) {
        const [r, c] = k.split('__||__');
        rowSet.add(r);
        colSet.add(c);
    }
    const rowArr = field.rowOptions || Array.from(rowSet);
    const colArr = Array.from(colSet);
    const headers = [field.rowsLabel || '行', ...colArr];
    const tableRows = rowArr
        .filter((r) => colArr.some((c) => obj[`${r}__||__${c}`]))
        .map((r) => [
            r,
            ...colArr.map((c) => {
                const cell = obj[`${r}__||__${c}`];
                if (!cell) return '';
                const v = cell[(field.cellField?.id) || 'note'];
                return v ? String(v) : '✓';
            }),
        ]);
    if (tableRows.length === 0) return '> *(未标记)*';
    return buildTable(headers, tableRows);
}

// multi-select-with-detail
function renderMsd(field, value) {
    const obj = value || {};
    const keys = Object.keys(obj);
    if (keys.length === 0) return '> *(未选)*';
    const out = [];
    for (const key of keys) {
        const opt = (field.options || []).find((o) => o.key === key);
        const detail = obj[key]?.detail || '';
        out.push(`- **${opt?.label || key}**:${detail || '—'}`);
    }
    return out.join('\n');
}

// 渲染单个字段
function renderField(field, value, manifest) {
    const out = [];
    out.push(`### ${field.order}. ${field.label}${field.required ? ' *' : ''}`);
    out.push('');

    switch (field.component) {
        case 'text': case 'select': case 'radio':
        case 'date': case 'time': case 'color': case 'url': case 'email':
        case 'tel': case 'number': case 'year': case 'slider': case 'switch':
            out.push(fmtValue(value));
            break;

        case 'textarea':
            if (isEmpty(value)) {
                out.push('—');
            } else {
                String(value).split(/\r?\n/).forEach((line) => {
                    out.push(line.trim() ? `> ${line}` : '>');
                });
            }
            break;

        case 'multi-select':
        case 'tag-input':
        case 'dynamic-list':
            if (isEmpty(value)) {
                out.push('—');
            } else {
                value.forEach((v) => out.push(`- ${v}`));
            }
            break;

        case 'sortable-list':
            if (isEmpty(value)) {
                out.push('—');
            } else {
                value.forEach((v, i) => out.push(`${i + 1}. ${v}`));
            }
            break;

        case 'country-select':
            out.push(countryLabel(value) || '—');
            break;

        case 'file':
            out.push(fileSummary(value, manifest, field.id));
            break;

        case 'composite':
            out.push(renderComposite(field, value, manifest));
            break;

        case 'dynamic-card':
            out.push(renderDynamicCard(field, value, manifest));
            break;

        case 'cert-grid':
        case 'tag-multi-with-attachment':
            out.push(renderCertGrid(field, value, manifest));
            break;

        case 'matrix-2d':
            out.push(renderMatrix(field, value));
            break;

        case 'multi-select-with-detail':
            out.push(renderMsd(field, value));
            break;

        case 'category-tree': {
            const lines = typeof value === 'string'
                ? value.split('\n').map((s) => s.trim()).filter(Boolean)
                : Array.isArray(value) ? value : [];
            if (lines.length === 0) {
                out.push('—');
            } else {
                lines.forEach((ln) => out.push(`- ${ln}`));
            }
            break;
        }

        default:
            out.push(`*(组件 ${field.component} 未渲染)*`);
    }

    if (field.help) {
        out.push('');
        out.push(`> 💡 **填写提示**:${field.help.replace(/\r?\n/g, ' ')}`);
    }
    out.push('');
    return out.join('\n');
}

// ---------- 主入口 ----------
export async function buildMarkdown(values, manifest, companyZh) {
    const out = [];

    // ===== 封面 =====
    out.push(`# 智贸出海 · B2B 视频服务立项资料表`);
    out.push('');
    out.push(`> **客户公司**:${companyZh || '—'}  `);
    out.push(`> **申报日期**:${new Date().toISOString().slice(0, 10)}  `);
    out.push(`> **生成时间**:${nowText()}`);
    out.push('');
    out.push('---');
    out.push('');

    // ===== 目录 =====
    out.push(`## 📑 目录`);
    out.push('');
    STAGES.forEach((s) => {
        out.push(`${s.id}. **阶段 ${s.id} · ${s.name}**`);
    });
    out.push('');
    out.push(`> 附件原始文件请参见同步导出的 ZIP 包(\`00_附件清单.tsv\` 内含完整路径)。`);
    out.push('');
    out.push('---');
    out.push('');

    // ===== 各阶段 =====
    for (const s of STAGES) {
        out.push(`## 阶段 ${s.id} · ${s.name}`);
        out.push('');
        const stageFields = FIELDS.filter((f) => f.stage === s.id).sort((a, b) => a.order - b.order);
        for (const f of stageFields) {
            out.push(renderField(f, values[f.id], manifest));
        }
        out.push('---');
        out.push('');
    }

    // ===== 附件清单 =====
    out.push(`## 📎 附件清单`);
    out.push('');
    if (!manifest || manifest.length === 0) {
        out.push('> *(无附件)*');
    } else {
        const headers = ['#', '阶段', '字段', 'ZIP 路径', '原文件名', '大小(KB)'];
        const rows = manifest.map((m, i) => [
            String(i + 1),
            stageById(m.stage)?.name || `阶段${m.stage}`,
            m.fieldLabel,
            m.zipPath,
            m.originalName,
            (m.size / 1024).toFixed(1),
        ]);
        out.push(buildTable(headers, rows));
    }
    out.push('');
    out.push('---');
    out.push('');
    out.push(`*本文档由 智贸出海 B2B 视频服务立项资料表 自动生成 · ${nowText()}*`);
    out.push('');

    const content = out.join('\n');
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const fileName = APP_CONFIG.markdown.fileNamePattern
        .replace('{companyZh}', safeFsName(companyZh || '客户'))
        .replace('{YYYYMMDD}', ymd());
    return { blob, fileName, content };
}

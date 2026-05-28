// ZIP 打包:遍历 values,收集所有文件 ref,按 7 阶段 + 字段语义命名落入子目录。
// 输出文件名:`金品诚企附件_{公司名}_{YYYYMMDD}.zip`

import { FIELDS, getField } from '../config/fields.js';
import { STAGES } from '../config/stages.js';
import { APP_CONFIG } from '../config/app.js';
import { loadFile, isFileRef } from '../core/draft.js';

function pad(n) { return String(n).padStart(2, '0'); }
function ymd() {
    const d = new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function safeFsName(s) {
    return String(s || '')
        .replace(/[\\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 80);
}

function stageDirName(stageId) {
    const s = STAGES.find((x) => x.id === stageId);
    return `${pad(stageId)}_${safeFsName(s?.name || `stage${stageId}`)}`;
}

// 找出 value 中所有 fileRef,返回 [{ ref, name, dirSuffix, label }]
// dirSuffix: 字段内的子路径(用于 dynamic-card 的 "卡N" 区分)
function* walkFileRefs(field, value, _path = []) {
    if (value == null) return;

    if (isFileRef(value)) {
        yield {
            ref: value.ref, name: value.name,
            dirSuffix: _path.length ? '_' + _path.join('_') : '',
            label: field.label,
        };
        return;
    }
    if (Array.isArray(value)) {
        // 顶层 multiple 文件 / dynamic-card / cert-grid / dynamic-list
        if (field.component === 'file' && field.multiple) {
            for (const f of value) if (isFileRef(f)) {
                yield { ref: f.ref, name: f.name, dirSuffix: '', label: field.label };
            }
            return;
        }
        if (field.component === 'dynamic-card') {
            for (let i = 0; i < value.length; i++) {
                const card = value[i];
                if (!card || typeof card !== 'object') continue;
                for (const sub of field.cardTemplate || []) {
                    const sv = card[sub.id];
                    if (sub.type === 'dynamic-card' && Array.isArray(sv)) {
                        for (let j = 0; j < sv.length; j++) {
                            const inner = sv[j];
                            for (const sub2 of sub.cardTemplate || []) {
                                yield* walkRefSub(field, inner?.[sub2.id], sub2,
                                    [`卡${i + 1}`, sub.label, `${j + 1}`, sub2.label]);
                            }
                        }
                    } else {
                        yield* walkRefSub(field, sv, sub, [`卡${i + 1}`, sub.label]);
                    }
                }
            }
            return;
        }
        if (field.component === 'cert-grid' || field.component === 'tag-multi-with-attachment') {
            for (const item of value) {
                if (!item || typeof item !== 'object') continue;
                for (const sub of field.itemFields || []) {
                    yield* walkRefSub(field, item[sub.id], sub, [item.key || '项', sub.label]);
                }
            }
            return;
        }
    }
    if (value && typeof value === 'object' && field.component === 'composite') {
        for (const sub of field.subFields || []) {
            yield* walkRefSub(field, value[sub.id], sub, [sub.label]);
        }
        return;
    }
}

// 子字段 ref 提取(被嵌套调用)
function* walkRefSub(parentField, val, sub, path) {
    if (val == null) return;
    if (isFileRef(val)) {
        yield {
            ref: val.ref, name: val.name,
            dirSuffix: path.length ? '_' + path.map(safeFsName).join('_') : '',
            label: sub.label,
        };
        return;
    }
    if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
            const f = val[i];
            if (isFileRef(f)) {
                yield {
                    ref: f.ref, name: f.name,
                    dirSuffix: '_' + path.map(safeFsName).join('_') + `_${i + 1}`,
                    label: sub.label,
                };
            }
        }
    }
}

// 主入口:遍历所有字段,把文件按阶段子目录写入 zip。
// 返回 { manifest: [], totalFiles, totalBytes } 供 Markdown 附件清单页使用。
export async function buildZip(values, companyZh) {
    if (!window.JSZip) throw new Error('JSZip 未加载');
    const zip = new window.JSZip();

    const manifest = []; // [{ stage, fieldLabel, zipPath, originalName, size }]
    let totalBytes = 0;
    let totalFiles = 0;

    for (const f of FIELDS) {
        const v = values[f.id];
        if (v == null) continue;
        for (const item of walkFileRefs(f, v)) {
            const blob = await loadFile(item.ref);
            if (!blob) continue;
            const stageDir = stageDirName(f.stage);
            const baseName = `${safeFsName(f.label)}${item.dirSuffix}_${safeFsName(item.name)}`;
            // 防同名冲突:检测是否已存在,加序号
            let zipPath = `${stageDir}/${baseName}`;
            let n = 2;
            while (zip.file(zipPath)) {
                zipPath = `${stageDir}/${baseName.replace(/(\.[^.]+)?$/, `_${n}$1`)}`;
                n += 1;
            }
            zip.file(zipPath, blob);
            manifest.push({
                stage: f.stage,
                fieldLabel: f.label,
                fieldId: f.id,
                zipPath,
                originalName: item.name,
                size: blob.size,
            });
            totalBytes += blob.size;
            totalFiles += 1;
        }
    }

    // 把 manifest 也写进 zip,便于客户回邮时核对
    if (manifest.length > 0) {
        const lines = ['阶段\t字段\tZIP 路径\t原文件名\t大小(KB)'];
        for (const m of manifest) {
            lines.push([
                m.stage, m.fieldLabel, m.zipPath, m.originalName,
                (m.size / 1024).toFixed(1),
            ].join('\t'));
        }
        zip.file('00_附件清单.tsv', lines.join('\n'));
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const fileName = APP_CONFIG.zip.fileNamePattern
        .replace('{companyZh}', safeFsName(companyZh || '客户'))
        .replace('{YYYYMMDD}', ymd());

    return { blob, fileName, manifest, totalFiles, totalBytes };
}

export function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

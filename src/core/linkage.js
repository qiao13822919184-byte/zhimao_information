// 联动引擎:负责 bindsTo / colSource 的"孤儿清理"。
// 当源字段(节点 28 / 节点 40 / 节点 18)的项被移除或重命名,
// 自动扫描目标字段并删除已不存在的引用值。
//
// 大部分联动是"读时即时"通过 store.linkedOptions / store.matrixCols 实现,
// 这里只处理"写时清理":避免选过的项变孤儿后还卡在数据里、最终塞进 Markdown。

import { FIELDS } from '../config/fields.js';

// 收集所有 bindsTo 关系:[{ targetFieldId, targetSubKey, targetContainer, sourceFieldId, sourceKey }]
function collectBindings() {
    const out = [];
    for (const f of FIELDS) {
        // composite 子字段
        if (f.component === 'composite' && Array.isArray(f.subFields)) {
            for (const sub of f.subFields) {
                if (sub.bindsTo) {
                    const sources = Array.isArray(sub.bindsTo) ? sub.bindsTo : [sub.bindsTo];
                    out.push({
                        kind: 'composite',
                        targetField: f.id, subId: sub.id,
                        sources, sourceKey: sub.bindsToKey || 'name',
                        multi: sub.type === 'multi-select',
                    });
                }
            }
        }
        // dynamic-card 子字段(节点 40 workflowNode → 节点 28)
        if (f.component === 'dynamic-card' && Array.isArray(f.cardTemplate)) {
            for (const sub of f.cardTemplate) {
                if (sub.bindsTo) {
                    const sources = Array.isArray(sub.bindsTo) ? sub.bindsTo : [sub.bindsTo];
                    out.push({
                        kind: 'card',
                        targetField: f.id, subId: sub.id,
                        sources, sourceKey: sub.bindsToKey || 'name',
                        multi: sub.type === 'multi-select',
                    });
                }
            }
        }
    }
    return out;
}

// 把 source 字段的当前合法选项收集为 Set
function readSourceOptions(values, sourceFieldId, key) {
    const v = values[sourceFieldId];
    const set = new Set();
    if (Array.isArray(v)) {
        for (const it of v) {
            if (typeof it === 'string') {
                if (it.trim()) set.add(it);
            } else if (it && typeof it === 'object') {
                const val = it[key];
                if (val && String(val).trim()) set.add(String(val));
            }
        }
    }
    return set;
}

function combinedOptions(values, sources, key) {
    const all = new Set();
    for (const s of sources) {
        for (const o of readSourceOptions(values, s, key)) all.add(o);
    }
    return all;
}

// 清理 multi-select 的孤儿
function pruneMulti(arr, allowed) {
    if (!Array.isArray(arr)) return arr;
    return arr.filter((x) => allowed.has(x));
}
function pruneSingle(v, allowed) {
    return allowed.has(v) ? v : '';
}

// 主清理函数:扫描所有绑定关系,删孤儿。返回清理过的字段 id 列表(用于提示/调试)。
export function pruneOrphans(values) {
    const bindings = collectBindings();
    const touched = new Set();

    for (const b of bindings) {
        const allowed = combinedOptions(values, b.sources, b.sourceKey);

        if (b.kind === 'composite') {
            const obj = values[b.targetField];
            if (!obj || typeof obj !== 'object') continue;
            const cur = obj[b.subId];
            if (b.multi) {
                const next = pruneMulti(cur, allowed);
                if (Array.isArray(cur) && next.length !== cur.length) {
                    obj[b.subId] = next;
                    touched.add(b.targetField);
                }
            } else {
                const next = pruneSingle(cur, allowed);
                if (cur && cur !== next) {
                    obj[b.subId] = next;
                    touched.add(b.targetField);
                }
            }
        } else if (b.kind === 'card') {
            const arr = values[b.targetField];
            if (!Array.isArray(arr)) continue;
            for (const card of arr) {
                if (!card || typeof card !== 'object') continue;
                const cur = card[b.subId];
                if (b.multi) {
                    const next = pruneMulti(cur, allowed);
                    if (Array.isArray(cur) && next.length !== cur.length) {
                        card[b.subId] = next;
                        touched.add(b.targetField);
                    }
                } else {
                    const next = pruneSingle(cur, allowed);
                    if (cur && cur !== next) {
                        card[b.subId] = next;
                        touched.add(b.targetField);
                    }
                }
            }
        }
    }

    // 矩阵列(node 18 → node 29):清理已不存在的列对应的格
    for (const f of FIELDS) {
        if (f.component !== 'matrix-2d' || !f.colSource) continue;
        const allowedCols = readSourceOptions(values, f.colSource.field, f.colSource.valueKey);
        const obj = values[f.id];
        if (!obj || typeof obj !== 'object') continue;
        const before = Object.keys(obj).length;
        for (const k of Object.keys(obj)) {
            const col = k.split('__||__')[1];
            if (!allowedCols.has(col)) delete obj[k];
        }
        if (Object.keys(obj).length !== before) touched.add(f.id);
    }

    return Array.from(touched);
}

// 注册联动:在 store.init() 里调用,为每个 source 字段建立 watcher。
// store: Alpine 组件 this 上下文。
export function attachLinkageWatchers(store) {
    const sources = new Set();
    for (const f of FIELDS) {
        if (f.component === 'composite') {
            for (const s of f.subFields || []) {
                if (s.bindsTo) (Array.isArray(s.bindsTo) ? s.bindsTo : [s.bindsTo]).forEach((x) => sources.add(x));
            }
        }
        if (f.component === 'dynamic-card') {
            for (const s of f.cardTemplate || []) {
                if (s.bindsTo) (Array.isArray(s.bindsTo) ? s.bindsTo : [s.bindsTo]).forEach((x) => sources.add(x));
            }
        }
        if (f.component === 'matrix-2d' && f.colSource) sources.add(f.colSource.field);
    }
    for (const fid of sources) {
        store.$watch(`values.${fid}`, () => {
            const touched = pruneOrphans(store.values);
            if (touched.length > 0) {
                // 清理后给一个 toast,避免用户疑惑
                store.showToast(`联动更新:已同步 ${touched.length} 个字段的引用项`, 1800);
            }
        });
    }
}

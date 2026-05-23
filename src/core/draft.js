// 草稿模块:
// - localStorage 存表单文本值与导航状态(JSON)
// - IndexedDB(经 idb-keyval)存文件 Blob,key=`file_{fieldId}_{cardIdx}_{subId}_{filename}`
// 文件值在 store 内以"占位对象 { __ref: key, name, size, type }"形式驻留,序列化时只写占位。

import { APP_CONFIG } from '../config/app.js';

const idb = () => window.idbKeyval;

let fileStore = null;
function getStore() {
    if (!fileStore) {
        fileStore = idb().createStore(APP_CONFIG.fileStoreName, APP_CONFIG.fileStoreName);
    }
    return fileStore;
}

const FILE_REF_TAG = '__fileRef__';

function isFileRef(v) {
    return v && typeof v === 'object' && v[FILE_REF_TAG] === true;
}

export async function saveFile(refKey, blob) {
    await idb().set(refKey, blob, getStore());
}

export async function loadFile(refKey) {
    return await idb().get(refKey, getStore());
}

export async function removeFile(refKey) {
    await idb().del(refKey, getStore());
}

export async function clearAllFiles() {
    await idb().clear(getStore());
}

// 把文件值替换为占位 ref(用于序列化)。深度遍历,递归 dynamic-card / composite。
export function serializeValues(values) {
    return JSON.stringify(values, (_k, v) => {
        if (v instanceof File || v instanceof Blob) {
            // store 中此时不应出现裸 Blob,正常流程已替换为 ref;兜底防穿透
            return null;
        }
        return v;
    });
}

export function buildFileRef(fieldId, path, file) {
    const safeName = file.name.replace(/[^\w.一-龥-]+/g, '_');
    const refKey = `file_${fieldId}_${path.join('.')}_${Date.now()}_${safeName}`;
    return {
        [FILE_REF_TAG]: true,
        ref: refKey,
        name: file.name,
        size: file.size,
        type: file.type,
        savedAt: Date.now(),
    };
}

const DRAFT_KEY = APP_CONFIG.draftKey;

export function readDraftMeta() {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    try {
        const obj = JSON.parse(raw);
        if (!obj || !obj.savedAt) return null;
        const ageDays = (Date.now() - obj.savedAt) / (1000 * 60 * 60 * 24);
        if (ageDays > APP_CONFIG.draftMaxAgeDays) {
            localStorage.removeItem(DRAFT_KEY);
            return null;
        }
        return obj;
    } catch {
        return null;
    }
}

export function writeDraft(snapshot) {
    const payload = {
        savedAt: Date.now(),
        version: 1,
        ...snapshot,
    };
    try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
        return true;
    } catch (e) {
        console.error('writeDraft failed', e);
        return false;
    }
}

export async function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
    await clearAllFiles();
}

// 防抖工具
export function debounce(fn, wait) {
    let t = null;
    return function (...args) {
        if (t) clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

export { FILE_REF_TAG, isFileRef };

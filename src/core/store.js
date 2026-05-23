// Alpine store / 应用入口逻辑。
// M1:数据模型、当前题导航、阶段进度、草稿读写、基础控件渲染分发。
// M2:复杂组件(动态卡片 / 二维矩阵 / 拖拽排序 / 认证网格 / 文件上传)。

import { FIELDS, fieldsByStage, TOTAL_FIELD_COUNT, getField } from '../config/fields.js';
import { STAGES, stageById } from '../config/stages.js';
import { APP_CONFIG } from '../config/app.js';
import {
    readDraftMeta, writeDraft, clearDraft, debounce,
    saveFile, loadFile, removeFile, buildFileRef, isFileRef,
} from './draft.js';
import { COUNTRIES } from '../config/countries.js';
import { validateField, validateAll } from './validation.js';
import { attachLinkageWatchers, pruneOrphans } from './linkage.js';
import { buildZip, downloadBlob } from '../generators/zip.js';
import { buildPdf } from '../generators/pdf.js';

function emptyValueFor(field) {
    switch (field.component) {
        case 'dynamic-list':
        case 'multi-select':
        case 'tag-input':
            return field.defaultValue ? [...field.defaultValue] : [];
        case 'dynamic-card':
        case 'tag-multi-with-attachment':
        case 'cert-grid':
            return [];
        case 'matrix-2d':
            return {};
        case 'sortable-list':
            return field.defaultItems ? [...field.defaultItems] : [];
        case 'composite':
            return {};
        case 'multi-select-with-detail':
            return {};
        case 'category-tree':
            return [];
        case 'switch':
            return false;
        case 'number':
        case 'year':
            return null;
        case 'file':
            return field.multiple ? [] : null;
        default:
            return '';
    }
}

// 给 dynamic-card 的卡片创建一个空对象,根据 cardTemplate 推导每个字段的默认值
function emptyCardItem(template) {
    const item = {};
    for (const sub of template) {
        if (sub.type === 'multi-select' || sub.type === 'tag-input') {
            item[sub.id] = [];
        } else if (sub.type === 'switch') {
            item[sub.id] = false;
        } else if (sub.type === 'file') {
            item[sub.id] = sub.multiple ? [] : null;
        } else if (sub.type === 'dynamic-card') {
            item[sub.id] = [];
        } else if (sub.type === 'number') {
            item[sub.id] = null;
        } else {
            item[sub.id] = '';
        }
    }
    return item;
}

function buildInitialValues() {
    const out = {};
    for (const f of FIELDS) out[f.id] = emptyValueFor(f);
    return out;
}

function formatDate(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function createApp() {
    return {
        ready: false,
        stages: STAGES,
        fields: FIELDS,
        totalCount: TOTAL_FIELD_COUNT,

        currentIndex: 0,
        values: buildInitialValues(),
        currentError: '',
        toast: '',
        toastTimer: null,

        showResumeModal: false,
        resumeInfo: { savedAt: '', completed: 0 },
        pendingDraft: null,

        get currentField() {
            return this.fields[this.currentIndex] || null;
        },
        get currentStage() {
            return this.currentField ? this.currentField.stage : 1;
        },
        get canPrev() {
            return this.currentIndex > 0;
        },
        get isLast() {
            return this.currentIndex === this.fields.length - 1;
        },

        async init() {
            const meta = readDraftMeta();
            if (meta && meta.values) {
                this.resumeInfo = {
                    savedAt: formatDate(meta.savedAt),
                    completed: meta.completedCount || 0,
                };
                this.pendingDraft = meta;
                this.showResumeModal = true;
            }
            this.ready = true;

            this._debouncedSave = debounce(() => this.saveDraft(false), APP_CONFIG.autoSaveDebounceMs);

            window.addEventListener('keydown', (e) => this.handleKey(e));

            // 字段值变化触发防抖保存(深度监听)
            this.$watch('values', () => { this._debouncedSave(); });

            // M3:联动引擎,源字段变化时清理目标字段的孤儿引用
            attachLinkageWatchers(this);
        },

        // ---- 草稿 ----
        snapshotForDraft() {
            return {
                currentIndex: this.currentIndex,
                values: this.values,
                completedCount: this.completedCount(),
            };
        },
        saveDraft(showToast = false) {
            const ok = writeDraft(this.snapshotForDraft());
            if (showToast) this.showToast(ok ? '草稿已保存' : '保存失败');
        },
        saveDraftManually() {
            this.saveDraft(true);
        },
        async resumeDraft() {
            if (this.pendingDraft) {
                this.values = { ...this.values, ...this.pendingDraft.values };
                this.currentIndex = this.pendingDraft.currentIndex || 0;
            }
            this.showResumeModal = false;
            this.pendingDraft = null;
        },
        async discardDraft() {
            await clearDraft();
            this.showResumeModal = false;
            this.pendingDraft = null;
            this.values = buildInitialValues();
            this.currentIndex = 0;
        },
        confirmReset() {
            if (window.confirm('确定要清空所有已填内容并重新开始吗?此操作不可撤销。')) {
                this.discardDraft();
                this.showToast('已清空,可重新填写');
            }
        },

        // ---- 进度 ----
        completedCount() {
            return this.fields.filter((f) => this.isFieldFilled(f)).length;
        },
        isFieldFilled(field) {
            const v = this.values[field.id];
            if (v == null) return false;
            if (Array.isArray(v)) return v.length > 0;
            if (typeof v === 'object') return Object.keys(v).length > 0;
            if (typeof v === 'string') return v.trim() !== '';
            if (typeof v === 'number') return true;
            if (typeof v === 'boolean') return v === true;
            return Boolean(v);
        },
        stageProgress(stageId) {
            const fs = fieldsByStage(stageId);
            const done = fs.filter((f) => this.isFieldFilled(f)).length;
            return { done, total: fs.length };
        },
        stageDone(stageId) {
            const p = this.stageProgress(stageId);
            return p.total > 0 && p.done === p.total;
        },
        stageTooltip(stageId) {
            const s = stageById(stageId);
            const p = this.stageProgress(stageId);
            return `阶段 ${stageId} · ${s?.name ?? ''}(${p.done}/${p.total})`;
        },
        stageName(stageId) {
            return stageById(stageId)?.name || '';
        },
        jumpToStage(stageId) {
            const idx = this.fields.findIndex((f) => f.stage === stageId);
            if (idx >= 0) this.currentIndex = idx;
        },

        // ---- 导航 ----
        prev() {
            if (this.canPrev) {
                this.currentError = '';
                this.currentIndex -= 1;
            }
        },
        next() {
            const err = this.validateCurrent();
            if (err) {
                this.currentError = err;
                this.showToast(err);
                return;
            }
            this.currentError = '';
            if (this.currentIndex < this.fields.length - 1) {
                this.currentIndex += 1;
                this.saveDraft(false);
            }
        },
        finish() {
            const err = this.validateCurrent();
            if (err) {
                this.currentError = err;
                this.showToast(err);
                return;
            }
            // M3:整表全量校验,若有任何错误,跳到第一处并提示
            const allErrors = this.validateAllFields();
            if (allErrors.length > 0) {
                const first = allErrors[0];
                const idx = this.fields.findIndex((f) => f.id === first.fieldId);
                if (idx >= 0) {
                    this.currentIndex = idx;
                    this.currentError = first.message;
                }
                this.showToast(`仍有 ${allErrors.length} 处需修正,已跳到第一处`);
                return;
            }
            this.saveDraft(false);
            this.generateOutputs();
        },

        // ---- M4:PDF + ZIP 生成 ----
        generating: false,
        generateProgress: '',
        async generateOutputs() {
            if (this.generating) return;
            this.generating = true;
            this.generateProgress = '正在打包附件…';
            try {
                const companyZh = this.values['node1_companyNameZh'] || '客户';

                // 1) ZIP(同时拿到 manifest 给 PDF 用)
                const zipResult = await buildZip(this.values, companyZh);
                this.generateProgress = '正在生成 PDF 立项资料表…';

                // 2) PDF
                const pdfResult = await buildPdf(this.values, zipResult.manifest, companyZh);
                this.generateProgress = '准备下载…';

                // 3) 下载(分两次以避免某些浏览器只触发第一次)
                downloadBlob(pdfResult.blob, pdfResult.fileName);
                setTimeout(() => downloadBlob(zipResult.blob, zipResult.fileName), 600);

                this.showToast(`已生成:${pdfResult.fileName} + ${zipResult.fileName}`, 6000);
            } catch (e) {
                console.error(e);
                const msg = String(e?.message || e);
                if (msg.includes('字体加载失败') || msg.includes('字体')) {
                    this.showToast(`PDF 生成失败:中文字体未就绪。请确认 assets/fonts/ 下已放置思源黑体子集。详见 README。`, 8000);
                } else {
                    this.showToast(`生成失败:${msg}`, 6000);
                }
            } finally {
                this.generating = false;
                this.generateProgress = '';
            }
        },
        handleKey(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.saveDraft(true);
            } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                const tag = (e.target?.tagName || '').toLowerCase();
                if (tag === 'textarea') return; // textarea 内 Enter 留给换行
                if (tag === 'button') return;
                if (this.showResumeModal) return;
                e.preventDefault();
                this.next();
            }
        },

        // ---- 校验(M3:接 validation.js 引擎) ----
        validateCurrent() {
            const f = this.currentField;
            if (!f) return '';
            return validateField(f, this.values[f.id], this.values);
        },
        validateAllFields() {
            return validateAll(this.fields, this.values);
        },

        // ---- 文件上传(供 field-file 组件使用) ----
        async handleFileUpload(fieldId, path, fileList) {
            const refs = [];
            for (const file of fileList) {
                const ref = buildFileRef(fieldId, path, file);
                await saveFile(ref.ref, file);
                refs.push(ref);
            }
            return refs;
        },

        // ---- toast ----
        showToast(msg, ms = 2400) {
            this.toast = msg;
            if (this.toastTimer) clearTimeout(this.toastTimer);
            this.toastTimer = setTimeout(() => { this.toast = ''; }, ms);
        },

        // ---- 当前题数据访问(供模板使用) ----
        getValue(fieldId) {
            return this.values[fieldId];
        },
        setValue(fieldId, v) {
            this.values[fieldId] = v;
        },

        // ============ M2: 复杂组件操作 ============

        // dynamic-list:简单字符串数组(节点 3 品牌)
        addListItem(fieldId, max) {
            const arr = this.values[fieldId];
            if (!Array.isArray(arr)) return;
            if (max && arr.length >= max) {
                this.showToast(`最多 ${max} 项`);
                return;
            }
            arr.push('');
        },
        removeListItem(fieldId, idx) {
            const arr = this.values[fieldId];
            if (Array.isArray(arr)) arr.splice(idx, 1);
        },

        // dynamic-card:每张卡是一个对象,字段由 cardTemplate 决定
        addCardItem(fieldId) {
            const f = getField(fieldId);
            if (!f || !f.cardTemplate) return;
            const arr = this.values[fieldId];
            if (!Array.isArray(arr)) return;
            if (f.max && arr.length >= f.max) {
                this.showToast(`最多 ${f.max} 张`);
                return;
            }
            arr.push(emptyCardItem(f.cardTemplate));
        },
        removeCardItem(fieldId, idx) {
            const arr = this.values[fieldId];
            if (Array.isArray(arr)) arr.splice(idx, 1);
        },

        // 嵌套 dynamic-card(节点 35 客户证言)
        addNestedCard(parentValue, parentSubKey, template) {
            if (!Array.isArray(parentValue[parentSubKey])) {
                parentValue[parentSubKey] = [];
            }
            parentValue[parentSubKey].push(emptyCardItem(template));
        },
        removeNestedCard(parentValue, parentSubKey, idx) {
            const arr = parentValue[parentSubKey];
            if (Array.isArray(arr)) arr.splice(idx, 1);
        },

        // tag-multi-with-attachment / cert-grid:每项 { key, ...itemFields }
        toggleCertSelected(fieldId, optionKey) {
            const f = getField(fieldId);
            if (!f) return;
            const arr = this.values[fieldId];
            const idx = arr.findIndex((it) => it.key === optionKey);
            if (idx >= 0) {
                arr.splice(idx, 1);
            } else {
                const newItem = { key: optionKey };
                for (const sub of f.itemFields || []) {
                    if (sub.type === 'file') newItem[sub.id] = null;
                    else if (sub.type === 'switch') newItem[sub.id] = false;
                    else newItem[sub.id] = '';
                }
                arr.push(newItem);
            }
        },
        addCustomCert(fieldId, customKey) {
            if (!customKey || !customKey.trim()) return;
            const f = getField(fieldId);
            if (!f) return;
            const arr = this.values[fieldId];
            if (arr.some((it) => it.key === customKey.trim())) {
                this.showToast('该项已存在');
                return;
            }
            const newItem = { key: customKey.trim(), _custom: true };
            for (const sub of f.itemFields || []) {
                if (sub.type === 'file') newItem[sub.id] = null;
                else if (sub.type === 'switch') newItem[sub.id] = false;
                else newItem[sub.id] = '';
            }
            arr.push(newItem);
        },
        isCertSelected(fieldId, optionKey) {
            const arr = this.values[fieldId];
            return Array.isArray(arr) && arr.some((it) => it.key === optionKey);
        },
        getCertItem(fieldId, optionKey) {
            const arr = this.values[fieldId];
            return arr.find((it) => it.key === optionKey);
        },

        // matrix-2d(节点 29:市场区域 × 主推产品线)
        matrixKey(rowKey, colKey) {
            return `${rowKey}__||__${colKey}`;
        },
        getMatrixCell(fieldId, rowKey, colKey) {
            const obj = this.values[fieldId];
            return obj?.[this.matrixKey(rowKey, colKey)];
        },
        setMatrixCell(fieldId, rowKey, colKey, subId, val) {
            const obj = this.values[fieldId];
            const k = this.matrixKey(rowKey, colKey);
            if (!obj[k]) obj[k] = {};
            obj[k][subId] = val;
        },
        toggleMatrixCell(fieldId, rowKey, colKey) {
            const obj = this.values[fieldId];
            const k = this.matrixKey(rowKey, colKey);
            if (obj[k]) delete obj[k];
            else obj[k] = {};
        },
        // 矩阵列动态来源(节点 18 → 节点 29)
        matrixCols(field) {
            if (!field.colSource) return [];
            const src = this.values[field.colSource.field];
            if (!Array.isArray(src)) return [];
            return src
                .map((it) => it[field.colSource.valueKey])
                .filter((v) => v && String(v).trim() !== '');
        },

        // sortable-list(节点 28)
        addSortableItem(fieldId, name) {
            if (!name || !name.trim()) return;
            const arr = this.values[fieldId];
            if (Array.isArray(arr)) arr.push(name.trim());
        },
        removeSortableItem(fieldId, idx) {
            const arr = this.values[fieldId];
            if (Array.isArray(arr) && arr.length > 1) arr.splice(idx, 1);
        },
        moveSortable(fieldId, from, to) {
            const arr = this.values[fieldId];
            if (!Array.isArray(arr)) return;
            if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return;
            const [item] = arr.splice(from, 1);
            arr.splice(to, 0, item);
        },
        renameSortable(fieldId, idx, newName) {
            const arr = this.values[fieldId];
            if (Array.isArray(arr) && arr[idx] != null) arr[idx] = newName;
        },

        // tag-input(节点 30/32/33 等)
        addTag(targetArr, value) {
            const v = String(value || '').trim();
            if (!v) return;
            if (targetArr.indexOf(v) >= 0) return;
            targetArr.push(v);
        },
        removeTag(targetArr, idx) {
            if (Array.isArray(targetArr)) targetArr.splice(idx, 1);
        },

        // multi-select-with-detail(节点 36 售后保障)
        toggleAfterSales(fieldId, optionKey) {
            const obj = this.values[fieldId];
            if (obj[optionKey]) delete obj[optionKey];
            else obj[optionKey] = { detail: '' };
        },
        afterSalesSelected(fieldId, optionKey) {
            const obj = this.values[fieldId];
            return Boolean(obj && obj[optionKey]);
        },

        // 联动:节点 40 取景区域 → 节点 41/43 多选源(取卡片的 name)
        linkedOptions(spec, key = 'name') {
            if (!spec) return [];
            const fids = Array.isArray(spec) ? spec : [spec];
            const out = [];
            for (const fid of fids) {
                const v = this.values[fid];
                if (Array.isArray(v)) {
                    for (const it of v) {
                        if (typeof it === 'string') {
                            out.push(it);
                        } else if (it && typeof it === 'object') {
                            const val = it[key];
                            if (val && String(val).trim() !== '') out.push(String(val));
                        }
                    }
                }
            }
            // 去重
            return Array.from(new Set(out));
        },

        // 国家列表
        countryOptions() {
            return COUNTRIES;
        },

        // ---- 文件上传(M2 实装) ----
        // 通用入口:把 FileList / File[] 上传至 IndexedDB 并返回 ref(s)
        async _uploadFiles(fieldId, path, fileList, multiple) {
            const refs = [];
            for (const file of Array.from(fileList || [])) {
                const ref = buildFileRef(fieldId, path, file);
                await saveFile(ref.ref, file);
                refs.push(ref);
            }
            return multiple ? refs : refs[0] || null;
        },
        async uploadTopLevelFile(field, ev) {
            const fileList = ev.target?.files;
            if (!fileList || fileList.length === 0) return;
            const valid = this._validateFiles(field, fileList);
            if (valid !== true) { this.showToast(valid); ev.target.value = ''; return; }
            if (field.multiple) {
                const cur = Array.isArray(this.values[field.id]) ? this.values[field.id] : [];
                const refs = await this._uploadFiles(field.id, ['top'], fileList, true);
                this.values[field.id] = [...cur, ...refs];
            } else {
                const ref = await this._uploadFiles(field.id, ['top'], fileList, false);
                this.values[field.id] = ref;
            }
            ev.target.value = '';
        },
        async uploadIntoCard(field, cardIdx, subId, multiple, accept, maxSize, ev) {
            const fileList = ev.target?.files;
            if (!fileList || fileList.length === 0) return;
            const fakeSub = { type: 'file', accept, maxSize };
            const valid = this._validateFiles(fakeSub, fileList);
            if (valid !== true) { this.showToast(valid); ev.target.value = ''; return; }
            const card = this.values[field.id][cardIdx];
            if (!card) return;
            if (multiple) {
                const cur = Array.isArray(card[subId]) ? card[subId] : [];
                const refs = await this._uploadFiles(field.id, ['card', cardIdx, subId], fileList, true);
                card[subId] = [...cur, ...refs];
            } else {
                const ref = await this._uploadFiles(field.id, ['card', cardIdx, subId], fileList, false);
                card[subId] = ref;
            }
            ev.target.value = '';
        },
        async uploadIntoComposite(field, subId, multiple, accept, maxSize, ev) {
            const fileList = ev.target?.files;
            if (!fileList || fileList.length === 0) return;
            const fakeSub = { type: 'file', accept, maxSize };
            const valid = this._validateFiles(fakeSub, fileList);
            if (valid !== true) { this.showToast(valid); ev.target.value = ''; return; }
            const obj = this.values[field.id];
            if (multiple) {
                const cur = Array.isArray(obj[subId]) ? obj[subId] : [];
                const refs = await this._uploadFiles(field.id, ['composite', subId], fileList, true);
                obj[subId] = [...cur, ...refs];
            } else {
                const ref = await this._uploadFiles(field.id, ['composite', subId], fileList, false);
                obj[subId] = ref;
            }
            ev.target.value = '';
        },
        async uploadIntoCertItem(field, optionKey, subId, ev) {
            const fileList = ev.target?.files;
            if (!fileList || fileList.length === 0) return;
            const subDef = (field.itemFields || []).find((s) => s.id === subId);
            const valid = this._validateFiles(subDef || { type: 'file' }, fileList);
            if (valid !== true) { this.showToast(valid); ev.target.value = ''; return; }
            const item = this.getCertItem(field.id, optionKey);
            if (!item) return;
            const ref = await this._uploadFiles(field.id, ['cert', optionKey, subId], fileList, false);
            item[subId] = ref;
            ev.target.value = '';
        },
        _validateFiles(sub, fileList) {
            const accept = (sub && sub.accept) || null;
            const maxSize = (sub && sub.maxSize) || null;
            for (const f of Array.from(fileList)) {
                if (maxSize && f.size > maxSize) {
                    return `${f.name} 超过 ${(maxSize / 1024 / 1024).toFixed(0)}MB 上限`;
                }
                if (accept && accept.length) {
                    const ext = (f.name.split('.').pop() || '').toLowerCase();
                    if (!accept.includes(ext)) {
                        return `${f.name} 格式不在允许列表(${accept.join('/')})`;
                    }
                }
            }
            return true;
        },
        async clearFileRef(fieldRef, key) {
            const ref = fieldRef[key];
            if (Array.isArray(ref)) {
                for (const r of ref) if (r && r.ref) await removeFile(r.ref);
                fieldRef[key] = [];
            } else if (ref && ref.ref) {
                await removeFile(ref.ref);
                fieldRef[key] = null;
            }
        },
        async removeFileFromList(arr, idx) {
            const item = arr[idx];
            if (item && item.ref) await removeFile(item.ref);
            arr.splice(idx, 1);
        },
        async previewFile(ref) {
            if (!ref || !ref.ref) return;
            const blob = await loadFile(ref.ref);
            if (!blob) {
                this.showToast('文件已丢失,请重新上传');
                return;
            }
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            // url 由浏览器在标签页关闭后回收
        },
        formatSize(bytes) {
            if (bytes == null) return '';
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
            return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        },
        isFileRef,
    };
}

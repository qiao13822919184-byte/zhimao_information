// 校验引擎:读 fields.js 上字段的 validation 规则,返回错误信息字符串(无错则返回 '')。
// 涵盖:必填、min/max(文本长度 / 数值)、pattern、整数、邮箱、URL、日期晚于今日、
// 关键词包含、跨子字段窗口、多选最少项、矩阵最少格、动态卡至少一张满足条件。

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;

function isEmpty(v) {
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'string') return v.trim() === '';
    if (typeof v === 'object') return Object.keys(v).length === 0;
    return false;
}

function isFilledForRequired(v) {
    return !isEmpty(v);
}

// 用于子字段:文件 ref 视为有值
function isSubFilled(v) {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') {
        if (v.__fileRef__) return true;
        return Object.keys(v).length > 0;
    }
    if (typeof v === 'string') return v.trim() !== '';
    if (typeof v === 'number') return true;
    if (typeof v === 'boolean') return v;
    return false;
}

// 子字段 showWhen 解析(composite 用)
function shouldShow(sub, container) {
    if (!sub.showWhen) return true;
    const { field, equals } = sub.showWhen;
    return container?.[field] === equals;
}

// 检查单个值符合 validation 规则(不含 required,required 在外层判断)
function validateValue(label, v, rules) {
    if (!rules) return '';
    if (isEmpty(v)) return ''; // 空值跳过(required 已在外层处理)

    if (typeof v === 'string') {
        if (rules.min != null && v.length < rules.min) return `「${label}」至少 ${rules.min} 字符`;
        if (rules.max != null && v.length > rules.max) return `「${label}」最多 ${rules.max} 字符`;
        if (rules.pattern && !rules.pattern.test(v)) return `「${label}」${rules.patternMsg || '格式不正确'}`;
        if (rules.email && !EMAIL_RE.test(v)) return `「${label}」邮箱格式不正确`;
        if (rules.url && !URL_RE.test(v)) return `「${label}」URL 须以 http(s):// 开头`;
        if (rules.mustContainAny && !rules.mustContainAny.some((kw) => v.includes(kw))) {
            return `「${label}」需包含:${rules.mustContainAny.join(' / ')}`;
        }
        if (rules.afterToday) {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const d = new Date(v);
            if (!isNaN(d) && d < today) return `「${label}」不得早于今日`;
        }
    } else if (typeof v === 'number') {
        if (rules.min != null && v < rules.min) return `「${label}」不能小于 ${rules.min}`;
        if (rules.max != null && v > rules.max) return `「${label}」不能大于 ${rules.max}`;
        if (rules.integer && !Number.isInteger(v)) return `「${label}」必须为整数`;
    }

    if (rules.minSelected != null && Array.isArray(v) && v.length < rules.minSelected) {
        return `「${label}」至少选择 ${rules.minSelected} 项`;
    }

    return '';
}

// 校验子字段(composite / cardTemplate / itemFields 共用)
function validateSubField(sub, val, container, prefix = '') {
    if (!shouldShow(sub, container)) return '';
    const label = prefix ? `${prefix} · ${sub.label}` : sub.label;

    if (sub.required && !isSubFilled(val)) {
        return `「${label}」为必填项`;
    }
    if (isEmpty(val) && !(typeof val === 'boolean' && val === false)) return '';

    if (sub.type === 'file') {
        // 文件值是 ref 对象或 ref 数组;格式/大小在上传时已校验
        return '';
    }

    // 跨子字段窗口校验(node 44 minRangeDays)
    if (sub.validation?.minRangeDays && container) {
        const startKey = sub.validation.minRangeDays.field;
        const days = sub.validation.minRangeDays.days;
        const start = container[startKey];
        if (start && val) {
            const ms = new Date(val) - new Date(start);
            if (isNaN(ms) || ms < days * 86400000 - 1) {
                return `「${label}」需在「${startKey}」之后至少 ${days} 天`;
            }
        }
    }

    if (sub.type === 'number' && typeof val === 'string' && val !== '') {
        const num = Number(val);
        if (Number.isNaN(num)) return `「${label}」必须为数字`;
        return validateValue(label, num, sub.validation);
    }
    return validateValue(label, val, sub.validation);
}

// dynamic-card / tag-multi-with-attachment / cert-grid 的 atLeastOneWith
function checkAtLeastOneWith(items, rule, label) {
    if (!rule) return '';
    const { field, equals, includes } = rule;
    const ok = items.some((it) => {
        const v = it?.[field];
        if (equals != null) return v === equals;
        if (includes != null) return Array.isArray(v) && v.includes(includes);
        return false;
    });
    if (!ok) {
        const desc = equals != null ? `${field} = ${equals}` : `${field} 包含 ${includes}`;
        return `「${label}」至少需要一项满足:${desc}`;
    }
    return '';
}

// 主入口:校验一个字段
export function validateField(field, value, allValues) {
    if (!field) return '';
    const label = field.label;
    const required = field.required;

    // required:用通用 isEmpty
    if (required && isEmpty(value)) {
        return `「${label}」为必填项`;
    }
    // 没填又非必填,直接放行
    if (isEmpty(value) && !(typeof value === 'boolean')) {
        // multi-select-with-detail / matrix 的空对象 isEmpty 已视为空;放行
        if (field.component === 'switch') return '';
        return '';
    }

    switch (field.component) {
        case 'text':
        case 'textarea':
            return validateValue(label, value, field.validation);

        case 'number':
        case 'year':
        case 'slider': {
            const num = typeof value === 'number' ? value : Number(value);
            if (value !== '' && Number.isNaN(num)) return `「${label}」必须为数字`;
            return validateValue(label, num, field.validation);
        }

        case 'date':
        case 'time':
        case 'color':
        case 'url':
        case 'email':
        case 'tel':
            return validateValue(label, value, field.validation);

        case 'select':
        case 'radio':
            return '';

        case 'multi-select':
        case 'tag-input': {
            if (field.validation?.minSelected != null
                && (!Array.isArray(value) || value.length < field.validation.minSelected)) {
                return `「${label}」至少选择 ${field.validation.minSelected} 项`;
            }
            if (field.min && Array.isArray(value) && value.length < field.min) {
                return `「${label}」至少 ${field.min} 项`;
            }
            return '';
        }

        case 'dynamic-list': {
            if (field.min && (!Array.isArray(value) || value.length < field.min)) {
                return `「${label}」至少 ${field.min} 项`;
            }
            if (Array.isArray(value) && field.itemField?.validation) {
                for (let i = 0; i < value.length; i++) {
                    const err = validateValue(`${label}[${i + 1}]`, value[i], field.itemField.validation);
                    if (err) return err;
                }
            }
            return '';
        }

        case 'sortable-list': {
            if (field.min && (!Array.isArray(value) || value.length < field.min)) {
                return `「${label}」至少 ${field.min} 项`;
            }
            return '';
        }

        case 'country-select':
            return '';

        case 'file': {
            if (field.multiple && field.min && Array.isArray(value) && value.length < field.min) {
                return `「${label}」至少上传 ${field.min} 个文件`;
            }
            return '';
        }

        case 'composite': {
            for (const sub of field.subFields || []) {
                const err = validateSubField(sub, value?.[sub.id], value, label);
                if (err) return err;
            }
            return '';
        }

        case 'dynamic-card': {
            const arr = Array.isArray(value) ? value : [];
            if (field.min && arr.length < field.min) return `「${label}」至少 ${field.min} 张`;
            if (field.max && arr.length > field.max) return `「${label}」最多 ${field.max} 张`;
            for (let i = 0; i < arr.length; i++) {
                const card = arr[i];
                for (const sub of field.cardTemplate || []) {
                    // 嵌套 dynamic-card(节点 35 客户证言下的 quotes)
                    if (sub.type === 'dynamic-card') {
                        const nested = card?.[sub.id];
                        if (sub.required && (!Array.isArray(nested) || nested.length === 0)) {
                            return `「${label}[${i + 1}] · ${sub.label}」为必填项`;
                        }
                        if (sub.min && Array.isArray(nested) && nested.length < sub.min) {
                            return `「${label}[${i + 1}] · ${sub.label}」至少 ${sub.min} 项`;
                        }
                        if (Array.isArray(nested)) {
                            for (let j = 0; j < nested.length; j++) {
                                for (const sub2 of sub.cardTemplate || []) {
                                    const err = validateSubField(
                                        sub2, nested[j]?.[sub2.id], nested[j],
                                        `${label}[${i + 1}] · ${sub.label}[${j + 1}]`
                                    );
                                    if (err) return err;
                                }
                            }
                        }
                        continue;
                    }
                    const err = validateSubField(sub, card?.[sub.id], card, `${label}[${i + 1}]`);
                    if (err) return err;
                }
            }
            return checkAtLeastOneWith(arr, field.validation?.atLeastOneWith, label);
        }

        case 'cert-grid':
        case 'tag-multi-with-attachment': {
            const arr = Array.isArray(value) ? value : [];
            if (field.required && arr.length === 0) return `「${label}」至少选择 1 项`;
            for (const item of arr) {
                const prefix = `${label} · ${item.key}`;
                for (const sub of field.itemFields || []) {
                    const err = validateSubField(sub, item?.[sub.id], item, prefix);
                    if (err) return err;
                }
            }
            return '';
        }

        case 'matrix-2d': {
            const obj = value && typeof value === 'object' ? value : {};
            const cells = Object.keys(obj);
            if (field.validation?.minCells != null && cells.length < field.validation.minCells) {
                return `「${label}」至少标记 ${field.validation.minCells} 格`;
            }
            return '';
        }

        case 'multi-select-with-detail': {
            const obj = value && typeof value === 'object' ? value : {};
            const keys = Object.keys(obj);
            if (field.validation?.minSelected != null && keys.length < field.validation.minSelected) {
                return `「${label}」至少选择 ${field.validation.minSelected} 项`;
            }
            return '';
        }

        case 'category-tree': {
            // 简化为多行文本;每行视作一项
            const lines = typeof value === 'string'
                ? value.split('\n').map((s) => s.trim()).filter(Boolean)
                : Array.isArray(value) ? value : [];
            if (field.validation?.minSelected != null && lines.length < field.validation.minSelected) {
                return `「${label}」至少 ${field.validation.minSelected} 项`;
            }
            return '';
        }

        default:
            return '';
    }
}

// 校验整个表单(供生成 Markdown 前最终检查使用)
export function validateAll(fields, values) {
    const errors = [];
    for (const f of fields) {
        const err = validateField(f, values[f.id], values);
        if (err) errors.push({ fieldId: f.id, message: err });
    }
    return errors;
}

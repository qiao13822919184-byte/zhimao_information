// 7 阶段元数据 — 与 fields.js 中的 stage 字段对应
export const STAGES = [
    { id: 1, name: '企业身份识别', short: '身份' },
    { id: 2, name: '规模与资质实力', short: '规模' },
    { id: 3, name: '市场与客户背景', short: '市场' },
    { id: 4, name: '生产能力画像', short: '产能' },
    { id: 5, name: '品质与合规体系', short: '品质' },
    { id: 6, name: '拍摄执行筹备', short: '拍摄' },
    { id: 7, name: '联络与数字化触点', short: '联络' },
];

export function stageById(id) {
    return STAGES.find((s) => s.id === id);
}

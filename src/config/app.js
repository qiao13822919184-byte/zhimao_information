export const APP_CONFIG = {
    draftKey: 'chuangrui_draft_v1',
    fileStoreName: 'chuangrui_files_v1',
    draftMaxAgeDays: 30,
    autoSaveDebounceMs: 5000,
    pdf: {
        fontPath: 'assets/fonts/NotoSansSC-Regular-subset.otf',
        fileNamePattern: '跨迅科技_{companyZh}_{YYYYMMDD}.pdf',
    },
    zip: {
        fileNamePattern: '金品诚企附件_{companyZh}_{YYYYMMDD}.zip',
    },
    submitEndpoint: null,
};

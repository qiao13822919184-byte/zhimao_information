// 入口:用 ESM 拉 Alpine,确保注册顺序正确。
// 先注册 Alpine.data('formApp', ...),再调用 Alpine.start()。

import Alpine from 'https://cdn.jsdelivr.net/npm/alpinejs@3.14.1/dist/module.esm.js';
import { createApp } from './core/store.js';

window.Alpine = Alpine;
Alpine.data('formApp', createApp);
Alpine.start();

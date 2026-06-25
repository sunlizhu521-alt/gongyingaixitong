# KCFX 静态资源说明

库存和销售数据看板已迁移到 React 组件内渲染，旧的 `public/kcfx/*.html` 页面和配套脚本已删除。

当前保留内容：

- `data/kcfx-library/manifest.json`：空文件库清单兼容文件。
- `vendor/xlsx.full.min.js`：兼容历史导入流程的 SheetJS 资源。

业务数据现在通过腾讯云后端接口读取：

- `/api/kcfx-library`
- `/api/kcfx-library/preloaded`
- `/api/kcfx-library/records/:slotId/upload`

不要再新增独立的 `public/kcfx/*.html` 看板页面；新页面应放在 `src/components/` 并由 `src/main.jsx` 按 tab 渲染。

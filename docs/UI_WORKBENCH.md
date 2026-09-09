# 制图工作台 v1.11.0

左侧是全部功能目录，中央是画布，右侧是当前参数。参数面板采用非模态布局，支持继续操作画布。更新预览不会关闭面板；关闭面板不会还原已经修改的值。构造对象仍需要“保存对象”，或在当前构造面板点击“更新预览”保存并绘图。

## 常用入口

| 操作 | 入口 |
| --- | --- |
| 空白区域地图 | 范围与投影 |
| 色带、地形分辨率、下载 | 地形底图 |
| 等高距与高程数字 | 等高线 |
| 自动叠加构造 | 本地构造库 |
| 点、线、区域坐标与样式 | 地点与构造 → 对象 / 样式 / 来源与锚点 |
| 中文、英文与名称避让 | 名称与语言 |
| 标题、比例尺、指北针 | 标题与图件元素 |
| 测点导入、字段、MT 参数 | 展开“测点与 MT” |
| PDF、PNG、EPS 与 GMT 脚本 | 导出图件 |
| 全局路径、区域名称、缓存清理 | 目录与缓存 |
| 安装及切换 GMT 6.7 | GMT 引擎 |

⌘/Ctrl + K 搜索功能；上下键选择、Enter 打开、Esc 关闭搜索。右侧面板支持 Esc 收起。没有隐藏关键运行状态、下载进度、校验错误或数据许可；说明文字放在帮助或折叠详情中。

## 实现边界

`electron/workbench-panels.js` 是侧栏、搜索和原生设置菜单的共享目录。`renderer/workbench-ui.js` 重排已有 DOM 控件，保留 ID 与事件绑定；`renderer/workbench.css` 统一布局与样式。构造编辑采用页签和折叠区域。新布局不改变工程 schema、MT 数学、IPC 与后台 worker 边界，不引入外部 UI 运行依赖。

参考的是桌面工作流程与信息组织：

- [QGIS 面板和 Locator](https://docs.qgis.org/latest/en/docs/user_manual/introduction/qgis_gui.html)：常驻功能面板与全局搜索。
- [Illustrator Properties](https://helpx.adobe.com/in/illustrator/desktop/get-started/learn-the-basics/properties-panel-overview.html)：集中当前对象属性。
- [ArcGIS Pro 用户界面](https://pro.arcgis.com/en/pro-app/3.1/get-started/user-interface.htm)：画布、面板和命令搜索。

## 验证

运行 `npm run test:node`。UI 与真实 GMT 集成使用独立工作目录：

```bash
MT_GMT_WORKSPACE='/absolute/qa/workbench' ./node_modules/.bin/electron tests/workbench_ui_integration.cjs
MT_GMT_WORKSPACE='/absolute/qa/gmt67' ./node_modules/.bin/electron tests/gmt67_integration.cjs
```

不要使用日常工作目录运行集成验证。测试采用隐藏、不可聚焦窗口，只派发测试页面内 DOM 事件，不操作系统键鼠。`QA_MODULE_ROOT` 可指定候选包内 `app.asar`；`GMT_QA_TERRAIN_GRID` 可提供已有网格，避免联网下载。Windows CSS 检查不替代 Windows 实机验证。

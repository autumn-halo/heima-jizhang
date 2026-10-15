# 🐴 黑马记账

个人本地记账桌面应用（Windows / macOS），**全程与 AI 智能体（Claude Code）协作开发**。

支持收入/支出记录、两级分类、多账户（含两级账户）、首页收支总览与明细折叠、统计图表、每日自动备份。数据完全本地存储，无需联网。

## ✨ 功能特性

- **首页**：本月收入 / 支出 / 结余卡片 + 收支明细（按月份折叠、按日分组、按收支类型/账户筛选）
- **记一笔**：支出/收入切换、两级分类级联选择、账户分组选择、习惯记忆（延续上次的账户与类型）
- **多账户**：微信/支付宝/银行卡（支持银行卡下挂具体卡），删除保护
- **分类管理**：11 大支出分类 + 3 大收入分类，两级结构，可自定义
- **统计图表**：月度汇总、分类占比环形图、近 6 个月趋势（色板通过色盲/对比度校验）
- **数据安全**：SQLite 本地存储 + 每日自动备份（保留 30 份）+ 手动备份

## 🛠 技术栈

Electron 44 · Vue 3 · electron-vite · Element Plus · ECharts · Pinia · vue-router · node:sqlite（Node 内置 SQLite，零原生依赖）· electron-builder · Playwright

## 📐 架构

标准 Electron 三层结构：渲染进程（Vue）→ 预加载白名单桥（contextBridge）→ 主进程（IPC 校验 + SQLite 数据层），详见 [docs/技术架构文档.md](docs/技术架构文档.md)。

## 🚀 本地运行

```bash
npm install          # 国内网络已配置 npmmirror 镜像
npm run dev          # 开发模式（经启动保护器）
npm run start        # 预览已构建版本
npm run build:win    # 打包 Windows 安装包（输出 dist/）
```

## 🧪 测试

```bash
npm run build && node scripts/drive-app.mjs      # 界面巡检（5 页面）
node scripts/test-accounts.mjs                    # 账户管理（8 项断言）
node scripts/test-categories.mjs                  # 分类管理（11 项）
node scripts/test-record.mjs                      # 记一笔（14 项）
node scripts/test-home.mjs                        # 首页（25 项）
node scripts/test-stats.mjs                       # 统计图表（4 项）
```

全部测试基于 Playwright 驱动真实 Electron 应用，数据自种自清。

## 📂 目录结构

```
src/
├─ main/          # 主进程：窗口、IPC 层（ipc.js）、数据层（db.js）、备份（backup.js）
├─ preload/       # 预加载：contextBridge 白名单
└─ renderer/src/  # 界面：views（5 页面）、components、stores、api、router
scripts/          # 测试与工具脚本（含图标生成管线）
docs/             # 技术文档
```

## 📄 许可

个人学习项目，供学习交流使用。

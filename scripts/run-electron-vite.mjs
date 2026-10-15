// 启动保护器：从 VS Code 扩展启动的开发环境会注入 ELECTRON_RUN_AS_NODE=1，
// 导致 Electron 以纯 Node 方式运行、窗口无法启动。这里在启动前彻底删除该变量。
// 本脚本只在本项目开发流程内生效，不修改系统设置。
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

delete process.env.ELECTRON_RUN_AS_NODE

// electron-vite 的命令行入口（按相对路径定位，避免包导出规则限制）
const cliPath = join(
  fileURLToPath(new URL('..', import.meta.url)),
  'node_modules',
  'electron-vite',
  'bin',
  'electron-vite.js'
)
// 子命令：dev（开发模式）或 preview（预览已构建版本）
const subCommand = process.argv[2] ?? 'dev'

const child = spawn(process.execPath, [cliPath, subCommand], { stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))

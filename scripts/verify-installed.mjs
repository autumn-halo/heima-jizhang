// 验证已安装的正式版软件可正常运行
import { _electron as electron } from 'playwright-core'
import { join } from 'node:path'
delete process.env.ELECTRON_RUN_AS_NODE
const exePath = join(process.env.LOCALAPPDATA, 'Programs', 'heima-jizhang', 'heima-jizhang.exe')
const app = await electron.launch({ executablePath: exePath, env: { ...process.env }, timeout: 30000 })
try {
  const page = await app.firstWindow()
  await page.waitForSelector('.app-menu', { timeout: 15000 })
  await page.waitForTimeout(800)
  const info = await page.evaluate(() => ({
    title: document.title,
    menuCount: document.querySelectorAll('.el-menu-item').length,
    pageTitle: document.querySelector('.page-title')?.textContent.trim()
  }))
  console.log('已安装软件验证:', JSON.stringify(info))
  // 检查数据库重新生成备份（干净数据）
  const { DatabaseSync } = await import('node:sqlite')
  const { readdirSync } = await import('node:fs')
  const dataDir = join(process.env.APPDATA, '黑马记账')
  const db = new DatabaseSync(join(dataDir, '黑马记账.db'), { readOnly: true })
  const expenseCount = db.prepare('SELECT COUNT(*) AS c FROM expenses').get().c
  db.close()
  const backups = readdirSync(join(dataDir, 'backups'))
  console.log('账本状态: 支出记录', expenseCount, '条；备份文件:', backups.join('、'))
} finally {
  await app.close().catch(() => {})
}

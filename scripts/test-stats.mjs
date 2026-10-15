// 统计图表端到端测试：验证统计卡片数值、图表渲染、月份切换
// 前置：数据库中有 test-transactions.mjs 写入的测试数据（10月11笔/9月8笔/8月5笔）
// 用法：npm run build 后执行 node scripts/test-stats.mjs
import { _electron as electron } from 'playwright-core'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

delete process.env.ELECTRON_RUN_AS_NODE

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const electronBin = join(appDir, 'node_modules', 'electron', 'dist', 'electron.exe')

const app = await electron.launch({
  executablePath: electronBin,
  args: [appDir],
  env: { ...process.env },
  timeout: 30000
})

let failed = 0
async function assert(cond, label, page) {
  console.log((cond ? '✓ ' : '✗ 失败: '), label)
  if (!cond) {
    failed++
    if (page) {
      const body = await page.evaluate(() => document.body.innerText.slice(0, 400))
      console.log('  --- 页面内容片段 ---\n' + body + '\n  --- 结束 ---')
    }
  }
}

// 读取三张统计卡片的值
async function readCards(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.stat-value')].map((el) => el.textContent.trim())
  )
}

try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => console.log('页面异常:', e.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[渲染进程error]`, msg.text().slice(0, 200))
  })
  await page.waitForSelector('.app-menu', { timeout: 15000 })

  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.el-menu-item')].find((e) =>
      e.textContent.includes('统计图表')
    )
    el.click()
  })
  await page.waitForSelector('.stat-card', { timeout: 10000 })
  await page.waitForTimeout(1200)

  // 1. 默认本月（2026-10）：总支出 ¥4,179.34、日均 ¥134.82、12 笔
  const octCards = await readCards(page)
  await assert(
    octCards[0] === '¥4,179.34' && octCards[1] === '¥134.82' && octCards[2] === '12 笔',
    `本月卡片数值正确（实际：${octCards.join(' / ')}）`,
    page
  )

  // 2. 两个图表 canvas 已渲染
  const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length)
  await assert(canvasCount >= 2, `图表已渲染（canvas 数量 ${canvasCount}）`, page)

  // 3. 界面数值与数据库统计接口一致（双重校验）
  const apiCheck = await page.evaluate(async () => {
    const res = await window.api.expenses.summary({ month: '2026-10' })
    return res.ok ? res.data : null
  })
  await assert(
    apiCheck && apiCheck.totalCents === 417934 && apiCheck.count === 12,
    `统计接口数值正确（总 417934 分 / 12 笔）`,
    page
  )

  // 4. 切换到 2026-09：总支出 ¥1,254.00、日均 ¥41.80、8 笔
  await page.fill('.page-header .el-date-editor input', '2026-09')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  const sepCards = await readCards(page)
  await assert(
    sepCards[0] === '¥1,254.00' && sepCards[1] === '¥41.80' && sepCards[2] === '8 笔',
    `切换 9 月后卡片数值正确（实际：${sepCards.join(' / ')}）`,
    page
  )
} finally {
  await app.close().catch(() => {})
}

console.log(failed === 0 ? '统计图表测试：全部通过 ✓' : `统计图表测试：${failed} 项未通过`)
process.exit(failed === 0 ? 0 : 1)

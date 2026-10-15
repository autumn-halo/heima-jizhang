// 支出流水端到端测试：先写入 25 条测试数据，再验证列表/筛选/搜索/编辑/删除
// 用法：npm run build 后执行 node scripts/test-transactions.mjs
import { _electron as electron } from 'playwright-core'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

// 关键：删除会使 Electron 退化为纯 Node 的环境变量
delete process.env.ELECTRON_RUN_AS_NODE

// ---------------- 第一步：写入测试数据 ----------------
const dbPath = join(process.env.APPDATA, '黑马记账', '黑马记账.db')
const seed = new DatabaseSync(dbPath)
seed.exec('DELETE FROM expenses')
const getSubId = seed.prepare(`
  SELECT sub.id FROM categories sub
  JOIN categories major ON sub.parent_id = major.id
  WHERE major.name = ? AND sub.name = ?`)
const ins = seed.prepare(
  'INSERT INTO expenses (amount_cents, category_id, expense_date, note) VALUES (?, ?, ?, ?)'
)
// [日期, 一级分类, 二级分类, 金额(分), 备注]
const seedRows = [
  ['2026-10-15', '学习教育', '学费培训', 50000, ''],
  ['2026-10-14', '餐饮饮食', '请客聚餐', 26000, '部门聚餐'],
  ['2026-10-13', '居住住房', '房租', 300000, ''],
  ['2026-10-12', '通讯网络', '手机话费', 10000, ''],
  ['2026-10-11', '居住住房', '电费', 15000, ''],
  ['2026-10-10', '休闲娱乐', '电影演出', 6000, ''],
  ['2026-10-09', '餐饮饮食', '咖啡奶茶', 1800, ''],
  ['2026-10-08', '餐饮饮食', '外卖', 3000, ''],
  ['2026-10-07', '交通出行', '打车', 2000, ''],
  ['2026-10-06', '交通出行', '公交地铁', 400, ''],
  ['2026-10-05', '餐饮饮食', '午餐', 2500, ''],
  ['2026-10-04', '餐饮饮食', '早餐', 1234, ''],
  ['2026-09-30', '购物消费', '图书文具', 6600, ''],
  ['2026-09-28', '人情往来', '红包礼金', 50000, ''],
  ['2026-09-25', '医疗健康', '体检疫苗', 20000, ''],
  ['2026-09-20', '休闲娱乐', '游戏充值', 9800, ''],
  ['2026-09-15', '居住住房', '水费', 4500, ''],
  ['2026-09-10', '交通出行', '加油充电', 30000, ''],
  ['2026-09-08', '餐饮饮食', '外卖', 3500, '加班聚餐'],
  ['2026-09-05', '餐饮饮食', '早餐', 1000, ''],
  ['2026-08-28', '交通出行', '火车高铁', 38000, ''],
  ['2026-08-20', '休闲娱乐', '电影演出', 4500, ''],
  ['2026-08-15', '居住住房', '电费', 14500, ''],
  ['2026-08-10', '交通出行', '打车', 5500, '出差聚餐车费'],
  ['2026-08-05', '餐饮饮食', '午餐', 2200, '']
]
seed.exec('BEGIN')
try {
  for (const [date, major, sub, cents, note] of seedRows) {
    const { id } = getSubId.get(major, sub)
    ins.run(cents, id, date, note)
  }
  seed.exec('COMMIT')
} catch (err) {
  seed.exec('ROLLBACK')
  throw err
}
seed.close()
console.log('已写入 25 条测试支出数据')

// ---------------- 第二步：启动应用测试 ----------------
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
      const body = await page.evaluate(() => document.body.innerText.slice(0, 500))
      console.log('  --- 页面内容片段 ---\n' + body + '\n  --- 结束 ---')
    }
  }
}

// 表格数据行数
async function rowCount(page) {
  return page.evaluate(() => document.querySelectorAll('.el-table__body tr').length)
}

// 第一行各列文字
async function firstRowText(page) {
  return page.evaluate(() => {
    const row = document.querySelector('.el-table__body tr')
    return row ? row.innerText : '(无行)'
  })
}

// 点击弹窗中的按钮
async function clickInMessageBox(page, text) {
  const okClick = await page.evaluate((t) => {
    const box = document.querySelector('.el-message-box')
    if (!box) return false
    const btn = [...box.querySelectorAll('button')].find((b) => b.textContent.trim() === t)
    if (!btn) return false
    btn.click()
    return true
  }, text)
  if (!okClick) throw new Error('弹窗按钮未找到: ' + text)
}

async function gotoTransactions(page) {
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.el-menu-item')].find((e) =>
      e.textContent.includes('支出流水')
    )
    el.click()
  })
  await page.waitForSelector('.el-table', { timeout: 10000 })
  await page.waitForTimeout(800)
}

try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => console.log('页面异常:', e.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[渲染进程error]`, msg.text().slice(0, 200))
  })
  await page.waitForSelector('.app-menu', { timeout: 15000 })

  // 1. 进入流水页：共 25 条、第一页 20 行、按日期倒序
  await gotoTransactions(page)
  await assert(
    await page.evaluate(() => document.body.innerText.includes('共 25 条')),
    '分页显示共 25 条',
    page
  )
  await assert((await rowCount(page)) === 20, '第一页显示 20 行', page)
  const firstRow = await firstRowText(page)
  await assert(
    firstRow.includes('2026-10-15') && firstRow.includes('学费培训') && firstRow.includes('¥500.00'),
    `第一行为最新记录 2026-10-15 学费培训 ¥500.00（实际：${firstRow.replace(/\n/g, ' ')})`,
    page
  )

  // 2. 编辑第一行：金额改为 99.99
  await page.evaluate(() => {
    const row = document.querySelector('.el-table__body tr')
    const btn = [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === '编辑')
    btn.click()
  })
  await page.waitForSelector('.el-dialog input', { timeout: 5000 })
  await page.fill('.el-dialog input', '99.99')
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.el-dialog button')].find(
      (b) => b.textContent.trim() === '保存'
    )
    btn.click()
  })
  await page.waitForTimeout(900)
  const firstRowAfterEdit = await firstRowText(page)
  await assert(
    firstRowAfterEdit.includes('¥99.99'),
    `编辑后第一行金额为 ¥99.99（实际：${firstRowAfterEdit.replace(/\n/g, ' ')})`,
    page
  )

  // 3. 删除第一行：确认后共 24 条
  await page.evaluate(() => {
    const row = document.querySelector('.el-table__body tr')
    const btn = [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === '删除')
    btn.click()
  })
  await page.waitForSelector('.el-message-box', { timeout: 5000 })
  await clickInMessageBox(page, '删除')
  await page.waitForTimeout(900)
  await assert(
    await page.evaluate(() => document.body.innerText.includes('共 24 条')),
    '删除后共 24 条',
    page
  )

  // 4. 关键词搜索「聚餐」→ 3 条（刷新页面重置筛选）
  await page.reload()
  await gotoTransactions(page)
  await page.fill('.filter-row input[placeholder="搜索备注关键词"]', '聚餐')
  await page.waitForTimeout(1000)
  await assert((await rowCount(page)) === 3, '搜索「聚餐」得到 3 条', page)

  // 5. 按月份筛选 2026-09 → 8 条
  await page.reload()
  await gotoTransactions(page)
  await page.fill('.filter-row .el-date-editor input', '2026-09')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1000)
  await assert((await rowCount(page)) === 8, '筛选 2026-09 得到 8 条', page)

  // 6. 按一级分类「餐饮饮食」筛选（跨月份）→ 8 条
  await page.reload()
  await gotoTransactions(page)
  await page.evaluate(() => document.querySelector('.filter-row .el-cascader').click())
  await page.waitForSelector('.el-cascader-node__label', { timeout: 5000 })
  // 可任意层级选中模式下：点分类名是展开，点名字前面的小圆点（radio）才是选中
  const clicked = await page.evaluate(() => {
    const node = [...document.querySelectorAll('.el-cascader-node')].find((n) =>
      n.textContent.includes('餐饮饮食')
    )
    const radio = node?.querySelector('.el-radio')
    if (!radio) return false
    radio.click()
    return true
  })
  await assert(clicked, '选中一级分类「餐饮饮食」（点小圆点）', page)
  await page.waitForTimeout(1000)
  await assert((await rowCount(page)) === 8, '筛选「餐饮饮食」得到 8 条', page)
} finally {
  await app.close().catch(() => {})
}

console.log(failed === 0 ? '支出流水测试：全部通过 ✓' : `支出流水测试：${failed} 项未通过`)
process.exit(failed === 0 ? 0 : 1)

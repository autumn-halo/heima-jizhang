// 首页端到端测试：验证本月卡片、按月折叠+按日分组的收支明细、收入/支出筛选、编辑删除
// 用法：npm run build 后执行 node scripts/test-home.mjs
import { _electron as electron } from 'playwright-core'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

delete process.env.ELECTRON_RUN_AS_NODE

// ---------------- 第一步：写入测试数据 ----------------
const dbPath = join(process.env.APPDATA, '黑马记账', '黑马记账.db')
const seed = new DatabaseSync(dbPath)
seed.exec('DELETE FROM expenses')
const getSubId = seed.prepare(`
  SELECT sub.id FROM categories sub
  JOIN categories major ON sub.parent_id = major.id
  WHERE major.name = ? AND sub.name = ?`)
const getAccountId = seed.prepare('SELECT id FROM accounts WHERE name = ?')
const ins = seed.prepare(
  'INSERT INTO expenses (amount_cents, category_id, expense_date, note, type, account_id) VALUES (?, ?, ?, ?, ?, ?)'
)
// [日期, 一级分类, 二级分类, 金额(分), 备注, 账户]（微信17 / 支付宝6 / 银行卡2）
const expenseRows = [
  ['2026-10-15', '学习教育', '学费培训', 50000, '', '银行卡'],
  ['2026-10-14', '餐饮饮食', '请客聚餐', 26000, '部门聚餐', '微信'],
  ['2026-10-13', '居住住房', '房租', 300000, '', '支付宝'],
  ['2026-10-12', '通讯网络', '手机话费', 10000, '', '微信'],
  ['2026-10-11', '居住住房', '电费', 15000, '', '微信'],
  ['2026-10-10', '休闲娱乐', '电影演出', 6000, '', '微信'],
  ['2026-10-09', '餐饮饮食', '咖啡奶茶', 1800, '', '微信'],
  ['2026-10-08', '餐饮饮食', '外卖', 3000, '', '微信'],
  ['2026-10-07', '交通出行', '打车', 2000, '', '支付宝'],
  ['2026-10-06', '交通出行', '公交地铁', 400, '', '微信'],
  ['2026-10-05', '餐饮饮食', '午餐', 2500, '', '微信'],
  ['2026-10-04', '餐饮饮食', '早餐', 1234, '', '微信'],
  ['2026-09-30', '购物消费', '图书文具', 6600, '', '微信'],
  ['2026-09-28', '人情往来', '红包礼金', 50000, '', '微信'],
  ['2026-09-25', '医疗健康', '体检疫苗', 20000, '', '银行卡'],
  ['2026-09-20', '休闲娱乐', '游戏充值', 9800, '', '支付宝'],
  ['2026-09-15', '居住住房', '水费', 4500, '', '微信'],
  ['2026-09-10', '交通出行', '加油充电', 30000, '', '支付宝'],
  ['2026-09-08', '餐饮饮食', '外卖', 3500, '加班聚餐', '微信'],
  ['2026-09-05', '餐饮饮食', '早餐', 1000, '', '微信'],
  ['2026-08-28', '交通出行', '火车高铁', 38000, '', '支付宝'],
  ['2026-08-20', '休闲娱乐', '电影演出', 4500, '', '微信'],
  ['2026-08-15', '居住住房', '电费', 14500, '', '微信'],
  ['2026-08-10', '交通出行', '打车', 5500, '出差聚餐车费', '支付宝'],
  ['2026-08-05', '餐饮饮食', '午餐', 2200, '', '微信']
]
// 收入：银行卡2 / 微信2
const incomeRows = [
  ['2026-10-01', '工资收入', '工资', 1500000, '10月工资', '银行卡'],
  ['2026-10-05', '理财收入', '理财收益', 50000, '', '微信'],
  ['2026-09-01', '工资收入', '工资', 1500000, '9月工资', '银行卡'],
  ['2026-09-15', '其他收入', '红包', 20000, '中秋红包', '微信']
]
seed.exec('BEGIN')
try {
  for (const [date, major, sub, cents, note, account] of expenseRows) {
    const { id } = getSubId.get(major, sub)
    const acc = getAccountId.get(account)
    ins.run(cents, id, date, note, 'expense', acc.id)
  }
  for (const [date, major, sub, cents, note, account] of incomeRows) {
    const { id } = getSubId.get(major, sub)
    const acc = getAccountId.get(account)
    ins.run(cents, id, date, note, 'income', acc.id)
  }
  seed.exec('COMMIT')
} catch (err) {
  seed.exec('ROLLBACK')
  throw err
}
seed.close()
console.log('已写入 25 笔支出 + 4 笔收入测试数据（按账户分配）')

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

async function readCards(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.stat-value')].map((el) => el.textContent.trim())
  )
}

// 展开月份分组内的明细行数
async function activeRowCount(page) {
  return page.evaluate(
    () => document.querySelectorAll('.el-collapse-item.is-active .record-row').length
  )
}

async function monthCount(page) {
  return page.evaluate(() => document.querySelectorAll('.el-collapse-item').length)
}

async function firstActiveRowText(page) {
  return page.evaluate(() => {
    const row = document.querySelector('.el-collapse-item.is-active .record-row')
    return row ? row.innerText.replace(/\n/g, ' ') : '(无行)'
  })
}

async function clickTypeFilter(page, text) {
  const okClick = await page.evaluate((t) => {
    const el = [...document.querySelectorAll('.list-header .el-radio-button')].find((e) =>
      e.textContent.trim() === t
    )
    if (!el) return false
    el.click()
    return true
  }, text)
  if (!okClick) throw new Error('筛选按钮未找到: ' + text)
}

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

try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => console.log('页面异常:', e.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[渲染进程error]`, msg.text().slice(0, 200))
  })
  await page.waitForSelector('.app-menu', { timeout: 15000 })

  const menuLabels = await page.evaluate(() =>
    [...document.querySelectorAll('.el-menu-item')].map((e) => e.textContent.trim())
  )
  await assert(
    menuLabels.join('/') === '首页/记一笔/账户管理/统计图表/分类管理',
    `导航为 首页/记一笔/账户管理/统计图表/分类管理（实际：${menuLabels.join('/')}）`,
    page
  )

  await page.waitForSelector('.stat-card', { timeout: 10000 })
  await page.waitForTimeout(1000)

  // 1. 本月卡片：收入 ¥15,500.00 / 支出 ¥4,179.34 / 结余 ¥11,320.66（卡片保留 ¥）
  const cards = await readCards(page)
  await assert(
    cards[0] === '¥15,500.00' && cards[1] === '¥4,179.34' && cards[2] === '¥11,320.66',
    `本月卡片数值正确（实际：${cards.join(' / ')}）`,
    page
  )

  // 2. 明细按月份折叠分组：3 个月、新到旧、最新月默认展开
  const monthLabels = await page.evaluate(() =>
    [...document.querySelectorAll('.month-name')].map((e) => e.textContent.trim())
  )
  await assert(
    monthLabels.join('/') === '2026年10月/2026年9月/2026年8月',
    `按月份分组且新到旧（实际：${monthLabels.join('/')}）`,
    page
  )
  await assert((await activeRowCount(page)) === 14, '最新月（10月）默认展开 14 条', page)

  // 3. 展开月份内按日分组，且明细金额不带 ¥（支出为 -、收入为 +）
  await assert(
    await page.evaluate(() => document.body.innerText.includes('10月15日')),
    '展开月份内按日分组显示（10月15日）',
    page
  )
  const firstRow = await firstActiveRowText(page)
  await assert(
    firstRow.includes('-500.00') &&
      firstRow.includes('学费培训') &&
      firstRow.includes('银行卡') &&
      !firstRow.includes('¥'),
    `明细首行 -500.00 学费培训·银行卡 且无¥符号（实际：${firstRow}）`,
    page
  )
  const monthSum = await page.evaluate(
    () => document.querySelector('.el-collapse-item.is-active .month-sum')?.textContent ?? ''
  )
  await assert(
    monthSum.includes('4,179.34') && !monthSum.includes('¥'),
    `月份小计显示 4,179.34 且无¥符号（实际：${monthSum}）`,
    page
  )

  // 4. 筛选「收入」→ 2 个月分组，10月展开 2 条，首行 +500.00 理财收益
  await clickTypeFilter(page, '收入')
  await page.waitForTimeout(800)
  await assert((await monthCount(page)) === 2, '筛选收入后 2 个月分组', page)
  await assert((await activeRowCount(page)) === 2, '10月收入 2 条', page)
  const firstIncomeRow = await firstActiveRowText(page)
  await assert(
    firstIncomeRow.includes('+500.00') && firstIncomeRow.includes('理财收益') && !firstIncomeRow.includes('¥'),
    `收入首行 +500.00 理财收益 且无¥（实际：${firstIncomeRow}）`,
    page
  )

  // 5. 筛选「支出」→ 3 个月分组，10月展开 12 条，首行 -500.00
  await clickTypeFilter(page, '支出')
  await page.waitForTimeout(800)
  await assert((await monthCount(page)) === 3, '筛选支出后 3 个月分组', page)
  await assert((await activeRowCount(page)) === 12, '10月支出 12 条', page)
  const firstExpenseRow = await firstActiveRowText(page)
  await assert(
    firstExpenseRow.includes('-500.00') && firstExpenseRow.includes('学费培训'),
    `支出首行 -500.00 学费培训（实际：${firstExpenseRow}）`,
    page
  )

  // 5.5 按账户筛选「支付宝」→ 3 个月分组，10月 2 条（房租、打车）
  // （el-select 需要真实点击事件）
  await page.click('.list-filters .el-select')
  await page.waitForSelector('.el-select-dropdown__item', { timeout: 5000 })
  const selectAlipay = await page.evaluate(() => {
    const item = [...document.querySelectorAll('.el-select-dropdown__item')].find(
      (e) => e.textContent.trim() === '支付宝'
    )
    if (!item) return false
    item.click()
    return true
  })
  await assert(selectAlipay, '选择账户筛选「支付宝」', page)
  await page.waitForTimeout(800)
  await assert((await monthCount(page)) === 3, '筛选支付宝后 3 个月分组', page)
  await assert((await activeRowCount(page)) === 2, '支付宝 10月 2 条', page)
  const alipayRow = await firstActiveRowText(page)
  await assert(
    alipayRow.includes('房租') && alipayRow.includes('支付宝'),
    `支付宝首行为房租（实际：${alipayRow}）`,
    page
  )
  // 清除账户筛选（悬停后点清除按钮）
  await page.hover('.list-filters .el-select')
  const cleared = await page.evaluate(() => {
    const clear = document.querySelector('.list-filters .el-select .el-select__clear')
    if (!clear) return false
    clear.click()
    return true
  })
  await assert(cleared, '清除账户筛选', page)
  await page.waitForTimeout(800)

  // 6. 编辑「10月工资」收入：15000 → 16000，卡片联动 ¥16,500.00
  await clickTypeFilter(page, '收入')
  await page.waitForTimeout(800)
  const editOk = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.record-row')].find((r) =>
      r.textContent.includes('10月工资')
    )
    if (!row) return false
    ;[...row.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === '编辑')
      .click()
    return true
  })
  await assert(editOk, '找到 10月工资 记录并打开编辑', page)
  await page.waitForSelector('.el-dialog input[placeholder="0.00"]', { timeout: 5000 })
  await page.fill('.el-dialog input[placeholder="0.00"]', '16000')
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.el-dialog button')].find(
      (b) => b.textContent.trim() === '保存'
    )
    btn.click()
  })
  await page.waitForTimeout(1000)
  const cardsAfterEdit = await readCards(page)
  await assert(
    cardsAfterEdit[0] === '¥16,500.00',
    `编辑后本月收入卡片联动为 ¥16,500.00（实际：${cardsAfterEdit[0]}）`,
    page
  )
  const rowAfterEdit = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.record-row')].find((r) =>
      r.textContent.includes('10月工资')
    )
    return row ? row.innerText.replace(/\n/g, ' ') : ''
  })
  await assert(
    rowAfterEdit.includes('+16,000.00'),
    `明细行金额更新为 +16,000.00（实际：${rowAfterEdit}）`,
    page
  )

  // 7. 删除该笔收入 → 卡片 ¥500.00，10月收入剩 1 条
  const delOk = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.record-row')].find((r) =>
      r.textContent.includes('10月工资')
    )
    if (!row) return false
    ;[...row.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === '删除')
      .click()
    return true
  })
  await assert(delOk, '点击删除编辑后的记录', page)
  await page.waitForSelector('.el-message-box', { timeout: 5000 })
  await clickInMessageBox(page, '删除')
  await page.waitForTimeout(1000)
  const cardsAfterDelete = await readCards(page)
  await assert(
    cardsAfterDelete[0] === '¥500.00' && cardsAfterDelete[2] === '-¥3,679.34',
    `删除后收入卡片 ¥500.00、结余 -¥3,679.34（实际：${cardsAfterDelete[0]} / ${cardsAfterDelete[2]}）`,
    page
  )
  await assert((await activeRowCount(page)) === 1, '10月收入剩 1 条', page)
} finally {
  await app.close().catch(() => {})
}

console.log(failed === 0 ? '首页测试：全部通过 ✓' : `首页测试：${failed} 项未通过`)
process.exit(failed === 0 ? 0 : 1)

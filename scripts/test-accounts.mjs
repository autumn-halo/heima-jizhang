// 账户管理端到端测试：内置账户、增删改、重名拦截、有记录时删除保护
// 用法：npm run build 后执行 node scripts/test-accounts.mjs
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
      const body = await page.evaluate(() => document.body.innerText.slice(0, 500))
      console.log('  --- 页面内容片段 ---\n' + body + '\n  --- 结束 ---')
    }
  }
}

async function clickButton(page, text) {
  const okClick = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t)
    if (!btn) return false
    btn.click()
    return true
  }, text)
  if (!okClick) throw new Error('按钮未找到: ' + text)
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

async function accountNames(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.account-tag')].map((e) => e.textContent.trim())
  )
}

// 点击某账户行的操作按钮
async function clickAccountAction(page, accountName, action) {
  const okClick = await page.evaluate(
    ({ name, act }) => {
      const row = [...document.querySelectorAll('.account-row')].find((r) =>
        r.textContent.includes(name)
      )
      if (!row) return false
      const btn = [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === act)
      if (!btn) return false
      btn.click()
      return true
    },
    { name: accountName, act: action }
  )
  if (!okClick) throw new Error(`账户 ${accountName} 的 ${action} 按钮未找到`)
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
      e.textContent.includes('账户管理')
    )
    el.click()
  })
  await page.waitForSelector('.account-row', { timeout: 10000 })

  // 1. 内置 3 个账户
  const names = await accountNames(page)
  await assert(
    names.join('/') === '微信/支付宝/银行卡',
    `内置账户为 微信/支付宝/银行卡（实际：${names.join('/')}）`,
    page
  )

  // 2. 新增账户「测试账户」
  await clickButton(page, '新增账户')
  await page.waitForSelector('.el-dialog input', { timeout: 5000 })
  await page.fill('.el-dialog input', '测试账户')
  await clickButton(page, '确定')
  await page.waitForTimeout(700)
  await assert(
    (await accountNames(page)).includes('测试账户'),
    '新增账户成功',
    page
  )

  // 3. 同名账户应被拒绝
  await clickButton(page, '新增账户')
  await page.waitForSelector('.el-dialog input')
  await page.fill('.el-dialog input', '测试账户')
  await clickButton(page, '确定')
  await page.waitForTimeout(700)
  await assert(
    await page.evaluate(() => document.body.innerText.includes('已存在同名账户')),
    '同名账户被拦截并提示',
    page
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // 4. 给「测试账户」挂一笔记录，验证删除保护
  const createRecord = await page.evaluate(async () => {
    const tree = (await window.api.categories.list()).data
    const major = tree.find((m) => m.kind === 'expense' && m.children.length)
    const accounts = (await window.api.accounts.list()).data
    const testAccount = accounts.find((a) => a.name === '测试账户')
    const res = await window.api.expenses.create({
      amountCents: 100,
      categoryId: major.children[0].id,
      date: '2026-10-16',
      note: '账户删除保护测试',
      type: 'expense',
      accountId: testAccount.id
    })
    return res.ok ? res.data.id : null
  })
  await assert(!!createRecord, '为测试账户写入一笔记录', page)
  await clickAccountAction(page, '测试账户', '删除')
  await page.waitForSelector('.el-message-box', { timeout: 5000 })
  await clickInMessageBox(page, '删除')
  await page.waitForTimeout(700)
  await assert(
    await page.evaluate(() => document.body.innerText.includes('该账户下有 1 笔收支记录')),
    '有记录的账户删除被拦截并提示',
    page
  )

  // 5. 删除该笔记录后再删除账户
  await page.evaluate(async (recordId) => {
    await window.api.expenses.delete(recordId)
  }, createRecord)
  await clickAccountAction(page, '测试账户', '删除')
  await page.waitForSelector('.el-message-box', { timeout: 5000 })
  await clickInMessageBox(page, '删除')
  await page.waitForTimeout(700)
  await assert(
    !(await accountNames(page)).includes('测试账户'),
    '删除测试账户成功',
    page
  )

  // 6. 重命名：把「银行卡」改成「储蓄卡」再改回来
  await clickAccountAction(page, '银行卡', '重命名')
  await page.waitForSelector('.el-dialog input', { timeout: 5000 })
  await page.fill('.el-dialog input', '储蓄卡')
  await clickButton(page, '确定')
  await page.waitForTimeout(700)
  await assert(
    (await accountNames(page)).includes('储蓄卡'),
    '重命名账户成功',
    page
  )
  await clickAccountAction(page, '储蓄卡', '重命名')
  await page.waitForSelector('.el-dialog input')
  await page.fill('.el-dialog input', '银行卡')
  await clickButton(page, '确定')
  await page.waitForTimeout(700)

  // 7. 最终恢复 3 个内置账户
  const finalNames = await accountNames(page)
  await assert(
    finalNames.join('/') === '微信/支付宝/银行卡',
    `测试后恢复 3 个内置账户（实际：${finalNames.join('/')}）`,
    page
  )
} finally {
  await app.close().catch(() => {})
}

console.log(failed === 0 ? '账户管理测试：全部通过 ✓' : `账户管理测试：${failed} 项未通过`)
process.exit(failed === 0 ? 0 : 1)

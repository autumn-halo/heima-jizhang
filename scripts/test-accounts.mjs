// 账户管理端到端测试：两级账户（一级账户 + 具体卡）、增删改、重名拦截、删除保护
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

// 点击某账户行（一级或具体）的操作按钮
async function clickAccountAction(page, accountName, action) {
  const okClick = await page.evaluate(
    ({ name, act }) => {
      const row = [...document.querySelectorAll('.account-row, .sub-row')].find((r) => {
        const tag = r.querySelector('.account-tag, .sub-tag')
        return tag && tag.textContent.trim() === name
      })
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

// 展开某个一级账户（点它前面的箭头）
async function toggleExpand(page, accountName) {
  const okClick = await page.evaluate((name) => {
    const row = [...document.querySelectorAll('.account-row')].find((r) => {
      const tag = r.querySelector('.account-tag')
      return tag && tag.textContent.trim() === name
    })
    if (!row) return false
    row.querySelector('.expand-icon').click()
    return true
  }, accountName)
  if (!okClick) throw new Error(`账户 ${accountName} 行未找到`)
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

  // 1. 内置 3 个一级账户
  const topNames = await page.evaluate(() =>
    [...document.querySelectorAll('.account-row .account-tag')].map((e) => e.textContent.trim())
  )
  await assert(
    topNames.join('/') === '微信/支付宝/银行卡',
    `内置一级账户为 微信/支付宝/银行卡（实际：${topNames.join('/')}）`,
    page
  )

  // 2. 展开「银行卡」，添加具体卡「招商银行」
  await toggleExpand(page, '银行卡')
  await page.waitForTimeout(400)
  await clickAccountAction(page, '银行卡', '添加具体账户')
  await page.waitForSelector('.el-dialog input', { timeout: 5000 })
  await page.fill('.el-dialog input', '招商银行')
  await clickButton(page, '确定')
  await page.waitForTimeout(700)
  const subNames = await page.evaluate(() =>
    [...document.querySelectorAll('.sub-row .sub-tag')].map((e) => e.textContent.trim())
  )
  await assert(
    subNames.includes('招商银行'),
    `银行卡下新增具体卡「招商银行」（实际：${subNames.join('/') || '(无)'}）`,
    page
  )

  // 3. 同名具体卡被拦截
  await clickAccountAction(page, '银行卡', '添加具体账户')
  await page.waitForSelector('.el-dialog input')
  await page.fill('.el-dialog input', '招商银行')
  await clickButton(page, '确定')
  await page.waitForTimeout(700)
  await assert(
    await page.evaluate(() => document.body.innerText.includes('已存在同名账户')),
    '同名具体卡被拦截并提示',
    page
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // 4. 给「招商银行」挂一笔记录 → 删除具体卡被拦截
  const createRecord = await page.evaluate(async () => {
    const tree = (await window.api.categories.list()).data
    const major = tree.find((m) => m.kind === 'expense' && m.children.length)
    const accounts = (await window.api.accounts.list()).data
    const card = accounts.find((a) => a.name === '招商银行')
    const res = await window.api.expenses.create({
      amountCents: 200,
      categoryId: major.children[0].id,
      date: '2026-10-16',
      note: '具体卡删除保护测试',
      type: 'expense',
      accountId: card.id
    })
    return res.ok ? res.data.id : null
  })
  await assert(!!createRecord, '为招商银行写入一笔记录', page)
  await clickAccountAction(page, '招商银行', '删除')
  await page.waitForSelector('.el-message-box', { timeout: 5000 })
  await clickInMessageBox(page, '删除')
  await page.waitForTimeout(700)
  await assert(
    await page.evaluate(() => document.body.innerText.includes('该账户下有 1 笔收支记录')),
    '有记录的具体卡删除被拦截并提示',
    page
  )

  // 5. 「银行卡」下还有具体卡时，删除银行卡被拦截
  await clickAccountAction(page, '银行卡', '删除')
  await page.waitForSelector('.el-message-box', { timeout: 5000 })
  await clickInMessageBox(page, '删除')
  await page.waitForTimeout(700)
  await assert(
    await page.evaluate(() => document.body.innerText.includes('该账户下还有 1 个具体账户')),
    '有具体卡的一级账户删除被拦截并提示',
    page
  )

  // 6. 删除记录后删除具体卡
  await page.evaluate(async (recordId) => {
    await window.api.expenses.delete(recordId)
  }, createRecord)
  await clickAccountAction(page, '招商银行', '删除')
  await page.waitForSelector('.el-message-box', { timeout: 5000 })
  await clickInMessageBox(page, '删除')
  await page.waitForTimeout(700)
  await assert(
    !(await page.evaluate(() =>
      [...document.querySelectorAll('.sub-tag')].some((e) => e.textContent.trim() === '招商银行')
    )),
    '删除具体卡成功',
    page
  )

  // 7. 最终恢复：3 个一级账户、无具体卡
  const finalTops = await page.evaluate(() =>
    [...document.querySelectorAll('.account-row .account-tag')].map((e) => e.textContent.trim())
  )
  const finalSubs = await page.evaluate(() => document.querySelectorAll('.sub-row').length)
  await assert(
    finalTops.join('/') === '微信/支付宝/银行卡' && finalSubs === 0,
    `测试后恢复原状（一级 ${finalTops.join('/')}，具体卡 ${finalSubs} 个）`,
    page
  )
} finally {
  await app.close().catch(() => {})
}

console.log(failed === 0 ? '账户管理测试：全部通过 ✓' : `账户管理测试：${failed} 项未通过`)
process.exit(failed === 0 ? 0 : 1)

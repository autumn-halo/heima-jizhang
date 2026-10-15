// 分类管理端到端测试：模拟真实用户操作（新增/重命名/删除/重名拦截）
// 用法：npm run build 后执行 node scripts/test-categories.mjs
import { _electron as electron } from 'playwright-core'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 关键：删除会使 Electron 退化为纯 Node 的环境变量
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
      // 失败时输出页面内容，便于排查软件实际提示了什么
      const body = await page.evaluate(() => document.body.innerText.slice(0, 600))
      console.log('  --- 页面内容片段 ---\n' + body + '\n  --- 结束 ---')
    }
  }
}

// 点击页面上文字匹配的按钮
async function clickButton(page, text) {
  const okClick = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t)
    if (!btn) return false
    btn.click()
    return true
  }, text)
  if (!okClick) throw new Error('按钮未找到: ' + text)
}

// 点击确认弹窗（ElMessageBox）里的按钮（避免误点页面上的同名按钮）
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
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[渲染进程${msg.type()}]`, msg.text().slice(0, 200))
    }
  })
  await page.waitForSelector('.app-menu', { timeout: 15000 })

  // 进入分类管理页
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.el-menu-item')].find((e) =>
      e.textContent.includes('分类管理')
    )
    el.click()
  })
  await page.waitForSelector('.major-card', { timeout: 10000 })

  // 1. 内置分类：支出 11 个一级大类 + 收入 3 个一级大类
  const expenseCount = await page.evaluate(
    () => document.querySelectorAll('[data-kind="expense"] .major-card').length
  )
  const incomeCount = await page.evaluate(
    () => document.querySelectorAll('[data-kind="income"] .major-card').length
  )
  await assert(
    expenseCount === 11 && incomeCount === 3,
    `内置分类正确（支出 ${expenseCount} 个 + 收入 ${incomeCount} 个）`,
    page
  )

  // 2. 新增支出分类「测试大类」
  await clickButton(page, '新增支出分类')
  await page.waitForSelector('.el-dialog input', { timeout: 5000 })
  await page.fill('.el-dialog input', '测试大类')
  await clickButton(page, '确定')
  await page.waitForTimeout(700)
  await assert(
    await page.evaluate(() => document.body.innerText.includes('测试大类')),
    '新增一级分类成功',
    page
  )

  // 3. 同名支出分类应被拒绝
  await clickButton(page, '新增支出分类')
  await page.waitForSelector('.el-dialog input')
  await page.fill('.el-dialog input', '测试大类')
  await clickButton(page, '确定')
  await page.waitForTimeout(700)
  const dupBlocked = await page.evaluate(() => document.body.innerText.includes('已存在同名分类'))
  await assert(dupBlocked, '同名一级分类被拦截并提示', page)
  // 关掉弹窗
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // 4. 给「测试大类」添加小类「测试小类」
  const addSubOk = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.major-card')].find((c) =>
      c.textContent.includes('测试大类')
    )
    const btn = [...card.querySelectorAll('button')].find((b) => b.textContent.trim() === '添加小类')
    if (!btn) return false
    btn.click()
    return true
  })
  await assert(addSubOk, '找到测试大类的添加小类按钮', page)
  await page.waitForSelector('.el-dialog input')
  await page.fill('.el-dialog input', '测试小类')
  await clickButton(page, '确定')
  await page.waitForTimeout(700)
  await assert(
    await page.evaluate(() => document.body.innerText.includes('测试小类')),
    '新增二级小类成功',
    page
  )

  // 5. 点击小类标签重命名
  await page.evaluate(() => {
    const tag = [...document.querySelectorAll('.el-tag')].find((t) =>
      t.textContent.includes('测试小类')
    )
    tag.click()
  })
  await page.waitForSelector('.el-dialog input')
  await page.fill('.el-dialog input', '改名小类')
  await clickButton(page, '确定')
  await page.waitForTimeout(700)
  await assert(
    await page.evaluate(() => document.body.innerText.includes('改名小类')),
    '小类重命名成功',
    page
  )

  // 6. 删除小类（点标签上的 ×，弹确认框后点删除）
  await page.evaluate(() => {
    const tag = [...document.querySelectorAll('.el-tag')].find((t) =>
      t.textContent.includes('改名小类')
    )
    tag.querySelector('.el-tag__close').click()
  })
  await page.waitForSelector('.el-message-box', { timeout: 5000 })
  await clickInMessageBox(page, '删除')
  await page.waitForTimeout(700)
  await assert(
    !(await page.evaluate(() => document.body.innerText.includes('改名小类'))),
    '小类删除成功',
    page
  )

  // 7. 删除一级分类「测试大类」
  const delMajorOk = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.major-card')].find((c) =>
      c.textContent.includes('测试大类')
    )
    const btn = [...card.querySelectorAll('button')].find((b) => b.textContent.trim() === '删除')
    if (!btn) return false
    btn.click()
    return true
  })
  await assert(delMajorOk, '找到测试大类的删除按钮', page)
  await page.waitForSelector('.el-message-box', { timeout: 5000 })
  await clickInMessageBox(page, '删除')
  await page.waitForTimeout(700)
  await assert(
    !(await page.evaluate(() => document.body.innerText.includes('测试大类'))),
    '一级分类删除成功',
    page
  )

  // 8. 最终应恢复为支出 11 个 + 收入 3 个一级大类
  const finalExpense = await page.evaluate(
    () => document.querySelectorAll('[data-kind="expense"] .major-card').length
  )
  const finalIncome = await page.evaluate(
    () => document.querySelectorAll('[data-kind="income"] .major-card').length
  )
  await assert(
    finalExpense === 11 && finalIncome === 3,
    `测试后恢复原状（支出 ${finalExpense} 个 + 收入 ${finalIncome} 个）`,
    page
  )

  // 9. 手动备份：点击「立即备份」→ 提示备份成功
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '立即备份')
    btn.click()
  })
  await page.waitForTimeout(900)
  await assert(
    await page.evaluate(() => document.body.innerText.includes('备份成功')),
    '手动备份成功并提示',
    page
  )
} finally {
  await app.close().catch(() => {})
}

console.log(failed === 0 ? '分类管理测试：全部通过 ✓' : `分类管理测试：${failed} 项未通过`)
process.exit(failed === 0 ? 0 : 1)

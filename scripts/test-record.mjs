// 记一笔页面端到端测试：模拟真实记账操作（填金额、选两级分类、保存、连续录入）
// 用法：npm run build 后执行 node scripts/test-record.mjs
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
      const body = await page.evaluate(() => document.body.innerText.slice(0, 500))
      console.log('  --- 页面内容片段 ---\n' + body + '\n  --- 结束 ---')
    }
  }
}

// 点击级联面板中指定文字的分类节点（点一级是展开，点二级是选中）
async function clickCascaderNode(page, text) {
  const okClick = await page.evaluate((t) => {
    const label = [...document.querySelectorAll('.el-cascader-node__label')].find((l) =>
      l.textContent.trim() === t
    )
    if (!label) return false
    label.click()
    return true
  }, text)
  if (!okClick) throw new Error('级联节点未找到: ' + text)
}

try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => console.log('页面异常:', e.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[渲染进程error]`, msg.text().slice(0, 200))
  })
  await page.waitForSelector('.app-menu', { timeout: 15000 })

  // 清除上次使用的账户与类型记忆，保证默认断言稳定
  await page.evaluate(() => {
    localStorage.removeItem('heima-last-account-id')
    localStorage.removeItem('heima-last-type')
  })
  await page.reload()
  await page.waitForSelector('.app-menu', { timeout: 15000 })

  // 从导航进入「记一笔」页
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.el-menu-item')].find((e) =>
      e.textContent.includes('记一笔')
    )
    el.click()
  })
  await page.waitForSelector('.amount-input input', { timeout: 10000 })
  await page.waitForTimeout(600)

  // 0.5 默认账户应为第一个内置账户（微信），默认类型为支出
  const defaultAccount = await page.evaluate(
    () => document.querySelector('.el-select')?.textContent.trim() ?? ''
  )
  await assert(
    defaultAccount.includes('微信'),
    `默认账户为微信（实际：${defaultAccount}）`,
    page
  )
  const defaultTypeActive = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.el-radio-button')].find(
      (e) => e.textContent.trim() === '支出'
    )
    return el ? el.classList.contains('is-active') : false
  })
  await assert(defaultTypeActive, '默认收支类型为支出', page)

  // 0. 日期默认应为今天
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const dateValue = await page.evaluate(
    () => document.querySelector('.el-date-editor input')?.value
  )
  await assert(dateValue === todayStr, `日期默认为今天（${dateValue}）`, page)

  // 1. 不填金额直接保存 → 应提示请输入金额
  const saveBtnSel = '.save-btn'
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '保存')
    btn.click()
  })
  await page.waitForTimeout(500)
  await assert(
    await page.evaluate(() => document.body.innerText.includes('请输入金额')),
    '空表单保存被拦截并提示',
    page
  )

  // 2. 填金额 12.34，选「餐饮饮食 → 早餐」，填备注，保存
  await page.fill('.amount-input input', '12.34')
  // 打开分类级联面板
  await page.evaluate(() => document.querySelector('.el-cascader').click())
  await page.waitForSelector('.el-cascader-node__label', { timeout: 5000 })
  await clickCascaderNode(page, '餐饮饮食') // 展开一级
  await page.waitForTimeout(500)
  await clickCascaderNode(page, '早餐') // 选中二级
  await page.waitForTimeout(600)
  await page.fill('input[placeholder="例如：和朋友聚餐"]', '测试备注：早餐两个包子')
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '保存')
    btn.click()
  })
  await page.waitForTimeout(800)
  await assert(
    await page.evaluate(() => document.body.innerText.includes('已记录 ¥12.34')),
    '保存成功并显示金额提示',
    page
  )
  // 表单应已重置（金额清空、备注清空）
  const amountAfter = await page.evaluate(() => document.querySelector('.amount-input input').value)
  const noteAfter = await page.evaluate(
    () => document.querySelector('input[placeholder="例如：和朋友聚餐"]').value
  )
  await assert(amountAfter === '' && noteAfter === '', '保存后表单自动重置', page)

  // 3. 只填金额不选分类 → 应提示请选择分类
  await page.fill('.amount-input input', '66')
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '保存')
    btn.click()
  })
  await page.waitForTimeout(500)
  await assert(
    await page.evaluate(() => document.body.innerText.includes('请选择分类')),
    '未选分类保存被拦截并提示',
    page
  )

  // 4. 连续记第二笔：8.5 元「交通出行 → 公交地铁」
  await page.fill('.amount-input input', '8.5')
  await page.evaluate(() => document.querySelector('.el-cascader').click())
  await page.waitForSelector('.el-cascader-node__label', { timeout: 5000 })
  await clickCascaderNode(page, '交通出行')
  await page.waitForTimeout(500)
  await clickCascaderNode(page, '公交地铁')
  await page.waitForTimeout(600)
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '保存')
    btn.click()
  })
  await page.waitForTimeout(800)
  await assert(
    await page.evaluate(() => document.body.innerText.includes('已记录 ¥8.50')),
    '连续记第二笔成功（¥8.50）',
    page
  )

  // 5. 记一笔收入：切换到「收入」，账户选具体银行卡「测试卡」，选「工资收入 → 工资」，金额 5000
  // 先通过接口在「银行卡」下创建一张测试卡
  const testCardCreated = await page.evaluate(async () => {
    const accounts = (await window.api.accounts.list()).data
    const bank = accounts.find((a) => a.name === '银行卡')
    const res = await window.api.accounts.create({ name: '测试卡', parentId: bank.id })
    return res.ok
  })
  await assert(testCardCreated, '创建具体卡「测试卡」', page)
  // 刷新页面让账户下拉加载新建的测试卡
  await page.reload()
  await page.waitForSelector('.app-menu', { timeout: 15000 })
  await page.waitForTimeout(1000)
  const incomeToggle = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.el-radio-button')].find(
      (e) => e.textContent.trim() === '收入'
    )
    if (!el) return false
    el.click()
    return true
  })
  await assert(incomeToggle, '切换到收入类型', page)
  await page.waitForTimeout(400)
  // 选择具体卡「测试卡」（el-select 需要真实点击事件）
  await page.click('.el-select')
  await page.waitForSelector('.el-select-dropdown__item', { timeout: 5000 })
  const accountSwitched = await page.evaluate(() => {
    const item = [...document.querySelectorAll('.el-select-dropdown__item')].find(
      (e) => e.textContent.trim() === '测试卡'
    )
    if (!item) return false
    item.click()
    return true
  })
  await assert(accountSwitched, '账户切换为具体卡「测试卡」', page)
  await page.waitForTimeout(400)
  await page.fill('.amount-input input', '5000')
  await page.evaluate(() => document.querySelector('.el-cascader').click())
  await page.waitForSelector('.el-cascader-node__label', { timeout: 5000 })
  await clickCascaderNode(page, '工资收入') // 展开一级
  await page.waitForTimeout(500)
  await clickCascaderNode(page, '工资') // 选中二级
  await page.waitForTimeout(600)
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '保存')
    btn.click()
  })
  await page.waitForTimeout(800)
  await assert(
    await page.evaluate(() => document.body.innerText.includes('已记录收入 ¥5,000.00')),
    '记收入成功（工资 ¥5,000.00）',
    page
  )

  // 6. 习惯记忆：重新打开记一笔页，应延续上次的选择（收入 + 测试卡）
  await page.reload()
  await page.waitForSelector('.app-menu', { timeout: 15000 })
  await page.waitForTimeout(1000)
  const typeRemembered = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.el-radio-button')].find(
      (e) => e.textContent.trim() === '收入'
    )
    return el ? el.classList.contains('is-active') : false
  })
  const accountRemembered = await page.evaluate(
    () => document.querySelector('.el-select')?.textContent.trim() ?? ''
  )
  await assert(
    typeRemembered && accountRemembered.includes('测试卡'),
    `重开页面延续上次选择：收入 + 测试卡（实际：${accountRemembered}）`,
    page
  )

  // 7. 清理：删除测试卡挂着的记录，再删除测试卡
  const cleanupOk = await page.evaluate(async () => {
    const accounts = (await window.api.accounts.list()).data
    const card = accounts.find((a) => a.name === '测试卡')
    if (!card) return true
    const listRes = await window.api.expenses.list({ accountId: card.id, page: 1, pageSize: 100 })
    for (const item of listRes.data.items) {
      await window.api.expenses.delete(item.id)
    }
    const delRes = await window.api.accounts.delete(card.id)
    return delRes.ok
  })
  await assert(cleanupOk, '清理测试卡与测试记录', page)
} finally {
  await app.close().catch(() => {})
}

console.log(failed === 0 ? '记一笔测试：全部通过 ✓' : `记一笔测试：${failed} 项未通过`)
process.exit(failed === 0 ? 0 : 1)

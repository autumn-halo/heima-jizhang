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

  // 默认就在「记一笔」页
  await page.waitForSelector('.amount-input input', { timeout: 10000 })

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
} finally {
  await app.close().catch(() => {})
}

console.log(failed === 0 ? '记一笔测试：全部通过 ✓' : `记一笔测试：${failed} 项未通过`)
process.exit(failed === 0 ? 0 : 1)

// 界面自动验证脚本：以打包模式启动应用，逐个页面截图，供开发时确认界面效果。
// 用法：npm run build 后执行 node scripts/drive-app.mjs
import { _electron as electron } from 'playwright-core'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

// 关键：删除会使 Electron 退化为纯 Node 的环境变量
delete process.env.ELECTRON_RUN_AS_NODE

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const shotDir = join(appDir, 'screenshots')
mkdirSync(shotDir, { recursive: true })

const electronBin = join(appDir, 'node_modules', 'electron', 'dist', 'electron.exe')

const app = await electron.launch({
  executablePath: electronBin,
  args: [appDir],
  env: { ...process.env },
  timeout: 30000
})

try {
  const page = await app.firstWindow()

  // 收集页面报错（渲染错误、资源加载失败等）
  const errors = []
  page.on('pageerror', (e) => errors.push('页面异常: ' + e.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('控制台错误: ' + msg.text())
  })

  // 等待界面渲染完成（侧边栏出现）
  await page.waitForSelector('.app-menu', { timeout: 15000 })
  await page.waitForTimeout(800)

  console.log('窗口标题:', await page.title())

  // 结构断言：菜单项数量与文字
  const menuInfo = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.el-menu-item')]
    return {
      count: items.length,
      labels: items.map((e) => e.textContent.trim())
    }
  })
  console.log('菜单项数量:', menuInfo.count, '文字:', menuInfo.labels.join('/'))

  // 样式断言：明亮清爽主题（浅灰内容区 + 白色侧边栏）
  const styleInfo = await page.evaluate(() => {
    const main = document.querySelector('.app-main')
    const aside = document.querySelector('.app-aside')
    return {
      mainBg: main ? getComputedStyle(main).backgroundColor : '无',
      asideBg: aside ? getComputedStyle(aside).backgroundColor : '无'
    }
  })
  console.log('内容区背景色:', styleInfo.mainBg, '侧边栏背景色:', styleInfo.asideBg)

  // 逐个页面截图并核对页面标题
  const pages = [
    ['记一笔', '01-record.png'],
    ['支出流水', '02-transactions.png'],
    ['统计图表', '03-stats.png'],
    ['分类管理', '04-categories.png']
  ]
  for (let i = 0; i < pages.length; i++) {
    const [name, file] = pages[i]
    if (i > 0) {
      // 用 DOM 方式点击侧边栏菜单项（不受坐标影响，最可靠）
      const clicked = await page.evaluate((t) => {
        const el = [...document.querySelectorAll('.el-menu-item')].find((e) =>
          e.textContent.includes(t)
        )
        if (!el) return false
        el.click()
        return true
      }, name)
      if (!clicked) throw new Error('菜单项未找到: ' + name)
      await page.waitForTimeout(900)
    }
    // 核对路由与页面标题一致
    const pageTitle = await page.evaluate(
      () => document.querySelector('.page-title')?.textContent.trim() ?? '(无标题)'
    )
    const routeOk = pageTitle === name
    console.log(`页面 ${name}: 标题「${pageTitle}」${routeOk ? '✓ 正确' : '✗ 不匹配!'}`)
    // 截图尽力而为：Electron 窗口失焦时截图可能卡住，超时则跳过（不影响验证）
    await page.bringToFront().catch(() => {})
    try {
      await page.screenshot({ path: join(shotDir, file), timeout: 8000 })
    } catch {
      console.log(`  （截图超时跳过 ${file}）`)
    }
  }

  // 汇总报错
  console.log(errors.length === 0 ? '报错检查: 无错误 ✓' : '报错检查:\n' + errors.join('\n'))
} finally {
  await app.close().catch(() => {})
}

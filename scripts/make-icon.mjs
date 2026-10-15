// 应用图标生成脚本：用 Electron 渲染黑马图标页面并截图，输出 512x512 PNG
// 用法：node scripts/make-icon.mjs（生成 resources/icon.png 和 build/icon.png）
import { _electron as electron } from 'playwright-core'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync, mkdirSync } from 'node:fs'

delete process.env.ELECTRON_RUN_AS_NODE

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const electronBin = join(appDir, 'node_modules', 'electron', 'dist', 'electron.exe')

// 图标页面：深色渐变背景 + 白马 emoji（呼应"黑马"名字）
const htmlPath = join(appDir, 'scripts', 'icon-page.html')
writeFileSync(
  htmlPath,
  `<!doctype html><html><body style="margin:0">
    <div id="icon" style="width:512px;height:512px;background:linear-gradient(135deg,#1f1f1f,#3d3d3d);
      display:flex;align-items:center;justify-content:center;font-size:300px;
      font-family:'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif;">🐴</div>
  </body></html>`
)

const app = await electron.launch({
  executablePath: electronBin,
  args: [htmlPath],
  env: { ...process.env },
  timeout: 30000
})

try {
  const page = await app.firstWindow()
  await page.waitForSelector('#icon', { timeout: 10000 })
  await page.waitForTimeout(1500) // 等 emoji 字体加载
  const buf = await page.locator('#icon').screenshot({ type: 'png' })
  for (const dir of [join(appDir, 'resources'), join(appDir, 'build')]) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'icon.png'), buf)
  }
  console.log('图标 PNG 已生成：resources/icon.png、build/icon.png（512x512）')
} finally {
  await app.close().catch(() => {})
}

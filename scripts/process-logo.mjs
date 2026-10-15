// 图标处理脚本：把用户提供的卡通图片（nike.png）处理成应用图标
// 流程：自动检测画面内容边界 → 裁剪主体 → 合成到 512x512 暖色渐变圆角背景
// 输出：build/icon.png、resources/icon.png、src/renderer/src/assets/logo.png
import { _electron as electron } from 'playwright-core'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'

delete process.env.ELECTRON_RUN_AS_NODE

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const electronBin = join(appDir, 'node_modules', 'electron', 'dist', 'electron.exe')

const app = await electron.launch({
  executablePath: electronBin,
  args: [], // 无参数启动，页面内自行加载图片
  env: { ...process.env },
  timeout: 30000
})

try {
  const page = await app.firstWindow()

  const pngUrl = 'file:///' + encodeURI(join(appDir, 'nike.png').replace(/\\/g, '/'))
  const result = await page.evaluate(async (url) => {
    const img = new Image()
    img.src = url
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error('图片加载失败: ' + url))
    })

    // 第一步：在原图尺寸画布上扫描内容边界（透明度 > 30 的像素）
    const c1 = document.createElement('canvas')
    c1.width = img.naturalWidth
    c1.height = img.naturalHeight
    const x1 = c1.getContext('2d')
    x1.drawImage(img, 0, 0)
    const data = x1.getImageData(0, 0, c1.width, c1.height).data
    let minX = c1.width
    let minY = c1.height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < c1.height; y++) {
      for (let x = 0; x < c1.width; x++) {
        if (data[(y * c1.width + x) * 4 + 3] > 30) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }

    // 第二步：合成 512x512 图标（圆角 + 暖色渐变背景 + 居中主体）
    const S = 512
    const margin = 32
    const cw = maxX - minX + 1
    const ch = maxY - minY + 1
    const scale = Math.min((S - margin * 2) / cw, (S - margin * 2) / ch)
    const dw = cw * scale
    const dh = ch * scale
    const dx = (S - dw) / 2
    const dy = (S - dh) / 2

    const c2 = document.createElement('canvas')
    c2.width = S
    c2.height = S
    const x2 = c2.getContext('2d')

    // 圆角矩形（圆角半径 112）
    const r = 112
    const path = new Path2D()
    path.moveTo(r, 0)
    path.arcTo(S, 0, S, S, r)
    path.arcTo(S, S, 0, S, r)
    path.arcTo(0, S, 0, 0, r)
    path.arcTo(0, 0, S, 0, r)
    path.closePath()
    x2.save()
    x2.clip(path)

    // 暖色调清新渐变：奶油白 → 蜜桃橙
    const grad = x2.createLinearGradient(0, 0, S, S)
    grad.addColorStop(0, '#FFF7EA')
    grad.addColorStop(1, '#FFDFC0')
    x2.fillStyle = grad
    x2.fillRect(0, 0, S, S)

    x2.drawImage(img, minX, minY, cw, ch, dx, dy, dw, dh)
    x2.restore()

    return {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      contentBox: { minX, minY, maxX, maxY, cw, ch },
      dataUrl: c2.toDataURL('image/png')
    }
  }, pngUrl)

  const pngBuf = Buffer.from(result.dataUrl.split(',')[1], 'base64')
  const targets = [
    join(appDir, 'build', 'icon.png'),
    join(appDir, 'resources', 'icon.png'),
    join(appDir, 'src', 'renderer', 'src', 'assets', 'logo.png')
  ]
  for (const t of targets) {
    writeFileSync(t, pngBuf)
  }
  console.log('图片信息:', JSON.stringify(result.contentBox), '原图', result.naturalWidth, 'x', result.naturalHeight)
  console.log('图标 PNG 已生成：')
  for (const t of targets) console.log(' ', t)
} finally {
  await app.close().catch(() => {})
}

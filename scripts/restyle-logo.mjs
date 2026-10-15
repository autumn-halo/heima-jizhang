// 二次元风格化图标处理：以用户提供的图片为基础，自动优化为可爱的二次元卡通形象
// 处理流程：
//   1. 按主体（不透明像素）的重心自动取方形构图，放大主体（解决横图比例失调问题）
//   2. 赛璐璐风格化：轻微平滑 → 色块平涂（减少色彩层次）→ 饱和度/暖色微调
//   3. 柔和的深棕描边（动漫勾线感）+ 底部软阴影（贴纸感）
//   4. 合成到 512x512 暖色渐变圆角背景
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
  args: [],
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
      img.onerror = () => reject(new Error('图片加载失败'))
    })

    const W = img.naturalWidth
    const H = img.naturalHeight

    // ---------- 第 1 步：主体重心与边界 ----------
    const c0 = document.createElement('canvas')
    c0.width = W
    c0.height = H
    const x0 = c0.getContext('2d')
    x0.drawImage(img, 0, 0)
    const d0 = x0.getImageData(0, 0, W, H).data
    let minX = W, minY = H, maxX = -1, maxY = -1
    let sumX = 0, sumY = 0, sumA = 0
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const a = d0[(y * W + x) * 4 + 3]
        if (a > 30) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
          sumX += x * a
          sumY += y * a
          sumA += a
        }
      }
    }
    const comX = sumX / sumA // 重心
    const comY = sumY / sumA
    const contentW = maxX - minX + 1
    const contentH = maxY - minY + 1

    // 方形构图：边长取主体高度（让主体放大占满画面），中心对准主体重心
    // 收窄 8% 让主体更突出
    const side = contentH * 0.92
    let cx = comX - side / 2
    let cy = comY - side / 2
    cx = Math.max(0, Math.min(cx, W - side))
    cy = Math.max(0, Math.min(cy, H - side))

    // ---------- 第 2 步：平滑 + 平涂（赛璐璐风） ----------
    // 先画裁剪区，再轻微模糊+提饱和
    const c1 = document.createElement('canvas')
    c1.width = side
    c1.height = side
    const x1 = c1.getContext('2d')
    x1.filter = 'blur(1px) saturate(1.22)'
    x1.drawImage(img, cx, cy, side, side, 0, 0, side, side)

    // 色彩平涂：每通道量化到 5 档（减少层次、更接近动漫平涂），并做暖色微调
    const imgData = x1.getImageData(0, 0, side, side)
    const px = imgData.data
    const LEVELS = 5
    const step = 255 / (LEVELS - 1)
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] > 0) {
        px[i] = Math.round(Math.round(px[i] / step) * step + 8) // R 微提（暖）
        px[i + 1] = Math.round(Math.round(px[i + 1] / step) * step + 2)
        px[i + 2] = Math.round(Math.round(px[i + 2] / step) * step - 6) // B 微降（暖）
      }
    }
    x1.putImageData(imgData, 0, 0)

    // ---------- 第 3 步：柔描边（先画外扩的深棕剪影，再把主体盖上去） ----------
    const c2 = document.createElement('canvas')
    c2.width = side
    c2.height = side
    const x2 = c2.getContext('2d')
    // 主体剪影
    const sil = document.createElement('canvas')
    sil.width = side
    sil.height = side
    const xs = sil.getContext('2d')
    xs.drawImage(c1, 0, 0)
    xs.globalCompositeOperation = 'source-in'
    xs.fillStyle = '#5a4632' // 暖深棕描边色
    xs.fillRect(0, 0, side, side)
    x2.filter = 'blur(2.5px)'
    x2.drawImage(sil, 0, 0)
    x2.filter = 'none'
    // 主体盖在描边之上
    x2.drawImage(c1, 0, 0)

    // ---------- 第 4 步：合成 512x512 图标 ----------
    const S = 512
    const c3 = document.createElement('canvas')
    c3.width = S
    c3.height = S
    const x3 = c3.getContext('2d')

    // 圆角矩形
    const r = 112
    const path = new Path2D()
    path.moveTo(r, 0)
    path.arcTo(S, 0, S, S, r)
    path.arcTo(S, S, 0, S, r)
    path.arcTo(0, S, 0, 0, r)
    path.arcTo(0, 0, S, 0, r)
    path.closePath()
    x3.save()
    x3.clip(path)

    // 暖色清新渐变背景：奶油白 → 蜜桃橙
    const grad = x3.createLinearGradient(0, 0, S, S)
    grad.addColorStop(0, '#FFF7EA')
    grad.addColorStop(1, '#FFDFC0')
    x3.fillStyle = grad
    x3.fillRect(0, 0, S, S)

    // 主体下方的软阴影（贴纸感）
    const shadow = x3.createRadialGradient(S / 2, S * 0.82, 10, S / 2, S * 0.82, S * 0.32)
    shadow.addColorStop(0, 'rgba(180, 120, 60, 0.20)')
    shadow.addColorStop(1, 'rgba(180, 120, 60, 0)')
    x3.fillStyle = shadow
    x3.fillRect(0, 0, S, S)

    // 主体：占画面 86%，居中
    const scale2 = (S * 0.86) / side
    const dw = side * scale2
    const dh = side * scale2
    x3.drawImage(c2, (S - dw) / 2, (S - dh) / 2, dw, dh)
    x3.restore()

    return {
      source: { W, H, contentW, contentH, comX: Math.round(comX), comY: Math.round(comY) },
      crop: { cx: Math.round(cx), cy: Math.round(cy), side: Math.round(side) },
      dataUrl: c3.toDataURL('image/png')
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
  console.log('原图信息:', JSON.stringify(result.source))
  console.log('方形取景:', JSON.stringify(result.crop))
  console.log('二次元风格化图标已生成：')
  for (const t of targets) console.log(' ', t)
} finally {
  await app.close().catch(() => {})
}

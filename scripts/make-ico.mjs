// 标准 ICO 图标生成脚本：把 build/icon.png 缩放为 6 种尺寸，按 ICO 规范组装
// （PNG 压缩帧，Windows Vista+ 通用；之前的 ico 由 PowerShell 生成、格式不规范，
//   导致 electron-builder 未能把图标嵌入 exe，桌面一直显示默认图标）
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
  const pngUrl = 'file:///' + encodeURI(join(appDir, 'build', 'icon.png').replace(/\\/g, '/'))
  const sizes = [256, 128, 64, 48, 32, 16]

  const base64List = await page.evaluate(async ({ url, sizeList }) => {
    const img = new Image()
    img.src = url
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error('图标 PNG 加载失败'))
    })
    const out = []
    for (const s of sizeList) {
      const c = document.createElement('canvas')
      c.width = s
      c.height = s
      const x = c.getContext('2d')
      x.drawImage(img, 0, 0, s, s)
      out.push(c.toDataURL('image/png').split(',')[1])
    }
    return out
  }, { url: pngUrl, sizeList: sizes })

  // ---- 按 ICO 文件规范组装 ----
  const pngBufs = base64List.map((b64) => Buffer.from(b64, 'base64'))
  const header = Buffer.alloc(6 + 16 * pngBufs.length)
  header.writeUInt16LE(0, 0) // 保留字段
  header.writeUInt16LE(1, 2) // 类型：1 = 图标
  header.writeUInt16LE(pngBufs.length, 4) // 图像数量
  let offset = 6 + 16 * pngBufs.length
  pngBufs.forEach((buf, i) => {
    const s = sizes[i]
    const e = 6 + 16 * i
    header.writeUInt8(s === 256 ? 0 : s, e) // 宽（0 表示 256）
    header.writeUInt8(s === 256 ? 0 : s, e + 1) // 高（0 表示 256）
    header.writeUInt8(0, e + 2) // 调色板数
    header.writeUInt8(0, e + 3) // 保留
    header.writeUInt16LE(1, e + 4) // 色彩平面数
    header.writeUInt16LE(32, e + 6) // 位深度
    header.writeUInt32LE(buf.length, e + 8) // 数据大小
    header.writeUInt32LE(offset, e + 12) // 数据偏移
    offset += buf.length
  })
  const icoBuf = Buffer.concat([header, ...pngBufs])
  writeFileSync(join(appDir, 'build', 'icon.ico'), icoBuf)
  console.log('icon.ico 已按规范重新生成（尺寸:', sizes.join('/'), '，共', icoBuf.length, '字节）')
} finally {
  await app.close().catch(() => {})
}

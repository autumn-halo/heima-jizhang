// 数据库检查脚本：查看用户数据目录中的账本数据库内容（开发验证用）
// 用法：node scripts/check-db.mjs
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { readdirSync } from 'node:fs'

const dataDir = join(process.env.APPDATA, '黑马记账')
const db = new DatabaseSync(join(dataDir, '黑马记账.db'), { readOnly: true })

const rootCount = db.prepare('SELECT COUNT(*) AS c FROM categories WHERE parent_id IS NULL').get().c
const subCount = db.prepare('SELECT COUNT(*) AS c FROM categories WHERE parent_id IS NOT NULL').get().c
const expenseCount = db.prepare('SELECT COUNT(*) AS c FROM expenses').get().c

console.log('数据库位置:', join(dataDir, '黑马记账.db'))
console.log('一级大类数量:', rootCount)
console.log('二级小类数量:', subCount)
console.log('支出记录数量:', expenseCount)
console.log(
  '一级大类列表:',
  db
    .prepare('SELECT name FROM categories WHERE parent_id IS NULL ORDER BY sort_order')
    .all()
    .map((r) => r.name)
    .join('、')
)
console.log(
  '二级小类示例（餐饮饮食）:',
  db.prepare(
    `SELECT c.name FROM categories c
     JOIN categories p ON c.parent_id = p.id
     WHERE p.name = '餐饮饮食' ORDER BY c.sort_order`
  )
    .all()
    .map((r) => r.name)
    .join('、')
)

try {
  const backups = readdirSync(join(dataDir, 'backups')).filter((f) => f.endsWith('.db'))
  console.log('备份文件:', backups.join('、') || '(无)')
} catch {
  console.log('备份文件: (备份目录不存在)')
}

db.close()

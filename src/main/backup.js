// 每日自动备份：应用启动时若今天还没备份过，生成一份数据库副本，最多保留最近 30 份
import { join } from 'node:path'
import { mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs'
import { getSetting, setSetting } from './db'

const MAX_BACKUPS = 30
const BACKUP_PREFIX = '黑马记账-backup-'

/** 生成本地日期字符串 YYYY-MM-DD */
function localDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 按需执行每日备份（同一天内只做一次；force=true 时强制备份）
 * @param {import('node:sqlite').DatabaseSync} db 数据库实例
 * @param {string} backupDir 备份目录完整路径
 * @param {boolean} [force] 是否强制备份（手动备份用）
 */
export function backupIfNeeded(db, backupDir, force = false) {
  const today = localDateStr()
  try {
    // 今天已经备份过就不重复做
    if (!force && getSetting(db, 'last_backup_date') === today) {
      return { skipped: true }
    }

    mkdirSync(backupDir, { recursive: true })
    const target = join(backupDir, `${BACKUP_PREFIX}${today}.db`)

    // VACUUM INTO 生成一份完整独立的数据副本（包含未落盘内容，安全可靠）；
    // 目标文件已存在（如当天的旧文件）先删掉，因为该语句要求目标不存在
    if (existsSync(target)) unlinkSync(target)
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)

    setSetting(db, 'last_backup_date', today)
    pruneOldBackups(backupDir)
    return { path: target }
  } catch (err) {
    // 备份失败不阻断应用启动，只记录日志
    console.error('每日备份失败:', err)
    return { error: err.message }
  }
}

/** 清理旧备份，只保留最近 MAX_BACKUPS 份 */
function pruneOldBackups(backupDir) {
  const files = readdirSync(backupDir)
    .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith('.db'))
    .sort()
    .reverse() // 文件名含日期，倒序后最新在前

  // 超出保留数量的旧文件删除
  for (const f of files.slice(MAX_BACKUPS)) {
    try {
      unlinkSync(join(backupDir, f))
    } catch (err) {
      console.error('删除旧备份失败:', f, err)
    }
  }
}

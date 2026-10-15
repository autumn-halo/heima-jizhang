// IPC 层：注册主进程与界面之间的全部通信通道，统一参数校验与返回格式
import { ipcMain, app } from 'electron'
import { join } from 'node:path'
import { backupIfNeeded } from './backup'

// 参数上限
const MAX_AMOUNT_CENTS = 999999999 // 9999999.99 元
const MAX_NOTE_LENGTH = 100
const MAX_NAME_LENGTH = 20
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/

/** 统一成功返回 */
function ok(data) {
  return { ok: true, data }
}

/** 统一失败返回（error 为可直接展示的中文信息） */
function fail(error) {
  return { ok: false, error }
}

/** 校验金额（以分为单位的整数）：>0 且不超过上限 */
function isValidAmount(cents) {
  return Number.isInteger(cents) && cents > 0 && cents <= MAX_AMOUNT_CENTS
}

/** 校验日期字符串 YYYY-MM-DD 是否为真实存在的日期 */
function isValidDate(str) {
  if (!DATE_RE.test(str)) return false
  const [y, m, d] = str.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

// ---------------- 分类相关 ----------------

function registerCategoryIpc(db) {
  ipcMain.handle('categories:list', () => {
    try {
      const rows = db
        .prepare('SELECT id, name, parent_id FROM categories ORDER BY sort_order, id')
        .all()
      // 组装两级树结构（三遍遍历，与行顺序完全无关：
      // 第一遍建立 id → 节点 索引；第二遍初始化所有一级大类；
      // 第三遍再挂接子节点。只有一级大类带 children 数组，二级小类不带）
      const nodeMap = new Map()
      for (const row of rows) {
        nodeMap.set(row.id, { id: row.id, name: row.name })
      }
      const tree = []
      for (const row of rows) {
        if (row.parent_id === null) {
          const node = nodeMap.get(row.id)
          node.children = []
          tree.push(node)
        }
      }
      for (const row of rows) {
        if (row.parent_id !== null) {
          const parent = nodeMap.get(row.parent_id)
          if (parent) parent.children.push(nodeMap.get(row.id))
        }
      }
      return ok(tree)
    } catch (err) {
      return fail('读取分类失败：' + err.message)
    }
  })

  ipcMain.handle('categories:create', (_e, payload) => {
    try {
      const name = String(payload?.name ?? '').trim()
      const parentId = payload?.parentId ?? null
      if (!name) return fail('分类名称不能为空')
      if (name.length > MAX_NAME_LENGTH) return fail(`分类名称不能超过 ${MAX_NAME_LENGTH} 个字`)
      // 新增二级小类时，父分类必须是一级大类
      if (parentId !== null) {
        const parent = db
          .prepare('SELECT id FROM categories WHERE id = ? AND parent_id IS NULL')
          .get(parentId)
        if (!parent) return fail('父分类不存在，请刷新后重试')
      }
      // 同级不允许重名
      const dup =
        parentId === null
          ? db.prepare('SELECT id FROM categories WHERE name = ? AND parent_id IS NULL').get(name)
          : db.prepare('SELECT id FROM categories WHERE name = ? AND parent_id = ?').get(name, parentId)
      if (dup) return fail('同级分类中已存在同名分类')
      // 排在同级最后
      const { m } = db
        .prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories WHERE parent_id IS ?')
        .get(parentId)
      const { lastInsertRowid } = db
        .prepare('INSERT INTO categories (name, parent_id, sort_order) VALUES (?, ?, ?)')
        .run(name, parentId, m + 1)
      return ok({ id: Number(lastInsertRowid) })
    } catch (err) {
      return fail('新增分类失败：' + err.message)
    }
  })

  ipcMain.handle('categories:update', (_e, payload) => {
    try {
      const id = payload?.id
      const name = String(payload?.name ?? '').trim()
      if (!name) return fail('分类名称不能为空')
      if (name.length > MAX_NAME_LENGTH) return fail(`分类名称不能超过 ${MAX_NAME_LENGTH} 个字`)
      const target = db.prepare('SELECT id, parent_id FROM categories WHERE id = ?').get(id)
      if (!target) return fail('分类不存在，请刷新后重试')
      // 同级不允许重名（排除自己）
      const dup =
        target.parent_id === null
          ? db
              .prepare('SELECT id FROM categories WHERE name = ? AND parent_id IS NULL AND id != ?')
              .get(name, id)
          : db
              .prepare('SELECT id FROM categories WHERE name = ? AND parent_id = ? AND id != ?')
              .get(name, target.parent_id, id)
      if (dup) return fail('同级分类中已存在同名分类')
      db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id)
      return ok(true)
    } catch (err) {
      return fail('重命名失败：' + err.message)
    }
  })

  ipcMain.handle('categories:delete', (_e, id) => {
    try {
      const target = db.prepare('SELECT id, parent_id FROM categories WHERE id = ?').get(id)
      if (!target) return fail('分类不存在，请刷新后重试')
      // 统计该分类（含其下属二级小类）下的支出记录，有记录则拒绝删除
      const count =
        target.parent_id === null
          ? db
              .prepare(
                `SELECT COUNT(*) AS c FROM expenses e
                 JOIN categories sub ON e.category_id = sub.id
                 WHERE sub.parent_id = ?`
              )
              .get(id).c
          : db.prepare('SELECT COUNT(*) AS c FROM expenses WHERE category_id = ?').get(id).c
      if (count > 0) {
        return fail(
          `该分类下有 ${count} 笔支出记录，暂时不能删除。请先删除这些记录，或把它们改到其他分类。`
        )
      }
      // 删除一级分类时，其二级小类会级联删除（外键 ON DELETE CASCADE）
      db.prepare('DELETE FROM categories WHERE id = ?').run(id)
      return ok(true)
    } catch (err) {
      return fail('删除分类失败：' + err.message)
    }
  })
}

// ---------------- 支出相关 ----------------

/** 校验并规整一笔支出的参数，返回 { error } 或合法数据 */
function validateExpensePayload(payload, db) {
  const amountCents = payload?.amountCents
  if (!isValidAmount(amountCents)) return { error: '金额必须是大于 0 且不超过 9999999.99 元' }
  const categoryId = payload?.categoryId
  // 必须选择二级小类
  const cat = db
    .prepare('SELECT id FROM categories WHERE id = ? AND parent_id IS NOT NULL')
    .get(categoryId)
  if (!cat) return { error: '请选择二级小类' }
  const date = String(payload?.date ?? '')
  if (!isValidDate(date)) return { error: '日期格式不正确' }
  const note = String(payload?.note ?? '').trim()
  if (note.length > MAX_NOTE_LENGTH) return { error: `备注不能超过 ${MAX_NOTE_LENGTH} 字` }
  return { amountCents, categoryId, date, note }
}

function registerExpenseIpc(db) {
  ipcMain.handle('expenses:create', (_e, payload) => {
    try {
      const v = validateExpensePayload(payload, db)
      if (v.error) return fail(v.error)
      const { lastInsertRowid } = db
        .prepare(
          'INSERT INTO expenses (amount_cents, category_id, expense_date, note) VALUES (?, ?, ?, ?)'
        )
        .run(v.amountCents, v.categoryId, v.date, v.note)
      return ok({ id: Number(lastInsertRowid) })
    } catch (err) {
      return fail('保存失败：' + err.message)
    }
  })

  ipcMain.handle('expenses:update', (_e, payload) => {
    try {
      const id = payload?.id
      const exists = db.prepare('SELECT id FROM expenses WHERE id = ?').get(id)
      if (!exists) return fail('该笔记录不存在，可能已被删除')
      const v = validateExpensePayload(payload, db)
      if (v.error) return fail(v.error)
      db.prepare(
        'UPDATE expenses SET amount_cents = ?, category_id = ?, expense_date = ?, note = ? WHERE id = ?'
      ).run(v.amountCents, v.categoryId, v.date, v.note, id)
      return ok(true)
    } catch (err) {
      return fail('修改失败：' + err.message)
    }
  })

  ipcMain.handle('expenses:delete', (_e, id) => {
    try {
      db.prepare('DELETE FROM expenses WHERE id = ?').run(id)
      return ok(true)
    } catch (err) {
      return fail('删除失败：' + err.message)
    }
  })

  ipcMain.handle('expenses:list', (_e, query) => {
    try {
      const { month, categoryId, keyword, page = 1, pageSize = 20 } = query ?? {}
      const where = []
      const params = []
      // 按月份筛选（expense_date 为 YYYY-MM-DD，前缀匹配即可）
      if (month && MONTH_RE.test(month)) {
        where.push('e.expense_date LIKE ?')
        params.push(month + '-%')
      }
      // 按分类筛选：选一级则筛其全部二级，选二级则精确匹配
      if (categoryId) {
        const cat = db.prepare('SELECT id, parent_id FROM categories WHERE id = ?').get(categoryId)
        if (cat) {
          if (cat.parent_id === null) {
            where.push('sub.parent_id = ?')
            params.push(categoryId)
          } else {
            where.push('e.category_id = ?')
            params.push(categoryId)
          }
        }
      }
      // 按备注关键词搜索
      if (keyword) {
        where.push('e.note LIKE ?')
        params.push(`%${keyword}%`)
      }
      const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''

      const { c: total } = db
        .prepare(
          `SELECT COUNT(*) AS c FROM expenses e JOIN categories sub ON e.category_id = sub.id ${whereSql}`
        )
        .get(...params)
      const pageNum = Math.max(1, Number(page))
      const pageSizeNum = Math.min(100, Math.max(1, Number(pageSize)))
      const offset = (pageNum - 1) * pageSizeNum
      const items = db
        .prepare(
          `SELECT e.id, e.amount_cents, e.expense_date, e.note,
                  sub.id AS sub_id, sub.name AS sub_name,
                  major.id AS major_id, major.name AS major_name
           FROM expenses e
           JOIN categories sub ON e.category_id = sub.id
           JOIN categories major ON sub.parent_id = major.id
           ${whereSql}
           ORDER BY e.expense_date DESC, e.created_at DESC, e.id DESC
           LIMIT ? OFFSET ?`
        )
        .all(...params, pageSizeNum, offset)
      return ok({ total, items })
    } catch (err) {
      return fail('查询流水失败：' + err.message)
    }
  })

  ipcMain.handle('expenses:summary', (_e, payload) => {
    try {
      const month = String(payload?.month ?? '')
      if (!MONTH_RE.test(month)) return fail('月份格式不正确')
      const monthPrefix = month + '-%'
      // 本月总额与笔数
      const total = db
        .prepare(
          'SELECT COALESCE(SUM(amount_cents), 0) AS total, COUNT(*) AS count FROM expenses WHERE expense_date LIKE ?'
        )
        .get(monthPrefix)
      // 日均支出 = 总额 ÷ 当月自然天数
      const [y, m] = month.split('-').map(Number)
      const daysInMonth = new Date(y, m, 0).getDate()
      const avgCents = Math.round(total.total / daysInMonth)
      // 一级分类占比
      const pie = db
        .prepare(
          `SELECT major.name AS name, SUM(e.amount_cents) AS totalCents
           FROM expenses e
           JOIN categories sub ON e.category_id = sub.id
           JOIN categories major ON sub.parent_id = major.id
           WHERE e.expense_date LIKE ?
           GROUP BY major.id ORDER BY totalCents DESC`
        )
        .all(monthPrefix)
      // 近 6 个月趋势（含当月）
      const trend = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date(y, m - 1 - i, 1)
        const mm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const r = db
          .prepare('SELECT COALESCE(SUM(amount_cents), 0) AS total FROM expenses WHERE expense_date LIKE ?')
          .get(mm + '-%')
        trend.push({ month: mm, totalCents: r.total })
      }
      return ok({ totalCents: total.total, count: total.count, avgCents, pie, trend })
    } catch (err) {
      return fail('统计查询失败：' + err.message)
    }
  })
}

// ---------------- 备份与信息 ----------------

function registerMiscIpc(db) {
  ipcMain.handle('backup:run', () => {
    try {
      const dataDir = app.getPath('userData')
      // force=true：手动备份总是生成一份当前最新副本（覆盖当天已有的同名备份）
      const result = backupIfNeeded(db, join(dataDir, 'backups'), true)
      if (result.error) return fail('备份失败：' + result.error)
      return ok(result)
    } catch (err) {
      return fail('备份失败：' + err.message)
    }
  })

  ipcMain.handle('app:get-data-path', () => {
    const dataDir = app.getPath('userData')
    return ok({ dataDir, backupsDir: join(dataDir, 'backups') })
  })
}

/**
 * 注册全部 IPC 通道
 * @param {import('node:sqlite').DatabaseSync} db 数据库实例
 */
export function registerIpc(db) {
  registerCategoryIpc(db)
  registerExpenseIpc(db)
  registerMiscIpc(db)
}

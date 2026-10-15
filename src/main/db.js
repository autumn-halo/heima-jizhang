// 数据层：打开并初始化 SQLite 数据库
// 使用 Node 内置的 node:sqlite 模块（Electron 44 自带），零原生依赖、无需编译
import { DatabaseSync } from 'node:sqlite'

// 内置两级分类（首次运行时写入数据库；之后用户可在软件中增删改）
const DEFAULT_EXPENSE_CATEGORIES = [
  { name: '餐饮饮食', children: ['早餐', '午餐', '晚餐', '夜宵', '外卖', '零食饮料', '咖啡奶茶', '买菜食材', '请客聚餐'] },
  { name: '交通出行', children: ['公交地铁', '打车', '加油充电', '停车费', '火车高铁', '飞机票', '汽车保养维修'] },
  { name: '购物消费', children: ['服饰鞋包', '数码家电', '日用百货', '美妆个护', '家居家具', '图书文具', '宠物用品'] },
  { name: '居住住房', children: ['房租', '房贷', '水费', '电费', '燃气费', '物业费', '宽带网费', '维修装修'] },
  { name: '休闲娱乐', children: ['电影演出', '游戏充值', '运动健身', '旅游度假', '会员订阅', 'KTV酒吧'] },
  { name: '医疗健康', children: ['看病买药', '体检疫苗', '保健品', '美容理发'] },
  { name: '学习教育', children: ['学费培训', '书籍资料', '考试报名', '文具用品', '兴趣班'] },
  { name: '人情往来', children: ['红包礼金', '孝敬父母', '请客送礼', '慈善捐款'] },
  { name: '通讯网络', children: ['手机话费', '流量费', '手机配件'] },
  { name: '金融保险', children: ['保险费', '贷款利息', '手续费', '信用卡年费'] },
  { name: '其他支出', children: ['罚款', '遗失', '其他'] }
]

// 内置收入分类（v1.1 新增：记收入功能）
const DEFAULT_INCOME_CATEGORIES = [
  { name: '工资收入', children: ['工资', '奖金', '加班费', '补贴'] },
  { name: '理财收入', children: ['理财收益', '利息', '分红'] },
  { name: '其他收入', children: ['红包', '兼职', '报销', '二手转让', '其他'] }
]

// 内置账户（v1.2 新增：多账户功能）
const DEFAULT_ACCOUNTS = ['微信', '支付宝', '银行卡']

/**
 * 打开（必要时创建）数据库，建表并播种内置分类
 * @param {string} dbPath 数据库文件完整路径
 * @returns {DatabaseSync} 数据库实例
 */
export function openDatabase(dbPath) {
  const db = new DatabaseSync(dbPath)

  // 开启外键约束（级联删除依赖它）
  db.exec('PRAGMA foreign_keys = ON')
  // WAL 模式：读写并发更好、崩溃损坏风险更低
  db.exec('PRAGMA journal_mode = WAL')

  // 分类表（两级：parent_id 为 NULL 表示一级大类，非 NULL 指向父分类）
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `)
  // 重名防护：SQLite 普通唯一索引对 NULL 值不生效，
  // 所以一级分类（parent_id 全为 NULL）必须用部分唯一索引
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_root_name
       ON categories(name) WHERE parent_id IS NULL`
  )
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_sub_name
       ON categories(parent_id, name) WHERE parent_id IS NOT NULL`
  )

  // 账户表（v1.2 多账户：微信/支付宝/银行卡等；必须先于 expenses 表创建）
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `)

  // 收支流水表（金额以"分"为单位存整数，杜绝浮点误差；
  // type: expense=支出 / income=收入；account_id: 所属账户，旧数据可为 NULL）
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount_cents INTEGER NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      expense_date TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'expense',
      account_id INTEGER REFERENCES accounts(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id)')

  // 键值设置表（schema 版本、最近备份日期等）
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  // 建表之后再迁移：老账本补字段（新账本建表时已包含全部字段，迁移自动跳过）
  migrate(db)

  seedDefaultCategories(db)
  seedDefaultAccounts(db)
  return db
}

/** 首次运行时写入内置账户（表为空才播种） */
function seedDefaultAccounts(db) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM accounts').get()
  if (count > 0) return
  const insert = db.prepare('INSERT INTO accounts (name, sort_order) VALUES (?, ?)')
  db.exec('BEGIN')
  try {
    DEFAULT_ACCOUNTS.forEach((name, i) => insert.run(name, i + 1))
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/**
 * 数据库结构迁移：兼容旧版本账本文件（v1 → v1.1 → v1.2）
 * - v1.1：expenses 增加 type 字段（expense=支出 / income=收入），旧记录默认为支出
 * - v1.1：categories 增加 kind 字段（expense=支出分类 / income=收入分类），旧分类默认为支出分类
 * - v1.2：expenses 增加 account_id 字段（多账户），旧记录为 NULL（界面显示"未设置"）
 */
function migrate(db) {
  const expenseCols = db.prepare('PRAGMA table_info(expenses)').all().map((c) => c.name)
  if (!expenseCols.includes('type')) {
    db.exec("ALTER TABLE expenses ADD COLUMN type TEXT NOT NULL DEFAULT 'expense'")
  }
  if (!expenseCols.includes('account_id')) {
    db.exec('ALTER TABLE expenses ADD COLUMN account_id INTEGER REFERENCES accounts(id)')
  }
  const catCols = db.prepare('PRAGMA table_info(categories)').all().map((c) => c.name)
  if (!catCols.includes('kind')) {
    db.exec("ALTER TABLE categories ADD COLUMN kind TEXT NOT NULL DEFAULT 'expense'")
  }
}

/** 首次运行时写入内置两级分类（按收支类型分别判断，缺哪类补哪类） */
function seedDefaultCategories(db) {
  // 支出分类：11 大类 + 60 小类
  const expenseCount = db
    .prepare("SELECT COUNT(*) AS count FROM categories WHERE kind = 'expense'")
    .get().count
  if (expenseCount === 0) {
    seedCategoryTree(db, DEFAULT_EXPENSE_CATEGORIES, 'expense')
  }
  // 收入分类：3 大类（v1.1 新增）
  const incomeCount = db
    .prepare("SELECT COUNT(*) AS count FROM categories WHERE kind = 'income'")
    .get().count
  if (incomeCount === 0) {
    seedCategoryTree(db, DEFAULT_INCOME_CATEGORIES, 'income')
  }
}

/** 把一组两级分类写入数据库（一个事务内完成） */
function seedCategoryTree(db, tree, kind) {
  const insert = db.prepare(
    'INSERT INTO categories (name, parent_id, sort_order, kind) VALUES (?, ?, ?, ?)'
  )
  db.exec('BEGIN')
  try {
    tree.forEach((major, majorIndex) => {
      // 先插入一级大类，拿到它的 id 作为二级小类的 parent_id
      const { lastInsertRowid } = insert.run(major.name, null, majorIndex + 1, kind)
      major.children.forEach((name, subIndex) => {
        insert.run(name, lastInsertRowid, subIndex + 1, kind)
      })
    })
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/** 读取一个设置项，不存在时返回 undefined */
export function getSetting(db, key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value
}

/** 写入一个设置项（存在则覆盖） */
export function setSetting(db, key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value)
}

// 统一封装 window.api 调用：解包 { ok, data } 结构，失败时抛出带中文信息的错误
async function call(fn, ...args) {
  const res = await fn(...args)
  if (!res.ok) throw new Error(res.error)
  return res.data
}

export const api = {
  categories: {
    list: () => call(window.api.categories.list),
    create: (payload) => call(window.api.categories.create, payload),
    update: (payload) => call(window.api.categories.update, payload),
    remove: (id) => call(window.api.categories.delete, id)
  },
  accounts: {
    list: () => call(window.api.accounts.list),
    create: (payload) => call(window.api.accounts.create, payload),
    update: (payload) => call(window.api.accounts.update, payload),
    remove: (id) => call(window.api.accounts.delete, id)
  },
  expenses: {
    create: (payload) => call(window.api.expenses.create, payload),
    update: (payload) => call(window.api.expenses.update, payload),
    remove: (id) => call(window.api.expenses.delete, id),
    list: (query) => call(window.api.expenses.list, query),
    summary: (payload) => call(window.api.expenses.summary, payload)
  },
  backup: {
    run: () => call(window.api.backup.run)
  },
  getDataPath: () => call(window.api.app.getDataPath)
}

import { defineStore } from 'pinia'
import { api } from '../api'

// 账户全局缓存（记一笔、首页明细、账户管理页共用）
// v1.3 起支持两级：一级账户（微信/支付宝/银行卡）+ 具体卡（如银行卡下的招商银行）
export const useAccountsStore = defineStore('accounts', {
  state: () => ({
    rows: [], // 带 parent_id 的扁平列表
    loaded: false
  }),
  getters: {
    // 两级树：[{ id, name, children: [{id, name}] }]
    // 注意：只有一级账户节点带 children 数组，具体卡不带（界面据此判断层级）
    tree(state) {
      const map = new Map()
      for (const r of state.rows) {
        map.set(r.id, { id: r.id, name: r.name })
      }
      const parents = []
      for (const r of state.rows) {
        if (r.parent_id === null) {
          const node = map.get(r.id)
          node.children = []
          parents.push(node)
        }
      }
      for (const r of state.rows) {
        if (r.parent_id !== null) {
          const p = map.get(r.parent_id)
          if (p) p.children.push(map.get(r.id))
        }
      }
      return parents
    },
    // 分组下拉选项（记一笔、首页筛选用）：
    // 一级账户作为组，组内第一个选项是一级本身，其后是具体卡
    accountGroups() {
      return this.tree.map((p) => ({
        label: p.name,
        options: [
          { label: p.name, value: p.id },
          ...p.children.map((c) => ({ label: c.name, value: c.id }))
        ]
      }))
    }
  },
  actions: {
    async load() {
      this.rows = await api.accounts.list()
      this.loaded = true
    },
    async add(name, parentId) {
      await api.accounts.create({ name, parentId })
      await this.load()
    },
    async rename(id, name) {
      await api.accounts.update({ id, name })
      await this.load()
    },
    async remove(id) {
      await api.accounts.remove(id)
      await this.load()
    }
  }
})

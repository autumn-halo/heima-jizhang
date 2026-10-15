import { defineStore } from 'pinia'
import { api } from '../api'

// 账户全局缓存（记一笔、首页明细、账户管理页共用）
export const useAccountsStore = defineStore('accounts', {
  state: () => ({
    list: [],
    loaded: false
  }),
  actions: {
    async load() {
      this.list = await api.accounts.list()
      this.loaded = true
    },
    async add(name) {
      await api.accounts.create({ name })
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

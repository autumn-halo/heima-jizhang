import { defineStore } from 'pinia'
import { api } from '../api'

// 分类树全局缓存：四个页面共享，分类变化后统一刷新
export const useCategoriesStore = defineStore('categories', {
  state: () => ({
    tree: [],
    loaded: false
  }),
  actions: {
    async load() {
      this.tree = await api.categories.list()
      this.loaded = true
    },
    async add(name, parentId, kind) {
      await api.categories.create({ name, parentId, kind })
      await this.load()
    },
    async rename(id, name) {
      await api.categories.update({ id, name })
      await this.load()
    },
    async remove(id) {
      await api.categories.remove(id)
      await this.load()
    }
  }
})

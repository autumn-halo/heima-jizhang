import { createRouter, createWebHashHistory } from 'vue-router'
import RecordExpense from '../views/RecordExpense.vue'
import Transactions from '../views/Transactions.vue'
import Stats from '../views/Stats.vue'
import Categories from '../views/Categories.vue'

// 使用 hash 模式：打包后以 file:// 方式加载页面时必须用 hash 路由
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'record', component: RecordExpense, meta: { title: '记一笔' } },
    {
      path: '/transactions',
      name: 'transactions',
      component: Transactions,
      meta: { title: '支出流水' }
    },
    { path: '/stats', name: 'stats', component: Stats, meta: { title: '统计图表' } },
    {
      path: '/categories',
      name: 'categories',
      component: Categories,
      meta: { title: '分类管理' }
    }
  ]
})

export default router

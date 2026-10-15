import { createRouter, createWebHashHistory } from 'vue-router'
import Home from '../views/Home.vue'
import RecordExpense from '../views/RecordExpense.vue'
import Accounts from '../views/Accounts.vue'
import Stats from '../views/Stats.vue'
import Categories from '../views/Categories.vue'

// 使用 hash 模式：打包后以 file:// 方式加载页面时必须用 hash 路由
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: Home, meta: { title: '首页' } },
    { path: '/record', name: 'record', component: RecordExpense, meta: { title: '记一笔' } },
    { path: '/accounts', name: 'accounts', component: Accounts, meta: { title: '账户管理' } },
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

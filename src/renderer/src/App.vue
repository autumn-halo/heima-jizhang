<script setup>
import { useRoute } from 'vue-router'
import { EditPen, List, DataAnalysis, Menu as MenuIcon } from '@element-plus/icons-vue'

const route = useRoute()
</script>

<template>
  <el-container class="app-layout">
    <!-- 左侧导航栏 -->
    <el-aside width="200px" class="app-aside">
      <div class="logo">
        <span class="logo-icon">🐴</span>
        <span class="logo-text">黑马记账</span>
      </div>
      <el-menu router :default-active="route.path" class="app-menu">
        <el-menu-item index="/">
          <el-icon><EditPen /></el-icon>
          <span>记一笔</span>
        </el-menu-item>
        <el-menu-item index="/transactions">
          <el-icon><List /></el-icon>
          <span>支出流水</span>
        </el-menu-item>
        <el-menu-item index="/stats">
          <el-icon><DataAnalysis /></el-icon>
          <span>统计图表</span>
        </el-menu-item>
        <el-menu-item index="/categories">
          <el-icon><MenuIcon /></el-icon>
          <span>分类管理</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- 右侧内容区 -->
    <el-main class="app-main">
      <router-view />
    </el-main>
  </el-container>
</template>

<style scoped>
.app-layout {
  height: 100%;
}

.app-aside {
  background: #ffffff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 16px 16px;
}

.logo-icon {
  font-size: 26px;
}

.logo-text {
  font-size: 18px;
  font-weight: 700;
  color: #303133;
}

.app-menu {
  border-right: none;
  flex: 1;
}

.app-main {
  padding: 20px;
  background: #f5f7fa;
}
</style>

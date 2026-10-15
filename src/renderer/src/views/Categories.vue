<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useCategoriesStore } from '../stores/categories'

const store = useCategoriesStore()

// 新增/重命名弹窗状态
const dialogVisible = ref(false)
const dialogTitle = ref('')
const dialogInput = ref('')
// 弹窗模式：create-major 新增一级 / create-sub 新增二级 / rename 重命名
let dialogMode = 'create-major'
let dialogTarget = null

// 小类标签配色循环（让界面更活泼）
const TAG_TYPES = ['primary', 'success', 'warning', 'danger', 'info']

onMounted(() => store.load())

function openCreateMajor() {
  dialogMode = 'create-major'
  dialogTarget = null
  dialogTitle.value = '新增一级分类'
  dialogInput.value = ''
  dialogVisible.value = true
}

function openCreateSub(major) {
  dialogMode = 'create-sub'
  dialogTarget = major
  dialogTitle.value = `给「${major.name}」添加小类`
  dialogInput.value = ''
  dialogVisible.value = true
}

function openRename(item) {
  dialogMode = 'rename'
  dialogTarget = item
  dialogTitle.value = `重命名「${item.name}」`
  dialogInput.value = item.name
  dialogVisible.value = true
}

async function submitDialog() {
  const name = dialogInput.value.trim()
  if (!name) {
    ElMessage.warning('名称不能为空')
    return
  }
  try {
    if (dialogMode === 'create-major') {
      await store.add(name, null)
    } else if (dialogMode === 'create-sub') {
      await store.add(name, dialogTarget.id)
    } else {
      await store.rename(dialogTarget.id, name)
    }
    dialogVisible.value = false
    ElMessage.success('保存成功')
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function removeCategory(item) {
  // 一级大类节点带 children 数组，二级小类不带
  const isMajor = Array.isArray(item.children)
  try {
    await ElMessageBox.confirm(
      isMajor
        ? `确定删除一级分类「${item.name}」吗？其下的所有小类会一并删除。`
        : `确定删除小类「${item.name}」吗？`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return // 用户点了取消
  }
  try {
    await store.remove(item.id)
    ElMessage.success('已删除')
  } catch (err) {
    ElMessage.error(err.message)
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">分类管理</h2>
      <el-button type="primary" :icon="Plus" @click="openCreateMajor">新增一级分类</el-button>
    </div>

    <el-alert
      class="tips"
      type="info"
      :closable="false"
      show-icon
      title="提示：点击小类标签可重命名，点标签上的 × 可删除；有支出记录的分类不允许删除"
    />

    <div v-if="!store.loaded" class="loading-wrap">
      <el-skeleton :rows="5" animated />
    </div>

    <template v-else>
      <el-card v-for="(major, mi) in store.tree" :key="major.id" shadow="never" class="major-card">
        <div class="major-row">
          <span class="major-name">{{ major.name }}</span>
          <div class="major-actions">
            <el-button size="small" @click="openCreateSub(major)">添加小类</el-button>
            <el-button size="small" text @click="openRename(major)">重命名</el-button>
            <el-button size="small" text type="danger" @click="removeCategory(major)">
              删除
            </el-button>
          </div>
        </div>
        <div class="sub-tags">
          <el-tag
            v-for="(sub, si) in major.children"
            :key="sub.id"
            :type="TAG_TYPES[(mi + si) % TAG_TYPES.length]"
            closable
            class="sub-tag"
            title="点击重命名"
            @click="openRename(sub)"
            @close="removeCategory(sub)"
          >
            {{ sub.name }}
          </el-tag>
          <span v-if="!major.children.length" class="no-sub">暂无小类</span>
        </div>
      </el-card>
    </template>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="360px">
      <el-input
        v-model="dialogInput"
        maxlength="20"
        show-word-limit
        placeholder="请输入分类名称"
        @keyup.enter="submitDialog"
      />
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitDialog">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-header .page-title {
  margin-bottom: 0;
}

.tips {
  margin-bottom: 16px;
}

.major-card {
  margin-bottom: 12px;
}

.major-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.major-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.major-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sub-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.sub-tag {
  cursor: pointer;
}

.no-sub {
  color: #a8abb2;
  font-size: 13px;
}
</style>

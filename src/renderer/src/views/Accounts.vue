<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useAccountsStore } from '../stores/accounts'

const store = useAccountsStore()

// 新增/重命名弹窗状态
const dialogVisible = ref(false)
const dialogTitle = ref('')
const dialogInput = ref('')
let dialogMode = 'create' // create=新增 / rename=重命名
let dialogTarget = null

const TAG_TYPES = ['success', 'primary', 'warning']

onMounted(() => store.load())

function openCreate() {
  dialogMode = 'create'
  dialogTarget = null
  dialogTitle.value = '新增账户'
  dialogInput.value = ''
  dialogVisible.value = true
}

function openRename(account) {
  dialogMode = 'rename'
  dialogTarget = account
  dialogTitle.value = `重命名「${account.name}」`
  dialogInput.value = account.name
  dialogVisible.value = true
}

async function submitDialog() {
  const name = dialogInput.value.trim()
  if (!name) {
    ElMessage.warning('名称不能为空')
    return
  }
  try {
    if (dialogMode === 'create') {
      await store.add(name)
    } else {
      await store.rename(dialogTarget.id, name)
    }
    dialogVisible.value = false
    ElMessage.success('保存成功')
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function removeAccount(account) {
  try {
    await ElMessageBox.confirm(
      `确定删除账户「${account.name}」吗？`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return // 用户取消
  }
  try {
    await store.remove(account.id)
    ElMessage.success('已删除')
  } catch (err) {
    ElMessage.error(err.message)
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">账户管理</h2>
      <el-button type="primary" :icon="Plus" @click="openCreate">新增账户</el-button>
    </div>

    <el-alert
      class="tips"
      type="info"
      :closable="false"
      show-icon
      title="提示：记账时选择账户来区分支付方式；有收支记录的账户不允许删除"
    />

    <div v-if="!store.loaded" class="loading-wrap">
      <el-skeleton :rows="3" animated />
    </div>

    <el-card v-else shadow="never">
      <div v-if="!store.list.length" class="empty-wrap">
        <el-empty description="暂无账户，点右上角新增" :image-size="80" />
      </div>
      <div v-for="(account, i) in store.list" :key="account.id" class="account-row">
        <el-tag :type="TAG_TYPES[i % TAG_TYPES.length]" size="small" class="account-tag">
          {{ account.name }}
        </el-tag>
        <span class="row-spacer"></span>
        <el-button size="small" text @click="openRename(account)">重命名</el-button>
        <el-button size="small" text type="danger" @click="removeAccount(account)">删除</el-button>
      </div>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="360px">
      <el-input
        v-model="dialogInput"
        maxlength="20"
        show-word-limit
        placeholder="请输入账户名称"
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

.account-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 4px;
  border-bottom: 1px solid #f0f2f5;
}

.account-row:last-child {
  border-bottom: none;
}

.account-tag {
  font-size: 14px;
  padding: 6px 12px;
  height: auto;
}

.row-spacer {
  flex: 1;
}

.empty-wrap {
  padding: 20px 0;
}
</style>

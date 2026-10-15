<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, ArrowRight } from '@element-plus/icons-vue'
import { useAccountsStore } from '../stores/accounts'

const store = useAccountsStore()

// 展开的一级账户 id 列表
const expandedIds = ref([])

// 弹窗状态：mode = create-top 新增一级账户 / create-sub 添加具体卡 / rename 重命名
const dialogVisible = ref(false)
const dialogTitle = ref('')
const dialogInput = ref('')
let dialogMode = 'create-top'
let dialogTarget = null

const TAG_TYPES = ['success', 'primary', 'warning']

onMounted(() => store.load())

function toggleExpand(id) {
  const i = expandedIds.value.indexOf(id)
  if (i >= 0) expandedIds.value.splice(i, 1)
  else expandedIds.value.push(id)
}

function openCreateTop() {
  dialogMode = 'create-top'
  dialogTarget = null
  dialogTitle.value = '新增账户'
  dialogInput.value = ''
  dialogVisible.value = true
}

function openCreateSub(parent) {
  dialogMode = 'create-sub'
  dialogTarget = parent
  dialogTitle.value = `给「${parent.name}」添加具体账户`
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
    if (dialogMode === 'create-top') {
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

async function removeAccount(account) {
  const isParent = Array.isArray(account.children)
  try {
    await ElMessageBox.confirm(
      isParent
        ? `确定删除账户「${account.name}」吗？其下的具体账户需先删除。`
        : `确定删除具体账户「${account.name}」吗？`,
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
      <el-button type="primary" :icon="Plus" @click="openCreateTop">新增账户</el-button>
    </div>

    <el-alert
      class="tips"
      type="info"
      :closable="false"
      show-icon
      title="提示：点账户行可展开/收起具体账户（如银行卡下的具体银行卡）；有收支记录或具体账户的账户不允许删除"
    />

    <div v-if="!store.loaded" class="loading-wrap">
      <el-skeleton :rows="3" animated />
    </div>

    <el-card v-else shadow="never">
      <div v-if="!store.tree.length" class="empty-wrap">
        <el-empty description="暂无账户，点右上角新增" :image-size="80" />
      </div>

      <template v-for="(account, i) in store.tree" :key="account.id">
        <!-- 一级账户行 -->
        <div class="account-row" :class="{ expanded: expandedIds.includes(account.id) }">
          <el-icon class="expand-icon" :class="{ open: expandedIds.includes(account.id) }" @click="toggleExpand(account.id)">
            <ArrowRight />
          </el-icon>
          <el-tag :type="TAG_TYPES[i % TAG_TYPES.length]" size="small" class="account-tag">
            {{ account.name }}
          </el-tag>
          <span class="row-spacer"></span>
          <el-button size="small" text @click="openCreateSub(account)">添加具体账户</el-button>
          <el-button size="small" text @click="openRename(account)">重命名</el-button>
          <el-button size="small" text type="danger" @click="removeAccount(account)">删除</el-button>
        </div>

        <!-- 展开的具体账户列表 -->
        <div v-if="expandedIds.includes(account.id)" class="sub-accounts">
          <div v-for="sub in account.children" :key="sub.id" class="sub-row">
            <el-tag type="info" size="small" class="sub-tag">{{ sub.name }}</el-tag>
            <span class="row-spacer"></span>
            <el-button size="small" text @click="openRename(sub)">重命名</el-button>
            <el-button size="small" text type="danger" @click="removeAccount(sub)">删除</el-button>
          </div>
          <div v-if="!account.children.length" class="no-sub">
            暂无具体账户，点「添加具体账户」添加（如：招商银行、建设银行）
          </div>
        </div>
      </template>
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
  cursor: default;
}

.expand-icon {
  cursor: pointer;
  color: #a8abb2;
  transition: transform 0.2s;
}

.expand-icon.open {
  transform: rotate(90deg);
}

.account-tag {
  font-size: 14px;
  padding: 6px 12px;
  height: auto;
}

.sub-accounts {
  background: #fafbfc;
  border-bottom: 1px solid #f0f2f5;
  padding: 2px 4px 6px 26px;
}

.sub-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
}

.sub-tag {
  font-size: 13px;
  padding: 4px 10px;
  height: auto;
}

.no-sub {
  font-size: 13px;
  color: #a8abb2;
  padding: 6px 4px;
}

.row-spacer {
  flex: 1;
}

.empty-wrap {
  padding: 20px 0;
}
</style>

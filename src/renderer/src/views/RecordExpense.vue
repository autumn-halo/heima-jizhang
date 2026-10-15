<script setup>
import { nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../api'
import { useCategoriesStore } from '../stores/categories'
import { useAccountsStore } from '../stores/accounts'
import { formatCents } from '../utils/format'
import CategoryCascader from '../components/CategoryCascader.vue'

const store = useCategoriesStore()
const accountsStore = useAccountsStore()

onMounted(async () => {
  if (!store.loaded) store.load()
  if (!accountsStore.loaded) await accountsStore.load()
  // 跟随用户习惯：延续上次记账的收支类型
  const lastType = localStorage.getItem('heima-last-type')
  if (lastType === 'income' || lastType === 'expense') {
    form.type = lastType
  }
  // 跟随用户习惯：延续上次使用的账户（不存在则回退到第一个账户）
  const lastId = Number(localStorage.getItem('heima-last-account-id'))
  if (accountsStore.list.some((a) => a.id === lastId)) {
    form.accountId = lastId
  } else if (accountsStore.list.length) {
    form.accountId = accountsStore.list[0].id
  }
  // 自动聚焦金额输入框
  nextTick(() => amountInputRef.value?.focus())
})

/** 今天的日期字符串 YYYY-MM-DD */
function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const form = reactive({
  type: 'expense', // expense=支出 / income=收入
  amountText: '', // 金额用字符串存输入内容，提交时再校验解析
  accountId: null, // 账户（v1.2 多账户）
  categoryPath: [], // 两级分类路径 [一级id, 二级id]
  date: todayStr(),
  note: ''
})
const saving = ref(false)
const amountInputRef = ref(null)

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/

// 切换收支类型时清空已选分类（分类体系不同）
function onTypeChange() {
  form.categoryPath = []
}

async function submit() {
  const text = form.amountText.trim()
  if (!text) {
    ElMessage.warning('请输入金额')
    return
  }
  if (!AMOUNT_RE.test(text)) {
    ElMessage.warning('金额格式不正确（最多两位小数）')
    return
  }
  const amount = parseFloat(text)
  if (amount <= 0) {
    ElMessage.warning('金额必须大于 0')
    return
  }
  if (amount > 9999999.99) {
    ElMessage.warning('金额不能超过 9999999.99 元')
    return
  }
  const categoryId = form.categoryPath[form.categoryPath.length - 1]
  if (!categoryId) {
    ElMessage.warning('请选择分类（需选到二级小类）')
    return
  }
  if (!form.date) {
    ElMessage.warning('请选择日期')
    return
  }

  saving.value = true
  try {
    // 金额转为"分"为单位的整数，避免小数误差
    const amountCents = Math.round(amount * 100)
    await api.expenses.create({
      amountCents,
      categoryId,
      date: form.date,
      note: form.note,
      type: form.type,
      accountId: form.accountId
    })
    // 记住本次使用的账户与收支类型（下次打开页面自动延续）
    if (form.accountId) {
      localStorage.setItem('heima-last-account-id', String(form.accountId))
    }
    localStorage.setItem('heima-last-type', form.type)
    ElMessage.success(
      form.type === 'income' ? `已记录收入 ${formatCents(amountCents)}` : `已记录 ${formatCents(amountCents)}`
    )
    // 重置表单，方便连续记账
    form.amountText = ''
    form.categoryPath = []
    form.note = ''
    form.date = todayStr()
    // 焦点回到金额输入框
    nextTick(() => amountInputRef.value?.focus())
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page">
    <h2 class="page-title">记一笔</h2>
    <el-card shadow="never" class="form-card">
      <el-form label-position="top">
        <!-- 收支类型切换 -->
        <el-form-item label="类型">
          <el-radio-group v-model="form.type" @change="onTypeChange">
            <el-radio-button value="expense">支出</el-radio-button>
            <el-radio-button value="income">收入</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="金额（元）">
          <el-input
            ref="amountInputRef"
            v-model="form.amountText"
            class="amount-input"
            placeholder="0.00"
            inputmode="decimal"
            @keyup.enter="submit"
          />
        </el-form-item>
        <el-form-item label="账户">
          <el-select v-model="form.accountId" placeholder="请选择账户" style="width: 100%">
            <el-option
              v-for="acc in accountsStore.list"
              :key="acc.id"
              :label="acc.name"
              :value="acc.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="分类">
          <CategoryCascader
            v-model="form.categoryPath"
            :kind="form.type"
            :placeholder="form.type === 'income' ? '请选择收入分类（选到二级小类）' : '请选择分类（选到二级小类）'"
          />
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="form.date"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注（选填）">
          <el-input
            v-model="form.note"
            maxlength="100"
            show-word-limit
            placeholder="例如：和朋友聚餐"
            @keyup.enter="submit"
          />
        </el-form-item>
        <el-button type="primary" size="large" class="save-btn" :loading="saving" @click="submit">
          保存
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.form-card {
  max-width: 520px;
}

.amount-input :deep(input) {
  font-size: 30px;
  font-weight: 600;
  text-align: center;
  height: 56px;
}

.save-btn {
  width: 100%;
  margin-top: 8px;
}
</style>

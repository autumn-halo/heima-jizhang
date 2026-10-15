<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import { formatCents, formatCentsNoSymbol } from '../utils/format'
import { useCategoriesStore } from '../stores/categories'
import CategoryCascader from '../components/CategoryCascader.vue'

const store = useCategoriesStore()

// ---------------- 本月汇总 ----------------
function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const summary = ref(null)

async function loadSummary() {
  try {
    summary.value = await api.expenses.summary({ month: currentMonth() })
  } catch (err) {
    ElMessage.error(err.message)
  }
}

const monthLabel = computed(() => {
  const [y, m] = currentMonth().split('-')
  return `${y} 年 ${Number(m)} 月`
})
const incomeText = computed(() => formatCents(summary.value?.incomeCents ?? 0))
const expenseText = computed(() => formatCents(summary.value?.totalCents ?? 0))
const balanceCents = computed(
  () => (summary.value?.incomeCents ?? 0) - (summary.value?.totalCents ?? 0)
)
const balanceText = computed(() => {
  const v = balanceCents.value
  return (v < 0 ? '-' : '') + formatCents(Math.abs(v))
})

// ---------------- 收支明细（按月折叠、按日分组） ----------------
const typeFilter = ref('') // '' = 全部 / income = 收入 / expense = 支出
const list = ref([]) // 全部明细记录（一次取出，前端分组）
const loading = ref(false)
const openMonths = ref([]) // 展开的月份（默认展开最新一个月）

async function loadList() {
  loading.value = true
  try {
    const data = await api.expenses.list({
      type: typeFilter.value || undefined,
      page: 1,
      pageSize: 10000 // 一次取出全部记录，用于按月分组
    })
    list.value = data.items
    // 首次加载时默认展开最新一个月
    if (!openMonths.value.length && data.items.length) {
      openMonths.value = [data.items[0].expense_date.slice(0, 7)]
    }
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

watch(typeFilter, loadList)

// 按月分组（服务器已按日期倒序返回，保持顺序即可）
const grouped = computed(() => {
  const monthMap = new Map()
  for (const row of list.value) {
    const m = row.expense_date.slice(0, 7)
    if (!monthMap.has(m)) monthMap.set(m, [])
    monthMap.get(m).push(row)
  }
  return [...monthMap.entries()].map(([month, rows]) => {
    const expenseCents = rows
      .filter((r) => r.type === 'expense')
      .reduce((s, r) => s + r.amount_cents, 0)
    const incomeCents = rows
      .filter((r) => r.type === 'income')
      .reduce((s, r) => s + r.amount_cents, 0)
    const [y, mo] = month.split('-')
    // 月内按日分组
    const dayMap = new Map()
    for (const row of rows) {
      const d = row.expense_date
      if (!dayMap.has(d)) dayMap.set(d, [])
      dayMap.get(d).push(row)
    }
    const days = [...dayMap.entries()].map(([date, dayRows]) => {
      const [, mo2, dd] = date.split('-')
      return { date, label: `${Number(mo2)}月${Number(dd)}日`, rows: dayRows }
    })
    return { month, monthLabel: `${y}年${Number(mo)}月`, expenseCents, incomeCents, days }
  })
})

// ---------------- 编辑 ----------------
const editVisible = ref(false)
const editSaving = ref(false)
const editForm = reactive({
  id: null,
  type: 'expense',
  amountText: '',
  categoryPath: [],
  date: '',
  note: ''
})

function openEdit(row) {
  editForm.id = row.id
  editForm.type = row.type
  editForm.amountText = (row.amount_cents / 100).toFixed(2)
  editForm.categoryPath = [row.major_id, row.sub_id]
  editForm.date = row.expense_date
  editForm.note = row.note
  editVisible.value = true
}

function onEditTypeChange() {
  editForm.categoryPath = []
}

async function submitEdit() {
  const text = editForm.amountText.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    ElMessage.warning('金额格式不正确（最多两位小数）')
    return
  }
  const amount = parseFloat(text)
  if (amount <= 0 || amount > 9999999.99) {
    ElMessage.warning('金额必须是大于 0 且不超过 9999999.99 元')
    return
  }
  const categoryId = editForm.categoryPath[editForm.categoryPath.length - 1]
  if (!categoryId) {
    ElMessage.warning('请选择分类（需选到二级小类）')
    return
  }
  editSaving.value = true
  try {
    await api.expenses.update({
      id: editForm.id,
      amountCents: Math.round(amount * 100),
      categoryId,
      date: editForm.date,
      note: editForm.note,
      type: editForm.type
    })
    editVisible.value = false
    ElMessage.success('修改成功')
    loadSummary()
    loadList()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    editSaving.value = false
  }
}

// ---------------- 删除 ----------------
async function removeRow(row) {
  try {
    await ElMessageBox.confirm(
      `确定删除这笔记录吗？\n${row.expense_date} ${row.major_name}/${row.sub_name} ${formatCents(row.amount_cents)}`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return // 用户取消
  }
  try {
    await api.expenses.remove(row.id)
    ElMessage.success('已删除')
    loadSummary()
    loadList()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

onMounted(() => {
  if (!store.loaded) store.load()
  loadSummary()
  loadList()
})
</script>

<template>
  <div class="page">
    <h2 class="page-title">首页</h2>

    <!-- 本月收支卡片 -->
    <div class="stat-cards">
      <el-card shadow="never" class="stat-card">
        <div class="stat-label">{{ monthLabel }} 收入</div>
        <div class="stat-value income">{{ incomeText }}</div>
      </el-card>
      <el-card shadow="never" class="stat-card">
        <div class="stat-label">{{ monthLabel }} 支出</div>
        <div class="stat-value">{{ expenseText }}</div>
      </el-card>
      <el-card shadow="never" class="stat-card">
        <div class="stat-label">{{ monthLabel }} 结余</div>
        <div class="stat-value" :class="balanceCents >= 0 ? 'income' : 'negative'">
          {{ balanceText }}
        </div>
      </el-card>
    </div>

    <!-- 收支明细（按月折叠、按日分组） -->
    <el-card shadow="never">
      <div class="list-header">
        <div class="list-title">收支明细</div>
        <el-radio-group v-model="typeFilter" size="small">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="income">收入</el-radio-button>
          <el-radio-button value="expense">支出</el-radio-button>
        </el-radio-group>
      </div>

      <div v-loading="loading">
        <el-empty
          v-if="!list.length"
          description="暂无收支记录，去记一笔吧"
          :image-size="80"
        />
        <el-collapse v-else v-model="openMonths" class="month-collapse">
          <el-collapse-item v-for="g in grouped" :key="g.month" :name="g.month">
            <template #title>
              <div class="month-title">
                <span class="month-name">{{ g.monthLabel }}</span>
                <span class="month-sum">
                  支出 {{ formatCentsNoSymbol(g.expenseCents) }} · 收入
                  {{ formatCentsNoSymbol(g.incomeCents) }}
                </span>
              </div>
            </template>

            <div v-for="day in g.days" :key="day.date" class="day-group">
              <div class="day-header">{{ day.label }}</div>
              <div v-for="row in day.rows" :key="row.id" class="record-row">
                <el-tag
                  :type="row.type === 'income' ? 'success' : 'info'"
                  size="small"
                  class="row-tag"
                >
                  {{ row.type === 'income' ? '收入' : '支出' }}
                </el-tag>
                <span class="row-cat">{{ row.major_name }} / {{ row.sub_name }}</span>
                <span class="row-note">{{ row.note }}</span>
                <span class="row-spacer"></span>
                <span class="row-amount" :class="row.type === 'income' ? 'income' : ''">
                  {{ row.type === 'income' ? '+' : '-' }}{{ formatCentsNoSymbol(row.amount_cents) }}
                </span>
                <el-button size="small" text type="primary" @click="openEdit(row)">
                  编辑
                </el-button>
                <el-button size="small" text type="danger" @click="removeRow(row)">
                  删除
                </el-button>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </el-card>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="editVisible" title="编辑记录" width="420px">
      <el-form label-position="top">
        <el-form-item label="类型">
          <el-radio-group v-model="editForm.type" @change="onEditTypeChange">
            <el-radio-button value="expense">支出</el-radio-button>
            <el-radio-button value="income">收入</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="金额（元）">
          <el-input
            v-model="editForm.amountText"
            inputmode="decimal"
            placeholder="0.00"
            @keyup.enter="submitEdit"
          />
        </el-form-item>
        <el-form-item label="分类">
          <CategoryCascader
            v-model="editForm.categoryPath"
            :kind="editForm.type"
            :placeholder="editForm.type === 'income' ? '请选择收入分类' : '请选择支出分类'"
          />
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="editForm.date"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="editForm.note" maxlength="100" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.stat-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.stat-label {
  font-size: 13px;
  color: #52514e;
  margin-bottom: 6px;
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: #0b0b0b;
  font-variant-numeric: tabular-nums;
}

.stat-value.income {
  color: #008300;
}

.stat-value.negative {
  color: #d03b3b;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.list-title {
  font-size: 15px;
  font-weight: 600;
  color: #0b0b0b;
}

.month-collapse {
  --el-collapse-border-color: #e4e7ed;
}

.month-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  padding-right: 8px;
}

.month-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.month-sum {
  font-size: 13px;
  color: #898781;
  font-variant-numeric: tabular-nums;
}

.day-group {
  padding: 2px 0 6px;
}

.day-header {
  font-size: 13px;
  font-weight: 600;
  color: #52514e;
  padding: 8px 4px 6px;
  border-bottom: 1px dashed #e4e7ed;
  margin-bottom: 4px;
}

.record-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 4px;
  border-radius: 6px;
}

.record-row:hover {
  background: #f5f7fa;
}

.row-tag {
  flex-shrink: 0;
}

.row-cat {
  font-size: 14px;
  color: #303133;
  flex-shrink: 0;
}

.row-note {
  font-size: 13px;
  color: #a8abb2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}

.row-spacer {
  flex: 1;
}

.row-amount {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.row-amount.income {
  color: #008300;
}

@media (max-width: 960px) {
  .stat-cards {
    grid-template-columns: 1fr;
  }
}
</style>

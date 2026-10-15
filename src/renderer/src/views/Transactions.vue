<script setup>
import { onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import { formatCents } from '../utils/format'
import CategoryCascader from '../components/CategoryCascader.vue'

// 筛选条件
const filters = reactive({
  month: '', // YYYY-MM
  categoryPath: [], // 分类路径 [一级id, 二级id]，选一级则筛其全部二级
  keyword: ''
})

const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)

async function loadList() {
  loading.value = true
  try {
    const categoryId = filters.categoryPath[filters.categoryPath.length - 1]
    const data = await api.expenses.list({
      month: filters.month || undefined,
      categoryId: categoryId || undefined,
      keyword: filters.keyword.trim() || undefined,
      page: page.value,
      pageSize
    })
    list.value = data.items
    total.value = data.total
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

onMounted(loadList)

// 月份、分类变化时回到第一页重新查询
watch(
  () => [filters.month, filters.categoryPath],
  () => {
    page.value = 1
    loadList()
  }
)

// 关键词搜索做防抖（停止输入 400ms 后再查）
let keywordTimer = null
watch(
  () => filters.keyword,
  () => {
    clearTimeout(keywordTimer)
    keywordTimer = setTimeout(() => {
      page.value = 1
      loadList()
    }, 400)
  }
)

// ---------------- 编辑 ----------------
const editVisible = ref(false)
const editSaving = ref(false)
const editForm = reactive({ id: null, amountText: '', categoryPath: [], date: '', note: '' })

function openEdit(row) {
  editForm.id = row.id
  editForm.amountText = (row.amount_cents / 100).toFixed(2)
  editForm.categoryPath = [row.major_id, row.sub_id]
  editForm.date = row.expense_date
  editForm.note = row.note
  editVisible.value = true
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
      note: editForm.note
    })
    editVisible.value = false
    ElMessage.success('修改成功')
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
    // 若当前页删空则回退一页
    if (list.value.length === 1 && page.value > 1) page.value -= 1
    loadList()
  } catch (err) {
    ElMessage.error(err.message)
  }
}
</script>

<template>
  <div class="page">
    <h2 class="page-title">支出流水</h2>

    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <el-date-picker
          v-model="filters.month"
          type="month"
          value-format="YYYY-MM"
          placeholder="按月份筛选"
          clearable
          style="width: 160px"
        />
        <CategoryCascader
          v-model="filters.categoryPath"
          placeholder="按分类筛选"
          width="240px"
          :check-strictly="true"
        />
        <el-input
          v-model="filters.keyword"
          placeholder="搜索备注关键词"
          clearable
          style="width: 220px"
        />
      </div>
    </el-card>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column prop="expense_date" label="日期" width="120" />
        <el-table-column prop="major_name" label="一级分类" width="110" />
        <el-table-column prop="sub_name" label="二级分类" width="110" />
        <el-table-column label="金额" width="140" align="right">
          <template #default="{ row }">
            <span class="amount-cell">{{ formatCents(row.amount_cents) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="note" label="备注" min-width="180" show-overflow-tooltip />
        <el-table-column label="操作" width="130" align="center">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" text type="danger" @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无支出记录，去记一笔吧" :image-size="80" />
        </template>
      </el-table>

      <div class="pager-wrap" v-if="total > pageSize">
        <el-pagination
          v-model:current-page="page"
          layout="total, prev, pager, next"
          :total="total"
          :page-size="pageSize"
          @current-change="loadList"
        />
      </div>
    </el-card>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="editVisible" title="编辑支出" width="420px">
      <el-form label-position="top">
        <el-form-item label="金额（元）">
          <el-input v-model="editForm.amountText" inputmode="decimal" @keyup.enter="submitEdit" />
        </el-form-item>
        <el-form-item label="分类">
          <CategoryCascader v-model="editForm.categoryPath" />
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
.filter-card {
  margin-bottom: 12px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.amount-cell {
  font-weight: 600;
  color: #303133;
}

.pager-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>

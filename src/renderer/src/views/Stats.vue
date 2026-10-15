<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart, BarChart } from 'echarts/charts'
import { TooltipComponent, GridComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { api } from '../api'
import { formatCents } from '../utils/format'

use([CanvasRenderer, PieChart, BarChart, TooltipComponent, GridComponent])

// ---------------- 图表配色（浅色主题，色板已通过色盲/对比度校验） ----------------
// 前 8 个一级大类固定对应 8 个色板槽位（顺序固定、不随金额排名变化，
// 保证同一分类在不同月份颜色一致）；其余一级大类统一并入「其他」（灰）
const MAJOR_COLOR_SLOTS = new Map([
  ['餐饮饮食', '#2a78d6'],
  ['交通出行', '#eb6834'],
  ['购物消费', '#1baf7a'],
  ['居住住房', '#eda100'],
  ['休闲娱乐', '#e87ba4'],
  ['医疗健康', '#008300'],
  ['学习教育', '#6250d6'],
  ['人情往来', '#e34948']
])
const OTHER_COLOR = '#c3c2b7'
// 趋势柱状图：单系列顺序蓝
const TREND_COLOR = '#2a78d6'
// 图表墨色（文字/坐标轴/网格线）
const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781', grid: '#e1e0d9' }

// ---------------- 数据加载 ----------------
function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const month = ref(currentMonth())
const summary = ref(null)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    summary.value = await api.expenses.summary({ month: month.value })
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(month, load)

// ---------------- 环形图：一级分类占比 ----------------
const pieOption = computed(() => {
  const pie = summary.value?.pie ?? []
  const data = []
  let otherCents = 0
  for (const item of pie) {
    const color = MAJOR_COLOR_SLOTS.get(item.name)
    if (color) {
      data.push({ name: item.name, value: item.totalCents, itemStyle: { color } })
    } else {
      otherCents += item.totalCents
    }
  }
  if (otherCents > 0) {
    data.push({ name: '其他', value: otherCents, itemStyle: { color: OTHER_COLOR } })
  }
  return {
    tooltip: {
      trigger: 'item',
      formatter: (p) => `${p.name}<br/>${formatCents(p.value)}（${p.percent}%）`
    },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '50%'],
        // 扇区之间留 2px 表面间隙
        itemStyle: { borderColor: '#fcfcfb', borderWidth: 2 },
        // 每个扇区直接标注名称+百分比（对低对比度颜色的可访问性要求）
        label: { formatter: '{b} {d}%', color: INK.secondary, fontSize: 12 },
        labelLine: { lineStyle: { color: INK.muted } },
        emphasis: {
          itemStyle: { shadowBlur: 8, shadowColor: 'rgba(11, 11, 11, 0.15)' }
        },
        data
      }
    ]
  }
})

// ---------------- 柱状图：近 6 个月趋势 ----------------
const trendOption = computed(() => {
  const trend = summary.value?.trend ?? []
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const p = params[0]
        return `${p.name}<br/>${formatCents(p.value)}`
      }
    },
    grid: { left: 10, right: 10, top: 30, bottom: 5, containLabel: true },
    xAxis: {
      type: 'category',
      data: trend.map((t) => t.month.slice(5) + '月'),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: INK.muted } },
      axisLabel: { color: INK.secondary }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: INK.muted,
        formatter: (v) => (v >= 10000 ? `${Math.round(v / 10000)}万` : v >= 1000 ? `${Math.round(v / 1000)}k` : v)
      },
      splitLine: { lineStyle: { color: INK.grid } }
    },
    series: [
      {
        type: 'bar',
        data: trend.map((t) => t.totalCents / 100),
        itemStyle: { color: TREND_COLOR, borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 44,
        label: {
          show: true,
          position: 'top',
          color: INK.secondary,
          fontSize: 11,
          formatter: (p) => formatCents(Math.round(p.value * 100))
        }
      }
    ]
  }
})

const totalText = computed(() => formatCents(summary.value?.totalCents ?? 0))
const avgText = computed(() => formatCents(summary.value?.avgCents ?? 0))
const countText = computed(() => `${summary.value?.count ?? 0} 笔`)
const isEmpty = computed(() => !summary.value || summary.value.totalCents === 0)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">统计图表</h2>
      <el-date-picker
        v-model="month"
        type="month"
        value-format="YYYY-MM"
        placeholder="选择月份"
        style="width: 150px"
      />
    </div>

    <!-- 统计卡片 -->
    <div class="stat-cards">
      <el-card shadow="never" class="stat-card">
        <div class="stat-label">{{ month }} 总支出</div>
        <div class="stat-value">{{ totalText }}</div>
      </el-card>
      <el-card shadow="never" class="stat-card">
        <div class="stat-label">日均支出</div>
        <div class="stat-value">{{ avgText }}</div>
      </el-card>
      <el-card shadow="never" class="stat-card">
        <div class="stat-label">支出笔数</div>
        <div class="stat-value">{{ countText }}</div>
      </el-card>
    </div>

    <div v-loading="loading" class="charts">
      <el-card shadow="never" class="chart-card">
        <div class="chart-title">{{ month }} 一级分类占比</div>
        <el-empty v-if="isEmpty" description="本月暂无支出数据" :image-size="80" />
        <VChart v-else :option="pieOption" autoresize class="chart" />
      </el-card>

      <el-card shadow="never" class="chart-card">
        <div class="chart-title">近 6 个月支出趋势</div>
        <el-empty v-if="isEmpty" description="暂无支出数据" :image-size="80" />
        <VChart v-else :option="trendOption" autoresize class="chart" />
      </el-card>
    </div>
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

.charts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.chart-card {
  min-height: 380px;
}

.chart-title {
  font-size: 15px;
  font-weight: 600;
  color: #0b0b0b;
  margin-bottom: 8px;
}

.chart {
  height: 330px;
}

@media (max-width: 960px) {
  .stat-cards,
  .charts {
    grid-template-columns: 1fr;
  }
}
</style>

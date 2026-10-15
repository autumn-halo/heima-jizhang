<script setup>
import { computed, onMounted } from 'vue'
import { useCategoriesStore } from '../stores/categories'

// 两级分类级联选择器（记一笔、首页编辑共用）
// v-model 绑定的是路径数组 [一级id, 二级id]
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  placeholder: { type: String, default: '请选择分类（选到二级小类）' },
  clearable: { type: Boolean, default: true },
  width: { type: String, default: '100%' },
  // true 时任意层级都可选中
  checkStrictly: { type: Boolean, default: false },
  // 只显示指定收支类型的分类：expense=支出分类 / income=收入分类 / all=全部
  kind: { type: String, default: 'all' }
})
const emit = defineEmits(['update:modelValue'])

const store = useCategoriesStore()
onMounted(() => {
  if (!store.loaded) store.load()
})

// 按收支类型过滤分类树
const options = computed(() => {
  if (props.kind === 'all') return store.tree
  return store.tree.filter((m) => m.kind === props.kind)
})

// 注意：checkStrictly 必须放在 props 配置对象里（el-cascader 没有顶层 checkStrictly 属性）
const cascaderProps = computed(() => ({
  value: 'id',
  label: 'name',
  children: 'children',
  checkStrictly: props.checkStrictly,
  // 没有二级小类的一级大类不可选中
  disabled: (data) => Array.isArray(data.children) && data.children.length === 0
}))
</script>

<template>
  <el-cascader
    :model-value="modelValue"
    :options="options"
    :props="cascaderProps"
    :placeholder="placeholder"
    :clearable="clearable"
    :style="{ width }"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

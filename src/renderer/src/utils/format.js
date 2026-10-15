/** 把以"分"为单位的整数金额格式化为带千分位的显示字符串，如 123456 → ¥1,234.56 */
export function formatCents(cents) {
  const yuan = (cents / 100).toFixed(2)
  const [int, dec] = yuan.split('.')
  return '¥' + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec
}

/** 同上，但不带货币符号：123456 → 1,234.56（收支明细列表用） */
export function formatCentsNoSymbol(cents) {
  return formatCents(cents).slice(1)
}

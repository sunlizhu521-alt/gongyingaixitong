const WAREHOUSE_FLOW_GROUPS = [
  {
    id: 'forward',
    label: '正向',
    usesFlowArrows: true,
    series: [
      { warehouseType: '销售供应商仓', aliases: [] },
      { warehouseType: '销售海上在途仓', aliases: ['销售海上在途'] },
      { warehouseType: '销售出库仓', aliases: [] }
    ]
  },
  {
    id: 'reverse',
    label: '逆向',
    usesFlowArrows: false,
    series: [
      { warehouseType: '销售退货拆检仓', aliases: [] }
    ]
  },
  {
    id: 'factory',
    label: '工厂',
    usesFlowArrows: true,
    series: [
      { warehouseType: '生产材料仓', aliases: ['生成材料仓'] },
      { warehouseType: '生产成品仓', aliases: [] }
    ]
  },
  {
    id: 'other',
    label: '其他',
    usesFlowArrows: false,
    series: [
      { warehouseType: '系统集成仓', aliases: [] },
      { warehouseType: '样品/展厅仓', aliases: ['样品展厅仓'] },
      { warehouseType: '销售售后配件仓', aliases: [] },
      { warehouseType: '未分类仓库类型', aliases: [], dashed: true }
    ]
  }
];

const WAREHOUSE_TYPE_LOOKUP = new Map();
for (const group of WAREHOUSE_FLOW_GROUPS) {
  for (const definition of group.series) {
    for (const name of [definition.warehouseType, ...definition.aliases]) {
      WAREHOUSE_TYPE_LOOKUP.set(normalizeWarehouseType(name), {
        ...definition,
        groupId: group.id
      });
    }
  }
}

export function buildWarehouseFlowTrend(rows = [], mode = 'amount', availableMonths = []) {
  const months = [...new Set([
    ...availableMonths,
    ...rows.map((row) => row.month)
  ].filter(Boolean))].sort();
  const valuesByType = new Map();
  const unknownTypes = new Set();

  for (const row of rows) {
    const rawWarehouseType = normalizeWarehouseType(row.warehouseType) || '未分类仓库类型';
    const definition = WAREHOUSE_TYPE_LOOKUP.get(rawWarehouseType);
    const warehouseType = definition?.warehouseType || rawWarehouseType;
    if (!definition) unknownTypes.add(warehouseType);
    const valuesByMonth = valuesByType.get(warehouseType) || new Map();
    const currentValue = valuesByMonth.get(row.month) || 0;
    valuesByMonth.set(row.month, currentValue + (Number(row[mode]) || 0));
    valuesByType.set(warehouseType, valuesByMonth);
  }

  const groups = WAREHOUSE_FLOW_GROUPS.map((group) => {
    const definitions = group.series.map((definition) => ({ ...definition }));
    if (group.id === 'other') {
      definitions.push(...[...unknownTypes]
        .filter((warehouseType) => warehouseType !== '未分类仓库类型')
        .sort((a, b) => a.localeCompare(b, 'zh-CN'))
        .map((warehouseType) => ({ warehouseType, aliases: [], dashed: true, unknown: true })));
    }
    return {
      id: group.id,
      label: group.label,
      usesFlowArrows: group.usesFlowArrows,
      series: definitions.map((definition) => buildWarehouseSeries(
        definition,
        months,
        valuesByType.get(definition.warehouseType) || new Map()
      ))
    };
  });

  return { months, groups };
}

export function buildForwardMonthlyFlowRows(groups = [], months = []) {
  const forwardGroup = groups.find((group) => group.id === 'forward');
  const series = forwardGroup?.series || [];
  return months.map((month, monthIndex) => ({
    month,
    values: series.map((item) => ({
      warehouseType: item.warehouseType,
      ...(item.values[monthIndex] || {
        month,
        value: 0,
        previousValue: 0,
        mom: null
      })
    }))
  }));
}

function buildWarehouseSeries(definition, months, valuesByMonth) {
  const values = months.map((month, monthIndex) => {
    const value = valuesByMonth.get(month) || 0;
    const previousValue = monthIndex > 0 ? valuesByMonth.get(months[monthIndex - 1]) || 0 : 0;
    return {
      month,
      value,
      previousValue,
      mom: monthIndex > 0 ? monthOverMonth(value, previousValue) : null
    };
  });
  const firstValue = values[0]?.value || 0;
  const latestValue = values.at(-1)?.value || 0;
  const trendDirection = firstValue === 0 && latestValue > 0
    ? 'new'
    : compareTrend(firstValue, latestValue);
  return {
    warehouseType: definition.warehouseType,
    dashed: Boolean(definition.dashed),
    unknown: Boolean(definition.unknown),
    values,
    trendDirection,
    trendPercent: trendDirection === 'new' ? null : percentageChange(firstValue, latestValue),
    firstValue,
    latestValue,
    minValue: Math.min(...values.map((item) => item.value), 0),
    maxValue: Math.max(...values.map((item) => item.value), 0)
  };
}

function normalizeWarehouseType(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

function monthOverMonth(currentValue, previousValue) {
  const current = Number(currentValue);
  const previous = Number(previousValue);
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function compareTrend(firstValue, latestValue) {
  const first = Number(firstValue) || 0;
  const latest = Number(latestValue) || 0;
  const tolerance = Math.max(Math.abs(first), Math.abs(latest), 1) * 1e-9;
  if (Math.abs(latest - first) <= tolerance) return 'flat';
  return latest > first ? 'up' : 'down';
}

function percentageChange(firstValue, latestValue) {
  const first = Number(firstValue);
  const latest = Number(latestValue);
  if (!Number.isFinite(first) || !Number.isFinite(latest) || first === 0) return null;
  return ((latest - first) / Math.abs(first)) * 100;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { getSalesRows } from '../src/components/kcfxUtils.js';
import { isStoreMappingHeaderSet, isStoreMappingRecordValid, pickStoreMappingSheetName, STORE_MAPPING_SHEET_HINT } from '../shared/kcfxStoreMapping.js';

function rowFrom(headers, values) {
  return Object.assign({ __cells: values }, Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

test('store mapping contract requires customer and daily short-name headers', () => {
  assert.equal(STORE_MAPPING_SHEET_HINT, '店铺名称汇总');
  assert.equal(isStoreMappingHeaderSet(['序号', '金蝶名称', '领星名称', '日常汇报沟通简称']), true);
  assert.equal(isStoreMappingHeaderSet(['销售单据类型', '用途']), false);
  assert.equal(isStoreMappingRecordValid({ parseDiagnostics: { headerFirst12: ['客户名称', '店铺简称'] } }), true);
  assert.equal(pickStoreMappingSheetName(['销售订单', '店铺名称汇总', '库存调拨']), '店铺名称汇总');
});

test('sales rows obtain store short names only by matching customer names', () => {
  const salesHeaders = ['销售日期', '客户名称', '物料编码', '应收数量'];
  const storeHeaders = ['序号', '客户名称', '领星名称', '日常汇报沟通简称'];
  const records = {
    'sales-data': {
      rows: [
        rowFrom(salesHeaders, ['2026-06-01', '客户全称A', '1001', 5]),
        rowFrom(salesHeaders, ['2026-06-01', '未维护客户B', '1002', 3])
      ]
    },
    'dim-customer-material': {
      rows: [rowFrom(storeHeaders, [1, '客户全称A', '领星店铺A', '日常简称A'])]
    }
  };

  const rows = getSalesRows(records);
  assert.deepEqual(rows.map(({ customer, storeShortName, storeMatchStatus }) => ({ customer, storeShortName, storeMatchStatus })), [
    { customer: '客户全称A', storeShortName: '日常简称A', storeMatchStatus: '已匹配' },
    { customer: '未维护客户B', storeShortName: '', storeMatchStatus: '未匹配' }
  ]);
});

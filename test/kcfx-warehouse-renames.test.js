import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalKcfxWarehouseName,
  KCFX_WAREHOUSE_RENAMES
} from '../shared/kcfxErrorWarehouseExclusions.js';

test('英国东荣仓旧名称统一映射到 CV5 新名称', () => {
  for (const [oldName, newName] of KCFX_WAREHOUSE_RENAMES) {
    assert.equal(canonicalKcfxWarehouseName(oldName), newName);
    assert.equal(canonicalKcfxWarehouseName(newName), newName);
  }
});

test('非改名仓库保持原名称', () => {
  assert.equal(canonicalKcfxWarehouseName('正常仓'), '正常仓');
});

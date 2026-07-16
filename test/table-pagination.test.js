import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TABLE_PAGE_SIZE, visiblePageNumbers } from '../shared/tablePagination.js';

test('all shared tables default to twenty rows per page', () => {
  assert.equal(DEFAULT_TABLE_PAGE_SIZE, 20);
});

test('table pagination keeps a compact page window around the current page', () => {
  assert.deepEqual(visiblePageNumbers(1, 10), [1, 2, 3, 4, 5]);
  assert.deepEqual(visiblePageNumbers(5, 10), [3, 4, 5, 6, 7]);
  assert.deepEqual(visiblePageNumbers(10, 10), [6, 7, 8, 9, 10]);
});

test('table pagination shows all page numbers when total pages are below the limit', () => {
  assert.deepEqual(visiblePageNumbers(1, 1), [1]);
  assert.deepEqual(visiblePageNumbers(2, 3), [1, 2, 3]);
});

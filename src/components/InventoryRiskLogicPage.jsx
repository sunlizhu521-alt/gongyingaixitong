import React from 'react';
import { KcfxPageShell, SimpleTable } from './KcfxCommon.jsx';

const SOURCE_ROWS = [
  { source: '最近关账库存', field: '物料编码、仓库名称、库存数量', purpose: '计算国内/海外在库及海外在途' },
  { source: '销售预测文件', field: '事业部、物料编码、未来月份预测数量', purpose: '计算未来N个月预测月均销量' },
  { source: '销售数据文件', field: '月份、物料编码、出库数量', purpose: '计算最近N个月历史平均月销量，仅作对照' },
  { source: '采购订单文件', field: '关闭状态、事业部、物料编码、剩余入库数量', purpose: '计算待交付数量' },
  { source: '商品分类维表', field: '物料编码、SKU、销售产品线', purpose: '补充展示属性，物料编码始终是计算主键' },
  { source: '仓库维表', field: '仓库名称、一级仓库分类、二级仓库分类', purpose: '识别排除仓、海外在途及仓库位置' }
];

const THRESHOLD_ROWS = [
  { standard: '在途周转天数', region: '海外', warning: '120天', severe: '180天' },
  { standard: '在途周转天数', region: '国内', warning: '38天', severe: '83天' },
  { standard: '全链覆盖天数', region: '海外', warning: '165天', severe: '200天' },
  { standard: '全链覆盖天数', region: '国内', warning: '83天', severe: '120天' }
];

export default function InventoryRiskLogicPage({ onBack }) {
  return (
    <KcfxPageShell
      title="库存风险计算逻辑"
      status="风险结果按物料编码和国内/海外库存段独立计算"
      actions={<button type="button" className="ghost" onClick={onBack}>返回库存风险分析</button>}
      className="inventory-risk-logic-page"
    >
      <section className="kcfx-panel risk-logic-section">
        <h3>数据来源与取数字段</h3>
        <SimpleTable
          rows={SOURCE_ROWS}
          paginated={false}
          columns={[
            { key: 'source', label: '数据来源' },
            { key: 'field', label: '取数字段' },
            { key: 'purpose', label: '用途' }
          ]}
        />
      </section>

      <section className="kcfx-panel risk-logic-section">
        <h3>库存归类</h3>
        <div className="risk-logic-rules">
          <p><strong>海外在途：</strong>仓库维表一级仓库分类为“销售海上在途仓”。</p>
          <p><strong>国内/海外在库：</strong>通过仓库名称匹配仓库维表，只读取二级仓库分类或仓库位置判断地域。</p>
          <p><strong>排除仓库：</strong>系统集成仓、样品/展厅仓、销售供应商仓不参与风险计算。</p>
          <p><strong>未确定位置：</strong>仓库位置为空或无法判断地域时进入数据诊断，不参与采购动作。</p>
          <p><strong>地域分配：</strong>国内事业部、销售部-工厂归国内，其他非空事业部归海外。</p>
        </div>
      </section>

      <section className="kcfx-panel risk-logic-section">
        <h3>计算公式</h3>
        <div className="risk-formula-grid">
          <div>
            <span>预测月均销量</span>
            <strong>未来 N 个月销售预测合计 ÷ N</strong>
          </div>
          <div>
            <span>历史月均销量</span>
            <strong>最近 N 个月真实、非内部、成品出库数量合计 ÷ N</strong>
          </div>
          <div>
            <span>在途周转天数</span>
            <strong>（在库数量 + 在途数量）÷（预测月均销量 ÷ 30）</strong>
          </div>
          <div>
            <span>全链覆盖天数</span>
            <strong>（在库 + 在途 + 待交付）÷（预测月均销量 ÷ 30）+ 交期天数</strong>
          </div>
        </div>
        <p className="risk-logic-callout">无销售预测或预测合计为 0 时，两个天数均按 999 天计算。</p>
      </section>

      <section className="kcfx-panel risk-logic-section">
        <h3>默认阈值</h3>
        <SimpleTable
          rows={THRESHOLD_ROWS}
          paginated={false}
          columns={[
            { key: 'standard', label: '判断标准' },
            { key: 'region', label: '库存段' },
            { key: 'warning', label: '限制采购线' },
            { key: 'severe', label: '停止采购线' }
          ]}
        />
        <div className="risk-action-flow">
          <div className="restricted"><strong>限制采购</strong><span>达到偏高线或关注线</span></div>
          <div className="stopped"><strong>停止采购</strong><span>达到严重线或干预线，优先级高于限制采购</span></div>
          <div className="normal"><strong>正常</strong><span>两个标准均未达到阈值，默认继续采购且不在风险表展示</span></div>
        </div>
      </section>
    </KcfxPageShell>
  );
}

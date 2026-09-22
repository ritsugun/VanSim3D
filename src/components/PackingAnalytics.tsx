import React, { useState, useMemo } from 'react';
import { PackingMetrics, Container, Language, UnitSystem, UnplacedItem, ContainerLoad, OverallPackingMetrics, PackedItem, CurrencyCode } from '../types';
import { 
  Gauge, Scale, Crosshair, AlertTriangle, CheckCircle2, 
  Truck, DollarSign, PackageCheck, Layers, Grid3X3,
  Box, ChevronRight, PieChart, ShieldAlert, Check, Pencil, X
} from 'lucide-react';
import { formatVolume, formatWeight, formatLength, formatCurrency, getCurrencySymbol, formatDimensions } from '../utils/units';

interface PackingAnalyticsProps {
  metrics: PackingMetrics;
  container: Container;
  unplacedItems: UnplacedItem[];
  language: Language;
  unitSystem: UnitSystem;
  containers?: ContainerLoad[];
  overallMetrics?: OverallPackingMetrics;
  activeContainerIndex?: number | 'all';
  onSelectContainerIndex?: (index: number | 'all') => void;
  packedItems?: PackedItem[];
  onUpdateContainer?: (container: Container) => void;
}

interface CargoBreakdownItem {
  sku: string;
  name: string;
  color: string;
  length: number;
  width: number;
  height: number;
  unitWeight: number;
  count: number;
  subtotalWeight: number;
  subtotalVolumeCbm: number;
  fragile: boolean;
}

export const PackingAnalytics: React.FC<PackingAnalyticsProps> = ({
  metrics,
  container,
  unplacedItems,
  language,
  unitSystem,
  containers,
  overallMetrics,
  activeContainerIndex = 1,
  onSelectContainerIndex,
  packedItems = [],
  onUpdateContainer
}) => {
  const isJa = language === 'ja';
  const [selectedBreakdownTab, setSelectedBreakdownTab] = useState<number | 'all'>('all');

  const [isEditingCost, setIsEditingCost] = useState(false);
  const [editCostVal, setEditCostVal] = useState(container.costEstimate ?? 2000);
  const [editCurrencyVal, setEditCurrencyVal] = useState<CurrencyCode>(container.costCurrency ?? 'USD');

  const hasMultipleContainers = Boolean(containers && containers.length > 1);

  // Effective containers list
  const effectiveContainerLoads: ContainerLoad[] = useMemo(() => {
    if (containers && containers.length > 0) {
      return containers;
    }
    return [{
      containerIndex: 1,
      container,
      packedItems: packedItems,
      metrics: metrics
    }];
  }, [containers, container, packedItems, metrics]);

  // Determine currently selected container load
  const activeContainerLoad = useMemo(() => {
    if (typeof activeContainerIndex === 'number') {
      const found = effectiveContainerLoads.find(c => c.containerIndex === activeContainerIndex);
      if (found) return found;
      if (activeContainerIndex >= 1 && activeContainerIndex <= effectiveContainerLoads.length) {
        return effectiveContainerLoads[activeContainerIndex - 1];
      }
    }
    return effectiveContainerLoads[0];
  }, [activeContainerIndex, effectiveContainerLoads]);

  const activeContNumber = activeContainerLoad.containerIndex || 1;
  const activeMetrics = activeContainerLoad.metrics;
  const activeContainer = activeContainerLoad.container || container;

  // CoG Offset status for active container
  const isXSafe = Math.abs(activeMetrics.centerOfGravity.offsetXPercent) <= 5;
  const isYSafe = Math.abs(activeMetrics.centerOfGravity.offsetYPercent) <= 5;
  const isOverallBalanced = isXSafe && isYSafe;

  // Visual position of crosshair on the 2D balance board
  const crosshairLeft = 50 + activeMetrics.centerOfGravity.offsetXPercent;
  const crosshairTop = 50 + activeMetrics.centerOfGravity.offsetYPercent;

  // Helper to compute breakdown for an array of packed items
  const computeBreakdown = (items: PackedItem[]): CargoBreakdownItem[] => {
    const map = new Map<string, CargoBreakdownItem>();
    items.forEach(item => {
      const key = `${item.sku}_${item.length}_${item.width}_${item.height}_${item.weight}`;
      const existing = map.get(key);
      const itemVolCbm = (item.length * item.width * item.height) / 1_000_000_000;
      if (existing) {
        existing.count += 1;
        existing.subtotalWeight += item.weight;
        existing.subtotalVolumeCbm += itemVolCbm;
      } else {
        map.set(key, {
          sku: item.sku,
          name: item.name,
          color: item.color,
          length: item.length,
          width: item.width,
          height: item.height,
          unitWeight: item.weight,
          count: 1,
          subtotalWeight: item.weight,
          subtotalVolumeCbm: itemVolCbm,
          fragile: item.fragile
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count || b.subtotalWeight - a.subtotalWeight);
  };

  // Breakdown per container
  const breakdownByContainer = useMemo(() => {
    return effectiveContainerLoads.map(cLoad => ({
      containerIndex: cLoad.containerIndex,
      container: cLoad.container,
      metrics: cLoad.metrics,
      items: computeBreakdown(cLoad.packedItems),
      totalCount: cLoad.packedItems.length,
      totalWeightKg: cLoad.metrics.packedWeightKg,
      totalVolumeCbm: cLoad.metrics.packedVolumeCbm,
      volumeUtil: cLoad.metrics.volumeUtilization,
      weightUtil: cLoad.metrics.weightUtilization
    }));
  }, [effectiveContainerLoads]);

  // Overall all-packed items breakdown
  const allPackedBreakdown = useMemo(() => {
    const allItems = effectiveContainerLoads.flatMap(c => c.packedItems);
    return computeBreakdown(allItems);
  }, [effectiveContainerLoads]);

  // Matrix of SKU distribution across containers
  const crossContainerMatrix = useMemo(() => {
    const skuMap = new Map<string, {
      sku: string;
      name: string;
      color: string;
      length: number;
      width: number;
      height: number;
      unitWeight: number;
      fragile: boolean;
      countsByContainer: number[];
      totalPacked: number;
      unplacedCount: number;
    }>();

    // Populate from all containers
    effectiveContainerLoads.forEach((cLoad, cIdx) => {
      cLoad.packedItems.forEach(item => {
        const key = item.sku;
        let entry = skuMap.get(key);
        if (!entry) {
          entry = {
            sku: item.sku,
            name: item.name,
            color: item.color,
            length: item.length,
            width: item.width,
            height: item.height,
            unitWeight: item.weight,
            fragile: item.fragile,
            countsByContainer: new Array(effectiveContainerLoads.length).fill(0),
            totalPacked: 0,
            unplacedCount: 0
          };
          skuMap.set(key, entry);
        }
        entry.countsByContainer[cIdx] += 1;
        entry.totalPacked += 1;
      });
    });

    // Add unplaced items
    unplacedItems.forEach(u => {
      let entry = skuMap.get(u.sku);
      if (!entry) {
        entry = {
          sku: u.sku,
          name: u.name,
          color: '#94a3b8',
          length: u.dimensions.length,
          width: u.dimensions.width,
          height: u.dimensions.height,
          unitWeight: u.weight,
          fragile: false,
          countsByContainer: new Array(effectiveContainerLoads.length).fill(0),
          totalPacked: 0,
          unplacedCount: 0
        };
        skuMap.set(u.sku, entry);
      }
      entry.unplacedCount += u.count;
    });

    return Array.from(skuMap.values()).sort((a, b) => b.totalPacked - a.totalPacked);
  }, [effectiveContainerLoads, unplacedItems]);

  return (
    <div id="packing-analytics-root" className="space-y-4">
      {/* Fleet Multi-Container Summary Card if multiple containers exist */}
      {hasMultipleContainers && overallMetrics && (
        <div className="bg-slate-50 border border-slate-300 rounded-xl p-4 shadow-xs text-slate-800">
          <div className="flex items-center justify-between gap-3 mb-3 pb-2.5 border-b border-slate-200 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  {isJa ? 'マルチコンテナ輸送編成サマリー' : 'Fleet Multi-Container Summary'}
                  <span className="bg-slate-900 text-white text-[10px] px-2 py-0.5 rounded font-mono font-bold">
                    {overallMetrics.totalContainersCount} {isJa ? '台 編成' : 'Units'}
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  {isJa 
                    ? `全 ${overallMetrics.totalItemsCount} 個の荷物を ${overallMetrics.totalContainersCount} 台のコンテナに最適分散配置` 
                    : `Distributed all ${overallMetrics.totalItemsCount} cargo items across ${overallMetrics.totalContainersCount} containers`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-300">
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">{isJa ? '全台平均容積積載率' : 'Fleet Avg Volume'}</span>
                <span className="font-mono font-bold text-slate-900 text-sm">{overallMetrics.overallVolumeUtilization.toFixed(1)}%</span>
              </div>
              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-300">
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">{isJa ? '全台総輸送コスト' : 'Total Fleet Cost'}</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {formatCurrency(overallMetrics.totalCostEstimate, activeContainer.costCurrency || container.costCurrency || 'USD')}
                </span>
              </div>
            </div>
          </div>

          {/* Container Breakdown Chips */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {containers.map((cLoad, idx) => {
              const cIndex = cLoad.containerIndex || (idx + 1);
              const isSelected = activeContNumber === cIndex;
              return (
                <div
                  key={cIndex}
                  onClick={() => {
                    onSelectContainerIndex && onSelectContainerIndex(cIndex);
                    setSelectedBreakdownTab(cIndex);
                  }}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs ring-2 ring-slate-900/20'
                      : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs font-mono ${
                      isSelected ? 'bg-white text-slate-900' : 'bg-slate-100 text-slate-900'
                    }`}>
                      #{cIndex}
                    </span>
                    <div>
                      <span className="font-bold text-xs block">
                        {isJa ? `コンテナ #${cIndex}` : `Container #${cIndex}`}
                        {isSelected && (
                          <span className="ml-1.5 text-[9px] bg-slate-700 text-slate-200 px-1.5 py-0.2 rounded font-sans font-normal">
                            {isJa ? '表示中' : 'Active'}
                          </span>
                        )}
                      </span>
                      <span className={`text-[10px] ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                        {cLoad.packedItems.length} {isJa ? '個積載' : 'boxes'} • {formatWeight(cLoad.metrics.packedWeightKg, unitSystem)}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={`font-mono font-bold text-xs block ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                      {cLoad.metrics.volumeUtilization.toFixed(1)}%
                    </span>
                    <span className={`text-[9px] uppercase ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                      {isJa ? '容積率' : 'Vol'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}




      {/* Active Container Switcher Bar for Multi-Container Fleets */}
      {hasMultipleContainers && (
        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-2xs text-xs flex-wrap gap-2.5">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5 text-slate-700" />
              {isJa ? '分析対象コンテナ:' : 'Active Container:'}
            </span>
            <span className="bg-slate-900 text-white font-mono font-bold px-2 py-0.5 rounded text-xs">
              #{activeContNumber} {activeContainer.name}
            </span>
            <span className="text-slate-500 text-[11px]">
              ({activeContainerLoad.packedItems.length} {isJa ? '個積載' : 'boxes'} • {formatWeight(activeMetrics.packedWeightKg, unitSystem)} • {activeMetrics.volumeUtilization.toFixed(1)}% {isJa ? '容積率' : 'vol'})
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px] mr-1">{isJa ? 'コンテナ切替:' : 'Select Container:'}</span>
            {effectiveContainerLoads.map((c, idx) => {
              const cIndex = c.containerIndex || (idx + 1);
              const isCurrentActive = activeContNumber === cIndex;
              return (
                <button
                  key={cIndex}
                  type="button"
                  onClick={() => {
                    onSelectContainerIndex && onSelectContainerIndex(cIndex);
                    setSelectedBreakdownTab(cIndex);
                  }}
                  className={`px-3 py-1 rounded-md font-mono text-xs font-bold transition-all flex items-center gap-1.5 ${
                    isCurrentActive
                      ? 'bg-slate-900 text-white shadow-xs ring-1 ring-slate-900'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  <span>#{cIndex}</span>
                  <span className={`text-[10px] font-normal ${isCurrentActive ? 'text-slate-300' : 'text-slate-400'}`}>
                    ({c.metrics.volumeUtilization.toFixed(0)}%)
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main KPI Utilization Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-slate-800 text-xs">
        {/* Volume Utilization Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-slate-800" />
              <span>{isJa ? '容積積載率 (CBM)' : 'Volume Utilization'}</span>
              {hasMultipleContainers && (
                <span className="bg-slate-100 text-slate-800 font-mono text-[10px] font-bold px-1.5 py-0.2 rounded border border-slate-200">
                  #{activeContNumber}
                </span>
              )}
            </span>
            <span className="font-bold font-mono text-base text-slate-900">
              {activeMetrics.volumeUtilization.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-2.5">
            <div 
              className="bg-slate-900 h-full transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(100, activeMetrics.volumeUtilization)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>{isJa ? '積載' : 'Used'}: <strong className="text-slate-800">{formatVolume(activeMetrics.packedVolumeCbm, unitSystem, 2)}</strong></span>
            <span>{isJa ? '空隙' : 'Free'}: <strong className="text-slate-800">{formatVolume(activeMetrics.freeVolumeCbm, unitSystem, 2)}</strong></span>
          </div>
        </div>

        {/* Weight Utilization Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-slate-800" />
              <span>{isJa ? '重量積載率 (Payload)' : 'Weight Utilization'}</span>
              {hasMultipleContainers && (
                <span className="bg-slate-100 text-slate-800 font-mono text-[10px] font-bold px-1.5 py-0.2 rounded border border-slate-200">
                  #{activeContNumber}
                </span>
              )}
            </span>
            <span className="font-bold font-mono text-base text-slate-900">
              {activeMetrics.weightUtilization.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-2.5">
            <div 
              className="h-full transition-all duration-500 rounded-full bg-slate-900"
              style={{ width: `${Math.min(100, activeMetrics.weightUtilization)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>{isJa ? '貨物総重量' : 'Cargo'}: <strong className="text-slate-800">{formatWeight(activeMetrics.packedWeightKg, unitSystem)}</strong></span>
            <span>{isJa ? '上限' : 'Max'}: <strong className="text-slate-800">{formatWeight(activeContainer.maxWeight, unitSystem)}</strong></span>
          </div>
        </div>

        {/* Total Packed Cargo Count */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <PackageCheck className="w-4 h-4 text-slate-800" />
              <span>{isJa ? '積載完了個数' : 'Cargo Packed'}</span>
              {hasMultipleContainers && (
                <span className="bg-slate-100 text-slate-800 font-mono text-[10px] font-bold px-1.5 py-0.2 rounded border border-slate-200">
                  #{activeContNumber}
                </span>
              )}
            </span>
            <div className="text-right">
              {hasMultipleContainers ? (
                <span className="font-mono text-slate-900 font-bold text-base block">
                  {activeContainerLoad.packedItems.length.toLocaleString()} <span className="text-xs text-slate-400 font-normal">/ {(overallMetrics?.totalPackedCount || packedItems.length).toLocaleString()} {isJa ? '個' : 'total'}</span>
                </span>
              ) : (
                <span className="font-mono text-slate-900 font-bold text-base block">
                  {activeMetrics.packedCount.toLocaleString()} / {activeMetrics.totalItemCount.toLocaleString()}
                </span>
              )}
              {(metrics.safetyLimitTruncatedCount ?? 0) > 0 && (
                <span className="text-[10px] text-amber-700 font-bold font-sans">
                  {isJa ? `(-${metrics.safetyLimitTruncatedCount.toLocaleString()} 除外)` : `(-${metrics.safetyLimitTruncatedCount.toLocaleString()} capped)`}
                </span>
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-500 my-1">
            {hasMultipleContainers
              ? (isJa 
                  ? `コンテナ #${activeContNumber} に ${activeContainerLoad.packedItems.length} 個の荷物を最適配置` 
                  : `Packed ${activeContainerLoad.packedItems.length} cargo boxes into Container #${activeContNumber}`)
              : (isJa 
                  ? `${activeMetrics.packedCount} 個の荷物を最適な配置順で配置完了` 
                  : `Optimally sequenced and packed ${activeMetrics.packedCount} cargo boxes`)}
          </p>
          <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-[10px] text-slate-400">
            <span>{isJa ? 'アルゴリズム計算時間' : 'Calc Time'}:</span>
            <span className="font-mono text-slate-800 font-bold">{metrics.calculationTimeMs} ms</span>
          </div>
        </div>

        {/* Shipping Cost & Efficiency */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-slate-800" />
              <span>{isJa ? '概算輸送コスト' : 'Estimated Cost'}</span>
              {hasMultipleContainers && (
                <span className="bg-slate-100 text-slate-800 font-mono text-[10px] font-bold px-1.5 py-0.2 rounded border border-slate-200">
                  #{activeContNumber}
                </span>
              )}
            </span>
            {onUpdateContainer && !isEditingCost && (
              <button
                type="button"
                onClick={() => {
                  setEditCostVal(activeContainer.costEstimate ?? (container.costEstimate ?? 2000));
                  setEditCurrencyVal(activeContainer.costCurrency || container.costCurrency || 'USD');
                  setIsEditingCost(true);
                }}
                className="text-[10.5px] text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 flex items-center gap-1 transition-colors cursor-pointer"
                title={isJa ? '単価・通貨を変更' : 'Edit rate & currency'}
              >
                <Pencil className="w-3 h-3" />
                <span>{isJa ? '単価変更' : 'Edit'}</span>
              </button>
            )}
          </div>

          {isEditingCost ? (
            <div className="space-y-2 py-1">
              <div className="flex items-center gap-1">
                <div className="grid grid-cols-3 gap-0.5 bg-slate-100 p-0.5 rounded text-[11px] font-semibold">
                  {(['USD', 'JPY', 'EUR'] as CurrencyCode[]).map(cur => (
                    <button
                      key={cur}
                      type="button"
                      onClick={() => setEditCurrencyVal(cur)}
                      className={`px-1 py-0.5 rounded cursor-pointer ${
                        editCurrencyVal === cur ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-500'
                      }`}
                    >
                      {cur}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1 min-w-[70px]">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400 text-xs pointer-events-none">
                    {getCurrencySymbol(editCurrencyVal)}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={editCostVal}
                    onChange={e => setEditCostVal(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full bg-white border border-slate-300 rounded px-2 pl-6 py-1 font-mono font-bold text-xs text-slate-900 focus:outline-none focus:border-slate-500"
                    autoFocus
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (onUpdateContainer) {
                      onUpdateContainer({
                        ...container,
                        costEstimate: Math.max(0, editCostVal),
                        costCurrency: editCurrencyVal
                      });
                    }
                    setIsEditingCost(false);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white p-1 rounded cursor-pointer transition-colors"
                  title={isJa ? '保存' : 'Save'}
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingCost(false)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 p-1 rounded cursor-pointer transition-colors"
                  title={isJa ? 'キャンセル' : 'Cancel'}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                {isJa ? 'コンテナ1台あたりの運賃単価' : 'Freight cost per container unit'}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-slate-900 font-bold text-base">
                  {formatCurrency(
                    hasMultipleContainers
                      ? (activeContainer.costEstimate || 2000)
                      : ((container.costEstimate || 2000) * metrics.containersNeeded),
                    activeContainer.costCurrency || container.costCurrency || 'USD'
                  )}
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {formatCurrency(activeContainer.costEstimate || 2000, activeContainer.costCurrency || container.costCurrency || 'USD')} / {isJa ? '台' : 'unit'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 my-1">
                {isJa 
                  ? `CBM単価: 約 ${formatCurrency(((activeContainer.costEstimate || 2000)) / Math.max(1, activeMetrics.packedVolumeCbm), activeContainer.costCurrency || container.costCurrency || 'USD')} / m³` 
                  : `Cost per CBM: ${formatCurrency(((activeContainer.costEstimate || 2000)) / Math.max(1, activeMetrics.packedVolumeCbm), activeContainer.costCurrency || container.costCurrency || 'USD')} / m³`}
              </p>
            </>
          )}

          <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-[10px] text-slate-400">
            {hasMultipleContainers && overallMetrics ? (
              <>
                <span>{isJa ? '全編成コスト' : 'Fleet Total'}:</span>
                <span className="font-mono text-slate-900 font-bold">
                  {formatCurrency(overallMetrics.totalCostEstimate, activeContainer.costCurrency || container.costCurrency || 'USD')} ({overallMetrics.totalContainersCount} {isJa ? '台' : 'units'})
                </span>
              </>
            ) : (
              <>
                <span>{isJa ? '必要コンテナ数' : 'Units Required'}:</span>
                <span className="font-mono text-slate-900 font-bold">{metrics.containersNeeded} 台</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Center of Gravity (CoG) Stability Analysis & Axle Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
        {/* CoG 2D Balance Board */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-slate-900" />
              <span>
                {isJa 
                  ? `重心位置・バランス解析${hasMultipleContainers ? ` (コンテナ #${activeContNumber})` : ' (CoG)'}` 
                  : `Center of Gravity Stability${hasMultipleContainers ? ` (Container #${activeContNumber})` : ''}`}
              </span>
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 bg-slate-100 text-slate-800 border border-slate-300">
              {isOverallBalanced ? <CheckCircle2 className="w-3 h-3 text-slate-700" /> : <AlertTriangle className="w-3 h-3 text-slate-700" />}
              {isOverallBalanced ? (isJa ? '重心安定 (理想的)' : 'Balanced & Safe') : (isJa ? '偏荷重注意' : 'Off-Center Caution')}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            {/* Visual 2D Container Top-Down Crosshair Map */}
            <div className="relative w-full h-32 bg-slate-50 border border-slate-200 rounded-lg overflow-hidden flex items-center justify-center">
              {/* Safe Zone Center */}
              <div className="absolute w-1/4 h-1/3 bg-slate-200/50 border border-slate-300 rounded" />

              {/* Grid Lines */}
              <div className="absolute inset-x-0 top-1/2 h-px bg-slate-200" />
              <div className="absolute inset-y-0 left-1/2 w-px bg-slate-200" />

              {/* Labels */}
              <span className="absolute top-1 left-2 text-[9px] text-slate-400 uppercase font-semibold">{isJa ? '奥 (Back)' : 'Back (X=0)'}</span>
              <span className="absolute bottom-1 right-2 text-[9px] text-slate-600 uppercase font-semibold">{isJa ? '扉側 (Door)' : 'Door (X=L)'}</span>
              <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-semibold">{isJa ? '左' : 'L'}</span>
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-semibold">{isJa ? '右' : 'R'}</span>

              {/* CoG Crosshair Marker */}
              <div 
                className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-slate-900 bg-slate-900/30 shadow-md flex items-center justify-center transition-all duration-300"
                style={{
                  left: `${Math.max(5, Math.min(95, crosshairLeft))}%`,
                  top: `${Math.max(5, Math.min(95, crosshairTop))}%`
                }}
              >
                <div className="w-1.5 h-1.5 bg-slate-900 rounded-full" />
              </div>
            </div>

            {/* Numeric Deviations Table */}
            <div className="space-y-2 text-[11px] text-slate-600">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                <span className="text-slate-400">{isJa ? '前後オフセット (X):' : 'Fore-Aft Offset (X):'}</span>
                <span className="font-mono font-bold text-slate-800">
                  {activeMetrics.centerOfGravity.offsetXPercent > 0 ? '+' : ''}{activeMetrics.centerOfGravity.offsetXPercent.toFixed(1)}% 
                  <span className="text-slate-400 font-normal ml-1">({formatLength(activeMetrics.centerOfGravity.x, unitSystem)})</span>
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                <span className="text-slate-400">{isJa ? '左右オフセット (Y):' : 'Left-Right Offset (Y):'}</span>
                <span className="font-mono font-bold text-slate-800">
                  {activeMetrics.centerOfGravity.offsetYPercent > 0 ? '+' : ''}{activeMetrics.centerOfGravity.offsetYPercent.toFixed(1)}%
                  <span className="text-slate-400 font-normal ml-1">({formatLength(activeMetrics.centerOfGravity.y, unitSystem)})</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{isJa ? '重心高さ (Z):' : 'CoG Height (Z):'}</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatLength(activeMetrics.centerOfGravity.z, unitSystem)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Axle Load Distribution for Road & Chassis */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Truck className="w-4 h-4 text-slate-800" />
              <span>
                {isJa 
                  ? `陸上輸送 軸重配分推定${hasMultipleContainers ? ` (コンテナ #${activeContNumber})` : ' (Axle Load)'}` 
                  : `Road Trailer Axle Load Estimation${hasMultipleContainers ? ` (Container #${activeContNumber})` : ''}`}
              </span>
            </h3>
            <span className="text-slate-400 text-[10px]">
              {isJa ? 'キングピン / 後軸 2軸配分' : 'Kingpin / Rear Tandem'}
            </span>
          </div>

          <div className="space-y-3 my-auto">
            {/* Front Axle Bar */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-slate-600 font-medium">{isJa ? '前軸 / 牽引側 (Front / Kingpin):' : 'Front Axle / Kingpin:'}</span>
                <span className="font-mono font-bold text-slate-900">
                  {activeMetrics.axleDistribution.frontAxlePercent.toFixed(1)}% ({formatWeight(activeMetrics.axleDistribution.frontAxleKg, unitSystem)})
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-slate-900 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${activeMetrics.axleDistribution.frontAxlePercent}%` }} 
                />
              </div>
            </div>

            {/* Rear Axle Bar */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-slate-600 font-medium">{isJa ? '後軸 / タンデム軸 (Rear Tandem):' : 'Rear Axle / Tandem:'}</span>
                <span className="font-mono font-bold text-slate-900">
                  {activeMetrics.axleDistribution.rearAxlePercent.toFixed(1)}% ({formatWeight(activeMetrics.axleDistribution.rearAxleKg, unitSystem)})
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-slate-700 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${activeMetrics.axleDistribution.rearAxlePercent}%` }} 
                />
              </div>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 pt-2 border-t border-slate-100 mt-2">
            {isJa 
              ? '※ 道路交通法の軸重規制（10トン以下など）および車両総重量制限を遵守して輸送計画を確定してください。' 
              : 'Ensure compliance with highway legal axle weight limits (e.g. 20,000 lbs single / 34,000 lbs tandem).'}
          </p>
        </div>
      </div>

      {/* Per-Container Cargo Load Breakdown & Tally Section */}
      <div id="container-cargo-breakdown-section" className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs text-slate-800 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 flex-wrap">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Box className="w-4 h-4 text-slate-800" />
              {isJa ? '各コンテナ別 貨物積載数・内訳明細' : 'Cargo Breakdown & Quantity per Container'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isJa 
                ? 'コンテナごとにどの貨物（SKU）が何台・何個積載されたかの詳細内訳一覧' 
                : 'Itemized summary of which cargo items and exact quantities loaded into each container'}
            </p>
          </div>

          {/* Container Selector Tabs for Breakdown */}
          {hasMultipleContainers && (
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setSelectedBreakdownTab('all')}
                className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                  selectedBreakdownTab === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
                <span>{isJa ? '全コンテナ配分一覧' : 'All Containers Matrix'}</span>
              </button>
              {breakdownByContainer.map((b, idx) => (
                <button
                  key={b.containerIndex}
                  type="button"
                  onClick={() => {
                    setSelectedBreakdownTab(idx);
                    onSelectContainerIndex && onSelectContainerIndex(idx);
                  }}
                  className={`px-2.5 py-1 rounded-md transition-all font-mono ${
                    selectedBreakdownTab === idx
                      ? 'bg-slate-900 text-white shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  #{idx + 1} ({b.totalCount} {isJa ? '個' : 'pcs'})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Multi-Container Matrix View */}
        {hasMultipleContainers && selectedBreakdownTab === 'all' && (
          <div className="space-y-4">
            {/* Cross-Container Cargo Allocation Matrix */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3.5 whitespace-nowrap">{isJa ? '品名 / SKU' : 'Item Name & SKU'}</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap">{isJa ? '寸法 (m)' : 'Dimensions (m)'}</th>
                    <th className="py-2.5 px-3.5 whitespace-nowrap">{isJa ? '単重 (kg)' : 'Unit Wt (kg)'}</th>
                    {breakdownByContainer.map((b, idx) => (
                      <th key={idx} className="py-2.5 px-3.5 text-center bg-slate-100 text-slate-800 whitespace-nowrap font-mono">
                        {isJa ? `コンテナ #${idx + 1}` : `Container #${idx + 1}`}
                      </th>
                    ))}
                    <th className="py-2.5 px-3.5 text-center whitespace-nowrap font-mono bg-slate-100 text-slate-900">
                      {isJa ? '合計積載数' : 'Total Packed'}
                    </th>
                    <th className="py-2.5 px-3.5 text-center whitespace-nowrap font-mono bg-slate-100 text-slate-700">
                      {isJa ? '未積載' : 'Unplaced'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {crossContainerMatrix.map((row, rIdx) => {
                    const isAllPacked = row.unplacedCount === 0;
                    return (
                      <tr key={rIdx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span 
                              className="w-3 h-3 rounded-sm shrink-0 border border-black/15 shadow-2xs" 
                              style={{ backgroundColor: row.color }} 
                            />
                            <div>
                              <span className="font-bold text-slate-900 block">{row.name}</span>
                              <span className="font-mono text-[10px] text-slate-400">{row.sku}</span>
                            </div>
                            {row.fragile && (
                              <span className="bg-slate-100 text-slate-800 border border-slate-300 text-[9px] px-1.5 py-0.2 rounded font-semibold ml-1">
                                {isJa ? '割れ物' : 'Fragile'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-slate-600 text-[11px]">
                          {formatDimensions(row.length, row.width, row.height, unitSystem, true)}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-slate-700 font-semibold">
                          {row.unitWeight} kg
                        </td>
                        {row.countsByContainer.map((cnt, cIdx) => (
                          <td key={cIdx} className="py-2.5 px-3.5 text-center font-mono whitespace-nowrap">
                            {cnt > 0 ? (
                              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-slate-900 text-white font-bold text-xs">
                                {cnt} {isJa ? '個' : 'pcs'}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        ))}
                        <td className="py-2.5 px-3.5 text-center font-mono whitespace-nowrap bg-slate-50">
                          <span className="font-bold text-slate-900 text-xs">
                            {row.totalPacked} {isJa ? '個' : 'pcs'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-center font-mono whitespace-nowrap bg-slate-50">
                          {row.unplacedCount > 0 ? (
                            <span className="font-bold text-slate-900 text-xs bg-slate-200 px-2 py-0.5 rounded">
                              {row.unplacedCount} {isJa ? '個' : 'pcs'}
                            </span>
                          ) : (
                            <span className="text-slate-800 font-semibold text-xs flex items-center justify-center gap-0.5">
                              <Check className="w-3 h-3" />
                              {isJa ? '完了' : '0'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Per-Container Cards in Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {breakdownByContainer.map((b, idx) => (
                <div key={b.containerIndex} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-md bg-slate-900 text-white font-mono font-bold flex items-center justify-center text-xs">
                        #{b.containerIndex}
                      </span>
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs">
                          {b.container.name}
                        </h4>
                        <span className="text-[10px] text-slate-500">
                          {b.items.length} {isJa ? '品目' : 'SKUs'} • {b.totalCount} {isJa ? '個積載' : 'boxes loaded'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="bg-slate-100 text-slate-900 border border-slate-300 font-mono font-bold px-2 py-0.5 rounded text-[11px]">
                        {isJa ? '容積率' : 'Vol'}: {b.volumeUtil.toFixed(1)}%
                      </span>
                      <span className="bg-slate-100 text-slate-900 border border-slate-300 font-mono font-bold px-2 py-0.5 rounded text-[11px]">
                        {formatWeight(b.totalWeightKg, unitSystem)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                    {b.items.map((item, iIdx) => (
                      <div key={iIdx} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span 
                            className="w-2.5 h-2.5 rounded-xs shrink-0 border border-black/10" 
                            style={{ backgroundColor: item.color }} 
                          />
                          <div className="truncate">
                            <span className="font-bold text-slate-900 truncate block text-xs">{item.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {item.length}×{item.width}×{item.height}mm • {item.unitWeight}kg
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0 pl-2">
                          <span className="inline-block bg-slate-100 border border-slate-300 text-slate-900 font-mono font-bold text-xs px-2 py-0.5 rounded">
                            {item.count} {isJa ? '個' : 'pcs'}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                            {formatWeight(item.subtotalWeight, unitSystem)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Single Container Breakdown Table View (or Specific Tab Selected) */}
        {(!hasMultipleContainers || selectedBreakdownTab !== 'all') && (
          <div>
            {(() => {
              const currentLoad = typeof selectedBreakdownTab === 'number' 
                ? (breakdownByContainer.find(b => b.containerIndex === selectedBreakdownTab) || breakdownByContainer[0])
                : breakdownByContainer[0];
              
              if (!currentLoad) return null;

              return (
                <div className="space-y-3">
                  {/* Container Quick Specs Pill Bar */}
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-slate-900 text-white font-mono font-bold flex items-center justify-center text-xs">
                        #{currentLoad.containerIndex}
                      </span>
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                          {currentLoad.container.name}
                          <span className="text-slate-400 font-normal">
                            ({currentLoad.container.length} × {currentLoad.container.width} × {currentLoad.container.height} mm)
                          </span>
                        </h4>
                        <span className="text-slate-500 text-[11px]">
                          {isJa ? '積載総個数' : 'Total Items'}: <strong className="text-slate-800 font-mono font-bold">{currentLoad.totalCount} {isJa ? '個' : 'boxes'}</strong>
                          <span className="mx-1.5 text-slate-300">|</span>
                          {isJa ? '品目数' : 'Unique SKUs'}: <strong className="text-slate-800 font-mono font-bold">{currentLoad.items.length} {isJa ? '種' : 'SKUs'}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <div className="bg-white px-2.5 py-1 rounded-lg border border-slate-300">
                        <span className="text-slate-400 text-[10px] block uppercase font-semibold">{isJa ? '積載重量' : 'Packed Weight'}</span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatWeight(currentLoad.totalWeightKg, unitSystem)} / {formatWeight(currentLoad.container.maxWeight, unitSystem)}
                        </span>
                      </div>
                      <div className="bg-white px-2.5 py-1 rounded-lg border border-slate-300">
                        <span className="text-slate-400 text-[10px] block uppercase font-semibold">{isJa ? '容積充填率' : 'Volume Util'}</span>
                        <span className="font-mono font-bold text-slate-900">
                          {currentLoad.volumeUtil.toFixed(1)}% ({formatVolume(currentLoad.totalVolumeCbm, unitSystem, 2)})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Table */}
                  <div className="overflow-x-auto rounded-xl border border-slate-200 custom-scrollbar">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-600 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3.5 w-12 text-center">No</th>
                          <th className="py-2.5 px-3.5 whitespace-nowrap">{isJa ? '貨物名 / 管理SKU' : 'Cargo Item & SKU'}</th>
                          <th className="py-2.5 px-3.5 whitespace-nowrap">{isJa ? '単体外寸 (L×W×H m)' : 'Unit Dimensions (m)'}</th>
                          <th className="py-2.5 px-3.5 whitespace-nowrap">{isJa ? '単体重量' : 'Unit Weight'}</th>
                          <th className="py-2.5 px-3.5 text-center whitespace-nowrap bg-slate-100 text-slate-900 font-bold">
                            {isJa ? '積載個数 (Qty)' : 'Loaded Qty'}
                          </th>
                          <th className="py-2.5 px-3.5 whitespace-nowrap">{isJa ? '小計重量 (kg)' : 'Subtotal Weight (kg)'}</th>
                          <th className="py-2.5 px-3.5 whitespace-nowrap">{isJa ? '小計容積 (m³)' : 'Subtotal Volume (m³)'}</th>
                          <th className="py-2.5 px-3.5 whitespace-nowrap">{isJa ? '容積占有率' : 'Volume Share'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {currentLoad.items.map((item, idx) => {
                          const volSharePercent = currentLoad.totalVolumeCbm > 0 
                            ? (item.subtotalVolumeCbm / currentLoad.totalVolumeCbm) * 100 
                            : 0;

                          return (
                            <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-2.5 px-3.5 text-center font-mono text-slate-400 text-xs">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span 
                                    className="w-3.5 h-3.5 rounded-sm shrink-0 border border-black/15 shadow-2xs" 
                                    style={{ backgroundColor: item.color }} 
                                  />
                                  <div>
                                    <span className="font-bold text-slate-900 block">{item.name}</span>
                                    <span className="font-mono text-[10px] text-slate-400">{item.sku}</span>
                                  </div>
                                  {item.fragile && (
                                    <span className="bg-slate-100 text-slate-800 border border-slate-300 text-[9px] px-1.5 py-0.2 rounded font-semibold ml-1">
                                      {isJa ? '割れ物' : 'Fragile'}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-slate-600 text-[11px]">
                                {formatDimensions(item.length, item.width, item.height, unitSystem, true)}
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-slate-700 font-semibold">
                                {item.unitWeight} kg
                              </td>
                              <td className="py-2.5 px-3.5 text-center whitespace-nowrap bg-slate-50">
                                <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-slate-900 text-white font-mono font-bold text-xs shadow-2xs">
                                  {item.count} {isJa ? '個' : 'pcs'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-slate-800 font-semibold">
                                {item.subtotalWeight.toLocaleString()} kg
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-slate-800">
                                {item.subtotalVolumeCbm.toFixed(3)} m³
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap font-mono">
                                <div className="flex items-center gap-2">
                                  <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                    <div 
                                      className="bg-slate-900 h-full rounded-full" 
                                      style={{ width: `${Math.min(100, volSharePercent)}%` }} 
                                    />
                                  </div>
                                  <span className="text-[11px] font-bold text-slate-700">
                                    {volSharePercent.toFixed(1)}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {/* Footer Totals */}
                      <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200 text-slate-900 text-xs">
                        <tr>
                          <td colSpan={4} className="py-2.5 px-3.5 text-right uppercase tracking-wider text-[11px] text-slate-500">
                            {isJa ? 'コンテナ積載合計:' : 'Container Total:'}
                          </td>
                          <td className="py-2.5 px-3.5 text-center font-mono text-slate-900 text-sm bg-slate-100 font-bold">
                            {currentLoad.totalCount} {isJa ? '個' : 'pcs'}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono text-slate-900">
                            {currentLoad.totalWeightKg.toLocaleString()} kg
                          </td>
                          <td className="py-2.5 px-3.5 font-mono text-slate-900">
                            {currentLoad.totalVolumeCbm.toFixed(3)} m³
                          </td>
                          <td className="py-2.5 px-3.5 font-mono text-slate-600">
                            100%
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

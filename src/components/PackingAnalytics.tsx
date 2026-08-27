import React from 'react';
import { PackingMetrics, Container, Language, UnitSystem, UnplacedItem, ContainerLoad, OverallPackingMetrics } from '../types';
import { 
  Gauge, Scale, Crosshair, AlertTriangle, CheckCircle2, 
  Truck, DollarSign, PackageCheck, Layers, Grid3X3
} from 'lucide-react';
import { formatVolume, formatWeight, formatLength } from '../utils/units';

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
}

export const PackingAnalytics: React.FC<PackingAnalyticsProps> = ({
  metrics,
  container,
  unplacedItems,
  language,
  unitSystem,
  containers,
  overallMetrics,
  activeContainerIndex = 0,
  onSelectContainerIndex
}) => {
  const isJa = language === 'ja';

  // CoG Offset status
  const isXSafe = Math.abs(metrics.centerOfGravity.offsetXPercent) <= 5;
  const isYSafe = Math.abs(metrics.centerOfGravity.offsetYPercent) <= 5;
  const isOverallBalanced = isXSafe && isYSafe;

  // Visual position of crosshair on the 2D balance board
  // Map -50%..+50% offset to 0%..100% position
  const crosshairLeft = 50 + metrics.centerOfGravity.offsetXPercent;
  const crosshairTop = 50 + metrics.centerOfGravity.offsetYPercent;

  const hasMultipleContainers = containers && containers.length > 1;

  return (
    <div id="packing-analytics-root" className="space-y-4">
      {/* Fleet Multi-Container Summary Card if multiple containers exist */}
      {hasMultipleContainers && overallMetrics && (
        <div className="bg-linear-to-r from-blue-50/80 to-purple-50/80 border border-blue-200 rounded-xl p-4 shadow-xs text-slate-800">
          <div className="flex items-center justify-between gap-3 mb-3 pb-2.5 border-b border-blue-200/60 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  {isJa ? 'マルチコンテナ輸送編成サマリー' : 'Fleet Multi-Container Summary'}
                  <span className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded font-mono font-bold">
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
              <div className="bg-white/80 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-blue-200/80">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">{isJa ? '全台平均容積積載率' : 'Fleet Avg Volume'}</span>
                <span className="font-mono font-bold text-blue-700 text-sm">{overallMetrics.overallVolumeUtilization.toFixed(1)}%</span>
              </div>
              <div className="bg-white/80 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-blue-200/80">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">{isJa ? '全台総輸送コスト' : 'Total Fleet Cost'}</span>
                <span className="font-mono font-bold text-purple-700 text-sm">${overallMetrics.totalCostEstimate.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Container Breakdown Chips */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {containers.map((cLoad, idx) => {
              const isSelected = activeContainerIndex === idx;
              return (
                <div
                  key={cLoad.containerIndex}
                  onClick={() => onSelectContainerIndex && onSelectContainerIndex(idx)}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs font-mono ${
                      isSelected ? 'bg-white text-blue-600' : 'bg-blue-50 text-blue-700'
                    }`}>
                      #{idx + 1}
                    </span>
                    <div>
                      <span className="font-bold text-xs block">
                        {isJa ? `コンテナ #${idx + 1}` : `Container #${idx + 1}`}
                      </span>
                      <span className={`text-[10px] ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                        {cLoad.packedItems.length} {isJa ? '個積載' : 'boxes'} • {formatWeight(cLoad.metrics.packedWeightKg, unitSystem)}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={`font-mono font-bold text-xs block ${isSelected ? 'text-white' : 'text-blue-600'}`}>
                      {cLoad.metrics.volumeUtilization.toFixed(1)}%
                    </span>
                    <span className={`text-[9px] uppercase ${isSelected ? 'text-blue-200' : 'text-slate-400'}`}>
                      {isJa ? '容積率' : 'Vol'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Unplaced Items Warning Alert if any */}
      {unplacedItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 text-xs shadow-xs">
          <div className="flex items-center gap-2 font-bold text-amber-800 mb-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              {isJa 
                ? `積載上限により未積載の貨物が ${metrics.unplacedCount} 個あります` 
                : `${metrics.unplacedCount} items could not be packed into available containers`}
            </span>
          </div>
          <div className="space-y-1 pl-6 text-[11px] text-amber-800/90">
            {unplacedItems.map((u, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span>• {u.name} ({u.sku}) × {u.count} {isJa ? '個' : 'pcs'}</span>
                <span className="font-mono font-semibold text-amber-700">
                  {u.reason === 'exceeds_weight' ? (isJa ? '重量制限超過' : 'Exceeds Weight Limit') : (isJa ? '空間不足' : 'Spatial Overflow')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main KPI Utilization Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-slate-800 text-xs">
        {/* Volume Utilization Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-blue-600" />
              {isJa ? '容積積載率 (CBM)' : 'Volume Utilization'}
            </span>
            <span className="font-bold font-mono text-base text-blue-600">
              {metrics.volumeUtilization.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-2.5">
            <div 
              className="bg-blue-600 h-full transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(100, metrics.volumeUtilization)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>{isJa ? '積載' : 'Used'}: <strong className="text-slate-800">{formatVolume(metrics.packedVolumeCbm, unitSystem, 2)}</strong></span>
            <span>{isJa ? '空隙' : 'Free'}: <strong className="text-slate-800">{formatVolume(metrics.freeVolumeCbm, unitSystem, 2)}</strong></span>
          </div>
        </div>

        {/* Weight Utilization Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-emerald-600" />
              {isJa ? '重量積載率 (Payload)' : 'Weight Utilization'}
            </span>
            <span className={`font-bold font-mono text-base ${metrics.weightUtilization > 95 ? 'text-red-600' : 'text-emerald-600'}`}>
              {metrics.weightUtilization.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-2.5">
            <div 
              className={`h-full transition-all duration-500 rounded-full ${metrics.weightUtilization > 95 ? 'bg-red-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, metrics.weightUtilization)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>{isJa ? '貨物総重量' : 'Cargo'}: <strong className="text-slate-800">{formatWeight(metrics.packedWeightKg, unitSystem)}</strong></span>
            <span>{isJa ? '上限' : 'Max'}: <strong className="text-slate-800">{formatWeight(container.maxWeight, unitSystem)}</strong></span>
          </div>
        </div>

        {/* Total Packed Cargo Count */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <PackageCheck className="w-4 h-4 text-amber-500" />
              {isJa ? '積載完了個数' : 'Cargo Packed'}
            </span>
            <span className="font-mono text-amber-600 font-bold text-base">
              {metrics.packedCount} / {metrics.totalItemCount}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 my-1">
            {isJa 
              ? `${metrics.packedCount} 個の荷物を最適な配置順で配置完了` 
              : `Optimally sequenced and packed ${metrics.packedCount} cargo boxes`}
          </p>
          <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-[10px] text-slate-400">
            <span>{isJa ? 'アルゴリズム計算時間' : 'Calc Time'}:</span>
            <span className="font-mono text-blue-600 font-bold">{metrics.calculationTimeMs} ms</span>
          </div>
        </div>

        {/* Shipping Cost & Efficiency */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-purple-600" />
              {isJa ? '概算輸送コスト' : 'Estimated Cost'}
            </span>
            <span className="font-mono text-purple-600 font-bold text-base">
              ${((container.costEstimate || 2000) * metrics.containersNeeded).toLocaleString()}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 my-1">
            {isJa 
              ? `CBM単価: 約 $${(((container.costEstimate || 2000)) / Math.max(1, metrics.packedVolumeCbm)).toFixed(1)} / m³` 
              : `Cost per CBM: $${(((container.costEstimate || 2000)) / Math.max(1, metrics.packedVolumeCbm)).toFixed(1)} / m³`}
          </p>
          <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-[10px] text-slate-400">
            <span>{isJa ? '必要コンテナ数' : 'Units Required'}:</span>
            <span className="font-mono text-purple-600 font-bold">{metrics.containersNeeded} 台</span>
          </div>
        </div>
      </div>

      {/* Center of Gravity (CoG) Stability Analysis & Axle Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
        {/* CoG 2D Balance Board */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-red-500" />
              {isJa ? '重心位置・バランス解析 (Center of Gravity)' : 'Center of Gravity (CoG) Stability'}
            </h3>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
              isOverallBalanced 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {isOverallBalanced ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <AlertTriangle className="w-3 h-3 text-amber-600" />}
              {isOverallBalanced ? (isJa ? '重心安定 (理想的)' : 'Balanced & Safe') : (isJa ? '偏荷重注意' : 'Off-Center Caution')}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            {/* Visual 2D Container Top-Down Crosshair Map */}
            <div className="relative w-full h-32 bg-slate-50 border border-slate-200 rounded-lg overflow-hidden flex items-center justify-center">
              {/* Safe Green Zone Center */}
              <div className="absolute w-1/4 h-1/3 bg-emerald-500/10 border border-emerald-500/25 rounded" />

              {/* Grid Lines */}
              <div className="absolute inset-x-0 top-1/2 h-px bg-slate-200" />
              <div className="absolute inset-y-0 left-1/2 w-px bg-slate-200" />

              {/* Labels */}
              <span className="absolute top-1 left-2 text-[9px] text-slate-400 uppercase font-semibold">{isJa ? '奥 (Back)' : 'Back (X=0)'}</span>
              <span className="absolute bottom-1 right-2 text-[9px] text-amber-600 uppercase font-semibold">{isJa ? '扉側 (Door)' : 'Door (X=L)'}</span>
              <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-semibold">{isJa ? '左' : 'L'}</span>
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-semibold">{isJa ? '右' : 'R'}</span>

              {/* CoG Red Target Crosshair Marker */}
              <div 
                className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-red-500 bg-red-500/30 shadow-md flex items-center justify-center transition-all duration-300"
                style={{
                  left: `${Math.max(5, Math.min(95, crosshairLeft))}%`,
                  top: `${Math.max(5, Math.min(95, crosshairTop))}%`
                }}
              >
                <div className="w-1.5 h-1.5 bg-red-600 rounded-full" />
              </div>
            </div>

            {/* Numeric Deviations Table */}
            <div className="space-y-2 text-[11px] text-slate-600">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                <span className="text-slate-400">{isJa ? '前後オフセット (X):' : 'Fore-Aft Offset (X):'}</span>
                <span className="font-mono font-bold text-slate-800">
                  {metrics.centerOfGravity.offsetXPercent > 0 ? '+' : ''}{metrics.centerOfGravity.offsetXPercent.toFixed(1)}% 
                  <span className="text-slate-400 font-normal ml-1">({formatLength(metrics.centerOfGravity.x, unitSystem)})</span>
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                <span className="text-slate-400">{isJa ? '左右オフセット (Y):' : 'Left-Right Offset (Y):'}</span>
                <span className="font-mono font-bold text-slate-800">
                  {metrics.centerOfGravity.offsetYPercent > 0 ? '+' : ''}{metrics.centerOfGravity.offsetYPercent.toFixed(1)}%
                  <span className="text-slate-400 font-normal ml-1">({formatLength(metrics.centerOfGravity.y, unitSystem)})</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{isJa ? '重心高さ (Z):' : 'CoG Height (Z):'}</span>
                <span className="font-mono font-bold text-emerald-600">
                  {formatLength(metrics.centerOfGravity.z, unitSystem)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Axle Load Distribution for Road & Chassis */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-600" />
              {isJa ? '陸上輸送 軸重配分推定 (Axle Load)' : 'Road Trailer Axle Load Estimation'}
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
                <span className="font-mono font-bold text-blue-600">
                  {metrics.axleDistribution.frontAxlePercent.toFixed(1)}% ({formatWeight(metrics.axleDistribution.frontAxleKg, unitSystem)})
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-blue-600 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${metrics.axleDistribution.frontAxlePercent}%` }} 
                />
              </div>
            </div>

            {/* Rear Axle Bar */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-slate-600 font-medium">{isJa ? '後軸 / タンデム軸 (Rear Tandem):' : 'Rear Axle / Tandem:'}</span>
                <span className="font-mono font-bold text-indigo-600">
                  {metrics.axleDistribution.rearAxlePercent.toFixed(1)}% ({formatWeight(metrics.axleDistribution.rearAxleKg, unitSystem)})
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-600 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${metrics.axleDistribution.rearAxlePercent}%` }} 
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
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import { Container, Language, UnitSystem, CurrencyCode } from '../types';
import { STANDARD_CONTAINERS } from '../data/presets';
import { Container as ContainerIcon, Truck, Box, Plus, Check, Settings2, AlertTriangle, DollarSign, RotateCcw } from 'lucide-react';
import { formatDimensions, formatVolume, formatWeight, formatCurrency, getCurrencySymbol } from '../utils/units';

interface ContainerSelectorProps {
  selectedContainer: Container;
  onSelectContainer: (container: Container) => void;
  language: Language;
  unitSystem: UnitSystem;
  containerCountMode?: 'auto' | 'manual';
  onChangeContainerCountMode?: (mode: 'auto' | 'manual') => void;
  containerCount?: number;
  onChangeContainerCount?: (count: number) => void;
  totalContainersNeeded?: number;
  totalItemsCount?: number;
  totalPackedCount?: number;
  safetyLimitTruncatedCount?: number;
}

export const ContainerSelector: React.FC<ContainerSelectorProps> = ({
  selectedContainer,
  onSelectContainer,
  language,
  unitSystem,
  containerCountMode = 'auto',
  onChangeContainerCountMode,
  containerCount = 1,
  onChangeContainerCount,
  totalContainersNeeded = 1,
  totalItemsCount = 0,
  totalPackedCount = 0,
  safetyLimitTruncatedCount = 0
}) => {
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [customForm, setCustomForm] = useState<Container>({
    id: 'custom_container',
    name: language === 'ja' ? 'カスタムコンテナ・荷台' : 'Custom Container / Vehicle',
    category: 'custom',
    length: 6000,
    width: 2400,
    height: 2400,
    maxWeight: 20000,
    tareWeight: 2500,
    costEstimate: 1500,
    costCurrency: 'USD',
    color: '#0284c7',
    description: language === 'ja' ? 'ユーザー定義の独自寸法コンテナ' : 'Custom user-defined dimensions'
  });

  const isJa = language === 'ja';

  // Active default preset & cost values
  const defaultPreset = useMemo(() => {
    return STANDARD_CONTAINERS.find(c => c.id === selectedContainer.id);
  }, [selectedContainer.id]);

  const currentCurrency: CurrencyCode = selectedContainer.costCurrency || 'USD';
  const currentCost = selectedContainer.costEstimate ?? (defaultPreset?.costEstimate ?? 2000);

  const handleCostChange = (newCost: number) => {
    onSelectContainer({
      ...selectedContainer,
      costEstimate: Math.max(0, newCost)
    });
  };

  const handleCurrencyChange = (newCurrency: CurrencyCode) => {
    onSelectContainer({
      ...selectedContainer,
      costCurrency: newCurrency
    });
  };

  const handleResetCostToDefault = () => {
    if (defaultPreset) {
      onSelectContainer({
        ...selectedContainer,
        costEstimate: defaultPreset.costEstimate,
        costCurrency: 'USD'
      });
    }
  };

  const quickRates = useMemo(() => {
    if (currentCurrency === 'JPY') {
      return [
        { label: '¥250,000', value: 250000 },
        { label: '¥350,000', value: 350000 },
        { label: '¥500,000', value: 500000 },
        { label: '¥600,000', value: 600000 }
      ];
    }
    if (currentCurrency === 'EUR') {
      return [
        { label: '€1,900', value: 1900 },
        { label: '€3,100', value: 3100 },
        { label: '€3,350', value: 3350 },
        { label: '€3,900', value: 3900 }
      ];
    }
    return [
      { label: '$2,100 (20GP)', value: 2100 },
      { label: '$3,400 (40GP)', value: 3400 },
      { label: '$3,650 (40HC)', value: 3650 },
      { label: '$4,200 (45HC)', value: 4200 }
    ];
  }, [currentCurrency]);

  const handleCustomChange = (field: keyof Container, val: any) => {
    const updated = {
      ...customForm,
      [field]: val
    };
    setCustomForm(updated);
    // Instant live update if in custom mode
    onSelectContainer({
      ...updated,
      length: Math.max(500, Number(updated.length) || 6000),
      width: Math.max(500, Number(updated.width) || 2400),
      height: Math.max(500, Number(updated.height) || 2400),
      maxWeight: Math.max(100, Number(updated.maxWeight) || 20000)
    });
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    onSelectContainer({
      ...customForm,
      length: Math.max(500, Number(customForm.length)),
      width: Math.max(500, Number(customForm.width)),
      height: Math.max(500, Number(customForm.height)),
      maxWeight: Math.max(100, Number(customForm.maxWeight))
    });
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'truck':
        return <Truck className="w-4 h-4 text-slate-700" />;
      case 'pallet':
        return <Box className="w-4 h-4 text-slate-700" />;
      default:
        return <ContainerIcon className="w-4 h-4 text-slate-800" />;
    }
  };

  return (
    <div id="container-selector-root" className="space-y-4">
      {/* Container Fleet Quantity Controller */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs text-slate-800">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-900 border border-slate-300 flex items-center justify-center font-bold text-sm shrink-0">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                {isJa ? 'コンテナ・車両の数量設定' : 'Fleet & Quantity Planning'}
                <span className="text-[10px] font-mono font-semibold bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-300">
                  {isJa ? '全貨物収容' : 'Multi-Container'}
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                {isJa 
                  ? '自動算出または数量を手動指定' 
                  : 'Auto-calculate required units or specify manually'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Mode Switcher */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => onChangeContainerCountMode && onChangeContainerCountMode('auto')}
                className={`px-2.5 py-1.5 rounded-md transition-all ${
                  containerCountMode === 'auto'
                    ? 'bg-slate-900 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ⚡ {isJa ? '自動算出' : 'Auto'}
              </button>
              <button
                type="button"
                onClick={() => onChangeContainerCountMode && onChangeContainerCountMode('manual')}
                className={`px-2.5 py-1.5 rounded-md transition-all ${
                  containerCountMode === 'manual'
                    ? 'bg-slate-900 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isJa ? '手動指定' : 'Manual'}
              </button>
            </div>

            {/* Manual Counter Controls */}
            {containerCountMode === 'manual' && (
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => onChangeContainerCount && onChangeContainerCount(Math.max(1, containerCount - 1))}
                  disabled={containerCount <= 1}
                  className="w-6 h-6 flex items-center justify-center rounded bg-white hover:bg-slate-100 border border-slate-300 font-bold text-slate-900 disabled:opacity-40"
                >
                  -
                </button>
                <span className="w-8 text-center font-mono font-bold text-slate-900 text-xs">
                  {containerCount}
                </span>
                <button
                  type="button"
                  onClick={() => onChangeContainerCount && onChangeContainerCount(containerCount + 1)}
                  className="w-6 h-6 flex items-center justify-center rounded bg-white hover:bg-slate-100 border border-slate-300 font-bold text-slate-900"
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Fleet Status Ribbon */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-slate-700 text-[11px]">
              {isJa ? '適用:' : 'Active:'}
            </span>
            <span className="bg-slate-100 text-slate-900 border border-slate-300 px-2 py-0.5 rounded font-mono font-bold text-[11px]">
              {totalContainersNeeded} × {selectedContainer.name}
            </span>
          </div>

          <div className="flex items-center gap-1.5 font-medium text-[11px]">
            <span>{isJa ? '進捗:' : 'Progress:'}</span>
            <span className="font-mono font-bold text-slate-900">
              {totalPackedCount}/{totalItemsCount} ({totalItemsCount > 0 ? Math.round((totalPackedCount / totalItemsCount) * 100) : 100}%)
            </span>
            {totalPackedCount === totalItemsCount ? (
              <span className="bg-slate-100 text-slate-900 border border-slate-300 text-[10px] px-1.5 py-0.2 rounded font-bold">
                ✓ {isJa ? '100% 収容' : '100% Loaded'}
              </span>
            ) : (
              <span className="bg-slate-100 text-slate-800 border border-slate-300 text-[10px] px-1.5 py-0.2 rounded font-bold">
                {isJa ? `未積載 ${totalItemsCount - totalPackedCount}個` : `Unplaced ${totalItemsCount - totalPackedCount}`}
              </span>
            )}
          </div>

          {safetyLimitTruncatedCount > 0 && (
            <div className="mt-1 text-[10.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 flex items-center gap-1 font-medium">
              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
              <span>
                {isJa 
                  ? `安全リミット適用: ${safetyLimitTruncatedCount.toLocaleString()}個除外 (各品目最大500個)` 
                  : `Safety limit: ${safetyLimitTruncatedCount.toLocaleString()} items excluded (max 500/item)`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Container Freight Rate & Currency Settings */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs text-slate-800">
        <div className="flex items-center justify-between gap-3 mb-3 pb-2.5 border-b border-slate-100 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-bold text-sm shrink-0">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                {isJa ? 'コンテナ運賃・単価設定' : 'Freight Rate & Cost Settings'}
                <span className="text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                  {selectedContainer.name}
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                {isJa 
                  ? '1台あたりの概算運賃。積載分析や総コスト試算に即時連動します' 
                  : 'Freight cost per container unit. Updates analytics & totals in real time'}
              </p>
            </div>
          </div>

          {/* Reset to default preset button if modified */}
          {defaultPreset && (selectedContainer.costEstimate !== defaultPreset.costEstimate || (selectedContainer.costCurrency && selectedContainer.costCurrency !== 'USD')) && (
            <button
              type="button"
              onClick={handleResetCostToDefault}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg border border-slate-300 flex items-center gap-1 transition-colors cursor-pointer"
              title={isJa ? 'プリセット標準単価に戻す' : 'Reset to default preset rate'}
            >
              <RotateCcw className="w-3 h-3" />
              <span>{isJa ? `標準値に戻す ($${defaultPreset.costEstimate?.toLocaleString()})` : `Reset ($${defaultPreset.costEstimate})`}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          {/* Currency Selector (4 cols) */}
          <div className="sm:col-span-4">
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">
              {isJa ? '通貨 (Currency)' : 'Currency'}
            </label>
            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
              {(['USD', 'JPY', 'EUR'] as CurrencyCode[]).map(cur => (
                <button
                  key={cur}
                  type="button"
                  onClick={() => handleCurrencyChange(cur)}
                  className={`py-1 rounded text-center transition-all cursor-pointer ${
                    currentCurrency === cur
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cur} ({getCurrencySymbol(cur)})
                </button>
              ))}
            </div>
          </div>

          {/* Unit Cost Input (8 cols) */}
          <div className="sm:col-span-8">
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">
              {isJa ? 'コンテナ1台あたりの運賃単価' : 'Freight Rate per Container'}
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-500 text-sm pointer-events-none">
                  {getCurrencySymbol(currentCurrency)}
                </span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={currentCost}
                  onChange={e => handleCostChange(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 font-mono font-bold text-slate-900 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                  placeholder="0"
                />
              </div>
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
                / {isJa ? '台' : 'unit'}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Rate Presets */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap text-xs">
          <span className="text-[11px] text-slate-400 font-medium">
            {isJa ? 'クイック単価設定:' : 'Quick Presets:'}
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {quickRates.map(rate => (
              <button
                key={rate.value}
                type="button"
                onClick={() => handleCostChange(rate.value)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer border ${
                  currentCost === rate.value
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                {rate.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs text-slate-800">
        <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-slate-100 flex-wrap">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-900 shrink-0" />
              {isJa ? '輸送コンテナ / 車両選択' : 'Container & Vehicle Type'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isJa ? '海上コンテナ、トラック、パレット、カスタム寸法' : 'ISO sea containers, trucks, pallets, or custom vehicles'}
            </p>
          </div>

          <button
            onClick={() => setIsCustomMode(!isCustomMode)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isCustomMode ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>{isJa ? 'カスタム設定' : 'Custom'}</span>
          </button>
        </div>

      {/* Standard Preset Cards Grid - Single Column Layout */}
      {!isCustomMode ? (
        <div className="grid grid-cols-1 gap-2.5">
          {STANDARD_CONTAINERS.map((cont) => {
            const isSelected = selectedContainer.id === cont.id;
            const volCbm = (cont.length * cont.width * cont.height) / 1_000_000_000;

            return (
              <div
                key={cont.id}
                onClick={() => onSelectContainer(cont)}
                className={`group relative p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-slate-50 border-slate-900 shadow-sm ring-1 ring-slate-900'
                    : 'bg-white border-slate-200 hover:border-slate-400 hover:shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      {getCategoryIcon(cont.category)}
                      <span className="font-bold text-xs text-slate-900 group-hover:text-black transition-colors">
                        {cont.name}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500 line-clamp-2 mb-3">
                    {cont.description}
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-2.5 space-y-1.5 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-sans font-semibold">
                      {isJa ? '内部有効寸法 (L×W×H)' : 'Internal Dimensions (L×W×H)'}
                    </span>
                    <span className="text-slate-800 font-mono font-medium block">
                      {formatDimensions(cont.length, cont.width, cont.height, unitSystem)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 pt-1 border-t border-slate-50">
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-sans font-semibold">
                        {isJa ? '有効容積' : 'Volume'}
                      </span>
                      <span className="text-slate-900 font-mono font-bold">
                        {formatVolume(volCbm, unitSystem)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-sans font-semibold">
                        {isJa ? '最大積載重量' : 'Max Payload'}
                      </span>
                      <span className="text-slate-900 font-mono font-bold">
                        {formatWeight(cont.maxWeight, unitSystem)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between col-span-2 pt-1 border-t border-slate-100 text-[10.5px]">
                      <span className="text-slate-400 font-semibold">{isJa ? '概算運賃' : 'Rate'}:</span>
                      <span className="font-mono font-bold text-slate-900 flex items-center gap-1">
                        {formatCurrency(isSelected ? currentCost : (cont.costEstimate || 2000), isSelected ? currentCurrency : 'USD')}
                        <span className="text-slate-400 font-normal text-[10px]">/ {isJa ? '台' : 'unit'}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Custom Dimensions Form with Live Update */
        <form onSubmit={handleApplyCustom} className="bg-slate-50 border border-slate-300 rounded-xl p-4 shadow-xs text-xs space-y-3">
          {/* Quick Vehicle / Container Templates */}
          <div>
            <span className="text-slate-500 font-medium text-[11px] block mb-1.5">
              {isJa ? 'クイック寸法テンプレート:' : 'Quick Dimensions Template:'}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { name: isJa ? '2t標準トラック' : '2t Truck', l: 3100, w: 1600, h: 1800, wt: 2000, cost: 400 },
                { name: isJa ? '4tウイング車' : '4t Wing Truck', l: 6200, w: 2350, h: 2400, wt: 4000, cost: 800 },
                { name: isJa ? '10t大型トラック' : '10t Heavy Truck', l: 9600, w: 2380, h: 2500, wt: 13500, cost: 1400 },
                { name: isJa ? '10ft ミニコンテナ' : '10ft Container', l: 2800, w: 2350, h: 2390, wt: 10000, cost: 1200 },
                { name: isJa ? '軽バン・ハイエース' : 'Van / Hiace', l: 2800, w: 1500, h: 1300, wt: 1000, cost: 200 },
              ].map(tpl => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => {
                    const upd: Container = {
                      ...customForm,
                      name: tpl.name,
                      length: tpl.l,
                      width: tpl.w,
                      height: tpl.h,
                      maxWeight: tpl.wt,
                      costEstimate: tpl.cost
                    };
                    setCustomForm(upd);
                    onSelectContainer(upd);
                  }}
                  className="px-2 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 hover:border-slate-400 text-slate-700 hover:text-slate-900 font-medium text-[11px] transition-colors"
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
            <div>
              <label className="text-slate-600 font-medium block mb-1">{isJa ? 'コンテナ・車両名' : 'Name'}</label>
              <input
                type="text"
                required
                value={customForm.name}
                onChange={e => handleCustomChange('name', e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
              />
            </div>
            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {isJa ? '最大積載重量 (kg)' : 'Max Payload (kg)'}
              </label>
              <input
                type="number"
                min="100"
                step="100"
                required
                value={customForm.maxWeight}
                onChange={e => handleCustomChange('maxWeight', Math.max(100, Number(e.target.value) || 100))}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 font-bold focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
              />
            </div>
          </div>

          {/* Custom Freight Rate & Currency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {isJa ? '運賃単価 / 台' : 'Freight Cost / Unit'}
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400 text-xs pointer-events-none">
                  {getCurrencySymbol(customForm.costCurrency || 'USD')}
                </span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={customForm.costEstimate ?? 1500}
                  onChange={e => handleCustomChange('costEstimate', Math.max(0, Number(e.target.value) || 0))}
                  className="w-full bg-white border border-slate-300 rounded-lg pl-7 pr-2.5 py-1.5 text-slate-900 font-bold font-mono focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {isJa ? '通貨 (Currency)' : 'Currency'}
              </label>
              <select
                value={customForm.costCurrency || 'USD'}
                onChange={e => handleCustomChange('costCurrency', e.target.value as CurrencyCode)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 font-medium focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none cursor-pointer"
              >
                <option value="USD">USD ($)</option>
                <option value="JPY">JPY (¥)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {isJa ? '長さ L (mm)' : 'Length (mm)'}
                <span className="text-slate-400 font-normal ml-1">({(customForm.length / 1000).toFixed(2)} m)</span>
              </label>
              <input
                type="number"
                min="500"
                step="50"
                required
                value={customForm.length}
                onChange={e => handleCustomChange('length', Math.max(500, Number(e.target.value) || 500))}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-800 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
              />
            </div>
            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {isJa ? '幅 W (mm)' : 'Width (mm)'}
                <span className="text-slate-400 font-normal ml-1">({(customForm.width / 1000).toFixed(2)} m)</span>
              </label>
              <input
                type="number"
                min="500"
                step="50"
                required
                value={customForm.width}
                onChange={e => handleCustomChange('width', Math.max(500, Number(e.target.value) || 500))}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-800 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
              />
            </div>
            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {isJa ? '高さ H (mm)' : 'Height (mm)'}
                <span className="text-slate-400 font-normal ml-1">({(customForm.height / 1000).toFixed(2)} m)</span>
              </label>
              <input
                type="number"
                min="500"
                step="50"
                required
                value={customForm.height}
                onChange={e => handleCustomChange('height', Math.max(500, Number(e.target.value) || 500))}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-800 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
            <div className="space-y-0.5">
              <span className="text-slate-500 text-[11px] block">
                {isJa ? '計算容積:' : 'Calculated Volume:'}{' '}
                <strong className="text-slate-900 font-mono">
                  {formatVolume((customForm.length * customForm.width * customForm.height) / 1_000_000_000, unitSystem)}
                </strong>
              </span>
              <span className="text-slate-400 text-[10px] font-mono block">
                {formatDimensions(customForm.length, customForm.width, customForm.height, unitSystem)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCustomMode(false)}
                className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 font-medium"
              >
                {isJa ? 'プリセット一覧に戻る' : 'Back to Presets'}
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-xs transition-colors"
              >
                ✓ {isJa ? '確定' : 'Apply'}
              </button>
            </div>
          </div>
        </form>
      )}
      </div>
    </div>
  );
};


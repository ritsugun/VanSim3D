import React, { useState } from 'react';
import { Container, Language, UnitSystem } from '../types';
import { STANDARD_CONTAINERS } from '../data/presets';
import { Container as ContainerIcon, Truck, Box, Plus, Check, Settings2 } from 'lucide-react';
import { formatDimensions, formatVolume, formatWeight } from '../utils/units';

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
  totalPackedCount = 0
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
    color: '#0284c7',
    description: language === 'ja' ? 'ユーザー定義の独自寸法コンテナ' : 'Custom user-defined dimensions'
  });

  const isJa = language === 'ja';

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
                { name: isJa ? '2t標準トラック' : '2t Truck', l: 3100, w: 1600, h: 1800, wt: 2000 },
                { name: isJa ? '4tウイング車' : '4t Wing Truck', l: 6200, w: 2350, h: 2400, wt: 4000 },
                { name: isJa ? '10t大型トラック' : '10t Heavy Truck', l: 9600, w: 2380, h: 2500, wt: 13500 },
                { name: isJa ? '10ft ミニコンテナ' : '10ft Container', l: 2800, w: 2350, h: 2390, wt: 10000 },
                { name: isJa ? '軽バン・ハイエース' : 'Van / Hiace', l: 2800, w: 1500, h: 1300, wt: 1000 },
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
                      maxWeight: tpl.wt
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


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
}

export const ContainerSelector: React.FC<ContainerSelectorProps> = ({
  selectedContainer,
  onSelectContainer,
  language,
  unitSystem
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
        return <Truck className="w-4 h-4 text-amber-500" />;
      case 'pallet':
        return <Box className="w-4 h-4 text-emerald-600" />;
      default:
        return <ContainerIcon className="w-4 h-4 text-blue-600" />;
    }
  };

  return (
    <div id="container-selector-root" className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs text-slate-800">
      <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
            {isJa ? '輸送コンテナ / トラック選択' : 'Container & Vehicle Type'}
            <span className="text-[10px] font-mono font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
              {unitSystem === 'metric' ? 'Metric: mm / m / kg' : 'Imperial: in / ft / lbs'}
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isJa ? '国際海上コンテナ、大型/中型トラック、パレット、または自由なカスタム寸法' : 'ISO sea containers, trucks, pallets, or custom vehicles'}
          </p>
        </div>

        <button
          onClick={() => setIsCustomMode(!isCustomMode)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
            isCustomMode ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
          }`}
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span>{isJa ? 'カスタム寸法設定' : 'Custom Dimensions'}</span>
        </button>
      </div>

      {/* Standard Preset Cards Grid */}
      {!isCustomMode ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {STANDARD_CONTAINERS.map((cont) => {
            const isSelected = selectedContainer.id === cont.id;
            const volCbm = (cont.length * cont.width * cont.height) / 1_000_000_000;

            return (
              <div
                key={cont.id}
                onClick={() => onSelectContainer(cont)}
                className={`group relative p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-blue-50/50 border-blue-500 shadow-sm ring-1 ring-blue-500'
                    : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      {getCategoryIcon(cont.category)}
                      <span className="font-bold text-xs text-slate-900 group-hover:text-blue-600 transition-colors">
                        {cont.name}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
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
                      <span className="text-blue-600 font-mono font-bold">
                        {formatVolume(volCbm, unitSystem)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-sans font-semibold">
                        {isJa ? '最大積載重量' : 'Max Payload'}
                      </span>
                      <span className="text-emerald-600 font-mono font-bold">
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
        /* Custom Dimensions Form */
        <form onSubmit={handleApplyCustom} className="bg-slate-50 border border-blue-200 rounded-xl p-4 shadow-xs text-xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-slate-600 font-medium block mb-1">{isJa ? 'コンテナ・車両名' : 'Name'}</label>
              <input
                type="text"
                required
                value={customForm.name}
                onChange={e => setCustomForm({ ...customForm, name: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {isJa ? '最大積載重量 (kg)' : 'Max Payload (kg)'}
                {unitSystem === 'imperial' && <span className="text-slate-400 font-normal ml-1">(≈ {Math.round(customForm.maxWeight * 2.20462)} lbs)</span>}
              </label>
              <input
                type="number"
                min="100"
                required
                value={customForm.maxWeight}
                onChange={e => setCustomForm({ ...customForm, maxWeight: Number(e.target.value) })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-emerald-600 font-bold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
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
                required
                value={customForm.length}
                onChange={e => setCustomForm({ ...customForm, length: Number(e.target.value) })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
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
                required
                value={customForm.width}
                onChange={e => setCustomForm({ ...customForm, width: Number(e.target.value) })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
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
                required
                value={customForm.height}
                onChange={e => setCustomForm({ ...customForm, height: Number(e.target.value) })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
            <div className="space-y-0.5">
              <span className="text-slate-500 text-[11px] block">
                {isJa ? '計算容積:' : 'Calculated Volume:'}{' '}
                <strong className="text-blue-600 font-mono">
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
                {isJa ? 'キャンセル' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs transition-colors"
              >
                {isJa ? 'カスタムコンテナを適用' : 'Apply Custom Container'}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};


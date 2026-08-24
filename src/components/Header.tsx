import React from 'react';
import { AlgorithmType, Language, UnitSystem } from '../types';
import { 
  Box, Sparkles, Cpu, Globe, Gauge, 
  RefreshCw, Check, Layers, Scale, Sliders 
} from 'lucide-react';

interface HeaderProps {
  algorithm: AlgorithmType;
  onChangeAlgorithm: (algo: AlgorithmType) => void;
  language: Language;
  onChangeLanguage: (lang: Language) => void;
  unitSystem: UnitSystem;
  onChangeUnitSystem: (unit: UnitSystem) => void;
  onOpenAiConsultant: () => void;
  onReoptimize: () => void;
  isCalculating: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  algorithm,
  onChangeAlgorithm,
  language,
  onChangeLanguage,
  unitSystem,
  onChangeUnitSystem,
  onOpenAiConsultant,
  onReoptimize,
  isCalculating
}) => {
  const isJa = language === 'ja';

  return (
    <header id="app-header" className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
        {/* Brand Title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm shrink-0">
            <Box className="w-5 h-5 text-white stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold leading-tight text-slate-900 tracking-tight">
                PackMaster <span className="text-blue-600">v2.5</span>
              </h1>
              <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium hidden sm:block">
              {isJa ? '高精度3D容積計算・重心管理・積載シミュレーション' : '3D Container Load Optimization & Fleet Safety Engine'}
            </p>
          </div>
        </div>

        {/* Algorithm & Settings Toolbar */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Algorithm Selector Dropdown */}
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 hover:border-slate-300 transition-colors">
            <Cpu className="w-3.5 h-3.5 text-blue-600 mr-1.5 shrink-0" />
            <select
              id="algorithm-select"
              value={algorithm}
              onChange={(e) => onChangeAlgorithm(e.target.value as AlgorithmType)}
              className="bg-transparent font-semibold text-xs text-slate-800 outline-none cursor-pointer pr-1"
            >
              <option value="extreme_points_bfd" className="bg-white text-slate-900">
                {isJa ? 'Extreme Points 3D (最高空間効率)' : 'Extreme Points 3D (Max Space)'}
              </option>
              <option value="wall_building" className="bg-white text-slate-900">
                {isJa ? 'ウォールビルディング (荷崩れ防止・安定)' : 'Wall Building (Transit Stability)'}
              </option>
              <option value="weight_balanced" className="bg-white text-slate-900">
                {isJa ? '重量重心バランス重視 (軸重均等化)' : 'Weight-Balanced (Center of Gravity)'}
              </option>
              <option value="layer_stacking" className="bg-white text-slate-900">
                {isJa ? 'レイヤースタッキング (均一多段積み)' : 'Layer Stacking (Flat Density)'}
              </option>
            </select>
          </div>

          {/* Unit Toggle */}
          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5 text-[11px] font-semibold text-slate-600">
            <button
              onClick={() => onChangeUnitSystem('metric')}
              className={`px-2 py-1 rounded-md transition-colors ${
                unitSystem === 'metric' ? 'bg-white text-blue-600 font-bold shadow-xs' : 'hover:text-slate-900'
              }`}
              title="Metric (mm, kg, m³)"
            >
              Metric
            </button>
            <button
              onClick={() => onChangeUnitSystem('imperial')}
              className={`px-2 py-1 rounded-md transition-colors ${
                unitSystem === 'imperial' ? 'bg-white text-blue-600 font-bold shadow-xs' : 'hover:text-slate-900'
              }`}
              title="Imperial (in, lb, ft³)"
            >
              Imperial
            </button>
          </div>

          {/* Language Switcher */}
          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5 text-[11px] font-semibold text-slate-600">
            <button
              onClick={() => onChangeLanguage('ja')}
              className={`px-2 py-1 rounded-md transition-colors ${
                language === 'ja' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              日本語
            </button>
            <button
              onClick={() => onChangeLanguage('en')}
              className={`px-2 py-1 rounded-md transition-colors ${
                language === 'en' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              EN
            </button>
          </div>

          {/* AI Advisor Button */}
          <button
            id="open-ai-advisor-btn"
            onClick={onOpenAiConsultant}
            className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center gap-1.5 shadow-xs border border-blue-200 transition-all active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
            <span>{isJa ? 'AI積載診断' : 'AI Advisor'}</span>
          </button>

          {/* Re-optimize / Run Button */}
          <button
            id="run-reoptimize-btn"
            onClick={onReoptimize}
            disabled={isCalculating}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCalculating ? 'animate-spin' : ''}`} />
            <span>{isJa ? '最適化を実行' : 'Run Optimization'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

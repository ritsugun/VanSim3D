import React from 'react';
import { AlgorithmType, GAGoalConfig, Language, UnitSystem, AutoSelectCriteria } from '../types';
import { 
  Box, Sparkles, Cpu, Target, Globe, Gauge, 
  RefreshCw, Check, Layers, Scale, Sliders, Zap, Bot
} from 'lucide-react';

interface HeaderProps {
  algorithm: AlgorithmType;
  onChangeAlgorithm: (algo: AlgorithmType) => void;
  gaConfig?: GAGoalConfig;
  onChangeGaConfig?: (config: GAGoalConfig) => void;
  isAutoAlgorithmEnabled?: boolean;
  onToggleAutoAlgorithm?: (enabled: boolean) => void;
  autoSelectCriteria?: AutoSelectCriteria;
  onChangeAutoCriteria?: (criteria: AutoSelectCriteria) => void;
  autoSelectedAlgorithmName?: string;
  language: Language;
  onChangeLanguage: (lang: Language) => void;
  unitSystem?: UnitSystem;
  onChangeUnitSystem?: (unit: UnitSystem) => void;
  onOpenAiConsultant: () => void;
  onOpenBenchmarkModal?: () => void;
  onAutoSelectBest?: () => void;
  onReoptimize: () => void;
  isCalculating: boolean;
  showAlgorithmPanel?: boolean;
  onToggleAlgorithmPanel?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  algorithm,
  onChangeAlgorithm,
  gaConfig,
  onChangeGaConfig,
  isAutoAlgorithmEnabled = false,
  onToggleAutoAlgorithm,
  autoSelectCriteria = 'overall_best',
  onChangeAutoCriteria,
  autoSelectedAlgorithmName,
  language,
  onChangeLanguage,
  onOpenAiConsultant,
  onOpenBenchmarkModal,
  onAutoSelectBest,
  onReoptimize,
  isCalculating,
  showAlgorithmPanel,
  onToggleAlgorithmPanel
}) => {
  const isJa = language === 'ja';
  const isGA = algorithm === 'genetic_algorithm';

  const getGaGoalLabel = () => {
    switch (gaConfig?.goal) {
      case 'max_volume': return isJa ? '容積最大化' : 'Max Volume';
      case 'min_containers': return isJa ? '本数最小化' : 'Min Containers';
      case 'balance_weight': return isJa ? '重量配分・軸重' : 'Balance Weight';
      default: return isJa ? '容積最大化' : 'Max Volume';
    }
  };

  const handleCycleGoal = () => {
    if (!onChangeGaConfig) return;
    const current = gaConfig?.goal || 'max_volume';
    if (current === 'max_volume') {
      onChangeGaConfig({ goal: 'min_containers', volumeWeight: 100, cogBalanceWeight: 20, lowCenterWeight: 20, priorityWeight: 10 });
    } else if (current === 'min_containers') {
      onChangeGaConfig({ goal: 'balance_weight', volumeWeight: 50, cogBalanceWeight: 100, lowCenterWeight: 80, priorityWeight: 20 });
    } else {
      onChangeGaConfig({ goal: 'max_volume', volumeWeight: 100, cogBalanceWeight: 30, lowCenterWeight: 30, priorityWeight: 20 });
    }
  };

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
                Takumi_Web <span className="text-blue-600">v1.0</span>
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
          
          {/* Auto Algorithm Switcher Toggle (ON / OFF) */}
          {onToggleAutoAlgorithm && (
            <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5 gap-1 text-xs">
              <button
                type="button"
                id="auto-algo-toggle-btn"
                onClick={() => onToggleAutoAlgorithm(!isAutoAlgorithmEnabled)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold text-xs transition-all ${
                  isAutoAlgorithmEnabled
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                }`}
                title={isJa ? '全7アルゴリズムから最適解を自動選定するモードのON/OFF' : 'Toggle auto algorithm selection mode ON/OFF'}
              >
                <Bot className={`w-3.5 h-3.5 ${isAutoAlgorithmEnabled ? 'text-yellow-300' : 'text-slate-500'}`} />
                <span>{isJa ? '自動選定' : 'Auto Mode'}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-extrabold ${
                  isAutoAlgorithmEnabled ? 'bg-blue-800 text-yellow-300' : 'bg-slate-200 text-slate-600'
                }`}>
                  {isAutoAlgorithmEnabled ? 'ON' : 'OFF'}
                </span>
              </button>

              {/* Criteria Selector when Auto Mode is ON */}
              {isAutoAlgorithmEnabled && onChangeAutoCriteria && (
                <div className="flex items-center pl-1 border-l border-slate-200">
                  <select
                    id="header-auto-criteria-select"
                    value={autoSelectCriteria}
                    onChange={(e) => onChangeAutoCriteria(e.target.value as AutoSelectCriteria)}
                    className="bg-white border border-blue-200 text-blue-900 font-bold text-xs rounded-md px-2 py-0.5 outline-none cursor-pointer"
                    title={isJa ? '自動選定の目標基準' : 'Auto selection target criteria'}
                  >
                    <option value="overall_best">{isJa ? '🏆 総合バランス' : '🏆 Overall'}</option>
                    <option value="max_volume">{isJa ? '📦 容積最大化' : '📦 Max Volume'}</option>
                    <option value="min_containers">{isJa ? '🚢 本数最小化' : '🚢 Min Fleet'}</option>
                    <option value="max_stability">{isJa ? '⚖️ 重心安定' : '⚖️ CoG Stability'}</option>
                    <option value="fastest">{isJa ? '⚡ 高速計算' : '⚡ Fastest'}</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Algorithm Selector Dropdown (Active when Manual, or showing Auto status) */}
          <div className={`flex items-center border rounded-lg px-2.5 py-1.5 transition-colors ${
            isAutoAlgorithmEnabled 
              ? 'bg-blue-50/70 border-blue-300 text-blue-900' 
              : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
          }`}>
            <Cpu className={`w-3.5 h-3.5 mr-1.5 shrink-0 ${
              isAutoAlgorithmEnabled ? 'text-blue-600' : isGA ? 'text-emerald-600' : 'text-blue-600'
            }`} />
            
            {isAutoAlgorithmEnabled ? (
              <div className="flex items-center gap-1.5 font-bold text-xs text-blue-950">
                <span className="truncate max-w-[140px] sm:max-w-[200px]" title={autoSelectedAlgorithmName}>
                  {autoSelectedAlgorithmName || (isJa ? '最適解を自動選定中' : 'Auto-Optimized')}
                </span>
                <span className="bg-blue-600 text-white text-[9px] font-mono px-1.5 py-0.2 rounded font-bold">
                  AUTO
                </span>
              </div>
            ) : (
              <select
                id="algorithm-select"
                value={algorithm}
                onChange={(e) => onChangeAlgorithm(e.target.value as AlgorithmType)}
                className="bg-transparent font-semibold text-xs text-slate-800 outline-none cursor-pointer pr-1"
              >
                <option value="extreme_points_bfd" className="bg-white text-slate-900">
                  {isJa ? 'Extreme Points 3D (最高空間効率)' : 'Extreme Points 3D (Max Space)'}
                </option>
                <option value="genetic_algorithm" className="bg-white text-slate-900">
                  {isJa ? '🧬 遺伝的アルゴリズム (AI Genetic Algorithm)' : '🧬 Genetic Algorithm (AI Optimization)'}
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
            )}

            {onToggleAlgorithmPanel && (
              <button
                type="button"
                id="toggle-algo-panel-header-btn"
                onClick={onToggleAlgorithmPanel}
                className={`ml-1.5 p-1 rounded-md transition-colors ${
                  showAlgorithmPanel 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
                }`}
                title={showAlgorithmPanel ? (isJa ? '設定パネルを非表示' : 'Hide Engine Settings') : (isJa ? '詳細設定パネルを表示' : 'Show Engine Settings')}
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Target Goal Pill (Visible when GA is active and not in auto mode) */}
          {!isAutoAlgorithmEnabled && isGA && (
            <button
              type="button"
              id="header-ga-target-btn"
              onClick={handleCycleGoal}
              className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-1.5 rounded-lg font-bold text-xs transition-colors shadow-xs"
              title={isJa ? 'クリックして目標を切り替え' : 'Click to cycle target goal'}
            >
              <Target className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
              <span>{isJa ? '目標:' : 'Goal:'} {getGaGoalLabel()}</span>
            </button>
          )}

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

          {/* Benchmark & Auto Comparison Button */}
          {onOpenBenchmarkModal && (
            <button
              id="open-benchmark-modal-btn"
              type="button"
              onClick={onOpenBenchmarkModal}
              className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs flex items-center gap-1.5 shadow-xs border border-amber-200 transition-all active:scale-95 group"
              title={isJa ? '全7アルゴリズムを一括シミュレーション・比較して最適解を選択' : 'Compare all 7 algorithms in parallel & select best strategy'}
            >
              <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500 group-hover:animate-bounce" />
              <span>{isJa ? '⚡ 一括比較' : '⚡ Benchmark'}</span>
            </button>
          )}

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
            <span>{isCalculating ? (isJa ? '計算中...' : 'Optimizing...') : (isJa ? '再計算' : 'Re-calculate')}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

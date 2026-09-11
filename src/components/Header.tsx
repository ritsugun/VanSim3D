import React from 'react';
import { AlgorithmType, GAGoalConfig, Language, UnitSystem, AutoSelectCriteria } from '../types';
import { 
  Box, Sparkles, Cpu, Target, Globe, Gauge, 
  RefreshCw, Check, Layers, Scale, Sliders, Zap, Bot,
  BarChart3, ListOrdered, Truck, AlertTriangle, Trash2, FileSpreadsheet
} from 'lucide-react';

export type TabType = '3d' | 'cargo' | 'container' | 'analytics' | 'manifest';

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
  onOpenImportManifest?: () => void;
  onAutoSelectBest?: () => void;
  onReoptimize: () => void;
  onAllClear?: () => void;
  isCalculating: boolean;
  showCalculatingPopup?: boolean;
  showAlgorithmPanel?: boolean;
  onToggleAlgorithmPanel?: () => void;
  
  // Navigation tabs & Live metrics props
  activeTab?: TabType;
  onChangeTab?: (tab: TabType) => void;
  totalItemCount?: number;
  totalRawItemCount?: number;
  safetyLimitTruncatedCount?: number;
  containerUnitsCount?: number;
  volumeUtilization?: number;
  packedItemCount?: number;
  packedWeightKg?: number;
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
  onOpenImportManifest,
  onAutoSelectBest,
  onReoptimize,
  onAllClear,
  isCalculating,
  showCalculatingPopup = false,
  showAlgorithmPanel,
  onToggleAlgorithmPanel,
  activeTab = '3d',
  onChangeTab,
  totalItemCount = 0,
  totalRawItemCount = 0,
  safetyLimitTruncatedCount = 0,
  containerUnitsCount = 1,
  volumeUtilization = 0,
  packedItemCount = 0,
  packedWeightKg = 0,
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
    <header id="app-header" className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* Top Bar: Brand, Algorithm Engine Controls & Actions */}
      <div className="px-3 sm:px-5 py-1 border-b border-slate-100">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 flex-wrap">
          {/* Brand Title */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-slate-900 rounded-md flex items-center justify-center shadow-xs shrink-0">
              <Box className="w-3.5 h-3.5 text-white stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 leading-none">
                <h1 className="text-sm font-bold text-slate-900 tracking-tight">
                  Takumi_Web <span className="text-slate-900 text-xs">v1.0</span>
                </h1>
                <span className="bg-slate-100 text-slate-800 border border-slate-300 text-[8px] font-mono font-bold px-1 py-0.2 rounded">
                  PRO
                </span>
              </div>
              <p className="text-[9px] text-slate-500 font-medium hidden md:block mt-0.5 leading-none">
                {isJa ? '3Dコンテナ積載最適化・重心管理エンジン' : '3D Container Load Optimization & Fleet Safety Engine'}
              </p>
            </div>
          </div>

          {/* Algorithm & Settings Toolbar */}
          <div className="flex items-center gap-1 flex-wrap text-xs">
            
            {/* Auto Algorithm Switcher Toggle (ON / OFF) */}
            {onToggleAutoAlgorithm && (
              <div className="flex items-center bg-slate-100 border border-slate-300 rounded-md p-0.5 gap-0.5 text-xs">
                <button
                  type="button"
                  id="auto-algo-toggle-btn"
                  onClick={() => onToggleAutoAlgorithm(!isAutoAlgorithmEnabled)}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-bold text-xs transition-all ${
                    isAutoAlgorithmEnabled
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                  }`}
                  title={isJa ? '全7アルゴリズムから最適解を自動選定するモードのON/OFF' : 'Toggle auto algorithm selection mode ON/OFF'}
                >
                  <Bot className={`w-3 h-3 ${isAutoAlgorithmEnabled ? 'text-white' : 'text-slate-500'}`} />
                  <span>{isJa ? '自動選定' : 'Auto Mode'}</span>
                  <span className={`text-[8px] px-1 py-0.2 rounded font-mono font-extrabold ${
                    isAutoAlgorithmEnabled ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {isAutoAlgorithmEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>

                {/* Criteria Selector when Auto Mode is ON */}
                {isAutoAlgorithmEnabled && onChangeAutoCriteria && (
                  <div className="flex items-center pl-1 border-l border-slate-300">
                    <select
                      id="header-auto-criteria-select"
                      value={autoSelectCriteria}
                      onChange={(e) => onChangeAutoCriteria(e.target.value as AutoSelectCriteria)}
                      className="bg-white border border-slate-300 text-slate-900 font-bold text-[11px] rounded px-1 py-0.5 outline-none cursor-pointer"
                      title={isJa ? '自動選定の目標基準' : 'Auto selection target criteria'}
                    >
                      <option value="overall_best">{isJa ? '🏆 総合' : '🏆 Overall'}</option>
                      <option value="max_volume">{isJa ? '📦 容積' : '📦 Max Vol'}</option>
                      <option value="min_containers">{isJa ? '🚢 本数' : '🚢 Min Fleet'}</option>
                      <option value="max_stability">{isJa ? '⚖️ 重心' : '⚖️ CoG'}</option>
                      <option value="fastest">{isJa ? '⚡ 速度' : '⚡ Fast'}</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Algorithm Selector Dropdown (Active when Manual, or showing Auto status) */}
            <div className={`flex items-center border rounded-md px-1.5 py-0.5 transition-colors ${
              isAutoAlgorithmEnabled 
                ? 'bg-slate-100 border-slate-400 text-slate-900' 
                : 'bg-slate-50 border-slate-300 text-slate-700 hover:border-slate-400'
            }`}>
              <Cpu className="w-3 h-3 mr-1 shrink-0 text-slate-700" />
              
              {isAutoAlgorithmEnabled ? (
                <div className="flex items-center gap-1 font-bold text-[11px] text-slate-900">
                  <span className="truncate max-w-[120px] sm:max-w-[160px]" title={autoSelectedAlgorithmName}>
                    {autoSelectedAlgorithmName || (isJa ? '最適解自動選定中' : 'Auto-Optimized')}
                  </span>
                  <span className="bg-slate-900 text-white text-[8px] font-mono px-1 py-0.2 rounded font-bold">
                    AUTO
                  </span>
                </div>
              ) : (
                <select
                  id="algorithm-select"
                  value={algorithm}
                  onChange={(e) => onChangeAlgorithm(e.target.value as AlgorithmType)}
                  className="bg-transparent font-semibold text-[11px] text-slate-800 outline-none cursor-pointer pr-0.5"
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
                  <option value="block_building" className="bg-white text-slate-900">
                    {isJa ? 'ブロックビルディング (組積・荷崩れ防止)' : 'Block-Building (Composite Blocks)'}
                  </option>
                  <option value="beam_search" className="bg-white text-slate-900">
                    {isJa ? 'ビームサーチ探索 (先読み最適化)' : 'Beam Search (Lookahead Tree)'}
                  </option>
                </select>
              )}

              {onToggleAlgorithmPanel && (
                <button
                  type="button"
                  id="toggle-algo-panel-header-btn"
                  onClick={onToggleAlgorithmPanel}
                  className={`ml-1 p-0.5 rounded transition-colors ${
                    showAlgorithmPanel 
                      ? 'bg-slate-200 text-slate-900' 
                      : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
                  }`}
                  title={showAlgorithmPanel ? (isJa ? '設定パネルを非表示' : 'Hide Engine Settings') : (isJa ? '詳細設定パネルを表示' : 'Show Engine Settings')}
                >
                  <Sliders className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Quick Target Goal Pill (Visible when GA is active and not in auto mode) */}
            {!isAutoAlgorithmEnabled && isGA && (
              <button
                type="button"
                id="header-ga-target-btn"
                onClick={handleCycleGoal}
                className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 px-1.5 py-0.5 rounded-md font-bold text-[11px] transition-colors shadow-xs"
                title={isJa ? 'クリックして目標を切り替え' : 'Click to cycle target goal'}
              >
                <Target className="w-3 h-3 text-slate-800" />
                <span>{isJa ? '目標:' : 'Goal:'} {getGaGoalLabel()}</span>
              </button>
            )}

            {/* Language Switcher */}
            <div className="flex items-center bg-slate-100 border border-slate-300 rounded-md p-0.5 text-[10px] font-semibold text-slate-600">
              <button
                onClick={() => onChangeLanguage('ja')}
                className={`px-1 py-0.5 rounded transition-colors ${
                  language === 'ja' ? 'bg-slate-900 text-white font-bold shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                JP
              </button>
              <button
                onClick={() => onChangeLanguage('en')}
                className={`px-1 py-0.5 rounded transition-colors ${
                  language === 'en' ? 'bg-slate-900 text-white font-bold shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                EN
              </button>
            </div>

            {/* Loading_Manifest Import & Reproduce Button */}
            {onOpenImportManifest && (
              <button
                id="header-open-manifest-btn"
                type="button"
                onClick={onOpenImportManifest}
                className="px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 text-slate-900 font-bold text-[11px] flex items-center gap-1 shadow-xs border border-slate-300 transition-all active:scale-95 group"
                title={isJa ? 'Loading_Manifestファイル取込 & 3D積載再現' : 'Import Loading Manifest & Reproduce 3D Layout'}
              >
                <FileSpreadsheet className="w-3 h-3 text-blue-600 group-hover:scale-110 transition-transform" />
                <span>{isJa ? 'マニフェスト再現' : 'Manifest'}</span>
              </button>
            )}

            {/* Benchmark & Auto Comparison Button */}
            {onOpenBenchmarkModal && (
              <button
                id="open-benchmark-modal-btn"
                type="button"
                onClick={onOpenBenchmarkModal}
                className="px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 text-slate-900 font-bold text-[11px] flex items-center gap-1 shadow-xs border border-slate-300 transition-all active:scale-95 group"
                title={isJa ? '全7アルゴリズムを一括シミュレーション・比較して最適解を選択' : 'Compare all 7 algorithms in parallel & select best strategy'}
              >
                <Zap className="w-3 h-3 text-slate-800 group-hover:scale-110 transition-transform" />
                <span>{isJa ? '比較' : 'Benchmark'}</span>
              </button>
            )}

            {/* AI Advisor Button */}
            <button
              id="open-ai-advisor-btn"
              onClick={onOpenAiConsultant}
              className="px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 text-slate-900 font-bold text-[11px] flex items-center gap-1 shadow-xs border border-slate-300 transition-all active:scale-95"
            >
              <Sparkles className="w-3 h-3 text-slate-800" />
              <span>{isJa ? 'AI診断' : 'AI Advisor'}</span>
            </button>

            {/* All Clear Button in Header */}
            {onAllClear && (
              <button
                id="header-all-clear-btn"
                type="button"
                onClick={onAllClear}
                className="px-2 py-0.5 rounded-md bg-red-50 hover:bg-red-100 text-red-700 font-bold text-[11px] flex items-center gap-1 shadow-xs border border-red-200 transition-all active:scale-95 cursor-pointer"
                title={isJa ? 'すべての登録貨物をクリア (All Clear)' : 'Clear all cargo items (All Clear)'}
              >
                <Trash2 className="w-3 h-3 text-red-600" />
                <span>All Clear</span>
              </button>
            )}

            {/* Re-optimize / Run Button */}
            <button
              id="run-reoptimize-btn"
              onClick={onReoptimize}
              disabled={isCalculating}
              className="px-2.5 py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs transition-all active:scale-95"
            >
              <RefreshCw className={`w-3 h-3 ${isCalculating ? 'animate-spin text-blue-400' : ''}`} />
              <span>{isCalculating ? (isJa ? '計算中...' : 'Optimizing...') : (isJa ? '再計算' : 'Re-calculate')}</span>
            </button>

            {showCalculatingPopup && (
              <div 
                id="header-calculating-indicator"
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-600 text-white font-mono text-[10px] font-bold shadow-xs animate-pulse"
              >
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                <span>{isJa ? '演算実行中' : 'CALCULATING'}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs & Live Metrics Status Ribbon in Sticky Header */}
      <div className="px-3 sm:px-5 py-0.5 bg-slate-50/90 backdrop-blur-xs">
        <div className="max-w-7xl mx-auto flex flex-col gap-0.5">
          {/* 1st Row: Quick Summary Metrics Label (Right-aligned) */}
          <div className="flex justify-end w-full -mb-0.5">
            <div className="flex items-center gap-2 bg-white border border-slate-300 px-2 py-0.5 rounded text-slate-600 shadow-2xs text-[10.5px] leading-tight w-fit flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                {isJa ? '台数:' : 'Containers:'}{' '}
                <strong className="text-slate-900 font-mono font-bold">{containerUnitsCount} {isJa ? '台' : 'units'}</strong>
              </span>
              <span className="text-slate-300">|</span>
              <span>
                {isJa ? '積載:' : 'Packed:'}{' '}
                <strong className="text-slate-900 font-mono font-bold">{packedItemCount.toLocaleString()} / {totalItemCount.toLocaleString()}</strong>
                {safetyLimitTruncatedCount > 0 && (
                  <span 
                    id="header-safety-limit-badge"
                    title={isJa 
                      ? `安全リミット警告: 各品目最大500個の上限により、${safetyLimitTruncatedCount.toLocaleString()}個の貨物が計算から除外されています（登録総数: ${totalRawItemCount.toLocaleString()}個 / 最適化計算対象数: ${totalItemCount.toLocaleString()}個）` 
                      : `Safety limit: ${safetyLimitTruncatedCount.toLocaleString()} items excluded by max 500 units/item limit (Registered: ${totalRawItemCount.toLocaleString()} / Calculation target: ${totalItemCount.toLocaleString()})`}
                    className="ml-1.5 text-amber-800 bg-amber-100 border border-amber-300 text-[10px] px-1.5 py-0.2 rounded font-bold cursor-help inline-flex items-center gap-0.5"
                  >
                    <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                    <span>{isJa ? `-${safetyLimitTruncatedCount.toLocaleString()}除外` : `-${safetyLimitTruncatedCount.toLocaleString()} capped`}</span>
                  </span>
                )}
              </span>
              <span className="text-slate-300">|</span>
              <span>
                {isJa ? '重量:' : 'Weight:'}{' '}
                <strong className="text-slate-900 font-mono font-bold">{packedWeightKg.toLocaleString()} kg</strong>
              </span>
            </div>
          </div>

          {/* 2nd Row: Navigation Buttons */}
          <div className="flex items-center gap-1 overflow-x-auto text-[11px] font-semibold custom-scrollbar">
            <button
              id="tab-3d-btn"
              onClick={() => onChangeTab && onChangeTab('3d')}
              className={`px-2 py-0.5 rounded-md flex items-center gap-1 transition-all ${
                activeTab === '3d'
                  ? 'bg-slate-900 text-white shadow-xs font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-300'
              }`}
            >
              <Box className="w-3 h-3" />
              <span>{isJa ? '3D 積載ビュー' : '3D Load View'}</span>
            </button>

            <button
              id="tab-cargo-btn"
              onClick={() => onChangeTab && onChangeTab('cargo')}
              className={`px-2 py-0.5 rounded-md flex items-center gap-1 transition-all ${
                activeTab === 'cargo'
                  ? 'bg-slate-900 text-white shadow-xs font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-300'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>{isJa ? '貨物・荷物設定' : 'Cargo Items'}</span>
              <span 
                className={`text-[9px] px-1 py-0.2 rounded-full font-mono font-bold inline-flex items-center ${
                  activeTab === 'cargo' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'
                }`}
                title={safetyLimitTruncatedCount > 0 
                  ? (isJa ? `最適化対象: ${totalItemCount.toLocaleString()} 個 (登録総数: ${totalRawItemCount.toLocaleString()} 個 / 安全リミットで ${safetyLimitTruncatedCount.toLocaleString()} 個除外)` : `Target: ${totalItemCount.toLocaleString()} (Registered: ${totalRawItemCount.toLocaleString()} / Excluded: ${safetyLimitTruncatedCount.toLocaleString()})`)
                  : undefined
                }
              >
                {totalItemCount.toLocaleString()}
                {safetyLimitTruncatedCount > 0 && <span className="text-amber-400 font-bold ml-0.5">*</span>}
              </span>
            </button>

            <button
              id="tab-container-btn"
              onClick={() => onChangeTab && onChangeTab('container')}
              className={`px-2 py-0.5 rounded-md flex items-center gap-1 transition-all ${
                activeTab === 'container'
                  ? 'bg-slate-900 text-white shadow-xs font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-300'
              }`}
            >
              <Truck className="w-3 h-3" />
              <span>{isJa ? 'コンテナ・編成設定' : 'Container Fleet'}</span>
              <span className={`text-[9px] px-1 py-0.2 rounded font-mono font-bold ${
                activeTab === 'container' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
                {containerUnitsCount} {isJa ? '台' : 'units'}
              </span>
            </button>

            <button
              id="tab-analytics-btn"
              onClick={() => onChangeTab && onChangeTab('analytics')}
              className={`px-2 py-0.5 rounded-md flex items-center gap-1 transition-all ${
                activeTab === 'analytics'
                  ? 'bg-slate-900 text-white shadow-xs font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-300'
              }`}
            >
              <BarChart3 className="w-3 h-3" />
              <span>{isJa ? '重心・積載解析' : 'Analytics & CoG'}</span>
              <span className={`text-[9px] px-1 py-0.2 rounded font-mono font-bold ${
                activeTab === 'analytics' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
                {volumeUtilization.toFixed(0)}%
              </span>
            </button>

            <button
              id="tab-manifest-btn"
              onClick={() => onChangeTab && onChangeTab('manifest')}
              className={`px-2 py-0.5 rounded-md flex items-center gap-1 transition-all ${
                activeTab === 'manifest'
                  ? 'bg-slate-900 text-white shadow-xs font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-300'
              }`}
            >
              <ListOrdered className="w-3 h-3" />
              <span>{isJa ? '積載マニフェスト' : 'Loading Manifest'}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

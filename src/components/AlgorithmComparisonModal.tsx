import React, { useState, useMemo } from 'react';
import { Container, CargoItem, Language, UnitSystem, AlgorithmBenchmarkEntry, AutoSelectCriteria, AlgorithmType, GAGoalConfig } from '../types';
import { runAllAlgorithmsBenchmark, getBestAlgorithmForCriteria } from '../services/packingOptimizer';
import { 
  X, Cpu, Trophy, Sparkles, Check, Download, 
  RefreshCw, Zap, Box, Scale, Truck, ShieldCheck, 
  BarChart2, ArrowRight, CheckCircle2, Sliders, Info, TrendingUp, Layers, Bot
} from 'lucide-react';

interface AlgorithmComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  container: Container;
  cargoList: CargoItem[];
  containerCountMode: 'auto' | 'manual';
  containerCount: number;
  currentAlgorithm: AlgorithmType;
  currentGaConfig?: GAGoalConfig;
  isAutoAlgorithmEnabled?: boolean;
  onToggleAutoAlgorithm?: (enabled: boolean) => void;
  autoSelectCriteria?: AutoSelectCriteria;
  onChangeAutoCriteria?: (criteria: AutoSelectCriteria) => void;
  onApplyAlgorithm: (algo: AlgorithmType, gaConfig?: GAGoalConfig) => void;
  language: Language;
  unitSystem: UnitSystem;
}

export const AlgorithmComparisonModal: React.FC<AlgorithmComparisonModalProps> = ({
  isOpen,
  onClose,
  container,
  cargoList,
  containerCountMode,
  containerCount,
  currentAlgorithm,
  currentGaConfig,
  isAutoAlgorithmEnabled = false,
  onToggleAutoAlgorithm,
  autoSelectCriteria = 'overall_best',
  onChangeAutoCriteria,
  onApplyAlgorithm,
  language,
  unitSystem
}) => {
  const isJa = language === 'ja';
  const [selectedCriteria, setSelectedCriteria] = useState<AutoSelectCriteria>(autoSelectCriteria);
  const [sortKey, setSortKey] = useState<'score' | 'volume' | 'containers' | 'stability' | 'time'>('score');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [appliedId, setAppliedId] = useState<string | null>(null);

  // Sync selectedCriteria with prop when changed
  const handleSelectCriteria = (c: AutoSelectCriteria) => {
    setSelectedCriteria(c);
    if (onChangeAutoCriteria) {
      onChangeAutoCriteria(c);
    }
  };

  // Run benchmark across all 7 strategies (only when modal is open)
  const benchmarkEntries: AlgorithmBenchmarkEntry[] = useMemo(() => {
    if (!isOpen) return [];
    const countParam = containerCountMode === 'auto' ? 'auto' : containerCount;
    return runAllAlgorithmsBenchmark(container, cargoList, countParam);
  }, [isOpen, container, cargoList, containerCountMode, containerCount, isRefreshing]);

  // Find best candidates for quick cards
  const overallBest = useMemo(() => benchmarkEntries.find(e => e.isOverallBest) || benchmarkEntries[0], [benchmarkEntries]);
  const maxVolumeBest = useMemo(() => benchmarkEntries.find(e => e.isBestVolume) || benchmarkEntries[0], [benchmarkEntries]);
  const minContainersBest = useMemo(() => benchmarkEntries.find(e => e.isBestContainers) || benchmarkEntries[0], [benchmarkEntries]);
  const maxStabilityBest = useMemo(() => benchmarkEntries.find(e => e.isBestStability) || benchmarkEntries[0], [benchmarkEntries]);

  // Selected best candidate based on criteria tab
  const criteriaBest = useMemo(() => {
    if (benchmarkEntries.length === 0) return null;
    return getBestAlgorithmForCriteria(benchmarkEntries, selectedCriteria);
  }, [benchmarkEntries, selectedCriteria]);

  // Sort entries for table
  const sortedEntries = useMemo(() => {
    const list = [...benchmarkEntries];
    list.sort((a, b) => {
      let diff = 0;
      if (sortKey === 'score') diff = b.score - a.score;
      else if (sortKey === 'volume') diff = b.volumeUtilization - a.volumeUtilization;
      else if (sortKey === 'containers') diff = a.containersCount - b.containersCount;
      else if (sortKey === 'stability') diff = b.cogStabilityScore - a.cogStabilityScore;
      else if (sortKey === 'time') diff = a.calculationTimeMs - b.calculationTimeMs;
      
      return sortOrder === 'desc' ? diff : -diff;
    });
    return list;
  }, [benchmarkEntries, sortKey, sortOrder]);

  const handleApply = (entry: AlgorithmBenchmarkEntry) => {
    onApplyAlgorithm(entry.algorithm, entry.gaConfig);
    setAppliedId(entry.id);
    setTimeout(() => {
      onClose();
    }, 400);
  };

  const handleRefresh = () => {
    setIsRefreshing(prev => !prev);
  };

  const handleExportCSV = () => {
    const headers = [
      isJa ? 'アルゴリズム名' : 'Algorithm Name',
      isJa ? '戦略タイプ' : 'Strategy Type',
      isJa ? '総合スコア' : 'Composite Score',
      isJa ? '容積充填率(%)' : 'Volume Utilization (%)',
      isJa ? '重量利用率(%)' : 'Weight Utilization (%)',
      isJa ? 'コンテナ本数' : 'Containers Count',
      isJa ? '積載個数' : 'Packed Items',
      isJa ? '未積載個数' : 'Unplaced Items',
      isJa ? '重心オフセットX(%)' : 'CoG Offset X (%)',
      isJa ? '重心オフセットY(%)' : 'CoG Offset Y (%)',
      isJa ? '重心安定度(点)' : 'Stability Score',
      isJa ? '計算時間(ms)' : 'Calculation Time (ms)',
      isJa ? '推定運賃' : 'Estimated Cost',
      isJa ? '推奨用途' : 'Recommended Suitability'
    ];

    const rows = sortedEntries.map(e => [
      `"${isJa ? e.nameJa : e.nameEn}"`,
      `"${isJa ? e.strategyLabelJa : e.strategyLabelEn}"`,
      e.score,
      e.volumeUtilization,
      e.weightUtilization,
      e.containersCount,
      e.packedCount,
      e.unplacedCount,
      e.cogOffsetX,
      e.cogOffsetY,
      e.cogStabilityScore,
      e.calculationTimeMs,
      e.estimatedCost,
      `"${isJa ? e.suitabilityJa : e.suitabilityEn}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `algorithm_benchmark_comparison_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isCurrentActive = (entry: AlgorithmBenchmarkEntry) => {
    if (entry.algorithm !== currentAlgorithm) return false;
    if (entry.algorithm === 'genetic_algorithm') {
      const currentGoal = currentGaConfig?.goal || 'max_volume';
      const entryGoal = entry.gaConfig?.goal || 'max_volume';
      return currentGoal === entryGoal;
    }
    return true;
  };

  if (!isOpen || !criteriaBest) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div 
        id="algorithm-comparison-modal" 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden my-auto"
      >
        {/* Modal Top Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-4 shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-inner">
              <Zap className="w-5 h-5 text-yellow-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight">
                  {isJa ? '自動アルゴリズム切り替え & 一括比較ベンチマーク' : 'Algorithm Benchmark & Auto-Selector'}
                </h2>
                <span className="bg-yellow-400/20 text-yellow-300 border border-yellow-400/30 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                  MULTI-STRATEGY
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {isJa 
                  ? '全7種類の幾何学・AI遺伝的最適化アルゴリズムを一括シミュレーションし、最適解を比較・自動選定します' 
                  : 'Simulate and compare all 7 geometric and AI genetic packing engines simultaneously to choose the best plan'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="refresh-benchmark-btn"
              onClick={handleRefresh}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title={isJa ? '再ベンチマーク実行' : 'Re-run Benchmark'}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              id="export-benchmark-csv-btn"
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isJa ? 'CSVエクスポート' : 'Export CSV'}</span>
            </button>
            <button
              id="close-benchmark-modal-btn"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/60">
          
          {/* Top Recommendation & Auto-Selector Bar */}
          <div className="bg-white border border-blue-200 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-blue-100 text-blue-800 font-bold text-xs px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-blue-600" />
                  {isJa ? 'AI 推奨エンジン' : 'AI Recommendation'}
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  {isJa ? '対象貨物:' : 'Cargo set:'} <strong>{cargoList.reduce((s, c) => s + c.quantity, 0)} {isJa ? '個' : 'items'}</strong> / {container.name}
                </span>

                {onToggleAutoAlgorithm && (
                  <button
                    type="button"
                    id="modal-auto-toggle-btn"
                    onClick={() => onToggleAutoAlgorithm(!isAutoAlgorithmEnabled)}
                    className={`ml-2 px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 border transition-all ${
                      isAutoAlgorithmEnabled
                        ? 'bg-blue-600 text-white border-blue-700'
                        : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    <Bot className="w-3 h-3" />
                    <span>{isJa ? '自動選定モード:' : 'Auto Mode:'} <strong>{isAutoAlgorithmEnabled ? 'ON' : 'OFF'}</strong></span>
                  </button>
                )}
              </div>
              
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {isJa ? criteriaBest.nameJa : criteriaBest.nameEn}
                </h3>
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-300 font-mono font-bold text-xs px-2 py-0.5 rounded-md">
                  {isJa ? '総合スコア:' : 'Score:'} {criteriaBest.score}/100
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                {isJa ? criteriaBest.descriptionJa : criteriaBest.descriptionEn}
              </p>
            </div>

            {/* Quick Apply Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full lg:w-auto shrink-0">
              {onToggleAutoAlgorithm && !isAutoAlgorithmEnabled && (
                <button
                  id="apply-and-enable-auto-btn"
                  type="button"
                  onClick={() => {
                    onToggleAutoAlgorithm(true);
                    handleApply(criteriaBest);
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95"
                  title={isJa ? '自動選定モードをONにして適用' : 'Enable auto-selector mode & apply'}
                >
                  <Bot className="w-4 h-4 text-indigo-600" />
                  <span>{isJa ? '自動選定をONにして適用' : 'Enable Auto & Apply'}</span>
                </button>
              )}

              <button
                id="apply-recommended-algo-btn"
                type="button"
                onClick={() => handleApply(criteriaBest)}
                className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95"
              >
                <Zap className="w-4 h-4 text-yellow-300 fill-yellow-300" />
                <span>{isJa ? 'このアルゴリズムを適用' : 'Apply Selected Algorithm'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Criteria Filter Selector Tabs */}
          <div className="flex items-center justify-between gap-2 flex-wrap pb-1 border-b border-slate-200">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-700 mr-1">
                {isJa ? '最適化方針:' : 'Auto Select Target:'}
              </span>
              {[
                { id: 'overall_best', labelJa: '🏆 総合バランス最良', labelEn: '🏆 Overall Best' },
                { id: 'max_volume', labelJa: '📦 容積充填率 最大化', labelEn: '📦 Max Volume' },
                { id: 'min_containers', labelJa: '🚢 コンテナ本数 最小化', labelEn: '🚢 Min Containers' },
                { id: 'max_stability', labelJa: '⚖️ 重心安定・偏荷重防止', labelEn: '⚖️ Max Stability' },
                { id: 'fastest', labelJa: '⚡ 高速計算', labelEn: '⚡ Fastest Calculation' }
              ].map(c => (
                <button
                  key={c.id}
                  id={`criteria-tab-${c.id}`}
                  onClick={() => handleSelectCriteria(c.id as AutoSelectCriteria)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    selectedCriteria === c.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {isJa ? c.labelJa : c.labelEn}
                </button>
              ))}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-semibold">{isJa ? '並び替え:' : 'Sort by:'}</span>
              <select
                id="benchmark-sort-select"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as any)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 font-bold outline-none cursor-pointer"
              >
                <option value="score">{isJa ? '総合スコア順' : 'Composite Score'}</option>
                <option value="volume">{isJa ? '容積充填率 (%) 順' : 'Volume Utilization'}</option>
                <option value="containers">{isJa ? 'コンテナ本数 順' : 'Containers Count'}</option>
                <option value="stability">{isJa ? '重心安定度 順' : 'Stability Score'}</option>
                <option value="time">{isJa ? '計算速度 順' : 'Speed / Time'}</option>
              </select>
            </div>
          </div>

          {/* Top 3 Category Winner Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Winner 1: Volume */}
            <div className="bg-white border border-blue-200 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Box className="w-3 h-3 text-blue-600" />
                    {isJa ? '最高容積充填' : 'Highest Volume'}
                  </span>
                  <span className="text-sm font-extrabold text-blue-700 font-mono">
                    {maxVolumeBest.volumeUtilization}%
                  </span>
                </div>
                <h4 className="font-bold text-xs sm:text-sm text-slate-900 line-clamp-1">
                  {isJa ? maxVolumeBest.nameJa : maxVolumeBest.nameEn}
                </h4>
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                  {isJa ? maxVolumeBest.suitabilityJa : maxVolumeBest.suitabilityEn}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleApply(maxVolumeBest)}
                className="mt-3 w-full py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-colors"
              >
                {isCurrentActive(maxVolumeBest) ? (isJa ? '✓ 適用中' : '✓ Active') : (isJa ? 'この方式を適用' : 'Apply')}
              </button>
            </div>

            {/* Winner 2: Min Containers */}
            <div className="bg-white border border-amber-200 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Truck className="w-3 h-3 text-amber-600" />
                    {isJa ? '最少コンテナ台数' : 'Fewest Containers'}
                  </span>
                  <span className="text-sm font-extrabold text-amber-700 font-mono">
                    {minContainersBest.containersCount} {isJa ? '台' : 'units'}
                  </span>
                </div>
                <h4 className="font-bold text-xs sm:text-sm text-slate-900 line-clamp-1">
                  {isJa ? minContainersBest.nameJa : minContainersBest.nameEn}
                </h4>
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                  {isJa ? minContainersBest.suitabilityJa : minContainersBest.suitabilityEn}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleApply(minContainersBest)}
                className="mt-3 w-full py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition-colors"
              >
                {isCurrentActive(minContainersBest) ? (isJa ? '✓ 適用中' : '✓ Active') : (isJa ? 'この方式を適用' : 'Apply')}
              </button>
            </div>

            {/* Winner 3: Stability */}
            <div className="bg-white border border-emerald-200 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Scale className="w-3 h-3 text-emerald-600" />
                    {isJa ? '最高重心安定度' : 'Max CoG Stability'}
                  </span>
                  <span className="text-sm font-extrabold text-emerald-700 font-mono">
                    {maxStabilityBest.cogStabilityScore} / 100
                  </span>
                </div>
                <h4 className="font-bold text-xs sm:text-sm text-slate-900 line-clamp-1">
                  {isJa ? maxStabilityBest.nameJa : maxStabilityBest.nameEn}
                </h4>
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                  {isJa ? maxStabilityBest.suitabilityJa : maxStabilityBest.suitabilityEn}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleApply(maxStabilityBest)}
                className="mt-3 w-full py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition-colors"
              >
                {isCurrentActive(maxStabilityBest) ? (isJa ? '✓ 適用中' : '✓ Active') : (isJa ? 'この方式を適用' : 'Apply')}
              </button>
            </div>
          </div>

          {/* Full Benchmark Comparison Cards / Table */}
          <div className="space-y-3">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-slate-600" />
              {isJa ? '全7方式の詳細比較マトリックス' : 'Complete 7-Strategy Benchmark Matrix'}
            </h3>

            <div className="grid grid-cols-1 gap-3">
              {sortedEntries.map((entry, index) => {
                const isActive = isCurrentActive(entry);
                const isSelectedForCriteria = criteriaBest.id === entry.id;

                return (
                  <div
                    key={entry.id}
                    id={`benchmark-card-${entry.id}`}
                    className={`bg-white rounded-xl border p-4 transition-all ${
                      isActive
                        ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md'
                        : isSelectedForCriteria
                        ? 'border-emerald-400 bg-emerald-50/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                      
                      {/* Left: Info & Badges */}
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-bold text-slate-400 w-5">
                            #{index + 1}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            entry.tag === 'AI OPTIMIZATION'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {entry.tag}
                          </span>

                          {entry.isOverallBest && (
                            <span className="bg-yellow-100 text-yellow-800 border border-yellow-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                              👑 {isJa ? '総合スコア1位' : 'Overall Top 1'}
                            </span>
                          )}

                          {entry.isBestVolume && (
                            <span className="bg-blue-100 text-blue-800 border border-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              📦 {isJa ? '容積率 1位' : 'Max Volume'}
                            </span>
                          )}

                          {entry.isBestContainers && (
                            <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              🚢 {isJa ? 'コンテナ本数 最小' : 'Min Containers'}
                            </span>
                          )}

                          {entry.isBestStability && (
                            <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              ⚖️ {isJa ? '重心安定 1位' : 'Best CoG'}
                            </span>
                          )}

                          {isActive && (
                            <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                              {isJa ? '● 現在適用中' : '● ACTIVE'}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-sm sm:text-base text-slate-900">
                            {isJa ? entry.nameJa : entry.nameEn}
                          </h4>
                          <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                            ({isJa ? entry.strategyLabelJa : entry.strategyLabelEn})
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed">
                          {isJa ? entry.descriptionJa : entry.descriptionEn}
                        </p>

                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <strong className="text-slate-700">{isJa ? '推奨シナリオ:' : 'Best For:'}</strong>
                          <span>{isJa ? entry.suitabilityJa : entry.suitabilityEn}</span>
                        </div>
                      </div>

                      {/* Middle: Metrics Comparison Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 shrink-0 w-full lg:w-auto text-xs">
                        {/* Volume */}
                        <div className="text-center px-2">
                          <div className="text-[10px] text-slate-500 font-semibold mb-0.5">
                            {isJa ? '容積充填率' : 'Volume'}
                          </div>
                          <div className="text-sm font-extrabold text-blue-700 font-mono">
                            {entry.volumeUtilization}%
                          </div>
                          <div className="w-16 h-1.5 bg-slate-200 rounded-full mx-auto mt-1 overflow-hidden">
                            <div 
                              className="h-full bg-blue-600 rounded-full" 
                              style={{ width: `${Math.min(100, entry.volumeUtilization)}%` }} 
                            />
                          </div>
                        </div>

                        {/* Containers & Items */}
                        <div className="text-center px-2 border-l border-slate-200">
                          <div className="text-[10px] text-slate-500 font-semibold mb-0.5">
                            {isJa ? 'コンテナ / 積載' : 'Fleet / Items'}
                          </div>
                          <div className="text-sm font-extrabold text-slate-900 font-mono">
                            {entry.containersCount} {isJa ? '台' : 'u'}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {entry.packedCount}/{entry.totalItemsCount}
                          </div>
                        </div>

                        {/* CoG Stability */}
                        <div className="text-center px-2 border-l border-slate-200">
                          <div className="text-[10px] text-slate-500 font-semibold mb-0.5">
                            {isJa ? '重心安定度' : 'Stability'}
                          </div>
                          <div className="text-sm font-extrabold text-emerald-700 font-mono">
                            {entry.cogStabilityScore} <span className="text-[10px] text-slate-400 font-normal">/100</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            Y: {entry.cogOffsetY > 0 ? `+${entry.cogOffsetY}` : entry.cogOffsetY}%
                          </div>
                        </div>

                        {/* Composite Score & Speed */}
                        <div className="text-center px-2 border-l border-slate-200">
                          <div className="text-[10px] text-slate-500 font-semibold mb-0.5">
                            {isJa ? '総合スコア' : 'Total Score'}
                          </div>
                          <div className="text-sm font-extrabold text-slate-900 font-mono">
                            {entry.score}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {entry.calculationTimeMs}ms
                          </div>
                        </div>
                      </div>

                      {/* Right: Apply Action */}
                      <div className="w-full lg:w-32 shrink-0 flex items-center justify-end">
                        <button
                          type="button"
                          id={`apply-btn-${entry.id}`}
                          onClick={() => handleApply(entry)}
                          className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                            isActive
                              ? 'bg-blue-600 text-white cursor-default'
                              : 'bg-white hover:bg-blue-600 text-slate-700 hover:text-white border border-slate-300 hover:border-blue-600'
                          }`}
                        >
                          {isActive ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>{isJa ? '適用中' : 'Active'}</span>
                            </>
                          ) : (
                            <>
                              <span>{isJa ? '適用する' : 'Apply'}</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Modal Bottom Footer */}
        <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 hidden sm:block">
            {isJa 
              ? '※ 最適化結果は貨物リストおよびコンテナ仕様に基づいてリアルタイムに算出されています。' 
              : '※ Benchmark results are calculated dynamically using current cargo specifications and container constraints.'}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-colors"
            >
              {isJa ? '閉じる' : 'Close'}
            </button>
            <button
              type="button"
              onClick={() => handleApply(criteriaBest)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Zap className="w-3.5 h-3.5 text-yellow-300" />
              <span>{isJa ? '最適解を適用して完了' : 'Apply Best & Finish'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

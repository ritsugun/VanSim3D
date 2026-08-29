import React, { useState } from 'react';
import { AlgorithmType, GAGoalConfig, GAOptimizationGoal, GAParameterInfo, Language, AutoSelectCriteria } from '../types';
import { 
  Cpu, Target, Box, Scale, Package, 
  ChevronDown, ChevronUp, CheckCircle2, Sparkles, SlidersHorizontal,
  Dna, Activity, Zap, RefreshCw, BarChart2, ShieldCheck, Tag, Info, Check, Bot
} from 'lucide-react';

interface AlgorithmSettingsPanelProps {
  algorithm: AlgorithmType;
  gaConfig: GAGoalConfig;
  gaParameters?: GAParameterInfo;
  onChangeAlgorithm: (algo: AlgorithmType) => void;
  onChangeGaConfig: (config: GAGoalConfig) => void;
  isAutoAlgorithmEnabled?: boolean;
  onToggleAutoAlgorithm?: (enabled: boolean) => void;
  autoSelectCriteria?: AutoSelectCriteria;
  onChangeAutoCriteria?: (criteria: AutoSelectCriteria) => void;
  autoSelectedAlgorithmName?: string;
  onOpenBenchmarkModal?: () => void;
  language: Language;
}

export const AlgorithmSettingsPanel: React.FC<AlgorithmSettingsPanelProps> = ({
  algorithm,
  gaConfig,
  gaParameters,
  onChangeAlgorithm,
  onChangeGaConfig,
  isAutoAlgorithmEnabled = false,
  onToggleAutoAlgorithm,
  autoSelectCriteria = 'overall_best',
  onChangeAutoCriteria,
  autoSelectedAlgorithmName,
  onOpenBenchmarkModal,
  language
}) => {
  const isJa = language === 'ja';
  const isGA = algorithm === 'genetic_algorithm';
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const algorithms: { id: AlgorithmType; nameJa: string; nameEn: string; descJa: string; descEn: string; tag: string }[] = [
    {
      id: 'extreme_points_bfd',
      nameJa: 'Extreme Points 3D (最高空間効率)',
      nameEn: 'Extreme Points 3D (Max Space)',
      descJa: '角や隙間に大型品から順次充填する幾何学的配置エンジン',
      descEn: 'Geometric corner placement sorting largest volume items first',
      tag: 'HEURISTIC'
    },
    {
      id: 'genetic_algorithm',
      nameJa: '🧬 遺伝的アルゴリズム (AI Genetic Algorithm)',
      nameEn: '🧬 Genetic Algorithm (AI Optimization)',
      descJa: '世代交代・変異で最適順序を探索。目標設定(容積・本数・重量)に対応',
      descEn: 'Evolutionary search across generations to optimize sequence, orientation, and target goals',
      tag: 'AI OPTIMIZATION'
    },
    {
      id: 'wall_building',
      nameJa: 'ウォールビルディング (荷崩れ防止・安定)',
      nameEn: 'Wall Building (Transit Stability)',
      descJa: '同種品目を壁状に整列して段積みする実務向け荷崩れ抑制方式',
      descEn: 'Builds stable transverse cargo walls to prevent transit collapse',
      tag: 'HEURISTIC'
    },
    {
      id: 'weight_balanced',
      nameJa: '重量重心バランス重視 (軸重均等化)',
      nameEn: 'Weight-Balanced (Center of Gravity)',
      descJa: '重い荷物を底面および中央軸へ重点配置し偏荷重・横転を防止',
      descEn: 'Prioritizes center of gravity stability and axle weight balance',
      tag: 'HEURISTIC'
    },
    {
      id: 'layer_stacking',
      nameJa: 'レイヤースタッキング (均一多段積み)',
      nameEn: 'Layer Stacking (Flat Density)',
      descJa: '高さを揃えて水平な層を形成しながら下から順に積み上げる方式',
      descEn: 'Creates flat horizontal layers for maximum tier stability',
      tag: 'HEURISTIC'
    },
    {
      id: 'block_building',
      nameJa: 'ブロックビルディング (組積・荷崩れ防止)',
      nameEn: 'Block-Building (Composite Blocks)',
      descJa: '同種品目を複合ブロック化して配置し、100%フラットな底面支持と荷崩れ防止を最優先',
      descEn: 'Pre-assembles identical items into solid 3D composite blocks ensuring 100% base support',
      tag: 'STABILITY FIRST'
    },
    {
      id: 'beam_search',
      nameJa: 'ビームサーチ探索 (先読み最適化)',
      nameEn: 'Beam Search (Lookahead Tree)',
      descJa: '上位K個の有望な積載状態を同時に保持・先読み探索し、高速・高密度・安定配置を実現',
      descEn: 'Explores top-K partial loading states simultaneously with multi-step lookahead',
      tag: 'TREE SEARCH'
    }
  ];

  const targetOptimizationOptions: {
    id: GAOptimizationGoal;
    titleJa: string;
    titleEn: string;
    subtitleJa: string;
    subtitleEn: string;
    descJa: string;
    descEn: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeJa: string;
    badgeEn: string;
  }[] = [
    {
      id: 'max_volume',
      titleJa: 'Maximize Volume',
      titleEn: 'Maximize Volume',
      subtitleJa: '容積充填率 最大化',
      subtitleEn: 'Max Space Utilization',
      descJa: '空間の隙間を極限まで埋め、コンテナの容積利用率を最高まで引き上げます。',
      descEn: 'Packs tightly into all corners to maximize total cubic volume utilization.',
      icon: Box,
      badgeJa: '空間効率重視',
      badgeEn: 'Max Volume'
    },
    {
      id: 'min_containers',
      titleJa: 'Minimize Container Count',
      titleEn: 'Minimize Container Count',
      subtitleJa: 'コンテナ本数 最小化',
      subtitleEn: 'Minimize Fleet Count',
      descJa: '荷物を極力少数のコンテナへ集約し、必要コンテナ台数と輸送運賃コストを最小化します。',
      descEn: 'Aggressively consolidates cargo into fewest containers to cut total freight costs.',
      icon: Package,
      badgeJa: 'コスト削減',
      badgeEn: 'Cost Reduction'
    },
    {
      id: 'balance_weight',
      titleJa: 'Balance Weight Distribution',
      titleEn: 'Balance Weight Distribution',
      subtitleJa: '重量配分・軸重バランス',
      subtitleEn: 'Axle Balance & CoG',
      descJa: '左右の偏荷重（Y軸）を徹底排除し、道路交通法や海上コンテナの軸重基準に最適化します。',
      descEn: 'Strictly balances lateral center of gravity (Y-axis) and prevents axle overloads.',
      icon: Scale,
      badgeJa: '横転防止・安全',
      badgeEn: 'Safety & CoG'
    }
  ];

  const handleSelectTargetGoal = (goal: GAOptimizationGoal) => {
    // Automatically switch to Genetic Algorithm mode if not active
    if (!isGA) {
      onChangeAlgorithm('genetic_algorithm');
    }

    if (goal === 'max_volume') {
      onChangeGaConfig({ goal, volumeWeight: 100, cogBalanceWeight: 30, lowCenterWeight: 30, priorityWeight: 20 });
    } else if (goal === 'min_containers') {
      onChangeGaConfig({ goal, volumeWeight: 100, cogBalanceWeight: 20, lowCenterWeight: 20, priorityWeight: 10 });
    } else if (goal === 'balance_weight') {
      onChangeGaConfig({ goal, volumeWeight: 50, cogBalanceWeight: 100, lowCenterWeight: 80, priorityWeight: 20 });
    }
  };

  return (
    <div id="algorithm-settings-panel" className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden transition-all">
      {/* Panel Top Header Bar */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            isAutoAlgorithmEnabled 
              ? 'bg-blue-600 text-white' 
              : isGA 
                ? 'bg-emerald-100 text-emerald-700' 
                : 'bg-blue-100 text-blue-700'
          }`}>
            {isAutoAlgorithmEnabled ? <Bot className="w-4 h-4 text-yellow-300" /> : <Cpu className="w-4 h-4" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
                {isJa ? '積載アルゴリズム設定' : 'Algorithm & Engine Settings'}
              </h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isAutoAlgorithmEnabled
                  ? 'bg-blue-50 text-blue-700 border-blue-300 font-mono'
                  : isGA 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                    : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}>
                {isAutoAlgorithmEnabled 
                  ? '🤖 AUTO SELECTOR ON' 
                  : isGA ? '🧬 AI GENETIC ACTIVE' : 'HEURISTIC ENGINE'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 hidden sm:block">
              {isJa 
                ? '幾何学的探索またはAI遺伝的探索アルゴリズムの選択と最適化目標の設定' 
                : 'Configure packing optimization logic and multi-objective fitness targets'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Auto Selector Toggle Pill in Header */}
          {onToggleAutoAlgorithm && (
            <button
              type="button"
              id="panel-auto-toggle-btn"
              onClick={() => onToggleAutoAlgorithm(!isAutoAlgorithmEnabled)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all ${
                isAutoAlgorithmEnabled
                  ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              <Bot className={`w-3.5 h-3.5 ${isAutoAlgorithmEnabled ? 'text-yellow-300' : 'text-slate-500'}`} />
              <span>{isJa ? '自動選定:' : 'Auto Mode:'}</span>
              <span className={`font-mono font-extrabold ${isAutoAlgorithmEnabled ? 'text-yellow-300' : 'text-slate-500'}`}>
                {isAutoAlgorithmEnabled ? 'ON' : 'OFF'}
              </span>
            </button>
          )}

          {/* Benchmark comparison button */}
          {onOpenBenchmarkModal && (
            <button
              type="button"
              id="panel-open-benchmark-btn"
              onClick={onOpenBenchmarkModal}
              className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs flex items-center gap-1.5 border border-amber-200 shadow-xs transition-all active:scale-95"
              title={isJa ? '全アルゴリズムを一括シミュレーションして比較' : 'Benchmark & compare all algorithms'}
            >
              <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
              <span>{isJa ? '⚡ 一括比較' : '⚡ Benchmark'}</span>
            </button>
          )}

          {/* Quick toggle algorithm dropdown in header bar (Active in manual mode) */}
          {!isAutoAlgorithmEnabled && (
            <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
              <span className="text-[11px] font-semibold text-slate-500 mr-2">
                {isJa ? '手動選定:' : 'Engine:'}
              </span>
              <select
                id="algorithm-select-panel"
                value={algorithm}
                onChange={(e) => onChangeAlgorithm(e.target.value as AlgorithmType)}
                className="bg-transparent font-bold text-xs text-slate-800 outline-none cursor-pointer pr-1"
              >
                {algorithms.map(algo => (
                  <option key={algo.id} value={algo.id}>
                    {isJa ? algo.nameJa : algo.nameEn}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Content Body */}
      {isExpanded && (
        <div className="p-4 sm:p-5 space-y-4">

          {/* Auto Algorithm Mode Card */}
          <div className={`rounded-xl border p-4 transition-all ${
            isAutoAlgorithmEnabled
              ? 'bg-blue-50/70 border-blue-300 shadow-xs'
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${
                  isAutoAlgorithmEnabled ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      {isJa ? '自動アルゴリズム切り替え機能 (Auto-Selector)' : 'Auto Algorithm Selection & Benchmark Engine'}
                    </h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isAutoAlgorithmEnabled
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}>
                      {isAutoAlgorithmEnabled ? (isJa ? '有効 (ON)' : 'ENABLED') : (isJa ? '無効 (OFF)' : 'DISABLED')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    {isJa 
                      ? 'ONにすると、貨物やコンテナの増減・変更時に全7戦略を一括シミュレーションし、指定目標に最も適した最適解を自動適用します。' 
                      : 'When enabled, the engine benchmarks all 7 algorithms in parallel on data changes and auto-applies the optimal strategy.'}
                  </p>
                </div>
              </div>

              {onToggleAutoAlgorithm && (
                <button
                  type="button"
                  onClick={() => onToggleAutoAlgorithm(!isAutoAlgorithmEnabled)}
                  className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all active:scale-95 shadow-xs ${
                    isAutoAlgorithmEnabled
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>{isAutoAlgorithmEnabled ? (isJa ? '自動選定をOFFにする' : 'Switch to Manual Mode') : (isJa ? '自動選定をONにする' : 'Enable Auto-Selector')}</span>
                </button>
              )}
            </div>

            {/* Criteria Tabs (Shown when Auto Mode is active) */}
            {isAutoAlgorithmEnabled && onChangeAutoCriteria && (
              <div className="mt-3 pt-3 border-t border-blue-200/80">
                <p className="text-[11px] font-bold text-blue-900 mb-2">
                  {isJa ? '🎯 自動選定の優先目標基準を選択:' : '🎯 Select Auto-Selection Target Objective:'}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {[
                    { id: 'overall_best' as AutoSelectCriteria, labelJa: '🏆 総合バランス最良', labelEn: '🏆 Overall Best', descJa: '容積率・本数・重心を総合評価' },
                    { id: 'max_volume' as AutoSelectCriteria, labelJa: '📦 容積充填率 最大化', labelEn: '📦 Max Volume', descJa: '空間の無駄を極限まで排除' },
                    { id: 'min_containers' as AutoSelectCriteria, labelJa: '🚢 コンテナ本数 最小化', labelEn: '🚢 Min Fleet', descJa: '台数と運賃コストを最小化' },
                    { id: 'max_stability' as AutoSelectCriteria, labelJa: '⚖️ 重心安定・偏荷重防止', labelEn: '⚖️ CoG Stability', descJa: '左右偏荷重ゼロ・低重心化' },
                    { id: 'fastest' as AutoSelectCriteria, labelJa: '⚡ 高速計算・即時', labelEn: '⚡ Fastest Calc', descJa: '最短時間で最適化完了' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => onChangeAutoCriteria(tab.id)}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        autoSelectCriteria === tab.id
                          ? 'bg-white border-blue-600 ring-2 ring-blue-500/20 shadow-xs'
                          : 'bg-white/60 hover:bg-white border-blue-200/80 text-slate-700'
                      }`}
                    >
                      <div className="font-bold text-xs text-slate-900 leading-tight">
                        {isJa ? tab.labelJa : tab.labelEn}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 leading-tight">
                        {tab.descJa}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Target Optimization Section (Always visible, highlights active target) */}
          <div id="target-optimization-section" className={`rounded-xl border p-4 transition-all ${
            isGA 
              ? 'bg-emerald-50/60 border-emerald-200 shadow-xs' 
              : 'bg-slate-50/70 border-slate-200'
          }`}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${
                  isGA ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
                      Target Optimization
                    </h3>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-200">
                      {isJa ? '遺伝的アルゴリズム (GA) 最適化目標' : 'Genetic Algorithm Goal'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    {isJa 
                      ? '遺伝的アルゴリズムの探索適応度（Fitness）の最優先方針を選択してください（クリックで即時適用）：' 
                      : 'Select the primary optimization target objective for the Genetic Algorithm fitness function:'}
                  </p>
                </div>
              </div>

              {!isGA && (
                <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                  {isJa ? '💡 目標をクリックすると自動でGAに切り替わります' : '💡 Selecting a goal switches to GA mode'}
                </span>
              )}
            </div>

            {/* 3 Target Optimization Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {targetOptimizationOptions.map((opt) => {
                const isSelected = isGA && (gaConfig.goal === opt.id || (opt.id === 'max_volume' && !['min_containers', 'balance_weight'].includes(gaConfig.goal)));
                const Icon = opt.icon;

                return (
                  <button
                    key={opt.id}
                    id={`target-opt-${opt.id}`}
                    type="button"
                    onClick={() => handleSelectTargetGoal(opt.id)}
                    className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between group cursor-pointer ${
                      isSelected
                        ? 'bg-white border-emerald-500 shadow-md ring-2 ring-emerald-500/20 text-slate-900'
                        : 'bg-white/80 border-slate-200 hover:bg-white hover:border-slate-300 text-slate-700 hover:shadow-xs'
                    }`}
                  >
                    <div>
                      {/* Top icon and badge */}
                      <div className="flex items-center justify-between mb-2">
                        <div className={`p-2 rounded-lg transition-colors ${
                          isSelected 
                            ? 'bg-emerald-600 text-white shadow-xs' 
                            : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isSelected
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {isJa ? opt.badgeJa : opt.badgeEn}
                          </span>
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          )}
                        </div>
                      </div>

                      {/* Titles */}
                      <div className="font-bold text-xs sm:text-sm text-slate-900">
                        {isJa ? opt.subtitleJa : opt.titleEn}
                      </div>
                      <div className="text-[11px] font-medium text-slate-500 mb-2">
                        {isJa ? opt.titleJa : opt.subtitleEn}
                      </div>

                      {/* Description */}
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {isJa ? opt.descJa : opt.descEn}
                      </p>
                    </div>

                    {/* Bottom Status bar */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <span className={`font-semibold ${isSelected ? 'text-emerald-700' : 'text-slate-400 group-hover:text-slate-600'}`}>
                        {isSelected ? (isJa ? '● 適用中' : '● ACTIVE') : (isJa ? '選択して適用' : 'Click to apply')}
                      </span>
                      {isSelected && (
                        <span className="text-[10px] text-emerald-600 font-mono font-bold">
                          Fitness Target ✓
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Engine Selector Row & Safety Constraints */}
          <div className="flex items-center justify-between text-xs text-slate-500 px-1 pt-1 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">
                {isJa ? '利用可能なアルゴリズム一覧:' : 'Available packing algorithms:'}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {algorithms.map(algo => (
                  <button
                    key={algo.id}
                    id={`btn-algo-${algo.id}`}
                    onClick={() => onChangeAlgorithm(algo.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                      algorithm === algo.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isJa ? algo.nameJa.split(' (')[0] : algo.nameEn.split(' (')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Bottom Support Constraint Badge */}
            <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isJa ? '底面完全支持・浮遊禁止 常時有効' : '100% Bottom Support Enforced'}</span>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

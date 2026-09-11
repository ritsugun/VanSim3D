import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Container, CargoItem, PackedItem, PackingResult, AlgorithmType, UnitSystem, Language, GAGoalConfig, AutoSelectCriteria, UnplacedItem } from './types';
import { STANDARD_CONTAINERS, SAMPLE_CARGO_PRESETS } from './data/presets';
import { run3DPackingOptimizer, runAllAlgorithmsBenchmark, getBestAlgorithmForCriteria } from './services/packingOptimizer';
import { applyManualItemPlacement, applyManualItemMove, applyManualItemRemove, applyManualUnloadContainer } from './utils/manualAdjustment';
import { Header } from './components/Header';
import { AlgorithmSettingsPanel } from './components/AlgorithmSettingsPanel';
import { ContainerViewer3D } from './components/ContainerViewer3D';
import { CargoManager } from './components/CargoManager';
import { ContainerSelector } from './components/ContainerSelector';
import { PackingAnalytics } from './components/PackingAnalytics';
import { LoadingGuideTable } from './components/LoadingGuideTable';
import { AiConsultantModal } from './components/AiConsultantModal';
import { AlgorithmComparisonModal } from './components/AlgorithmComparisonModal';
import { ManifestImportModal } from './components/ManifestImportModal';
import { 
  Box, BarChart3, ListOrdered, Truck, Sparkles, 
  Layers, Sliders, CheckCircle2, ShieldAlert, Zap, Bot,
  AlertTriangle, ChevronDown, RefreshCw, Trash2, FileSpreadsheet
} from 'lucide-react';

const ALGORITHM_DISPLAY_NAMES: Record<AlgorithmType, { ja: string; en: string }> = {
  genetic_algorithm: { ja: '遺伝的アルゴリズム (GA)', en: 'Genetic Algorithm (GA)' },
  extreme_points_bfd: { ja: 'エクストリームポイント (EP-BFD)', en: 'Extreme Point (EP-BFD)' },
  wall_building: { ja: 'ウォールビルディング (荷崩れ防止)', en: 'Wall Building' },
  weight_balanced: { ja: '重量重心バランス重視', en: 'Weight Balanced' },
  layer_stacking: { ja: 'レイヤースタッキング', en: 'Layer Stacking' },
  block_building: { ja: 'ブロックビルディング', en: 'Block Building' },
  beam_search: { ja: 'ビームサーチ探索', en: 'Beam Search' }
};

export default function App() {
  // Application State
  const [language, setLanguage] = useState<Language>('en');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [algorithm, setAlgorithm] = useState<AlgorithmType>('extreme_points_bfd');
  const [gaConfig, setGaConfig] = useState<GAGoalConfig>({ goal: 'max_volume' });
  const [isAutoAlgorithmEnabled, setIsAutoAlgorithmEnabled] = useState<boolean>(false);
  const [autoSelectCriteria, setAutoSelectCriteria] = useState<AutoSelectCriteria>('overall_best');

  const [selectedContainer, setSelectedContainer] = useState<Container>(STANDARD_CONTAINERS[1]); // 40GP default
  const [cargoList, setCargoList] = useState<CargoItem[]>(() => SAMPLE_CARGO_PRESETS[0].items);
  const [containerCountMode, setContainerCountMode] = useState<'auto' | 'manual'>('auto');
  const [containerCount, setContainerCount] = useState<number>(1);
  const [activeContainerIndex, setActiveContainerIndex] = useState<number | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'3d' | 'cargo' | 'container' | 'analytics' | 'manifest'>('3d');
  const [selectedItem, setSelectedItem] = useState<PackedItem | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [isBenchmarkModalOpen, setIsBenchmarkModalOpen] = useState<boolean>(false);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [showCalculatingPopup, setShowCalculatingPopup] = useState<boolean>(false);
  const [showAlgorithmPanel, setShowAlgorithmPanel] = useState<boolean>(false);
  const [showSafetyDetails, setShowSafetyDetails] = useState<boolean>(false);
  const [showUnplacedDetails, setShowUnplacedDetails] = useState<boolean>(true);
  const [showGlobalClearModal, setShowGlobalClearModal] = useState<boolean>(false);
  const [isManifestModalOpen, setIsManifestModalOpen] = useState<boolean>(false);
  const [manifestReplayMeta, setManifestReplayMeta] = useState<{
    fileName: string;
    totalItems: number;
    totalWeightKg: number;
    warnings: string[];
    importedAt: Date;
  } | null>(null);

  const handleAllClearFromApp = () => {
    if (cargoList.length === 0) return;
    setCargoList([]);
    setShowGlobalClearModal(false);
  };

  const isJa = language === 'ja';

  // Compute Auto-Selected Best Algorithm across all 7 strategies ONLY when Auto Mode is enabled
  const autoBenchmarkResult = useMemo(() => {
    if (!isAutoAlgorithmEnabled) return null;
    const countParam = containerCountMode === 'auto' ? 'auto' : containerCount;
    return runAllAlgorithmsBenchmark(selectedContainer, cargoList, countParam);
  }, [isAutoAlgorithmEnabled, selectedContainer, cargoList, containerCountMode, containerCount]);

  const autoSelectedEntry = useMemo(() => {
    if (!autoBenchmarkResult) return null;
    return getBestAlgorithmForCriteria(autoBenchmarkResult, autoSelectCriteria);
  }, [autoBenchmarkResult, autoSelectCriteria]);

  // Effective Algorithm & GA Config (Determined either by Auto Mode or Manual Selection)
  const effectiveAlgorithm = isAutoAlgorithmEnabled && autoSelectedEntry 
    ? autoSelectedEntry.algorithm 
    : algorithm;
  const effectiveGaConfig = isAutoAlgorithmEnabled && autoSelectedEntry
    ? (autoSelectedEntry.gaConfig || gaConfig) 
    : gaConfig;

  // Run Packing Optimization Calculation with fleet support and GA target goals
  const [packingResult, setPackingResult] = useState<PackingResult>(() => {
    const countParam = containerCountMode === 'auto' ? 'auto' : containerCount;
    return run3DPackingOptimizer(selectedContainer, cargoList, effectiveAlgorithm, countParam, effectiveGaConfig);
  });

  // Keep selectedItem synchronized with packingResult updates (e.g. manual moves, undo/redo)
  useEffect(() => {
    if (selectedItem) {
      const fresh = packingResult.packedItems.find(p => p.id === selectedItem.id);
      if (fresh) {
        if (
          fresh.x !== selectedItem.x ||
          fresh.y !== selectedItem.y ||
          fresh.z !== selectedItem.z ||
          fresh.rotationIndex !== selectedItem.rotationIndex ||
          fresh.length !== selectedItem.length ||
          fresh.width !== selectedItem.width ||
          fresh.height !== selectedItem.height ||
          fresh.containerIndex !== selectedItem.containerIndex
        ) {
          setSelectedItem(fresh);
        }
      } else {
        setSelectedItem(null);
      }
    }
  }, [packingResult.packedItems, selectedItem]);

  const [isManualMode, setIsManualMode] = useState<boolean>(false);
  const [undoStack, setUndoStack] = useState<PackingResult[]>([]);
  const [redoStack, setRedoStack] = useState<PackingResult[]>([]);
  const packingResultRef = useRef<PackingResult>(packingResult);
  packingResultRef.current = packingResult;

  // Record an adjustment step into undo stack and clear redo stack
  const recordManualAdjustment = useCallback((nextResult: PackingResult) => {
    const current = packingResultRef.current;
    if (nextResult === current) return;
    setUndoStack(prev => [...prev.slice(-49), current]);
    setRedoStack([]);
    setPackingResult(nextResult);
  }, []);

  // Manual Adjustment handlers
  const handleManualPlaceItem = useCallback((unplacedItem: UnplacedItem, placement: { x: number; y: number; z: number; length: number; width: number; height: number; rotationIndex?: number; color?: string; containerIndex?: number }) => {
    const targetIdx = placement.containerIndex !== undefined 
      ? placement.containerIndex 
      : (activeContainerIndex === 'all' ? 1 : activeContainerIndex);
    const next = applyManualItemPlacement(packingResultRef.current, selectedContainer, targetIdx, unplacedItem, placement);
    recordManualAdjustment(next);
  }, [selectedContainer, activeContainerIndex, recordManualAdjustment]);

  const handleManualMoveItem = useCallback((itemId: string, newCoords: { x: number; y: number; z: number; length?: number; width?: number; height?: number; rotationIndex?: number }) => {
    const next = applyManualItemMove(packingResultRef.current, selectedContainer, itemId, newCoords);
    recordManualAdjustment(next);
    const moved = next.packedItems.find(p => p.id === itemId);
    if (moved) {
      setSelectedItem(moved);
    }
  }, [selectedContainer, recordManualAdjustment]);

  const handleManualRemoveItem = useCallback((itemId: string) => {
    const next = applyManualItemRemove(packingResultRef.current, selectedContainer, itemId);
    recordManualAdjustment(next);
  }, [selectedContainer, recordManualAdjustment]);

  // Unload all items from container (or all containers) for full manual packing
  const handleManualUnloadContainer = useCallback((containerIndex?: number | 'all') => {
    const targetIdx = containerIndex !== undefined 
      ? containerIndex 
      : (activeContainerIndex === 'all' ? 'all' : activeContainerIndex);
    const next = applyManualUnloadContainer(packingResultRef.current, selectedContainer, targetIdx);
    recordManualAdjustment(next);
    setSelectedItem(null);
  }, [selectedContainer, activeContainerIndex, recordManualAdjustment]);

  // Undo recent manual adjustment
  const handleUndo = useCallback(() => {
    setUndoStack(prevUndo => {
      if (prevUndo.length === 0) return prevUndo;
      const newUndo = [...prevUndo];
      const previousState = newUndo.pop()!;
      const current = packingResultRef.current;
      setRedoStack(prevRedo => [...prevRedo.slice(-49), current]);
      setPackingResult(previousState);
      return newUndo;
    });
  }, []);

  // Redo recent manual adjustment
  const handleRedo = useCallback(() => {
    setRedoStack(prevRedo => {
      if (prevRedo.length === 0) return prevRedo;
      const newRedo = [...prevRedo];
      const nextState = newRedo.pop()!;
      const current = packingResultRef.current;
      setUndoStack(prevUndo => [...prevUndo.slice(-49), current]);
      setPackingResult(nextState);
      return newRedo;
    });
  }, []);

  const handleResetToAlgorithm = useCallback(() => {
    setManifestReplayMeta(null);
    setUndoStack([]);
    setRedoStack([]);
    setIsCalculating(true);
    setTimeout(() => {
      const countParam = containerCountMode === 'auto' ? 'auto' : containerCount;
      const res = run3DPackingOptimizer(selectedContainer, cargoList, effectiveAlgorithm, countParam, effectiveGaConfig);
      setPackingResult(res);
      setIsCalculating(false);
    }, 30);
  }, [selectedContainer, cargoList, effectiveAlgorithm, containerCountMode, containerCount, effectiveGaConfig]);

  // Handle faithful reproduction of 3D packing plan from external Loading_Manifest
  const handleApplyManifestResult = useCallback((
    newPackingResult: PackingResult,
    reconstructedCargo: CargoItem[],
    detectedContainer: Container,
    manifestMeta: {
      fileName: string;
      totalItems: number;
      totalWeightKg: number;
      warnings: string[];
    }
  ) => {
    setSelectedContainer(detectedContainer);
    setCargoList(reconstructedCargo);
    setUndoStack([]);
    setRedoStack([]);
    setPackingResult(newPackingResult);
    setManifestReplayMeta({
      ...manifestMeta,
      importedAt: new Date()
    });
    setActiveTab('3d');
    try {
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.7 }
      });
    } catch (e) {
      // Ignore if canvas-confetti unavailable
    }
  }, []);

  // Handle importing manifest items only as cargo inventory without fixing 3D positions
  const handleApplyAsCargoListOnly = useCallback((
    importedCargo: CargoItem[],
    detectedContainer?: Container
  ) => {
    if (detectedContainer) {
      setSelectedContainer(detectedContainer);
    }
    // Deselect all items initially when imported as cargo inventory per user request
    setCargoList(importedCargo.map(c => ({ ...c, enabled: false })));
    setManifestReplayMeta(null);
    setActiveTab('cargo');
  }, []);

  // Automatically trigger optimization calculation whenever inputs change, displaying the calculation in-progress status
  useEffect(() => {
    // When external Loading_Manifest reproduction mode is active, do not overwrite exact 3D coordinates!
    if (manifestReplayMeta) {
      return;
    }
    setIsCalculating(true);
    setUndoStack([]);
    setRedoStack([]);
    const timer = setTimeout(() => {
      const countParam = containerCountMode === 'auto' ? 'auto' : containerCount;
      const res = run3DPackingOptimizer(selectedContainer, cargoList, effectiveAlgorithm, countParam, effectiveGaConfig);
      setPackingResult(res);
      setIsCalculating(false);
    }, 70);

    return () => clearTimeout(timer);
  }, [selectedContainer, cargoList, effectiveAlgorithm, containerCountMode, containerCount, effectiveGaConfig, manifestReplayMeta]);

  // Do not show calculation popup immediately upon pressing buttons or input changes.
  // Delay popup display: quick optimizations (< 600ms) complete seamlessly without jarring popups.
  // Only prolonged calculations (> 600ms) will display the popup indicator.
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isCalculating) {
      timer = setTimeout(() => {
        setShowCalculatingPopup(true);
      }, 600);
    } else {
      setShowCalculatingPopup(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isCalculating]);

  // Re-optimize action trigger with subtle celebration effect
  const handleReoptimize = useCallback(() => {
    setManifestReplayMeta(null);
    setUndoStack([]);
    setRedoStack([]);
    setIsCalculating(true);
    setTimeout(() => {
      const countParam = containerCountMode === 'auto' ? 'auto' : containerCount;
      const res = run3DPackingOptimizer(selectedContainer, cargoList, effectiveAlgorithm, countParam, effectiveGaConfig);
      setPackingResult(res);
      setIsCalculating(false);
      if (res.metrics.volumeUtilization > 75 || res.metrics.unplacedCount === 0) {
        try {
          confetti({
            particleCount: 40,
            spread: 60,
            origin: { y: 0.85 }
          });
        } catch (e) {
          // Ignore if canvas confetti unavailable
        }
      }
    }, 30);
  }, [selectedContainer, cargoList, effectiveAlgorithm, containerCountMode, containerCount, effectiveGaConfig]);

  // Apply algorithm from benchmark or selector with subtle celebration
  const handleApplyAlgorithm = useCallback((newAlgo: AlgorithmType, newGaConfig?: GAGoalConfig) => {
    setIsAutoAlgorithmEnabled(false);
    setAlgorithm(newAlgo);
    if (newGaConfig) {
      setGaConfig(newGaConfig);
    }
  }, []);

  // Total raw quantity entered across all cargo items
  const totalRawCargoCount = useMemo(() => {
    return cargoList.reduce((s, c) => s + (Number(c.quantity) || 0), 0);
  }, [cargoList]);

  // Actual number of items targeted by the 3D optimization calculation (3,320)
  const optimizationTargetCount = useMemo(() => {
    return packingResult.overallMetrics?.totalItemsCount ?? packingResult.metrics.totalItemCount ?? 0;
  }, [packingResult]);

  // Count of items excluded due to the 500-item safety limit (19,500)
  const safetyLimitTruncatedCount = useMemo(() => {
    return packingResult.safetyLimitTruncatedCount ?? 0;
  }, [packingResult]);

  // Unplaced items that could not fit into containers
  const unplacedItems = useMemo(() => {
    return packingResult.unplacedItems || [];
  }, [packingResult.unplacedItems]);

  const totalUnplacedCount = useMemo(() => {
    if (unplacedItems.length > 0) {
      return unplacedItems.reduce((sum, u) => sum + (u.count || 0), 0);
    }
    return packingResult.overallMetrics?.totalUnplacedCount ?? packingResult.metrics.unplacedCount ?? 0;
  }, [unplacedItems, packingResult.overallMetrics, packingResult.metrics]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Header with Sticky Navigation & Status Ribbon */}
      <Header
        algorithm={effectiveAlgorithm}
        onChangeAlgorithm={(newAlgo) => {
          setIsAutoAlgorithmEnabled(false);
          setAlgorithm(newAlgo);
        }}
        gaConfig={effectiveGaConfig}
        onChangeGaConfig={(newConfig) => {
          setIsAutoAlgorithmEnabled(false);
          setGaConfig(newConfig);
        }}
        isAutoAlgorithmEnabled={isAutoAlgorithmEnabled}
        onToggleAutoAlgorithm={setIsAutoAlgorithmEnabled}
        autoSelectCriteria={autoSelectCriteria}
        onChangeAutoCriteria={setAutoSelectCriteria}
        autoSelectedAlgorithmName={autoSelectedEntry ? (isJa ? autoSelectedEntry.nameJa : autoSelectedEntry.nameEn) : undefined}
        language={language}
        onChangeLanguage={setLanguage}
        unitSystem={unitSystem}
        onChangeUnitSystem={setUnitSystem}
        onOpenAiConsultant={() => setIsAiModalOpen(true)}
        onOpenBenchmarkModal={() => setIsBenchmarkModalOpen(true)}
        onOpenImportManifest={() => setIsManifestModalOpen(true)}
        onReoptimize={handleReoptimize}
        onAllClear={cargoList.length > 0 ? () => setShowGlobalClearModal(true) : undefined}
        isCalculating={isCalculating}
        showCalculatingPopup={showCalculatingPopup}
        showAlgorithmPanel={showAlgorithmPanel}
        onToggleAlgorithmPanel={() => setShowAlgorithmPanel(!showAlgorithmPanel)}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        totalItemCount={optimizationTargetCount}
        totalRawItemCount={totalRawCargoCount}
        safetyLimitTruncatedCount={safetyLimitTruncatedCount}
        containerUnitsCount={packingResult.containers?.length || 1}
        volumeUtilization={packingResult.metrics.volumeUtilization}
        packedItemCount={packingResult.packedItems.length}
        packedWeightKg={packingResult.metrics.packedWeightKg}
      />

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-5 pt-1.5 pb-4 space-y-3">
        
        {/* Loading_Manifest External Reproduction Banner */}
        {manifestReplayMeta && (
          <div 
            id="manifest-replay-active-banner"
            className="bg-blue-50 border-2 border-blue-400 rounded-xl p-3.5 sm:p-4 text-blue-950 shadow-xs animate-fadeIn"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shrink-0 mt-0.5 shadow-xs">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-sm text-blue-950">
                      {isJa 
                        ? `外部Loading_Manifestファイル再現中: ${manifestReplayMeta.fileName}` 
                        : `External Loading Manifest Active: ${manifestReplayMeta.fileName}`}
                    </h4>
                    <span className="bg-blue-200/90 text-blue-900 border border-blue-400/80 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                      {isJa ? '3D配置完全再現' : '3D Placement Replay'}
                    </span>
                  </div>
                  <p className="text-xs text-blue-900 mt-1 leading-relaxed">
                    {isJa 
                      ? `外部マニフェストから読み込んだ計 ${manifestReplayMeta.totalItems.toLocaleString()} 個（総重量: ${manifestReplayMeta.totalWeightKg.toLocaleString()} kg）の3D座標(X,Y,Z)・段数・積載順序を完全再現しています。`
                      : `Faithfully reproducing exact 3D coordinates (X,Y,Z), tiers, and sequence for ${manifestReplayMeta.totalItems.toLocaleString()} items (${manifestReplayMeta.totalWeightKg.toLocaleString()} kg).`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('3d')}
                  className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer ${
                    activeTab === '3d'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white hover:bg-blue-100 text-blue-800 border border-blue-300'
                  }`}
                >
                  <Box className="w-3.5 h-3.5" />
                  <span>{isJa ? '3Dビュー' : '3D View'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('manifest')}
                  className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer ${
                    activeTab === 'manifest'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white hover:bg-blue-100 text-blue-800 border border-blue-300'
                  }`}
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                  <span>{isJa ? '積載マニフェスト' : 'Manifest Table'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetToAlgorithm}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  title={isJa ? 'AI最適化アルゴリズムによる自動配置へ切り替える' : 'Reset to AI optimization algorithm'}
                >
                  <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                  <span>{isJa ? 'AI最適化で再計算' : 'Re-optimize with AI'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setManifestReplayMeta(null)}
                  className="px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-blue-100/80 font-medium transition-colors cursor-pointer"
                  title={isJa ? 'バナーを閉じる' : 'Dismiss'}
                >
                  {isJa ? '閉じる' : 'Dismiss'}
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Safety Limit Truncation Alert Banner */}
        {safetyLimitTruncatedCount > 0 && (
          <div 
            id="safety-limit-alert-banner"
            className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3.5 sm:p-4 text-amber-950 shadow-xs animate-fadeIn"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 mt-0.5 shadow-xs">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-sm text-amber-950">
                      {isJa 
                        ? `${safetyLimitTruncatedCount.toLocaleString()} 個の貨物が安全リミットにより除外されました`
                        : `${safetyLimitTruncatedCount.toLocaleString()} cargo items were excluded by the safety limit`}
                    </h4>
                    <span className="bg-amber-200/80 text-amber-900 border border-amber-400/60 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                      {isJa ? '1品目あたり上限 500個' : 'Max 500 units/item'}
                    </span>
                  </div>
                  <p className="text-xs text-amber-900 mt-1 leading-relaxed">
                    {isJa 
                      ? `ブラウザのクラッシュ・フリーズを防ぐため、1品目あたりの数量上限を500個に制限しています。最適化計算の対象数は ${optimizationTargetCount.toLocaleString()} 個（登録総数: ${totalRawCargoCount.toLocaleString()} 個）です。`
                      : `To prevent browser performance lag, cargo quantities are capped at 500 units per item. The optimization calculation target is ${optimizationTargetCount.toLocaleString()} items (Total registered: ${totalRawCargoCount.toLocaleString()}).`}
                  </p>
                </div>
              </div>

              {packingResult.truncatedItems && packingResult.truncatedItems.length > 0 && (
                <button
                  type="button"
                  id="toggle-safety-details-btn"
                  onClick={() => setShowSafetyDetails(!showSafetyDetails)}
                  className="shrink-0 text-xs bg-white hover:bg-amber-100/70 text-amber-900 border border-amber-300 font-semibold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                >
                  <span>{showSafetyDetails ? (isJa ? '内訳を閉じる' : 'Hide Details') : (isJa ? '除外内訳を表示' : 'Show Details')}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSafetyDetails ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>

            {/* Expandable details of truncated SKUs */}
            {showSafetyDetails && packingResult.truncatedItems && packingResult.truncatedItems.length > 0 && (
              <div className="mt-3 pt-3 border-t border-amber-200/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {packingResult.truncatedItems.map((item) => (
                  <div key={item.cargoId} className="bg-white/90 border border-amber-200 rounded-lg p-2.5 text-xs flex justify-between items-center shadow-2xs">
                    <div className="truncate pr-2">
                      <span className="font-bold text-slate-800">{item.name}</span>
                      {item.sku && <span className="text-[10px] text-slate-500 font-mono ml-1">({item.sku})</span>}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-slate-400 line-through mr-1">{item.requestedQty.toLocaleString()}</span>
                      <span className="font-bold text-slate-900 font-mono">500</span>
                      <span className="text-amber-700 font-bold ml-1.5 text-[11px]">(-{item.truncatedQty.toLocaleString()})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Unplaced Items Capacity Alert Banner (Moved to top with high-visibility styling per user request) */}
        {totalUnplacedCount > 0 && (
          <div 
            id="unplaced-items-alert-banner"
            className="bg-rose-50 border-2 border-rose-400 rounded-xl p-3.5 sm:p-4 text-rose-950 shadow-sm animate-fadeIn"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center font-bold shrink-0 mt-0.5 shadow-xs">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-sm text-rose-950">
                      {isJa 
                        ? `${totalUnplacedCount.toLocaleString()} 個の貨物がコンテナに積載できませんでした（未積載）`
                        : `${totalUnplacedCount.toLocaleString()} items could not be packed into available containers`}
                    </h4>
                    <span className="bg-rose-200/90 text-rose-900 border border-rose-400/80 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                      {isJa ? '積載不可・要確認' : 'Unplaced Cargo'}
                    </span>
                  </div>
                  <p className="text-xs text-rose-900 mt-1 leading-relaxed">
                    {isJa 
                      ? '指定されたコンテナの空間容積・床面積または重量制限に達したため、以下の貨物が積載されずに残っています。'
                      : 'The available containers have reached their spatial capacity or payload weight limits, leaving the following cargo unplaced.'}
                  </p>
                </div>
              </div>

              {unplacedItems.length > 0 && (
                <button
                  type="button"
                  id="toggle-unplaced-details-btn"
                  onClick={() => setShowUnplacedDetails(!showUnplacedDetails)}
                  className="shrink-0 text-xs bg-white hover:bg-rose-100/70 text-rose-900 border border-rose-300 font-semibold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                >
                  <span>{showUnplacedDetails ? (isJa ? '内訳を閉じる' : 'Hide Details') : (isJa ? '未積載の内訳を表示' : 'Show Details')}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showUnplacedDetails ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>

            {/* Unplaced Items List */}
            {showUnplacedDetails && unplacedItems.length > 0 && (
              <div className="mt-3 pt-3 border-t border-rose-200/80 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {unplacedItems.map((u, idx) => {
                    const reasonLabel = u.reason === 'exceeds_weight'
                      ? (isJa ? '重量制限超過' : 'Exceeds Weight Limit')
                      : u.reason === 'stacking_constraint'
                      ? (isJa ? '段積み制約' : 'Stacking Limit')
                      : u.reason === 'floor_constraint'
                      ? (isJa ? '床面配置制約' : 'Floor Limit')
                      : (isJa ? '空間不足' : 'Spatial Overflow');

                    return (
                      <div 
                        key={`${u.cargoItemId || u.sku}-${idx}`}
                        className="bg-white/95 border border-rose-200/90 rounded-lg p-2.5 text-xs flex justify-between items-center shadow-2xs gap-2"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                          <div className="truncate">
                            <span className="font-bold text-slate-900">{u.name}</span>
                            {u.sku && <span className="text-[11px] text-slate-500 font-mono ml-1.5">({u.sku})</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-mono font-bold text-rose-950 bg-rose-100/90 px-2 py-0.5 rounded text-xs">
                            × {u.count} {isJa ? '個' : 'pcs'}
                          </span>
                          <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-300 whitespace-nowrap">
                            {reasonLabel}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-1 text-[11px] text-rose-900/90 flex-wrap gap-2">
                  <span>
                    {isJa
                      ? '💡 対策案: コンテナ本数の追加、より大型のコンテナ（40HC等）への変更、または3D画面での手動配置調整をご検討ください。'
                      : '💡 Suggestions: Add more containers, select larger container models (e.g. 40HC), or manually adjust positions in the 3D Viewer.'}
                  </span>
                  {activeTab !== '3d' && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('3d')}
                      className="text-xs font-bold text-rose-700 hover:text-rose-900 underline flex items-center gap-1 cursor-pointer"
                    >
                      {isJa ? '3Dビューで確認 →' : 'Inspect in 3D →'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Algorithm Settings & Target Optimization Panel (Hidden by default, toggleable via Header) */}
        {showAlgorithmPanel && (
          <AlgorithmSettingsPanel
            algorithm={effectiveAlgorithm}
            gaConfig={effectiveGaConfig}
            gaParameters={packingResult.gaParameters}
            onChangeAlgorithm={(newAlgo) => {
              setIsAutoAlgorithmEnabled(false);
              setAlgorithm(newAlgo);
            }}
            onChangeGaConfig={(newConfig) => {
              setIsAutoAlgorithmEnabled(false);
              setGaConfig(newConfig);
            }}
            isAutoAlgorithmEnabled={isAutoAlgorithmEnabled}
            onToggleAutoAlgorithm={setIsAutoAlgorithmEnabled}
            autoSelectCriteria={autoSelectCriteria}
            onChangeAutoCriteria={setAutoSelectCriteria}
            autoSelectedAlgorithmName={autoSelectedEntry ? (isJa ? autoSelectedEntry.nameJa : autoSelectedEntry.nameEn) : undefined}
            onOpenBenchmarkModal={() => setIsBenchmarkModalOpen(true)}
            language={language}
          />
        )}

        {/* Tab Views Content */}
        {activeTab === '3d' && (
          <div className="space-y-4">
            {/* Top 3D Interactive Viewport */}
            <div className="w-full h-[580px]">
              <ContainerViewer3D
                container={selectedContainer}
                containers={packingResult.containers}
                activeContainerIndex={activeContainerIndex}
                onChangeActiveContainerIndex={setActiveContainerIndex}
                packedItems={packingResult.packedItems}
                centerOfGravity={packingResult.metrics.centerOfGravity}
                unitSystem={unitSystem}
                language={language}
                onSelectItem={setSelectedItem}
                selectedItem={selectedItem}
                isCalculating={showCalculatingPopup}
                isManualMode={isManualMode}
                onToggleManualMode={setIsManualMode}
                hasManualAdjustments={packingResult.hasManualAdjustments}
                manualAdjustmentsCount={packingResult.manualAdjustmentsCount}
                onManualPlaceItem={handleManualPlaceItem}
                onManualMoveItem={handleManualMoveItem}
                onManualRemoveItem={handleManualRemoveItem}
                onManualUnloadContainer={handleManualUnloadContainer}
                onResetToAlgorithm={handleResetToAlgorithm}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={undoStack.length > 0}
                canRedo={redoStack.length > 0}
                unplacedItems={packingResult.unplacedItems}
                cargoList={cargoList}
              />
            </div>

            {/* Bottom Quick Analytics & CoG Snapshot */}
            <PackingAnalytics
              metrics={packingResult.metrics}
              container={selectedContainer}
              unplacedItems={packingResult.unplacedItems}
              language={language}
              unitSystem={unitSystem}
              containers={packingResult.containers}
              overallMetrics={packingResult.overallMetrics}
              activeContainerIndex={activeContainerIndex}
              onSelectContainerIndex={setActiveContainerIndex}
            />
          </div>
        )}

        {activeTab === 'cargo' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Cargo Manifest Area (Optimized width & zero overflow) */}
            <div className="lg:col-span-5 xl:col-span-4 min-w-0">
              <CargoManager
                cargoList={cargoList}
                onChangeCargoList={setCargoList}
                container={selectedContainer}
                unitSystem={unitSystem}
                language={language}
                onSelectContainer={(containerId) => {
                  const target = STANDARD_CONTAINERS.find(c => c.id === containerId);
                  if (target) setSelectedContainer(target);
                }}
                onOpenImportManifest={() => setIsManifestModalOpen(true)}
              />
            </div>

            {/* 3D Container Packing Viewport Area */}
            <div className="lg:col-span-7 xl:col-span-8 min-w-0 sticky top-4">
              <div className="w-full h-[600px] xl:h-[680px] rounded-xl overflow-hidden border border-slate-200 shadow-xs bg-slate-900">
                <ContainerViewer3D
                  container={selectedContainer}
                  containers={packingResult.containers}
                  activeContainerIndex={activeContainerIndex}
                  onChangeActiveContainerIndex={setActiveContainerIndex}
                  packedItems={packingResult.packedItems}
                  centerOfGravity={packingResult.metrics.centerOfGravity}
                  unitSystem={unitSystem}
                  language={language}
                  onSelectItem={setSelectedItem}
                  selectedItem={selectedItem}
                  isCalculating={showCalculatingPopup}
                  isManualMode={isManualMode}
                  onToggleManualMode={setIsManualMode}
                  hasManualAdjustments={packingResult.hasManualAdjustments}
                  manualAdjustmentsCount={packingResult.manualAdjustmentsCount}
                  onManualPlaceItem={handleManualPlaceItem}
                  onManualMoveItem={handleManualMoveItem}
                  onManualRemoveItem={handleManualRemoveItem}
                  onManualUnloadContainer={handleManualUnloadContainer}
                  onResetToAlgorithm={handleResetToAlgorithm}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  canUndo={undoStack.length > 0}
                  canRedo={redoStack.length > 0}
                  unplacedItems={packingResult.unplacedItems}
                  cargoList={cargoList}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'container' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Container Fleet & Selection Area (Narrowed for compact efficiency) */}
            <div className="lg:col-span-4 xl:col-span-4">
              <ContainerSelector
                selectedContainer={selectedContainer}
                onSelectContainer={setSelectedContainer}
                language={language}
                unitSystem={unitSystem}
                containerCountMode={containerCountMode}
                onChangeContainerCountMode={setContainerCountMode}
                containerCount={containerCount}
                onChangeContainerCount={setContainerCount}
                totalContainersNeeded={packingResult.overallMetrics?.totalContainersCount || packingResult.metrics.containersNeeded}
                totalItemsCount={optimizationTargetCount}
                totalPackedCount={packingResult.packedItems.length}
                safetyLimitTruncatedCount={safetyLimitTruncatedCount}
              />
            </div>

            {/* 3D Container Packing Viewport Area (Expanded wider) */}
            <div className="lg:col-span-8 xl:col-span-8 sticky top-4">
              <div className="w-full h-[600px] xl:h-[680px] rounded-xl overflow-hidden border border-slate-200 shadow-xs bg-slate-900">
                <ContainerViewer3D
                  container={selectedContainer}
                  containers={packingResult.containers}
                  activeContainerIndex={activeContainerIndex}
                  onChangeActiveContainerIndex={setActiveContainerIndex}
                  packedItems={packingResult.packedItems}
                  centerOfGravity={packingResult.metrics.centerOfGravity}
                  unitSystem={unitSystem}
                  language={language}
                  onSelectItem={setSelectedItem}
                  selectedItem={selectedItem}
                  isCalculating={showCalculatingPopup}
                  isManualMode={isManualMode}
                  onToggleManualMode={setIsManualMode}
                  hasManualAdjustments={packingResult.hasManualAdjustments}
                  manualAdjustmentsCount={packingResult.manualAdjustmentsCount}
                  onManualPlaceItem={handleManualPlaceItem}
                  onManualMoveItem={handleManualMoveItem}
                  onManualRemoveItem={handleManualRemoveItem}
                  onManualUnloadContainer={handleManualUnloadContainer}
                  onResetToAlgorithm={handleResetToAlgorithm}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  canUndo={undoStack.length > 0}
                  canRedo={redoStack.length > 0}
                  unplacedItems={packingResult.unplacedItems}
                  cargoList={cargoList}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-4">
            <PackingAnalytics
              metrics={packingResult.metrics}
              container={selectedContainer}
              unplacedItems={packingResult.unplacedItems}
              language={language}
              unitSystem={unitSystem}
              containers={packingResult.containers}
              overallMetrics={packingResult.overallMetrics}
              activeContainerIndex={activeContainerIndex}
              onSelectContainerIndex={setActiveContainerIndex}
              packedItems={packingResult.packedItems}
            />

            <div className="w-full h-[480px]">
              <ContainerViewer3D
                container={selectedContainer}
                containers={packingResult.containers}
                activeContainerIndex={activeContainerIndex}
                onChangeActiveContainerIndex={setActiveContainerIndex}
                packedItems={packingResult.packedItems}
                centerOfGravity={packingResult.metrics.centerOfGravity}
                unitSystem={unitSystem}
                language={language}
                onSelectItem={setSelectedItem}
                selectedItem={selectedItem}
              />
            </div>
          </div>
        )}

        {activeTab === 'manifest' && (
          <div className="space-y-4">
            <LoadingGuideTable
              packedItems={packingResult.packedItems}
              container={selectedContainer}
              language={language}
              unitSystem={unitSystem}
              onSelectItem={setSelectedItem}
              selectedItem={selectedItem}
              containers={packingResult.containers}
              activeContainerIndex={activeContainerIndex}
              onSelectContainerIndex={setActiveContainerIndex}
              metrics={packingResult.metrics}
              overallMetrics={packingResult.overallMetrics}
              unplacedItems={packingResult.unplacedItems}
              algorithmName={effectiveAlgorithm}
              hasManualAdjustments={packingResult.hasManualAdjustments}
              onOpenImportManifest={() => setIsManifestModalOpen(true)}
              isManifestReplayActive={!!manifestReplayMeta}
              manifestFileName={manifestReplayMeta?.fileName}
              onResetToAlgorithm={handleResetToAlgorithm}
            />
          </div>
        )}
      </main>

      {/* Manifest Import & 3D Reproduction Modal */}
      {isManifestModalOpen && (
        <ManifestImportModal
          isOpen={isManifestModalOpen}
          onClose={() => setIsManifestModalOpen(false)}
          language={language}
          currentContainer={selectedContainer}
          onApplyManifestResult={handleApplyManifestResult}
          onApplyAsCargoListOnly={handleApplyAsCargoListOnly}
        />
      )}

      {/* AI Consultant Modal */}
      <AiConsultantModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        container={selectedContainer}
        cargoList={cargoList}
        metrics={packingResult.metrics}
        language={language}
      />

      {/* Algorithm Benchmark & Comparison Modal */}
      {isBenchmarkModalOpen && (
        <AlgorithmComparisonModal
          isOpen={isBenchmarkModalOpen}
          onClose={() => setIsBenchmarkModalOpen(false)}
          container={selectedContainer}
          cargoList={cargoList}
          containerCountMode={containerCountMode}
          containerCount={containerCount}
          currentAlgorithm={effectiveAlgorithm}
          currentGaConfig={effectiveGaConfig}
          isAutoAlgorithmEnabled={isAutoAlgorithmEnabled}
          onToggleAutoAlgorithm={setIsAutoAlgorithmEnabled}
          autoSelectCriteria={autoSelectCriteria}
          onChangeAutoCriteria={setAutoSelectCriteria}
          onApplyAlgorithm={handleApplyAlgorithm}
          language={language}
          unitSystem={unitSystem}
        />
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3.5 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <span className="font-medium text-slate-600">
            Takumi_Web v1.0 • 3D Container & Vehicle Load Planning System
          </span>
          <span className="text-slate-400">
            {isJa ? 'ISO 668 海上コンテナ & 物流トラック積載規格準拠' : 'ISO 668 Ocean Containers & Highway Fleet Compliant'}
          </span>
        </div>
      </footer>

      {/* Global All Clear Confirmation Modal */}
      {showGlobalClearModal && (
        <div 
          id="global-all-clear-confirm-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4 animate-fade-in"
        >
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">
                  {isJa ? 'すべての貨物をクリアしますか？' : 'Clear all cargo items?'}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {isJa 
                    ? `現在登録されている ${cargoList.length} 種類の貨物（合計 ${cargoList.reduce((s, c) => s + c.quantity, 0).toLocaleString()} 個）を全件消去します。` 
                    : `This will remove all ${cargoList.length} items (${cargoList.reduce((s, c) => s + c.quantity, 0).toLocaleString()} total units) from the cargo list.`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                id="modal-cancel-all-clear-btn"
                onClick={() => setShowGlobalClearModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
              >
                {isJa ? 'キャンセル' : 'Cancel'}
              </button>
              <button
                type="button"
                id="modal-confirm-all-clear-btn"
                onClick={handleAllClearFromApp}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isJa ? '全消去を実行 (All Clear)' : 'All Clear'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Software Calculation in Progress Indicator Toast */}
      {showCalculatingPopup && (
        <div 
          id="calculation-in-progress-toast"
          className="fixed bottom-5 right-5 z-50 bg-slate-900/95 text-white backdrop-blur-md border border-slate-700/80 shadow-2xl rounded-2xl px-4 py-3 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200 pointer-events-none"
        >
          <div className="relative flex items-center justify-center shrink-0">
            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
            <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin absolute" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-slate-100">
                {isJa ? 'ソフトが最適化演算を実行中...' : 'Optimization calculation in progress...'}
              </span>
              <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-ping shrink-0" />
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[220px]">
              {isJa 
                ? `${ALGORITHM_DISPLAY_NAMES[effectiveAlgorithm]?.[language] || effectiveAlgorithm} 探索中`
                : `Computing with ${ALGORITHM_DISPLAY_NAMES[effectiveAlgorithm]?.[language] || effectiveAlgorithm}`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


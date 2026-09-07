import React, { useState, useEffect, useMemo, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { Container, CargoItem, PackedItem, PackingResult, AlgorithmType, UnitSystem, Language, GAGoalConfig, AutoSelectCriteria } from './types';
import { STANDARD_CONTAINERS, SAMPLE_CARGO_PRESETS } from './data/presets';
import { run3DPackingOptimizer, runAllAlgorithmsBenchmark, getBestAlgorithmForCriteria } from './services/packingOptimizer';
import { Header } from './components/Header';
import { AlgorithmSettingsPanel } from './components/AlgorithmSettingsPanel';
import { ContainerViewer3D } from './components/ContainerViewer3D';
import { CargoManager } from './components/CargoManager';
import { ContainerSelector } from './components/ContainerSelector';
import { PackingAnalytics } from './components/PackingAnalytics';
import { LoadingGuideTable } from './components/LoadingGuideTable';
import { AiConsultantModal } from './components/AiConsultantModal';
import { AlgorithmComparisonModal } from './components/AlgorithmComparisonModal';
import { 
  Box, BarChart3, ListOrdered, Truck, Sparkles, 
  Layers, Sliders, CheckCircle2, ShieldAlert, Zap, Bot,
  AlertTriangle, ChevronDown 
} from 'lucide-react';
import { applyVividColorsToCargoList, ColorPaletteId } from './utils/colors';

export default function App() {
  // Application State
  const [language, setLanguage] = useState<Language>('en');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [algorithm, setAlgorithm] = useState<AlgorithmType>('extreme_points_bfd');
  const [gaConfig, setGaConfig] = useState<GAGoalConfig>({ goal: 'max_volume' });
  const [isAutoAlgorithmEnabled, setIsAutoAlgorithmEnabled] = useState<boolean>(false);
  const [autoSelectCriteria, setAutoSelectCriteria] = useState<AutoSelectCriteria>('overall_best');

  const [selectedContainer, setSelectedContainer] = useState<Container>(STANDARD_CONTAINERS[1]); // 40GP default
  // Initialize with vibrant, high-saturation neon colors per user request: "貨物の色を鮮やかな色に変えて見たい"
  const [cargoList, setCargoList] = useState<CargoItem[]>(() => 
    applyVividColorsToCargoList(SAMPLE_CARGO_PRESETS[0].items, 'vivid_neon')
  );
  const [containerCountMode, setContainerCountMode] = useState<'auto' | 'manual'>('auto');
  const [containerCount, setContainerCount] = useState<number>(1);
  const [activeContainerIndex, setActiveContainerIndex] = useState<number | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'3d' | 'cargo' | 'container' | 'analytics' | 'manifest'>('3d');
  const [selectedItem, setSelectedItem] = useState<PackedItem | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [isBenchmarkModalOpen, setIsBenchmarkModalOpen] = useState<boolean>(false);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [showAlgorithmPanel, setShowAlgorithmPanel] = useState<boolean>(false);
  const [showSafetyDetails, setShowSafetyDetails] = useState<boolean>(false);

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
  const packingResult: PackingResult = useMemo(() => {
    const countParam = containerCountMode === 'auto' ? 'auto' : containerCount;
    return run3DPackingOptimizer(selectedContainer, cargoList, effectiveAlgorithm, countParam, effectiveGaConfig);
  }, [selectedContainer, cargoList, effectiveAlgorithm, containerCountMode, containerCount, effectiveGaConfig]);

  // Re-optimize action trigger with subtle celebration effect
  const handleReoptimize = useCallback(() => {
    setIsCalculating(true);
    setTimeout(() => {
      setIsCalculating(false);
      if (packingResult.metrics.volumeUtilization > 75 || packingResult.metrics.unplacedCount === 0) {
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
    }, 250);
  }, [packingResult]);

  // Apply algorithm from benchmark or selector with subtle celebration
  const handleApplyAlgorithm = useCallback((newAlgo: AlgorithmType, newGaConfig?: GAGoalConfig) => {
    setAlgorithm(newAlgo);
    if (newGaConfig) {
      setGaConfig(newGaConfig);
    }
    setIsCalculating(true);
    setTimeout(() => {
      setIsCalculating(false);
      try {
        confetti({
          particleCount: 35,
          spread: 55,
          origin: { y: 0.85 }
        });
      } catch (e) {
        // Ignore if unavailable
      }
    }, 200);
  }, []);

  // Apply vivid color palette to all cargo items
  const handleApplyVividColors = useCallback((paletteId: ColorPaletteId = 'vivid_neon') => {
    setCargoList(prev => applyVividColorsToCargoList(prev, paletteId));
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
        onReoptimize={handleReoptimize}
        isCalculating={isCalculating}
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
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 space-y-4">
        
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
                onApplyVividColors={handleApplyVividColors}
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
            {/* Cargo Manifest Area (Narrowed for compact efficiency) */}
            <div className="lg:col-span-4 xl:col-span-4">
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
                  onApplyVividColors={handleApplyVividColors}
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
                  onApplyVividColors={handleApplyVividColors}
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
            />
          </div>
        )}
      </main>

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
    </div>
  );
}


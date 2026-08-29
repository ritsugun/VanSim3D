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
  Layers, Sliders, CheckCircle2, ShieldAlert, Zap, Bot 
} from 'lucide-react';

export default function App() {
  // Application State
  const [language, setLanguage] = useState<Language>('en');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [algorithm, setAlgorithm] = useState<AlgorithmType>('extreme_points_bfd');
  const [gaConfig, setGaConfig] = useState<GAGoalConfig>({ goal: 'max_volume' });
  const [isAutoAlgorithmEnabled, setIsAutoAlgorithmEnabled] = useState<boolean>(false);
  const [autoSelectCriteria, setAutoSelectCriteria] = useState<AutoSelectCriteria>('overall_best');

  const [selectedContainer, setSelectedContainer] = useState<Container>(STANDARD_CONTAINERS[1]); // 40GP default
  const [cargoList, setCargoList] = useState<CargoItem[]>(SAMPLE_CARGO_PRESETS[0].items); // HVAC CSV Dataset default
  const [containerCountMode, setContainerCountMode] = useState<'auto' | 'manual'>('auto');
  const [containerCount, setContainerCount] = useState<number>(1);
  const [activeContainerIndex, setActiveContainerIndex] = useState<number | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'3d' | 'cargo' | 'container' | 'analytics' | 'manifest'>('3d');
  const [selectedItem, setSelectedItem] = useState<PackedItem | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [isBenchmarkModalOpen, setIsBenchmarkModalOpen] = useState<boolean>(false);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [showAlgorithmPanel, setShowAlgorithmPanel] = useState<boolean>(false);

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

  const totalItemCount = useMemo(() => {
    return cargoList.reduce((s, c) => s + c.quantity, 0);
  }, [cargoList]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
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
      />

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 space-y-4">
        
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

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2.5 overflow-x-auto custom-scrollbar">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <button
              id="tab-3d-btn"
              onClick={() => setActiveTab('3d')}
              className={`px-3.5 py-2 rounded-lg flex items-center gap-2 transition-all ${
                activeTab === '3d'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <Box className="w-4 h-4" />
              <span>{isJa ? '3D 積載ビュー & 操作' : '3D Load View'}</span>
            </button>

            <button
              id="tab-cargo-btn"
              onClick={() => setActiveTab('cargo')}
              className={`px-3.5 py-2 rounded-lg flex items-center gap-2 transition-all ${
                activeTab === 'cargo'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>{isJa ? '貨物・荷物設定' : 'Cargo Items'}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'cargo' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-blue-600'
              }`}>
                {totalItemCount}
              </span>
            </button>

            <button
              id="tab-container-btn"
              onClick={() => setActiveTab('container')}
              className={`px-3.5 py-2 rounded-lg flex items-center gap-2 transition-all ${
                activeTab === 'container'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>{isJa ? 'コンテナ・編成設定' : 'Container Fleet'}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                activeTab === 'container' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-amber-600'
              }`}>
                {packingResult.containers?.length || 1} {isJa ? '台' : 'units'}
              </span>
            </button>

            <button
              id="tab-analytics-btn"
              onClick={() => setActiveTab('analytics')}
              className={`px-3.5 py-2 rounded-lg flex items-center gap-2 transition-all ${
                activeTab === 'analytics'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>{isJa ? '重心・積載解析' : 'Analytics & CoG'}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                activeTab === 'analytics' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-emerald-600'
              }`}>
                {packingResult.metrics.volumeUtilization.toFixed(0)}%
              </span>
            </button>

            <button
              id="tab-manifest-btn"
              onClick={() => setActiveTab('manifest')}
              className={`px-3.5 py-2 rounded-lg flex items-center gap-2 transition-all ${
                activeTab === 'manifest'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <ListOrdered className="w-4 h-4" />
              <span>{isJa ? '積載指示マニフェスト' : 'Loading Manifest'}</span>
            </button>
          </div>

          {/* Quick Summary Metrics Pill on Right */}
          <div className="hidden lg:flex items-center gap-3 bg-white border border-slate-200 px-3.5 py-1.5 rounded-lg text-slate-600 shadow-xs text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {isJa ? 'コンテナ台数:' : 'Containers:'} <strong className="text-slate-900 font-mono font-bold">{packingResult.containers?.length || 1} {isJa ? '台' : 'units'}</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span>
              {isJa ? '積載完了:' : 'Packed:'} <strong className="text-blue-600 font-mono font-bold">{packingResult.packedItems.length} / {totalItemCount}</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span>
              {isJa ? '積載重量:' : 'Weight:'} <strong className="text-emerald-600 font-mono font-bold">{packingResult.metrics.packedWeightKg.toLocaleString()} kg</strong>
            </span>
          </div>
        </div>

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
            <div className="lg:col-span-5 xl:col-span-5">
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
            <div className="lg:col-span-7 xl:col-span-7 sticky top-4">
              <div className="w-full h-[580px] xl:h-[640px] rounded-xl overflow-hidden border border-slate-200 shadow-xs bg-slate-900">
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
          </div>
        )}

        {activeTab === 'container' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8">
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
                totalItemsCount={totalItemCount}
                totalPackedCount={packingResult.packedItems.length}
              />
            </div>
            <div className="lg:col-span-4 h-full">
              <div className="h-full min-h-[460px]">
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


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
        totalItemCount={totalItemCount}
        containerUnitsCount={packingResult.containers?.length || 1}
        volumeUtilization={packingResult.metrics.volumeUtilization}
        packedItemCount={packingResult.packedItems.length}
        packedWeightKg={packingResult.metrics.packedWeightKg}
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
                totalItemsCount={totalItemCount}
                totalPackedCount={packingResult.packedItems.length}
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


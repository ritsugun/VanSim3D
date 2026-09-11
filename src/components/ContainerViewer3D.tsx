import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Container, PackedItem, UnitSystem, Language, ContainerLoad, UnplacedItem, CargoItem } from '../types';
import { 
  Play, Pause, SkipBack, SkipForward, RotateCcw, 
  Layers, Camera, Maximize2, Minimize2, ShieldAlert, 
  Compass, Crosshair, SlidersHorizontal, Box, Grid3X3, X,
  GripVertical, Blend, Sparkles, Palette,
  Hand, Move, RotateCw, Trash2, Magnet, Check, AlertCircle, ArrowDownToLine, 
  RefreshCw, Undo2, Redo2, ChevronDown, ChevronUp, Plus, PackagePlus, PackageMinus
} from 'lucide-react';
import { formatDimensions, formatCoordinates, formatWeightCompact } from '../utils/units';
import { VIVID_NEON_PALETTE, boostHexToVivid } from '../utils/colors';
import { calculateSupportHeight, checkContainerBounds, isRestingOnFragile } from '../utils/manualAdjustment';

interface ContainerViewer3DProps {
  container: Container;
  containers?: ContainerLoad[];
  activeContainerIndex?: number | 'all';
  onChangeActiveContainerIndex?: (index: number | 'all') => void;
  packedItems: PackedItem[];
  centerOfGravity: { x: number; y: number; z: number };
  unitSystem: UnitSystem;
  language: Language;
  onSelectItem?: (item: PackedItem | null) => void;
  selectedItem?: PackedItem | null;
  onApplyVividColors?: (paletteId?: any) => void;
  isCalculating?: boolean;
  unplacedItems?: UnplacedItem[];
  cargoList?: CargoItem[];
  onManualPlaceItem?: (unplacedItem: UnplacedItem, placement: { x: number; y: number; z: number; length: number; width: number; height: number; rotationIndex?: number; color?: string; containerIndex?: number }) => void;
  onManualMoveItem?: (itemId: string, newCoords: { x: number; y: number; z: number; rotationIndex?: number; length?: number; width?: number; height?: number }) => void;
  onManualRemoveItem?: (itemId: string) => void;
  onManualUnloadContainer?: (containerIndex?: number | 'all') => void;
  onResetToAlgorithm?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  hasManualAdjustments?: boolean;
  manualAdjustmentsCount?: number;
  isManualMode?: boolean;
  isManualModeActive?: boolean;
  onToggleManualMode?: (active: boolean) => void;
}

export const ContainerViewer3D: React.FC<ContainerViewer3DProps> = ({
  container,
  containers,
  activeContainerIndex = 1,
  onChangeActiveContainerIndex,
  packedItems,
  centerOfGravity,
  unitSystem,
  language,
  onSelectItem,
  selectedItem: externalSelectedItem,
  onApplyVividColors,
  isCalculating = false,
  unplacedItems = [],
  cargoList = [],
  onManualPlaceItem,
  onManualMoveItem,
  onManualRemoveItem,
  onManualUnloadContainer,
  onResetToAlgorithm,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  hasManualAdjustments = false,
  manualAdjustmentsCount = 0,
  isManualMode: isManualModeProp,
  isManualModeActive,
  onToggleManualMode
}) => {
  const isJa = language === 'ja';
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const boxMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const cogGroupRef = useRef<THREE.Group | null>(null);
  const containersGroupRef = useRef<THREE.Group | null>(null);
  const ghostGroupRef = useRef<THREE.Group | null>(null);
  const draggedUnplacedRef = useRef<{ unplaced: UnplacedItem; rotation: 0 | 1; color: string } | null>(null);

  // Manual Adjustment State
  const [internalManualMode, setInternalManualMode] = useState<boolean>(false);
  const [isTrayCollapsed, setIsTrayCollapsed] = useState<boolean>(false);
  const isManualMode = isManualModeProp !== undefined 
    ? isManualModeProp 
    : (isManualModeActive !== undefined ? isManualModeActive : internalManualMode);
  const setIsManualMode = useCallback((val: boolean) => {
    if (onToggleManualMode) {
      onToggleManualMode(val);
    } else {
      setInternalManualMode(val);
    }
  }, [onToggleManualMode]);

  const [heldUnplacedItem, setHeldUnplacedItem] = useState<{
    unplaced: UnplacedItem;
    rotation: 0 | 1;
    color: string;
  } | null>(null);
  const [gridSnapMm, setGridSnapMm] = useState<number>(50);
  const [showUnplacedTray, setShowUnplacedTray] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDraggingExistingItem, setIsDraggingExistingItem] = useState<PackedItem | null>(null);
  const [ghostCoords, setGhostCoords] = useState<{
    x: number;
    y: number;
    z: number;
    length: number;
    width: number;
    height: number;
    isValid: boolean;
    invalidReason?: string;
    offsetZ?: number;
    containerIndex?: number;
  } | null>(null);

  const [confirmingUnload, setConfirmingUnload] = useState<boolean>(false);
  const confirmTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
      }
    };
  }, []);

  // Synchronize held unplaced item when unplacedItems changes or stock runs out
  useEffect(() => {
    if (!isManualMode) {
      if (heldUnplacedItem) {
        setHeldUnplacedItem(null);
        setGhostCoords(null);
      }
      return;
    }
    if (heldUnplacedItem) {
      const current = unplacedItems?.find(
        u => (u.cargoItemId && u.cargoItemId === heldUnplacedItem.unplaced.cargoItemId) ||
             (u.sku && u.sku === heldUnplacedItem.unplaced.sku)
      );
      if (!current || current.count <= 0) {
        setHeldUnplacedItem(null);
        setGhostCoords(null);
      } else if (current.count !== heldUnplacedItem.unplaced.count) {
        setHeldUnplacedItem(prev => prev ? { ...prev, unplaced: current } : null);
      }
    }
  }, [unplacedItems, isManualMode]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => prev === msg ? null : prev);
    }, 3500);
  }, []);

  // Interaction & Display States
  const [internalActiveTab, setInternalActiveTab] = useState<number | 'all'>(activeContainerIndex);
  const [sceneReady, setSceneReady] = useState<number>(0);
  const [webglError, setWebglError] = useState<string | null>(null);
  const currentTab = onChangeActiveContainerIndex ? activeContainerIndex : internalActiveTab;
  const setTab = (tab: number | 'all') => {
    if (onChangeActiveContainerIndex) {
      onChangeActiveContainerIndex(tab);
    } else {
      setInternalActiveTab(tab);
    }
  };

  // Active items based on selected tab
  const activeItemsToDisplay = useMemo(() => {
    if (containers && containers.length > 0) {
      if (currentTab === 'all') {
        return containers.flatMap(c => c.packedItems);
      }
      const target = containers.find(c => c.containerIndex === currentTab) 
        || containers[(typeof currentTab === 'number' && currentTab >= 1 ? currentTab - 1 : 0)] 
        || containers[0];
      return target.packedItems;
    }
    return packedItems;
  }, [containers, currentTab, packedItems]);

  const [currentStep, setCurrentStep] = useState<number>(activeItemsToDisplay.length);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showCoG, setShowCoG] = useState<boolean>(true);
  const [showWireframeOnly, setShowWireframeOnly] = useState<boolean>(false);
  const [isTranslucent, setIsTranslucent] = useState<boolean>(false); // Default to false (100% opaque) per user request: "貨物透明度の初期値は１００％不透明にして"
  const [cargoOpacity, setCargoOpacity] = useState<number>(100); // 100% opaque default
  const [colorMode, setColorMode] = useState<'cargo' | 'vivid' | 'weight' | 'sequence'>('cargo');
  const [isVividBoost, setIsVividBoost] = useState<boolean>(true); // High vibrancy and emissive boost
  const [activeCameraView, setActiveCameraView] = useState<'iso' | 'top' | 'side' | 'door'>('iso');
  const [showSliceControls, setShowSliceControls] = useState<boolean>(false);
  const [zSlicePercent, setZSlicePercent] = useState<number>(100);
  const [xSlicePercent, setXSlicePercent] = useState<number>(100);
  const [hoveredItem, setHoveredItem] = useState<PackedItem | null>(null);
  const [internalSelectedItem, setInternalSelectedItem] = useState<PackedItem | null>(null);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  // Keep internalSelectedItem in sync with packedItems updates (e.g. after undo/redo/manual move)
  useEffect(() => {
    if (internalSelectedItem) {
      const found = packedItems.find(p => p.id === internalSelectedItem.id);
      if (found) {
        if (
          found.x !== internalSelectedItem.x ||
          found.y !== internalSelectedItem.y ||
          found.z !== internalSelectedItem.z ||
          found.rotationIndex !== internalSelectedItem.rotationIndex ||
          found.width !== internalSelectedItem.width ||
          found.length !== internalSelectedItem.length ||
          found.height !== internalSelectedItem.height
        ) {
          setInternalSelectedItem(found);
        }
      } else {
        setInternalSelectedItem(null);
      }
    }
  }, [packedItems, internalSelectedItem]);

  // Drag-and-drop state for floating Controls panel
  const viewerWrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Handle Drag Start
  const handlePanelDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    // Avoid dragging when clicking inside interactive elements like buttons, inputs, selects
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('a')) {
      return;
    }

    if (!panelRef.current || !viewerWrapperRef.current) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const panelRect = panelRef.current.getBoundingClientRect();
    const wrapperRect = viewerWrapperRef.current.getBoundingClientRect();

    dragStartOffset.current = {
      x: clientX - panelRect.left,
      y: clientY - panelRect.top,
    };

    if (!panelPos) {
      setPanelPos({
        x: panelRect.left - wrapperRect.left,
        y: panelRect.top - wrapperRect.top,
      });
    }

    setIsDragging(true);
  };

  // Window-level mouse/touch move & up listeners for smooth non-blocking dragging
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!viewerWrapperRef.current || !panelRef.current) return;

      const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;

      const wrapperRect = viewerWrapperRef.current.getBoundingClientRect();
      const panelWidth = panelRef.current.offsetWidth || 288;
      const panelHeight = panelRef.current.offsetHeight || 420;

      let newX = clientX - wrapperRect.left - dragStartOffset.current.x;
      let newY = clientY - wrapperRect.top - dragStartOffset.current.y;

      // Bound clamping inside viewer with 8px margin
      const minX = 8;
      const maxX = Math.max(minX, wrapperRect.width - panelWidth - 8);
      const minY = 8;
      const maxY = Math.max(minY, wrapperRect.height - panelHeight - 8);

      newX = Math.max(minX, Math.min(newX, maxX));
      newY = Math.max(minY, Math.min(newY, maxY));

      setPanelPos({ x: newX, y: newY });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('touchcancel', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('touchcancel', handlePointerUp);
    };
  }, [isDragging]);

  // Toggle Full Screen handler supporting both native Fullscreen API and CSS-based fullscreen fallback
  const toggleFullScreen = useCallback(async () => {
    const wrapper = viewerWrapperRef.current;
    if (!wrapper) return;

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (err) {
        console.warn('Exit fullscreen failed:', err);
      }
      setIsFullScreen(false);
    } else {
      try {
        if (wrapper.requestFullscreen) {
          await wrapper.requestFullscreen();
          setIsFullScreen(true);
        } else {
          setIsFullScreen(prev => !prev);
        }
      } catch (err) {
        // In environments/iframes where requestFullscreen is blocked or unsupported, fallback to full-viewport CSS
        console.info('Native requestFullscreen failed or blocked by sandbox, using CSS fullscreen:', err);
        setIsFullScreen(prev => !prev);
      }
    }
  }, []);

  // Listen to native fullscreen changes and ESC key
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(Boolean(document.fullscreenElement));
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen && !document.fullscreenElement) {
        setIsFullScreen(false);
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 100);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullScreen]);

  // Trigger resize observer event when isFullScreen toggles so Three.js camera & canvas immediately adapt
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 150);
    return () => clearTimeout(timer);
  }, [isFullScreen]);

  const rawSelectedItem = externalSelectedItem || internalSelectedItem;
  const activeSelectedItem = useMemo(() => {
    if (!rawSelectedItem) return null;
    const found = packedItems.find(p => p.id === rawSelectedItem.id);
    return found || rawSelectedItem;
  }, [rawSelectedItem, packedItems]);

  const activeSelectedItemRef = useRef<PackedItem | null>(activeSelectedItem);
  activeSelectedItemRef.current = activeSelectedItem;

  // Drop selected cargo to nearest underlying support (floor or top of underlying box)
  const handleDropItemToSupport = useCallback((targetItem?: PackedItem | null) => {
    const raw = targetItem || activeSelectedItemRef.current || activeSelectedItem;
    if (!raw || !onManualMoveItem) return;
    const item = packedItems.find(p => p.id === raw.id) || raw;

    // Find container items
    const activeContLoad = (containers && containers.length > 0)
      ? (containers.find(c => c.containerIndex === (item.containerIndex ?? (typeof currentTab === 'number' ? currentTab : 1))) || containers[0])
      : null;
    const contItems = activeContLoad ? activeContLoad.packedItems : packedItems;

    const targetZ = calculateSupportHeight(
      item.x,
      item.y,
      item.length,
      item.width,
      contItems,
      item.id
    );

    if (item.z === targetZ) {
      showToast(isJa ? `「${item.name}」は既に最下部（Z: ${targetZ}mm）に接地しています` : `"${item.name}" is already resting at Z: ${targetZ}mm`);
      return;
    }

    const updated = {
      ...item,
      z: targetZ
    };
    activeSelectedItemRef.current = updated;

    onManualMoveItem(item.id, {
      x: item.x,
      y: item.y,
      z: targetZ
    });

    if (onSelectItem) {
      onSelectItem(updated);
    }

    showToast(isJa 
      ? `「${item.name}」を直下（Z: ${targetZ}mm）へ着地させました` 
      : `Dropped "${item.name}" to Z: ${targetZ}mm`);
  }, [activeSelectedItem, onManualMoveItem, containers, currentTab, packedItems, isJa, showToast, onSelectItem]);

  // Unload all cargo items in the active container (or all containers) to unplaced tray
  const handleUnloadContainerAll = useCallback(() => {
    if (!onManualUnloadContainer) return;

    const targetContIdx = currentTab === 'all' ? 'all' : (typeof currentTab === 'number' ? currentTab : 1);
    const itemsInTarget = packedItems.filter(p => {
      if (targetContIdx === 'all') return true;
      return (p.containerIndex || 1) === targetContIdx;
    });

    if (itemsInTarget.length === 0) {
      showToast(isJa ? '現在コンテナ内に配置されている貨物はありません' : 'No cargo currently loaded in container');
      return;
    }

    if (!confirmingUnload) {
      setConfirmingUnload(true);
      showToast(isJa 
        ? `【確認】もう一度「一括アンロード」を押すと、${targetContIdx === 'all' ? '全コンテナ' : `コンテナ #${targetContIdx}`}内の全${itemsInTarget.length}個の貨物をアンロードします` 
        : `Click "Unload All" again to unload ${itemsInTarget.length} items from ${targetContIdx === 'all' ? 'all containers' : `Container #${targetContIdx}`}`);
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = setTimeout(() => {
        setConfirmingUnload(false);
      }, 4000);
      return;
    }

    // User confirmed
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    setConfirmingUnload(false);

    onManualUnloadContainer(targetContIdx);
    setInternalSelectedItem(null);
    activeSelectedItemRef.current = null;
    if (onSelectItem) onSelectItem(null);
    setHeldUnplacedItem(null);
    setIsDraggingExistingItem(null);
    setGhostCoords(null);
    setIsTrayCollapsed(false); // Automatically open cargo tray for manual packing

    showToast(isJa 
      ? `コンテナ内の全${itemsInTarget.length}個の貨物を一括アンロードしました。トレイから自由に積載できます (Ctrl+Zで復元可能)` 
      : `Unloaded all ${itemsInTarget.length} items to tray. Ready for manual placement (Ctrl+Z to undo)`);
  }, [onManualUnloadContainer, currentTab, packedItems, confirmingUnload, isJa, showToast, onSelectItem]);

  // Max weight for weight color mapping
  const maxItemWeight = useMemo(() => {
    return Math.max(1, ...activeItemsToDisplay.map(p => p.weight));
  }, [activeItemsToDisplay]);

  // Single container volume utilization for quick badge display
  const singleContainerUtilization = useMemo(() => {
    if (containers && containers.length > 0) {
      return containers[0].metrics?.volumeUtilization || 0;
    }
    const contVol = container.length * container.width * container.height;
    if (contVol <= 0) return 0;
    const packedVol = packedItems.reduce((acc, item) => acc + (item.length * item.width * item.height), 0);
    return Math.min(100, (packedVol / contVol) * 100);
  }, [containers, container, packedItems]);

  // Sync currentStep when items change
  useEffect(() => {
    setCurrentStep(activeItemsToDisplay.length);
    setIsPlaying(false);
  }, [activeItemsToDisplay]);

  // Playback timer
  useEffect(() => {
    let interval: any = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= activeItemsToDisplay.length) {
            setIsPlaying(false);
            return activeItemsToDisplay.length;
          }
          return prev + 1;
        });
      }, 400 / playbackSpeed);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, playbackSpeed, activeItemsToDisplay.length]);

  // Initialize Three.js Scene
  useEffect(() => {
    if (!containerRef.current) return;

    try {
      const width = Math.max(containerRef.current.clientWidth || 600, 300);
      const height = Math.max(containerRef.current.clientHeight || 560, 300);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf8fafc); // Slate 50 neutral background
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      rendererRef.current = renderer;

      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controlsRef.current = controls;

      // Lighting setup
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
      scene.add(ambientLight);

      const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
      dirLight1.position.set(15, 25, 20);
      dirLight1.castShadow = true;
      dirLight1.shadow.mapSize.width = 2048;
      dirLight1.shadow.mapSize.height = 2048;
      scene.add(dirLight1);

      const dirLight2 = new THREE.DirectionalLight(0x94a3b8, 0.45);
      dirLight2.position.set(-15, 15, -15);
      scene.add(dirLight2);

      // Initial Camera Position
      const contLengthM = container.length / 1000;
      const contHeightM = container.height / 1000;
      const contWidthM = container.width / 1000;

      camera.position.set(contLengthM * 1.5, contHeightM * 1.8, contWidthM * 2.2);
      controls.target.set(contLengthM / 2, contHeightM / 2, contWidthM / 2);
      controls.update();

      // Lock vertical rotation (polar angle) so rotation is purely horizontal (yaw only)
      const initialPolar = controls.getPolarAngle();
      controls.minPolarAngle = initialPolar;
      controls.maxPolarAngle = initialPolar;
      controls.update();

      // Signal scene is ready for mesh population
      setSceneReady(prev => prev + 1);

      // Render loop
      let animationFrameId: number;
      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      // Resize observer
      const handleResize = () => {
        if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
        const newW = containerRef.current.clientWidth;
        const newH = containerRef.current.clientHeight || 560;
        if (newW > 0 && newH > 0) {
          cameraRef.current.aspect = newW / newH;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(newW, newH);
        }
      };

      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(containerRef.current);

      return () => {
        cancelAnimationFrame(animationFrameId);
        resizeObserver.disconnect();
        if (rendererRef.current) {
          rendererRef.current.dispose();
          rendererRef.current = null;
        }
        sceneRef.current = null;
      };
    } catch (err: any) {
      console.error('Three.js / WebGL initialization error:', err);
      setWebglError(err?.message || 'WebGL not supported or failed to initialize');
    }
  }, []);

  // Update Container Geometry & Visual Walls (Supports single or multi side-by-side)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (containersGroupRef.current) {
      scene.remove(containersGroupRef.current);
    }

    const allContainersGroup = new THREE.Group();
    containersGroupRef.current = allContainersGroup;

    const lenM = container.length / 1000;
    const widM = container.width / 1000;
    const heiM = container.height / 1000;

    const isSideBySide = currentTab === 'all' && containers && containers.length > 1;
    const countToRender = isSideBySide ? containers.length : 1;
    const spacingM = widM + 1.2;

    for (let cIdx = 0; cIdx < countToRender; cIdx++) {
      const zOffsetM = isSideBySide ? cIdx * spacingM : 0;
      const singleGroup = new THREE.Group();

      // Floor Plane
      const floorGeo = new THREE.PlaneGeometry(lenM, widM);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.9,
        metalness: 0.1,
        side: THREE.DoubleSide
      });
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.rotation.x = Math.PI / 2;
      floorMesh.position.set(lenM / 2, 0, widM / 2 + zOffsetM);
      floorMesh.receiveShadow = true;
      singleGroup.add(floorMesh);

      // Floor Grid lines
      const gridHelper = new THREE.GridHelper(Math.max(lenM, widM) * 1.5, 30, 0x94a3b8, 0xcbd5e1);
      gridHelper.position.set(lenM / 2, -0.005, widM / 2 + zOffsetM);
      singleGroup.add(gridHelper);

      // Bounding Box Outline (Wireframe container)
      const boxGeo = new THREE.BoxGeometry(lenM, heiM, widM);
      const edges = new THREE.EdgesGeometry(boxGeo);
      const lineMat = new THREE.LineBasicMaterial({ 
        color: isSideBySide ? (cIdx === 0 ? 0x2563eb : 0x7c3aed) : 0x2563eb, 
        linewidth: 2 
      });
      const wireframe = new THREE.LineSegments(edges, lineMat);
      wireframe.position.set(lenM / 2, heiM / 2, widM / 2 + zOffsetM);
      singleGroup.add(wireframe);

      // Semi-transparent side walls and roof
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.04,
        roughness: 0.1,
        metalness: 0.1,
        side: THREE.BackSide
      });
      const wallMesh = new THREE.Mesh(boxGeo, wallMat);
      wallMesh.position.set(lenM / 2, heiM / 2, widM / 2 + zOffsetM);
      singleGroup.add(wallMesh);

      // Cargo Door Indicator at the front (X = Length)
      const doorFrameGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(lenM, 0, zOffsetM),
        new THREE.Vector3(lenM, heiM, zOffsetM),
        new THREE.Vector3(lenM, heiM, widM + zOffsetM),
        new THREE.Vector3(lenM, 0, widM + zOffsetM),
        new THREE.Vector3(lenM, 0, zOffsetM)
      ]);
      const doorMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 3 });
      const doorLines = new THREE.Line(doorFrameGeo, doorMat);
      singleGroup.add(doorLines);

      // Origin Axes Marker
      const originAxes = new THREE.AxesHelper(Math.min(lenM, widM, heiM) * 0.35);
      originAxes.position.set(0, 0.01, zOffsetM);
      singleGroup.add(originAxes);

      allContainersGroup.add(singleGroup);
    }

    scene.add(allContainersGroup);

    // Re-center camera controls target
    if (controlsRef.current && cameraRef.current) {
      controlsRef.current.minPolarAngle = 0;
      controlsRef.current.maxPolarAngle = Math.PI;
      if (isSideBySide) {
        const totalZ = (countToRender - 1) * spacingM + widM;
        controlsRef.current.target.set(lenM / 2, heiM / 2, totalZ / 2);
        cameraRef.current.position.set(lenM * 1.6, heiM * 2.2 + totalZ * 0.4, totalZ * 1.3);
      } else {
        controlsRef.current.target.set(lenM / 2, heiM / 2, widM / 2);
      }
      controlsRef.current.update();
      const currentPolar = controlsRef.current.getPolarAngle();
      controlsRef.current.minPolarAngle = currentPolar;
      controlsRef.current.maxPolarAngle = currentPolar;
      controlsRef.current.update();
    }
  }, [container, currentTab, containers, sceneReady]);

  // Update Cargo Box Meshes in Three.js Scene
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old box meshes
    boxMeshesRef.current.forEach(mesh => {
      scene.remove(mesh);
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Line) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
    });
    boxMeshesRef.current.clear();

    const maxZLimit = (container.height * zSlicePercent) / 100;
    const maxXLimit = (container.length * xSlicePercent) / 100;
    const isSideBySide = currentTab === 'all' && containers && containers.length > 1;
    const spacingM = (container.width / 1000) + 1.2;

    activeItemsToDisplay.slice(0, currentStep).forEach((item) => {
      // Slicing filters
      if (item.z > maxZLimit || item.x > maxXLimit) {
        return;
      }

      const lenM = item.length / 1000;
      const widM = item.width / 1000;
      const heiM = item.height / 1000;
      const xM = item.x / 1000;
      const yM = item.y / 1000;
      const zM = item.z / 1000;

      // In side-by-side mode, offset each item by its container index along Z-axis
      const itemContIdx = typeof item.containerIndex === 'number' ? item.containerIndex : 1;
      const containerOffsetZ = isSideBySide ? Math.max(0, itemContIdx - 1) * spacingM : 0;

      const isSelected = activeSelectedItem?.id === item.id;
      const isHovered = hoveredItem?.id === item.id;

      // Color mapping with high-saturation vivid mode support
      let boxColor = new THREE.Color(item.color || '#3b82f6');
      if (colorMode === 'vivid') {
        const vividHex = VIVID_NEON_PALETTE[Math.abs(item.sequenceNumber - 1) % VIVID_NEON_PALETTE.length];
        boxColor = new THREE.Color(vividHex);
      } else if (colorMode === 'weight') {
        const weightRatio = item.weight / maxItemWeight;
        boxColor = new THREE.Color().setHSL(0.33 * (1 - weightRatio), 0.95, 0.5);
      } else if (colorMode === 'sequence') {
        const seqRatio = item.sequenceNumber / Math.max(1, activeItemsToDisplay.length);
        boxColor = new THREE.Color().setHSL(seqRatio * 0.85, 0.95, 0.52);
      } else if (isVividBoost && item.color) {
        // Boost saturation and brightness of base color
        boxColor = new THREE.Color(boostHexToVivid(item.color));
      }

      if (isSelected) {
        boxColor = new THREE.Color(0xfacc15); // Vibrant Yellow for selection
      } else if (isHovered) {
        boxColor = boxColor.clone().offsetHSL(0, 0, 0.18);
      }

      const isSemiTransparent = isTranslucent && cargoOpacity < 100;
      let effectiveOpacity = 1.0;
      if (isSemiTransparent) {
        if (isSelected) {
          effectiveOpacity = 0.95;
        } else if (isHovered) {
          effectiveOpacity = Math.min(1.0, (cargoOpacity / 100) + 0.25);
        } else {
          effectiveOpacity = cargoOpacity / 100;
        }
      } else {
        effectiveOpacity = (isHovered || isSelected) ? 0.92 : 1.0;
      }

      const boxGeo = new THREE.BoxGeometry(lenM, heiM, widM);
      const boxMat = new THREE.MeshStandardMaterial({
        color: boxColor,
        roughness: 0.28,
        metalness: 0.05,
        wireframe: showWireframeOnly,
        transparent: isSemiTransparent || isHovered || isSelected,
        opacity: effectiveOpacity,
        depthWrite: !isSemiTransparent,
        emissive: boxColor.clone().multiplyScalar(isVividBoost ? 0.15 : 0.08),
      });

      const mesh = new THREE.Mesh(boxGeo, boxMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Position: Center of the box in Three.js coordinates
      // X = Length, Y = Height in 3D, Z = Width in 3D
      mesh.position.set(
        xM + lenM / 2,
        zM + heiM / 2,
        yM + widM / 2 + containerOffsetZ
      );
      mesh.userData = { packedItem: item };

      // Edges outline
      const edgesGeo = new THREE.EdgesGeometry(boxGeo);
      const edgeLineMat = new THREE.LineBasicMaterial({
        color: isSelected ? 0x000000 : (item.isManual ? 0xf59e0b : 0x0f172a),
        linewidth: isSelected ? 3 : (item.isManual ? 2 : 1),
        transparent: isSemiTransparent,
        opacity: isSemiTransparent ? 0.85 : 1.0
      });
      const edgeLines = new THREE.LineSegments(edgesGeo, edgeLineMat);
      mesh.add(edgeLines);

      scene.add(mesh);
      boxMeshesRef.current.set(item.id, mesh);
    });
  }, [
    activeItemsToDisplay, currentStep, colorMode, isVividBoost, showWireframeOnly, 
    isTranslucent, cargoOpacity,
    zSlicePercent, xSlicePercent, hoveredItem, activeSelectedItem, 
    maxItemWeight, container, currentTab, containers, sceneReady
  ]);

  // Center of Gravity 3D Marker
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (cogGroupRef.current) {
      scene.remove(cogGroupRef.current);
    }

    if (!showCoG || activeItemsToDisplay.length === 0) return;

    const allCogGroup = new THREE.Group();
    cogGroupRef.current = allCogGroup;

    const isSideBySide = currentTab === 'all' && containers && containers.length > 1;
    const spacingM = (container.width / 1000) + 1.2;

    if (isSideBySide) {
      // Render CoG for each individual container
      containers.forEach((cLoad, cIdx) => {
        if (cLoad.packedItems.length === 0) return;
        const cCog = cLoad.metrics.centerOfGravity;
        const cogXM = cCog.x / 1000;
        const cogYM = cCog.y / 1000 + cIdx * spacingM;
        const cogZM = cCog.z / 1000;

        const sphereGeo = new THREE.SphereGeometry(0.12, 24, 24);
        const sphereMat = new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0xef4444,
          emissiveIntensity: 0.6,
          roughness: 0.2
        });
        const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
        sphereMesh.position.set(cogXM, cogZM, cogYM);
        allCogGroup.add(sphereMesh);

        const targetGeo = new THREE.RingGeometry(0.15, 0.25, 32);
        const targetMat = new THREE.MeshBasicMaterial({
          color: 0xef4444,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8
        });
        const targetMesh = new THREE.Mesh(targetGeo, targetMat);
        targetMesh.rotation.x = Math.PI / 2;
        targetMesh.position.set(cogXM, 0.02, cogYM);
        allCogGroup.add(targetMesh);

        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(cogXM, 0.02, cogYM),
          new THREE.Vector3(cogXM, cogZM, cogYM)
        ]);
        const lineMat = new THREE.LineDashedMaterial({
          color: 0xef4444,
          dashSize: 0.05,
          gapSize: 0.03
        });
        const line = new THREE.Line(lineGeo, lineMat);
        line.computeLineDistances();
        allCogGroup.add(line);
      });
    } else {
      // Single container CoG
      const activeContLoad = (typeof currentTab === 'number' && containers)
        ? (containers.find(c => c.containerIndex === currentTab) || containers[Math.max(0, currentTab - 1)])
        : undefined;
      const currentCoG = activeContLoad
        ? activeContLoad.metrics.centerOfGravity
        : centerOfGravity;

      const cogXM = currentCoG.x / 1000;
      const cogYM = currentCoG.y / 1000;
      const cogZM = currentCoG.z / 1000;

      const sphereGeo = new THREE.SphereGeometry(0.12, 24, 24);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xef4444,
        emissiveIntensity: 0.6,
        roughness: 0.2
      });
      const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
      sphereMesh.position.set(cogXM, cogZM, cogYM);
      allCogGroup.add(sphereMesh);

      const targetGeo = new THREE.RingGeometry(0.15, 0.25, 32);
      const targetMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
      });
      const targetMesh = new THREE.Mesh(targetGeo, targetMat);
      targetMesh.rotation.x = Math.PI / 2;
      targetMesh.position.set(cogXM, 0.02, cogYM);
      allCogGroup.add(targetMesh);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cogXM, 0.02, cogYM),
        new THREE.Vector3(cogXM, cogZM, cogYM)
      ]);
      const lineMat = new THREE.LineDashedMaterial({
        color: 0xef4444,
        dashSize: 0.05,
        gapSize: 0.03
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.computeLineDistances();
      allCogGroup.add(line);
    }

    scene.add(allCogGroup);
  }, [centerOfGravity, showCoG, activeItemsToDisplay.length, currentTab, containers, container, sceneReady]);

  // Update Ghost Box in 3D Scene
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!isManualMode || !ghostCoords) {
      if (ghostGroupRef.current) {
        ghostGroupRef.current.visible = false;
      }
      return;
    }

    const isSideBySide = currentTab === 'all' && containers && containers.length > 1;
    const targetCont0 = typeof currentTab === 'number' ? Math.max(0, currentTab - 1) : 0;
    const spacingM = (container.width / 1000) + 1.2;
    const targetOffsetZ = isSideBySide ? targetCont0 * spacingM : 0;

    let group = ghostGroupRef.current;
    if (!group) {
      group = new THREE.Group();
      group.name = 'manual-ghost-group';
      scene.add(group);
      ghostGroupRef.current = group;
    }

    while (group.children.length > 0) {
      const obj = group.children[0];
      group.remove(obj);
      if ((obj as any).geometry) (obj as any).geometry.dispose();
      if ((obj as any).material) {
        if (Array.isArray((obj as any).material)) (obj as any).material.forEach((m: any) => m.dispose());
        else (obj as any).material.dispose();
      }
    }

    const lenM = ghostCoords.length / 1000;
    const heiM = ghostCoords.height / 1000;
    const widM = ghostCoords.width / 1000;

    const boxGeo = new THREE.BoxGeometry(lenM, heiM, widM);
    const colorHex = ghostCoords.isValid ? 0x10b981 : 0xef4444;
    const boxMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.65,
      roughness: 0.2,
      metalness: 0.1,
      emissive: new THREE.Color(colorHex),
      emissiveIntensity: 0.45
    });

    const mesh = new THREE.Mesh(boxGeo, boxMat);
    group.add(mesh);

    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    const edgeLineMat = new THREE.LineBasicMaterial({
      color: ghostCoords.isValid ? 0x047857 : 0xb91c1c,
      linewidth: 3
    });
    const edgeLines = new THREE.LineSegments(edgesGeo, edgeLineMat);
    group.add(edgeLines);

    const activeOffsetZ = ghostCoords.offsetZ !== undefined ? ghostCoords.offsetZ : targetOffsetZ;
    group.position.set(
      (ghostCoords.x + ghostCoords.length / 2) / 1000,
      (ghostCoords.z + ghostCoords.height / 2) / 1000,
      (ghostCoords.y + ghostCoords.width / 2) / 1000 + activeOffsetZ
    );
    group.visible = true;
  }, [isManualMode, ghostCoords, currentTab, containers, container]);

  // Clean up ghost mesh on unmount
  useEffect(() => {
    return () => {
      const scene = sceneRef.current;
      if (scene && ghostGroupRef.current) {
        scene.remove(ghostGroupRef.current);
        ghostGroupRef.current = null;
      }
    };
  }, []);

  // Raycasting for Mouse Hover, Click & Drag Placement
  useEffect(() => {
    const containerEl = containerRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!containerEl || !camera || !scene) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const calculatePlacementAtMouse = (clientX: number, clientY: number, itemDim: { length: number; width: number; height: number; rotation: number }) => {
      const rect = containerEl.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hitPoint = new THREE.Vector3();
      const hasHit = raycaster.ray.intersectPlane(groundPlane, hitPoint);
      if (!hasHit) return null;

      // Also raycast existing boxes to find if hovering over a box top
      const candidateMeshes = Array.from(boxMeshesRef.current.values()).filter(m => {
        if (isDraggingExistingItem && m.userData?.packedItem?.id === isDraggingExistingItem.id) return false;
        return true;
      });
      const boxHits = raycaster.intersectObjects(candidateMeshes, false);
      if (boxHits.length > 0) {
        hitPoint.x = boxHits[0].point.x;
        hitPoint.z = boxHits[0].point.z;
      }

      const isSideBySide = currentTab === 'all' && containers && containers.length > 1;
      const widM = container.width / 1000;
      const spacingM = widM + 1.2;

      let targetContNum = typeof currentTab === 'number' ? currentTab : 1;
      let targetOffsetZ = 0;

      if (isSideBySide && containers && containers.length > 1) {
        // Calculate which container hitPoint.z is nearest to
        const approxIdx = Math.floor((hitPoint.z + 0.6) / spacingM);
        const clampedIdx = Math.max(0, Math.min(containers.length - 1, approxIdx));
        targetOffsetZ = clampedIdx * spacingM;
        targetContNum = containers[clampedIdx].containerIndex ?? (clampedIdx + 1);
      } else if (typeof currentTab === 'number') {
        targetContNum = currentTab;
        targetOffsetZ = 0;
      }

      const isRot = itemDim.rotation === 1;
      const length = isRot ? itemDim.width : itemDim.length;
      const width = isRot ? itemDim.length : itemDim.width;
      const height = itemDim.height;

      let rawX = (hitPoint.x * 1000) - length / 2;
      let rawY = ((hitPoint.z - targetOffsetZ) * 1000) - width / 2;

      if (gridSnapMm > 0) {
        rawX = Math.round(rawX / gridSnapMm) * gridSnapMm;
        rawY = Math.round(rawY / gridSnapMm) * gridSnapMm;
      }

      rawX = Math.max(0, Math.min(container.length - length, rawX));
      rawY = Math.max(0, Math.min(container.width - width, rawY));

      const activeContLoad = (containers && containers.length > 0)
        ? (containers.find(c => c.containerIndex === targetContNum) || containers[0])
        : null;
      const contItems = activeContLoad ? activeContLoad.packedItems : packedItems;
      const ignoreId = isDraggingExistingItem ? isDraggingExistingItem.id : undefined;
      const rawZ = calculateSupportHeight(rawX, rawY, length, width, contItems, ignoreId);

      const bounds = checkContainerBounds(rawX, rawY, rawZ, length, width, height, container);
      const restingOnFragile = isRestingOnFragile(rawX, rawY, rawZ, length, width, contItems, ignoreId);

      // Check container payload capacity if maxWeight is defined
      const itemWeight = heldUnplacedItem?.unplaced.weight ?? isDraggingExistingItem?.weight ?? 0;
      const currentContWeight = contItems.reduce((s, i) => (ignoreId && i.id === ignoreId ? s : s + i.weight), 0);
      const exceedsWeight = container.maxWeight > 0 && (currentContWeight + itemWeight) > container.maxWeight;

      let invalidReason: string | undefined;
      if (!bounds.isValid) {
        if (bounds.exceedsHeight) {
          invalidReason = language === 'ja' ? 'コンテナの天井高さを超過しています' : 'Exceeds container ceiling height';
        } else {
          invalidReason = language === 'ja' ? 'コンテナの境界寸法を超過しています' : 'Exceeds container boundary dimensions';
        }
      } else if (restingOnFragile) {
        invalidReason = language === 'ja' ? '割れ物（Fragile）指定の荷物の上には積載できません' : 'Cannot stack on top of fragile cargo';
      } else if (exceedsWeight) {
        invalidReason = language === 'ja' ? 'コンテナの最大積載重量を超過します' : 'Exceeds container max weight limit';
      }

      const isValid = bounds.isValid && !restingOnFragile && !exceedsWeight;

      return {
        x: rawX,
        y: rawY,
        z: rawZ,
        length,
        width,
        height,
        isValid,
        invalidReason,
        offsetZ: targetOffsetZ,
        containerIndex: targetContNum
      };
    };

    const handleMouseMove = (event: MouseEvent) => {
      const activeHeld = heldUnplacedItem || (draggedUnplacedRef.current ? {
        unplaced: draggedUnplacedRef.current.unplaced,
        rotation: draggedUnplacedRef.current.rotation,
        color: draggedUnplacedRef.current.color
      } : null);

      if (isManualMode && (activeHeld || isDraggingExistingItem)) {
        const itemDim = activeHeld ? {
          length: activeHeld.unplaced.dimensions.length,
          width: activeHeld.unplaced.dimensions.width,
          height: activeHeld.unplaced.dimensions.height,
          rotation: activeHeld.rotation
        } : {
          length: isDraggingExistingItem!.length,
          width: isDraggingExistingItem!.width,
          height: isDraggingExistingItem!.height,
          rotation: 0
        };

        const result = calculatePlacementAtMouse(event.clientX, event.clientY, itemDim);
        if (result) {
          setGhostCoords(result);
          containerEl.style.cursor = 'crosshair';
        }
        return;
      }

      // Normal raycast for hover
      const rect = containerEl.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const meshes: THREE.Object3D[] = Array.from(boxMeshesRef.current.values());
      const intersects = raycaster.intersectObjects(meshes, false);

      if (intersects.length > 0) {
        const targetMesh = intersects[0].object as THREE.Mesh;
        const item = targetMesh.userData.packedItem as PackedItem;
        setHoveredItem(item);
        containerEl.style.cursor = isManualMode ? 'grab' : 'pointer';
      } else {
        setHoveredItem(null);
        containerEl.style.cursor = 'default';
      }
    };

    let mouseDownPos = { x: 0, y: 0 };
    const handleMouseDown = (event: MouseEvent) => {
      mouseDownPos = { x: event.clientX, y: event.clientY };
    };

    const handleClick = (event: MouseEvent) => {
      // Ignore click if user was dragging/orbiting the camera (moved > 5px)
      const dx = Math.abs(event.clientX - mouseDownPos.x);
      const dy = Math.abs(event.clientY - mouseDownPos.y);
      if (dx > 5 || dy > 5) return;

      // 1. Repositioning existing item in manual mode
      if (isManualMode && isDraggingExistingItem && onManualMoveItem) {
        const itemDim = {
          length: isDraggingExistingItem.length,
          width: isDraggingExistingItem.width,
          height: isDraggingExistingItem.height,
          rotation: 0
        };
        const place = calculatePlacementAtMouse(event.clientX, event.clientY, itemDim);
        if (place) {
          if (!place.isValid) {
            showToast(place.invalidReason || (language === 'ja' ? 'コンテナの制限を超過しているため配置できません' : 'Cannot move item: exceeds container constraints'));
            return;
          }
          onManualMoveItem(isDraggingExistingItem.id, {
            x: place.x,
            y: place.y,
            z: place.z,
            length: place.length,
            width: place.width,
            height: place.height,
            rotationIndex: isDraggingExistingItem.rotationIndex
          });
          showToast(language === 'ja'
            ? `「${isDraggingExistingItem.name}」の位置を変更しました (X:${place.x} Y:${place.y} Z:${place.z}mm)`
            : `Moved "${isDraggingExistingItem.name}" to (X:${place.x}, Y:${place.y}, Z:${place.z}mm)`);
          setIsDraggingExistingItem(null);
          setGhostCoords(null);
          return;
        }
      }

      // 2. If holding an unplaced item in manual mode, click places it
      if (isManualMode && heldUnplacedItem && onManualPlaceItem) {
        const itemDim = {
          length: heldUnplacedItem.unplaced.dimensions.length,
          width: heldUnplacedItem.unplaced.dimensions.width,
          height: heldUnplacedItem.unplaced.dimensions.height,
          rotation: heldUnplacedItem.rotation
        };
        const place = calculatePlacementAtMouse(event.clientX, event.clientY, itemDim);
        if (place) {
          if (!place.isValid) {
            showToast(place.invalidReason || (language === 'ja' ? 'コンテナの制限を超過しているため配置できません' : 'Cannot place item: exceeds container limits'));
            return;
          }

          const targetContNum = place.containerIndex ?? (typeof currentTab === 'number' ? currentTab : 1);
          onManualPlaceItem(heldUnplacedItem.unplaced, {
            x: place.x,
            y: place.y,
            z: place.z,
            length: place.length,
            width: place.width,
            height: place.height,
            rotationIndex: heldUnplacedItem.rotation,
            color: heldUnplacedItem.color,
            containerIndex: targetContNum
          });
          showToast(language === 'ja' 
            ? `「${heldUnplacedItem.unplaced.name}」を手動配置しました (コンテナ#${targetContNum} X:${place.x} Y:${place.y} Z:${place.z}mm)`
            : `Manually placed "${heldUnplacedItem.unplaced.name}" (Cont #${targetContNum} X:${place.x}, Y:${place.y}, Z:${place.z}mm)`);
          
          if (heldUnplacedItem.unplaced.count <= 1) {
            setHeldUnplacedItem(null);
            setGhostCoords(null);
          } else {
            setHeldUnplacedItem(prev => prev ? {
              ...prev,
              unplaced: {
                ...prev.unplaced,
                count: prev.unplaced.count - 1
              }
            } : null);
          }
          return;
        }
      }

      // Normal selection click: Raycast cargo boxes
      const rect = containerEl.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const meshes: THREE.Object3D[] = Array.from(boxMeshesRef.current.values());
      const intersects = raycaster.intersectObjects(meshes, false);

      if (intersects.length > 0) {
        const targetMesh = intersects[0].object as THREE.Mesh;
        const item = targetMesh.userData.packedItem as PackedItem;
        const currentlySelected = externalSelectedItem || internalSelectedItem;
        // Toggle selection: clicking the already selected item closes the tooltip
        if (currentlySelected?.id === item.id) {
          setInternalSelectedItem(null);
          activeSelectedItemRef.current = null;
          if (onSelectItem) onSelectItem(null);
        } else {
          setInternalSelectedItem(item);
          activeSelectedItemRef.current = item;
          if (onSelectItem) onSelectItem(item);
        }
      } else {
        // Clicking empty space closes the tooltip
        setInternalSelectedItem(null);
        activeSelectedItemRef.current = null;
        if (onSelectItem) onSelectItem(null);
      }
    };

    // HTML5 Drag & Drop event handlers on 3D Container
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      if (isManualMode && draggedUnplacedRef.current) {
        const itemDim = {
          length: draggedUnplacedRef.current.unplaced.dimensions.length,
          width: draggedUnplacedRef.current.unplaced.dimensions.width,
          height: draggedUnplacedRef.current.unplaced.dimensions.height,
          rotation: draggedUnplacedRef.current.rotation
        };
        const result = calculatePlacementAtMouse(e.clientX, e.clientY, itemDim);
        if (result) {
          setGhostCoords(result);
          containerEl.style.cursor = 'copy';
        }
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      if (isManualMode && draggedUnplacedRef.current && onManualPlaceItem) {
        const dragged = draggedUnplacedRef.current;
        const itemDim = {
          length: dragged.unplaced.dimensions.length,
          width: dragged.unplaced.dimensions.width,
          height: dragged.unplaced.dimensions.height,
          rotation: dragged.rotation
        };
        const place = calculatePlacementAtMouse(e.clientX, e.clientY, itemDim);
        if (place) {
          if (!place.isValid) {
            showToast(place.invalidReason || (language === 'ja' ? 'コンテナの制限を超過しているため配置できません' : 'Cannot drop item: exceeds container limits'));
            setGhostCoords(null);
            draggedUnplacedRef.current = null;
            return;
          }

          const targetContNum = place.containerIndex ?? (typeof currentTab === 'number' ? currentTab : 1);
          onManualPlaceItem(dragged.unplaced, {
            x: place.x,
            y: place.y,
            z: place.z,
            length: place.length,
            width: place.width,
            height: place.height,
            rotationIndex: dragged.rotation,
            color: dragged.color,
            containerIndex: targetContNum
          });
          showToast(language === 'ja' 
            ? `「${dragged.unplaced.name}」をドロップ配置しました (コンテナ#${targetContNum} X:${place.x} Y:${place.y} Z:${place.z}mm)`
            : `Dropped "${dragged.unplaced.name}" (Cont #${targetContNum} X:${place.x}, Y:${place.y}, Z:${place.z}mm)`);
        }
        setGhostCoords(null);
        draggedUnplacedRef.current = null;
      }
    };

    // Keyboard shortcuts for Manual Mode & Tooltip closing
    const handleKeyDown = (e: KeyboardEvent) => {
      // Guard: Ignore shortcuts if the user is typing into an input field, textarea or select
      const targetEl = e.target as HTMLElement | null;
      const tagName = (targetEl?.tagName || '').toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || targetEl?.isContentEditable) {
        return;
      }

      // Undo: Ctrl+Z / Cmd+Z (without Shift)
      if (isManualMode && (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        if (canUndo && onUndo) {
          onUndo();
          setHeldUnplacedItem(null);
          setIsDraggingExistingItem(null);
          setGhostCoords(null);
          showToast(language === 'ja' ? '操作を元に戻しました (Ctrl+Z)' : 'Undid adjustment (Ctrl+Z)');
        }
        return;
      }

      // Redo: Ctrl+Y, or Ctrl+Shift+Z / Cmd+Shift+Z
      if (
        isManualMode && (
          ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) ||
          ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && e.shiftKey)
        )
      ) {
        e.preventDefault();
        if (canRedo && onRedo) {
          onRedo();
          setHeldUnplacedItem(null);
          setIsDraggingExistingItem(null);
          setGhostCoords(null);
          showToast(language === 'ja' ? '操作をやり直しました (Ctrl+Y)' : 'Redid adjustment (Ctrl+Y)');
        }
        return;
      }

      const rawTarget = externalSelectedItem || internalSelectedItem;
      const currentSelected = (activeSelectedItemRef.current && rawTarget && activeSelectedItemRef.current.id === rawTarget.id)
        ? activeSelectedItemRef.current
        : (rawTarget ? (packedItems.find(p => p.id === rawTarget.id) || rawTarget) : null);

      if (e.key === 'r' || e.key === 'R') {
        if (heldUnplacedItem) {
          setHeldUnplacedItem(prev => prev ? { ...prev, rotation: prev.rotation === 0 ? 1 : 0 } : null);
        } else if (isManualMode && currentSelected && onManualMoveItem) {
          e.preventDefault();
          const nextRot = (currentSelected.rotationIndex + 1) % 6;
          const updatedItem = {
            ...currentSelected,
            length: currentSelected.width,
            width: currentSelected.length,
            rotationIndex: nextRot
          };
          activeSelectedItemRef.current = updatedItem;
          onManualMoveItem(currentSelected.id, {
            x: currentSelected.x,
            y: currentSelected.y,
            z: currentSelected.z,
            length: currentSelected.width,
            width: currentSelected.length,
            height: currentSelected.height,
            rotationIndex: nextRot
          });
          if (onSelectItem) onSelectItem(updatedItem);
          showToast(language === 'ja' ? `「${currentSelected.name}」を90°回転しました` : `Rotated "${currentSelected.name}" 90°`);
        }
      } else if (e.key === ' ' || e.key === 'd' || e.key === 'D') {
        // Space or 'D': Gravity Drop selected item to nearest support/floor
        if (isManualMode && currentSelected) {
          e.preventDefault();
          handleDropItemToSupport(currentSelected);
        }
      } else if (
        isManualMode && 
        currentSelected && 
        onManualMoveItem &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(e.key)
      ) {
        // Arrow Keys & PageUp/PageDown Nudge fine adjustment
        e.preventDefault();
        const baseStep = gridSnapMm > 0 ? gridSnapMm : 50;

        let dx = 0;
        let dy = 0;
        let dz = 0;

        if (e.key === 'PageUp' || (e.shiftKey && e.key === 'ArrowUp')) {
          dz = baseStep; // Elevation Up
        } else if (e.key === 'PageDown' || (e.shiftKey && e.key === 'ArrowDown')) {
          dz = -baseStep; // Elevation Down
        } else if (e.key === 'ArrowUp') {
          dx = -baseStep; // Inward (towards front/depth of container)
        } else if (e.key === 'ArrowDown') {
          dx = baseStep; // Outward (towards container doors)
        } else if (e.key === 'ArrowLeft') {
          dy = -baseStep; // Move Left
        } else if (e.key === 'ArrowRight') {
          dy = baseStep; // Move Right
        }

        const maxX = Math.max(0, container.length - currentSelected.length);
        const maxY = Math.max(0, container.width - currentSelected.width);
        const maxZ = Math.max(0, container.height - currentSelected.height);

        const newX = Math.max(0, Math.min(maxX, currentSelected.x + dx));
        const newY = Math.max(0, Math.min(maxY, currentSelected.y + dy));
        const newZ = Math.max(0, Math.min(maxZ, currentSelected.z + dz));

        if (newX !== currentSelected.x || newY !== currentSelected.y || newZ !== currentSelected.z) {
          const updatedItem = {
            ...currentSelected,
            x: newX,
            y: newY,
            z: newZ
          };
          activeSelectedItemRef.current = updatedItem;
          onManualMoveItem(currentSelected.id, { x: newX, y: newY, z: newZ });
          if (onSelectItem) {
            onSelectItem(updatedItem);
          }
        }
      } else if (e.key === 'Escape') {
        setHeldUnplacedItem(null);
        setIsDraggingExistingItem(null);
        setGhostCoords(null);
        setInternalSelectedItem(null);
        activeSelectedItemRef.current = null;
        if (onSelectItem) onSelectItem(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && isManualMode) {
        if (currentSelected && onManualRemoveItem) {
          onManualRemoveItem(currentSelected.id);
          setInternalSelectedItem(null);
          activeSelectedItemRef.current = null;
          if (onSelectItem) onSelectItem(null);
          showToast(language === 'ja' ? `「${currentSelected.name}」を未積載リストに戻しました` : `Returned "${currentSelected.name}" to unplaced list`);
        }
      }
    };

    containerEl.addEventListener('mousedown', handleMouseDown);
    containerEl.addEventListener('mousemove', handleMouseMove);
    containerEl.addEventListener('click', handleClick);
    containerEl.addEventListener('dragover', handleDragOver);
    containerEl.addEventListener('drop', handleDrop);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      containerEl.removeEventListener('mousedown', handleMouseDown);
      containerEl.removeEventListener('mousemove', handleMouseMove);
      containerEl.removeEventListener('click', handleClick);
      containerEl.removeEventListener('dragover', handleDragOver);
      containerEl.removeEventListener('drop', handleDrop);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    isManualMode, heldUnplacedItem, isDraggingExistingItem, currentTab, containers, 
    container, gridSnapMm, onManualPlaceItem, onManualMoveItem, onManualRemoveItem, 
    onSelectItem, externalSelectedItem, internalSelectedItem, language, showToast, packedItems,
    onUndo, onRedo, canUndo, canRedo, handleDropItemToSupport
  ]);

  // Camera preset views
  const setCameraView = (type: 'iso' | 'top' | 'side' | 'door') => {
    setActiveCameraView(type);
    if (!cameraRef.current || !controlsRef.current) return;
    const lenM = container.length / 1000;
    const widM = container.width / 1000;
    const heiM = container.height / 1000;
    const isSideBySide = currentTab === 'all' && containers && containers.length > 1;
    const spacingM = widM + 1.2;
    const count = isSideBySide ? containers.length : 1;
    const totalZ = (count - 1) * spacingM + widM;

    const target = new THREE.Vector3(lenM / 2, heiM / 2, totalZ / 2);
    controlsRef.current.target.copy(target);

    // Temporarily allow polar repositioning
    controlsRef.current.minPolarAngle = 0;
    controlsRef.current.maxPolarAngle = Math.PI;

    if (type === 'iso') {
      cameraRef.current.position.set(lenM * 1.5, heiM * 1.8, totalZ * 1.4);
    } else if (type === 'top') {
      cameraRef.current.position.set(lenM / 2, heiM * 3.5 + totalZ * 0.5, totalZ / 2 + 0.001);
    } else if (type === 'side') {
      cameraRef.current.position.set(lenM / 2, heiM / 2, totalZ * 2.5);
    } else if (type === 'door') {
      cameraRef.current.position.set(lenM * 2.4, heiM * 0.8, totalZ / 2);
    }
    controlsRef.current.update();

    // Lock vertical rotation (polar angle) to new view's elevation for horizontal-only rotation
    const newPolar = controlsRef.current.getPolarAngle();
    controlsRef.current.minPolarAngle = newPolar;
    controlsRef.current.maxPolarAngle = newPolar;
    controlsRef.current.update();
  };

  // Capture High-Res Snapshot
  const captureSnapshot = () => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `3D-Loading-Plan-${container.name.replace(/\s+/g, '_')}-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = dataUrl;
    link.click();
  };

  const hasMultipleContainers = containers && containers.length > 1;

  return (
    <div 
      ref={viewerWrapperRef}
      id="container-viewer-3d-root" 
      className={`flex flex-col bg-white border border-slate-200 overflow-hidden shadow-xs text-slate-800 transition-all ${
        isFullScreen 
          ? '!fixed !inset-0 !w-screen !h-screen !z-[99999] rounded-none !m-0 !p-0 border-none' 
          : 'relative w-full h-full min-h-[580px] rounded-xl'
      }`}
    >
      {/* 3D Canvas Viewport */}
      <div 
        ref={containerRef} 
        className="w-full flex-1 relative bg-slate-50 select-none outline-none min-h-[400px]"
      >
        {webglError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-50 text-slate-700 space-y-3">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">3Dグラフィックス (WebGL) の初期化中または非対応です</p>
              <p className="text-xs text-slate-500 mt-1">{webglError}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors"
            >
              ページを再読み込み
            </button>
          </div>
        )}
      </div>

      {/* Top Floating Container Selector Tabs & Quick Badges */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none gap-2 flex-wrap z-10">
        <div className="flex items-center gap-1.5 pointer-events-auto bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-sm text-xs text-slate-800 flex-wrap">
          <Box className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="font-semibold text-slate-900">{container.name}</span>

          {hasMultipleContainers ? (
            <div className="flex items-center gap-1 ml-2 border-l border-slate-200 pl-2">
              {containers.map((cLoad, idx) => {
                const cIndex = cLoad.containerIndex || (idx + 1);
                const isActive = currentTab === cIndex;
                return (
                  <button
                    key={cIndex}
                    type="button"
                    onClick={() => setTab(cIndex)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    #{cIndex} ({(cLoad.metrics.volumeUtilization || 0).toFixed(0)}%)
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setTab('all')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 transition-all ${
                  currentTab === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Grid3X3 className="w-3 h-3" />
                <span>{isJa ? '全台並列' : 'Side-by-Side'}</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 ml-2 border-l border-slate-200 pl-2">
              <button
                type="button"
                onClick={() => setTab(1)}
                title={isJa ? `コンテナ #1 (容積充填率: ${singleContainerUtilization.toFixed(1)}%)` : `Container #1 (Volume Utilization: ${singleContainerUtilization.toFixed(1)}%)`}
                className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-900 text-white shadow-xs transition-all cursor-default"
              >
                #1 ({singleContainerUtilization.toFixed(0)}%)
              </button>
            </div>
          )}

          <span className="text-slate-300 mx-1">|</span>
          <span className="text-slate-900 font-mono font-bold">
            {activeItemsToDisplay.length} {isJa ? '個 積載' : 'Boxes'}
          </span>
        </div>

        {/* Top-Right Viewer Toolbar */}
        <div className="flex items-center gap-1 pointer-events-auto bg-white/90 backdrop-blur-md p-1 rounded-lg border border-slate-200 shadow-sm text-xs">
          <button
            id="toggle-slice-controls-btn"
            onClick={() => setShowSliceControls(!showSliceControls)}
            title={isJa ? '操作・視点・表示設定 (Vivid・半透明・断面・シミュレーション)' : 'Controls, Display & Slicing Settings'}
            className={`px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1.5 font-bold ${
              showSliceControls 
                ? 'bg-slate-900 text-white shadow-2xs' 
                : (zSlicePercent < 100 || xSlicePercent < 100 || isPlaying)
                  ? 'bg-slate-200 text-slate-900 border border-slate-300 font-bold'
                  : 'text-slate-800 hover:bg-slate-100'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="text-xs">{isJa ? '操作・表示設定' : 'Controls'}</span>
            {!showSliceControls && (isVividBoost || isTranslucent || zSlicePercent < 100 || xSlicePercent < 100 || isPlaying) && (
              <span className="flex items-center gap-1 ml-0.5">
                {isVividBoost && (
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500" title={isJa ? '鮮やかON' : 'Vivid ON'} />
                )}
                {isTranslucent && (
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" title={isJa ? '半透明ON' : 'Translucent ON'} />
                )}
              </span>
            )}
          </button>
          <button
            id="toggle-manual-mode-btn"
            onClick={() => {
              const next = !isManualMode;
              setIsManualMode(next);
              if (!next) {
                setHeldUnplacedItem(null);
                setGhostCoords(null);
              }
            }}
            title={isJa ? '手動調整モード切替: 未積載荷物のドラッグ配置・位置修正' : 'Toggle Manual Adjustment Mode'}
            className={`px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1.5 font-bold ${
              isManualMode
                ? 'bg-amber-500 text-slate-950 shadow-xs ring-2 ring-amber-400/70'
                : hasManualAdjustments
                  ? 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                  : 'text-slate-800 hover:bg-slate-100'
            }`}
          >
            <Hand className={`w-3.5 h-3.5 ${isManualMode ? 'text-slate-950' : 'text-amber-500'}`} />
            <span className="text-xs">{isJa ? '手動調整' : 'Manual'}</span>
            {hasManualAdjustments && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">
                {manualAdjustmentsCount || '✓'}
              </span>
            )}
          </button>
          <div className="w-px h-4 bg-slate-200 mx-0.5" />
          <button
            id="toggle-cog-btn"
            onClick={() => setShowCoG(!showCoG)}
            title={isJa ? '重心マーカー表示切替' : 'Toggle Center of Gravity'}
            className={`p-1.5 rounded-md transition-colors ${showCoG ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <button
            id="snapshot-3d-btn"
            onClick={captureSnapshot}
            title={isJa ? '3D画像保存 (PNG)' : 'Save 3D Snapshot'}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-700 transition-colors"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
          <button
            id="fullscreen-3d-btn"
            onClick={toggleFullScreen}
            title={isJa 
              ? (isFullScreen ? '全画面表示を解除 (Esc)' : '全画面表示') 
              : (isFullScreen ? 'Exit Full Screen (Esc)' : 'Full Screen')
            }
            className={`p-1.5 rounded-md transition-colors ${
              isFullScreen 
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs' 
                : 'hover:bg-slate-100 text-slate-600'
            }`}
          >
            {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Manual Mode Active Sticky Control Strip */}
      {isManualMode && (
        <div 
          id="manual-mode-active-banner"
          className="absolute top-14 left-3 right-3 pointer-events-auto bg-amber-50/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-amber-300 shadow-md text-xs z-20 animate-fade-in flex items-center justify-between gap-3 text-slate-900 flex-wrap"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 bg-amber-500 text-slate-950 px-2 py-0.5 rounded font-bold text-[11px] shadow-2xs">
              <Hand className="w-3.5 h-3.5" />
              {isJa ? '手動調整モード中' : 'Manual Mode Active'}
            </span>
            <span className="text-[11px] text-amber-950 font-medium">
              {heldUnplacedItem ? (
                <span className="font-bold text-amber-900 flex items-center gap-1">
                  <ArrowDownToLine className="w-3.5 h-3.5 text-amber-600 animate-bounce" />
                  {isJa 
                    ? `配置位置を選択中: 「${heldUnplacedItem.unplaced.name}」 3Dビュー内をクリックで配置確定 / [R]で回転` 
                    : `Positioning "${heldUnplacedItem.unplaced.name}" - Click 3D view to place / [R] to rotate`}
                </span>
              ) : activeSelectedItem ? (
                <span className="font-bold text-amber-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0 border border-black/15" style={{ backgroundColor: activeSelectedItem.color }} />
                  {isJa
                    ? `「${activeSelectedItem.name}」選択中: [↑↓←→] 微動 / [Shift+↑↓] 昇降 / [Space] 着地 / [R] 回転`
                    : `"${activeSelectedItem.name}" selected: [Arrows] Nudge / [Shift+Up/Dn] Elevate / [Space] Drop / [R] Rotate`}
                </span>
              ) : (
                isJa 
                  ? '未積載トレイの荷物を配置、または積載済みの荷物をクリックして選択（矢印キー微動・Spaceで着地）' 
                  : 'Place tray items, or click packed cargo to select (Arrow keys nudge, Space to drop)'
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Undo / Redo buttons */}
            <div className="flex items-center gap-0.5 bg-white border border-amber-300 rounded-md p-0.5 shadow-2xs">
              <button
                id="banner-undo-btn"
                type="button"
                disabled={!canUndo}
                onClick={() => {
                  if (canUndo && onUndo) {
                    onUndo();
                    setHeldUnplacedItem(null);
                    setIsDraggingExistingItem(null);
                    setGhostCoords(null);
                    showToast(isJa ? '操作を元に戻しました (Ctrl+Z)' : 'Undid adjustment (Ctrl+Z)');
                  }
                }}
                title={isJa ? '元に戻す (ショートカット: Ctrl+Z / ⌘Z)' : 'Undo (Shortcut: Ctrl+Z / ⌘Z)'}
                className="px-2 py-1 rounded text-slate-800 hover:bg-amber-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed flex items-center gap-1 text-[11px] font-bold transition-colors cursor-pointer disabled:pointer-events-none"
              >
                <Undo2 className="w-3.5 h-3.5 text-amber-800" />
                <span>{isJa ? '元に戻す' : 'Undo'}</span>
              </button>
              <div className="w-[1px] h-3.5 bg-amber-200" />
              <button
                id="banner-redo-btn"
                type="button"
                disabled={!canRedo}
                onClick={() => {
                  if (canRedo && onRedo) {
                    onRedo();
                    setHeldUnplacedItem(null);
                    setIsDraggingExistingItem(null);
                    setGhostCoords(null);
                    showToast(isJa ? '操作をやり直しました (Ctrl+Y)' : 'Redid adjustment (Ctrl+Y)');
                  }
                }}
                title={isJa ? 'やり直す (ショートカット: Ctrl+Y / ⌘Shift+Z)' : 'Redo (Shortcut: Ctrl+Y / ⌘Shift+Z)'}
                className="px-2 py-1 rounded text-slate-800 hover:bg-amber-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed flex items-center gap-1 text-[11px] font-bold transition-colors cursor-pointer disabled:pointer-events-none"
              >
                <Redo2 className="w-3.5 h-3.5 text-amber-800" />
                <span>{isJa ? 'やり直す' : 'Redo'}</span>
              </button>
            </div>

            {/* Rotate item */}
            <button
              id="banner-rotate-btn"
              onClick={() => {
                if (heldUnplacedItem) {
                  setHeldUnplacedItem(prev => prev ? { ...prev, rotation: prev.rotation === 0 ? 1 : 0 } : null);
                } else if (activeSelectedItem && onManualMoveItem) {
                  onManualMoveItem(activeSelectedItem.id, {
                    x: activeSelectedItem.x,
                    y: activeSelectedItem.y,
                    z: activeSelectedItem.z,
                    length: activeSelectedItem.width,
                    width: activeSelectedItem.length,
                    height: activeSelectedItem.height,
                    rotationIndex: (activeSelectedItem.rotationIndex + 1) % 6
                  });
                  showToast(isJa ? `90°回転しました` : `Rotated 90°`);
                }
              }}
              title={isJa ? '荷物を90°回転 (ショートカット: R)' : 'Rotate 90 degrees (Shortcut: R)'}
              className="px-2 py-1 rounded-md bg-white border border-amber-300 text-slate-800 hover:bg-amber-100 flex items-center gap-1 text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"
            >
              <RotateCw className="w-3 h-3 text-amber-700" />
              <span>{isJa ? '90°回転 (R)' : 'Rotate (R)'}</span>
            </button>

            {/* Gravity Drop (Landing) button when cargo is selected */}
            {activeSelectedItem && (
              <button
                id="banner-drop-btn"
                onClick={() => handleDropItemToSupport(activeSelectedItem)}
                title={isJa ? '真下の床・荷物の天面まで着地 (ショートカット: Space / D)' : 'Drop onto floor or underlying cargo (Shortcut: Space / D)'}
                className="px-2 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1 text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"
              >
                <ArrowDownToLine className="w-3 h-3" />
                <span>{isJa ? '直下へ着地 (Space)' : 'Drop (Space)'}</span>
              </button>
            )}

            {/* Grid Snap selector */}
            <div className="flex items-center gap-1 bg-white border border-amber-300 rounded-md px-2 py-0.5 text-[11px]">
              <Magnet className="w-3 h-3 text-amber-700" />
              <span className="text-slate-500 font-medium">{isJa ? 'スナップ:' : 'Snap:'}</span>
              <select
                value={gridSnapMm}
                onChange={(e) => setGridSnapMm(Number(e.target.value))}
                className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
              >
                <option value={10}>10mm</option>
                <option value={50}>50mm</option>
                <option value={100}>100mm</option>
                <option value={0}>{isJa ? 'なし (自由)' : 'Free'}</option>
              </select>
            </div>

            {/* Unload All Cargo to unplaced tray for manual packing */}
            {onManualUnloadContainer && (
              <button
                id="banner-unload-container-btn"
                type="button"
                onClick={handleUnloadContainerAll}
                title={isJa 
                  ? 'コンテナ内の貨物をすべて未積載トレイに戻し、手動で一から配置します (Ctrl+Zで元に戻せます)' 
                  : 'Unload all cargo items back to tray for manual loading (Ctrl+Z to undo)'}
                className={`px-2 py-1 rounded-md border text-[11px] font-bold shadow-2xs transition-all flex items-center gap-1 cursor-pointer ${
                  confirmingUnload 
                    ? 'bg-red-600 text-white border-red-700 animate-pulse' 
                    : 'bg-white border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300'
                }`}
              >
                <PackageMinus className="w-3.5 h-3.5 text-current" />
                <span>
                  {confirmingUnload 
                    ? (isJa ? '本当に空にしますか？ (クリックで確定)' : 'Confirm Unload All?') 
                    : (isJa ? '一括アンロード (空にする)' : 'Unload All')}
                </span>
              </button>
            )}

            {/* Done */}
            <button
              id="banner-done-btn"
              onClick={() => {
                setIsManualMode(false);
                setHeldUnplacedItem(null);
                setGhostCoords(null);
              }}
              className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-black text-white flex items-center gap-1 text-[11px] font-bold shadow-2xs transition-colors"
            >
              <Check className="w-3 h-3 text-emerald-400" />
              <span>{isJa ? '完了' : 'Done'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Selected Box Inspector Card (Displayed on Mouse Click) */}
      {activeSelectedItem && (
        <div className={`absolute ${isManualMode ? 'top-26' : 'top-16'} left-3 pointer-events-auto bg-white/95 backdrop-blur-md p-3.5 rounded-xl border border-slate-200 shadow-xl text-xs max-w-xs z-20 animate-fade-in text-slate-800`}>
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2">
            <div className="flex items-center gap-1.5 truncate">
              <span 
                className="w-3 h-3 rounded-full shrink-0 border border-black/10" 
                style={{ backgroundColor: activeSelectedItem.color }} 
              />
              <span className="font-bold text-slate-900 truncate">
                {activeSelectedItem.name}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {activeSelectedItem.isManual && (
                <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-bold text-[10px] border border-amber-300 flex items-center gap-0.5">
                  <Hand className="w-2.5 h-2.5 text-amber-700" />
                  {isJa ? '手動' : 'Manual'}
                </span>
              )}
              {activeSelectedItem.containerIndex && (
                <span className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-mono font-bold text-[10px] border border-slate-300">
                  C#{activeSelectedItem.containerIndex}
                </span>
              )}
              <span className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-mono font-bold text-[10px] border border-slate-300">
                #{activeSelectedItem.sequenceNumber}
              </span>
              <button
                type="button"
                id="close-cargo-inspector-card-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setInternalSelectedItem(null);
                  if (onSelectItem) onSelectItem(null);
                }}
                title={isJa ? '閉じる (Esc)' : 'Close (Esc)'}
                className="ml-0.5 p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {(() => {
            const target = activeSelectedItem;
            if (!target) return null;
            const coords = formatCoordinates(target.x, target.y, target.z, unitSystem);
            return (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-slate-600">
                  <div>
                    <span className="text-slate-400 block">{isJa ? 'SKU / 識別:' : 'SKU:'}</span>
                    <span className="font-mono font-semibold text-slate-800">{target.sku}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{isJa ? '単体重量:' : 'Weight:'}</span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatWeightCompact(target.weight, unitSystem)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{isJa ? '寸法 (L×W×H):' : 'Size (L×W×H):'}</span>
                    <span className="font-mono text-slate-800 font-medium">
                      {formatDimensions(target.length, target.width, target.height, unitSystem, true)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{isJa ? `配置位置 (${coords.unit}):` : `Pos (${coords.unit}):`}</span>
                    <span className="font-mono text-slate-800 font-bold">
                      {coords.x}, {coords.y}, {coords.z}
                    </span>
                  </div>
                </div>

                {/* Manual Adjustment fine-tuning controls when item is selected in manual mode */}
                {isManualMode && activeSelectedItem && activeSelectedItem.id === target.id && (
                  <div className="mt-2 pt-2 border-t border-slate-200 space-y-1.5 bg-amber-50/60 -mx-3.5 -mb-3.5 p-3 rounded-b-xl">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-800 flex items-center gap-1">
                        <Move className="w-3 h-3 text-amber-600" />
                        {isJa ? '位置微調整' : 'Nudge Position'}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        ±{gridSnapMm || 50}mm
                      </span>
                    </div>

                    {/* Coordinate Nudge Controls */}
                    <div className="grid grid-cols-3 gap-1">
                      {/* X Nudge */}
                      <div className="bg-white rounded border border-slate-200 p-1 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500">X:</span>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (onManualMoveItem) {
                                const step = gridSnapMm || 50;
                                const newX = Math.max(0, target.x - step);
                                const updated = { ...target, x: newX };
                                activeSelectedItemRef.current = updated;
                                onManualMoveItem(target.id, { x: newX, y: target.y, z: target.z });
                                if (onSelectItem) onSelectItem(updated);
                              }
                            }}
                            className="w-4 h-4 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center font-bold text-slate-700 text-xs cursor-pointer"
                          >-</button>
                          <button
                            type="button"
                            onClick={() => {
                              if (onManualMoveItem) {
                                const step = gridSnapMm || 50;
                                const newX = Math.min(container.length - target.length, target.x + step);
                                const updated = { ...target, x: newX };
                                activeSelectedItemRef.current = updated;
                                onManualMoveItem(target.id, { x: newX, y: target.y, z: target.z });
                                if (onSelectItem) onSelectItem(updated);
                              }
                            }}
                            className="w-4 h-4 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center font-bold text-slate-700 text-xs cursor-pointer"
                          >+</button>
                        </div>
                      </div>

                      {/* Y Nudge */}
                      <div className="bg-white rounded border border-slate-200 p-1 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500">Y:</span>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (onManualMoveItem) {
                                const step = gridSnapMm || 50;
                                const newY = Math.max(0, target.y - step);
                                const updated = { ...target, y: newY };
                                activeSelectedItemRef.current = updated;
                                onManualMoveItem(target.id, { x: target.x, y: newY, z: target.z });
                                if (onSelectItem) onSelectItem(updated);
                              }
                            }}
                            className="w-4 h-4 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center font-bold text-slate-700 text-xs cursor-pointer"
                          >-</button>
                          <button
                            type="button"
                            onClick={() => {
                              if (onManualMoveItem) {
                                const step = gridSnapMm || 50;
                                const newY = Math.min(container.width - target.width, target.y + step);
                                const updated = { ...target, y: newY };
                                activeSelectedItemRef.current = updated;
                                onManualMoveItem(target.id, { x: target.x, y: newY, z: target.z });
                                if (onSelectItem) onSelectItem(updated);
                              }
                            }}
                            className="w-4 h-4 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center font-bold text-slate-700 text-xs cursor-pointer"
                          >+</button>
                        </div>
                      </div>

                      {/* Z Nudge */}
                      <div className="bg-white rounded border border-slate-200 p-1 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500">Z:</span>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (onManualMoveItem) {
                                const step = gridSnapMm || 50;
                                const newZ = Math.max(0, target.z - step);
                                const updated = { ...target, z: newZ };
                                activeSelectedItemRef.current = updated;
                                onManualMoveItem(target.id, { x: target.x, y: target.y, z: newZ });
                                if (onSelectItem) onSelectItem(updated);
                              }
                            }}
                            className="w-4 h-4 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center font-bold text-slate-700 text-xs cursor-pointer"
                          >-</button>
                          <button
                            type="button"
                            onClick={() => {
                              if (onManualMoveItem) {
                                const step = gridSnapMm || 50;
                                const newZ = Math.min(container.height - target.height, target.z + step);
                                const updated = { ...target, z: newZ };
                                activeSelectedItemRef.current = updated;
                                onManualMoveItem(target.id, { x: target.x, y: target.y, z: newZ });
                                if (onSelectItem) onSelectItem(updated);
                              }
                            }}
                            className="w-4 h-4 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center font-bold text-slate-700 text-xs cursor-pointer"
                          >+</button>
                        </div>
                      </div>
                    </div>

                    {/* Quick Gravity Drop button */}
                    <button
                      type="button"
                      id="inspector-drop-btn"
                      onClick={() => handleDropItemToSupport(target)}
                      className="w-full py-1.5 px-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                      title={isJa ? '真下の床または荷物天面まで着地 (Space / D)' : 'Drop to floor or underlying cargo (Space / D)'}
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" />
                      <span>{isJa ? '直下へ着地 (Space)' : 'Drop to Floor/Support (Space)'}</span>
                    </button>

                    {/* Keyboard Shortcuts Cheatsheet */}
                    <div className="bg-amber-100/70 border border-amber-200/80 rounded px-2 py-1 text-[10px] text-amber-900 flex flex-col gap-0.5">
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-semibold text-slate-700">{isJa ? '↑ ↓ ← →' : 'Arrows'}:</span>
                        <span>{isJa ? '水平微動 (前後左右)' : 'Planar Nudge'}</span>
                      </div>
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-semibold text-slate-700">{isJa ? 'Shift+↑/↓' : 'Shift+Up/Dn'}:</span>
                        <span>{isJa ? '垂直昇降 (Z軸)' : 'Elevation Z'}</span>
                      </div>
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-semibold text-slate-700">{isJa ? 'Space / D' : 'Space / D'}:</span>
                        <span>{isJa ? '直下へ着地' : 'Gravity Drop'}</span>
                      </div>
                    </div>

                    {/* Action buttons: Move (reposition), Rotate & Remove */}
                    <div className="flex items-center gap-1 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsDraggingExistingItem(target);
                          setInternalSelectedItem(null);
                          if (onSelectItem) onSelectItem(null);
                          showToast(isJa
                            ? `「${target.name}」の再配置モードを開始しました。移動先を3D画面内でクリックしてください (Escでキャンセル)`
                            : `Moving "${target.name}". Click target position in 3D scene (Esc to cancel)`);
                        }}
                        className="flex-1 py-1 px-1 rounded bg-white hover:bg-amber-100 border border-amber-300 text-slate-800 text-[10px] font-bold flex items-center justify-center gap-0.5 transition-colors"
                        title={isJa ? '3D画面内でクリックして位置変更' : 'Click in 3D to reposition'}
                      >
                        <Move className="w-3 h-3 text-amber-700" />
                        <span>{isJa ? '再配置' : 'Move'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (onManualMoveItem) {
                            onManualMoveItem(target.id, {
                              x: target.x,
                              y: target.y,
                              z: target.z,
                              length: target.width,
                              width: target.length,
                              height: target.height,
                              rotationIndex: (target.rotationIndex + 1) % 6
                            });
                            showToast(isJa ? `90°回転しました` : `Rotated 90°`);
                          }
                        }}
                        className="flex-1 py-1 px-1 rounded bg-white hover:bg-amber-100 border border-amber-300 text-slate-800 text-[10px] font-bold flex items-center justify-center gap-0.5 transition-colors"
                      >
                        <RotateCw className="w-3 h-3 text-amber-700" />
                        <span>{isJa ? '回転' : 'Rotate'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (onManualRemoveItem) {
                            onManualRemoveItem(target.id);
                            setInternalSelectedItem(null);
                            if (onSelectItem) onSelectItem(null);
                            showToast(isJa ? `未積載に戻しました` : `Returned to unplaced`);
                          }
                        }}
                        className="flex-1 py-1 px-1 rounded bg-white hover:bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold flex items-center justify-center gap-0.5 transition-colors"
                      >
                        <Trash2 className="w-3 h-3 text-red-600" />
                        <span>{isJa ? '未積載へ' : 'Remove'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {activeSelectedItem.fragile && (
            <div className="mt-2.5 flex items-center gap-1 bg-slate-100 border border-slate-300 text-slate-800 px-2 py-1 rounded text-[10px] font-semibold">
              <ShieldAlert className="w-3 h-3 text-slate-900 shrink-0" />
              <span>{isJa ? '天地無用 / 割れ物 (上に積載不可)' : 'Fragile / Do Not Stack On Top'}</span>
            </div>
          )}
        </div>
      )}

      {/* Layer Slicing, Camera Views & Sequence Player Controls (Draggable Floating Panel) */}
      {showSliceControls && (
        <div 
          ref={panelRef}
          style={
            panelPos
              ? { top: `${panelPos.y}px`, left: `${panelPos.x}px`, right: 'auto' }
              : undefined
          }
          className={`absolute pointer-events-auto bg-white/95 backdrop-blur-md p-2.5 rounded-xl border border-slate-200/90 shadow-lg text-xs space-y-2.5 z-20 w-64 text-slate-700 animate-fade-in transition-shadow ${
            !panelPos ? 'top-14 right-3' : ''
          } ${isDragging ? 'shadow-2xl ring-2 ring-slate-900/30 select-none opacity-95' : ''}`}
        >
          {/* Header with Title, Drag Handle & Close Button */}
          <div 
            onMouseDown={handlePanelDragStart}
            onTouchStart={handlePanelDragStart}
            className="flex items-center justify-between pb-1.5 border-b border-slate-100 cursor-grab active:cursor-grabbing select-none group"
            title={isJa ? 'ドラッグして画面内の好きな位置へ移動できます' : 'Drag to reposition anywhere'}
          >
            <div className="flex items-center gap-1">
              <GripVertical className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />
              <span className="text-[11px] font-bold text-slate-900 flex items-center gap-1">
                <SlidersHorizontal className="w-3 h-3 text-slate-700" />
                {isJa ? '操作・視点' : 'Controls & Views'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {panelPos && (
                <button
                  id="reset-panel-pos-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPanelPos(null);
                  }}
                  title={isJa ? '小窓の位置を初期位置に戻す' : 'Reset position'}
                  className="text-[9px] text-slate-500 hover:text-slate-800 font-semibold px-1 py-0.5 rounded hover:bg-slate-100 transition-colors"
                >
                  {isJa ? '位置初期化' : 'Reset Pos'}
                </button>
              )}
              {(zSlicePercent < 100 || xSlicePercent < 100) && (
                <button
                  id="reset-slice-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setZSlicePercent(100);
                    setXSlicePercent(100);
                  }}
                  title={isJa ? '断面を全表示に戻す (100%)' : 'Reset Slices (100%)'}
                  className="text-[9px] text-slate-700 hover:text-black font-semibold px-1 hover:underline"
                >
                  {isJa ? '全表示' : 'Reset'}
                </button>
              )}
              <button
                id="close-slice-panel-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSliceControls(false);
                }}
                title={isJa ? '閉じる' : 'Close'}
                className="text-slate-400 hover:text-slate-700 p-0.5 rounded hover:bg-slate-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 1. Camera View Presets (3D, TOP, SIDE, DOOR) */}
          <div>
            <div className="grid grid-cols-4 p-0.5 bg-slate-100 rounded-lg text-[11px]">
              <button
                id="camera-view-iso-btn"
                onClick={() => setCameraView('iso')}
                title={isJa ? '斜視図 (3D Isometric)' : '3D Isometric'}
                className={`py-1 rounded-md transition-all font-semibold text-center ${
                  activeCameraView === 'iso'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                3D
              </button>
              <button
                id="camera-view-top-btn"
                onClick={() => setCameraView('top')}
                title={isJa ? '上面図 (Top Plan)' : 'Top Plan'}
                className={`py-1 rounded-md transition-all font-semibold text-center ${
                  activeCameraView === 'top'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isJa ? '天面' : 'TOP'}
              </button>
              <button
                id="camera-view-side-btn"
                onClick={() => setCameraView('side')}
                title={isJa ? '側面図 (Side View)' : 'Side View'}
                className={`py-1 rounded-md transition-all font-semibold text-center ${
                  activeCameraView === 'side'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isJa ? '側面' : 'SIDE'}
              </button>
              <button
                id="camera-view-door-btn"
                onClick={() => setCameraView('door')}
                title={isJa ? '扉側 (Door Entrance)' : 'Door'}
                className={`py-1 rounded-md transition-all font-semibold text-center ${
                  activeCameraView === 'door'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isJa ? '扉側' : 'DOOR'}
              </button>
            </div>
          </div>

          {/* 2. Play Load / Loading Simulation Player */}
          <div className="pt-2 border-t border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-semibold text-slate-700 flex items-center gap-1">
                <Play className="w-2.5 h-2.5 text-slate-800 fill-slate-800" />
                {isJa ? '積載順' : 'Sequence'}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-slate-600 font-semibold">
                  {currentStep}/{activeItemsToDisplay.length}
                </span>
                <div className="flex items-center bg-slate-100 rounded px-1 py-0.5 text-[9px] font-semibold text-slate-600">
                  {[1, 2, 4].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => setPlaybackSpeed(speed)}
                      className={`px-1 rounded transition-colors ${
                        playbackSpeed === speed 
                          ? 'bg-white text-slate-900 font-bold shadow-2xs' 
                          : 'hover:text-slate-900'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Play, Step Buttons & Slider */}
            <div className="flex items-center gap-1">
              <button
                id="seq-reset-btn"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStep(0);
                }}
                disabled={currentStep === 0}
                title={isJa ? '最初に戻る' : 'Reset to Start'}
                className="p-1 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              <button
                id="seq-prev-btn"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStep(prev => Math.max(0, prev - 1));
                }}
                disabled={currentStep === 0}
                title={isJa ? '前の荷物' : 'Previous Step'}
                className="p-1 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors shrink-0"
              >
                <SkipBack className="w-3 h-3" />
              </button>
              <button
                id="seq-play-pause-btn"
                onClick={() => {
                  if (currentStep >= activeItemsToDisplay.length) {
                    setCurrentStep(0);
                  }
                  setIsPlaying(!isPlaying);
                }}
                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center gap-1 shadow-2xs transition-all active:scale-95 text-[10px] shrink-0"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-2.5 h-2.5 text-white" />
                    <span>{isJa ? '停止' : 'Pause'}</span>
                  </>
                ) : (
                  <>
                    <Play className="w-2.5 h-2.5 fill-current text-white" />
                    <span>{isJa ? '再生' : 'Play'}</span>
                  </>
                )}
              </button>
              <button
                id="seq-next-btn"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStep(prev => Math.min(activeItemsToDisplay.length, prev + 1));
                }}
                disabled={currentStep >= activeItemsToDisplay.length}
                title={isJa ? '次の荷物' : 'Next Step'}
                className="p-1 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors shrink-0"
              >
                <SkipForward className="w-3 h-3" />
              </button>
              <input
                id="loading-step-slider"
                type="range"
                min="0"
                max={activeItemsToDisplay.length}
                value={currentStep}
                onChange={(e) => {
                  setIsPlaying(false);
                  setCurrentStep(Number(e.target.value));
                }}
                className="w-full h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-slate-900"
              />
            </div>
          </div>

          {/* 3. Slicing Sliders */}
          <div className="pt-2 border-t border-slate-100 space-y-1.5">
            <div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                <span className="flex items-center gap-1 font-medium">
                  <Layers className="w-2.5 h-2.5 text-slate-600" />
                  {isJa ? '高さ (Z)' : 'Height (Z)'}
                </span>
                <span className="font-mono text-slate-700 font-semibold text-[10px]">{zSlicePercent}%</span>
              </div>
              <input
                id="z-slice-slider"
                type="range"
                min="10"
                max="100"
                value={zSlicePercent}
                onChange={(e) => setZSlicePercent(Number(e.target.value))}
                className="w-full h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-slate-900"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                <span className="flex items-center gap-1 font-medium">
                  <SlidersHorizontal className="w-2.5 h-2.5 text-slate-600" />
                  {isJa ? '奥行 (X)' : 'Depth (X)'}
                </span>
                <span className="font-mono text-slate-700 font-semibold text-[10px]">{xSlicePercent}%</span>
              </div>
              <input
                id="x-slice-slider"
                type="range"
                min="10"
                max="100"
                value={xSlicePercent}
                onChange={(e) => setXSlicePercent(Number(e.target.value))}
                className="w-full h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-slate-900"
              />
            </div>
          </div>

          {/* 4. Visual & Display Style Controls (Vivid & Translucent) */}
          <div className="pt-2 border-t border-slate-100 space-y-1.5">
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              {/* Vivid Toggle Button */}
              <button
                type="button"
                id="panel-vivid-boost-toggle"
                onClick={() => setIsVividBoost(!isVividBoost)}
                className={`py-1 px-1.5 rounded-md font-semibold flex items-center justify-between transition-colors border ${
                  isVividBoost
                    ? 'bg-pink-600 text-white border-pink-600'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>{isJa ? '鮮やか' : 'Vivid'}</span>
                </span>
                <span className="font-mono text-[9px] font-bold">
                  {isVividBoost ? 'ON' : 'OFF'}
                </span>
              </button>

              {/* Translucent Toggle Button */}
              <button
                type="button"
                id="panel-translucent-toggle"
                onClick={() => {
                  if (!isTranslucent && cargoOpacity >= 100) {
                    setCargoOpacity(65);
                  }
                  setIsTranslucent(!isTranslucent);
                }}
                className={`py-1 px-1.5 rounded-md font-semibold flex items-center justify-between transition-colors border ${
                  isTranslucent
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-1">
                  <Blend className="w-3 h-3" />
                  <span>{isJa ? '半透明' : 'Translucent'}</span>
                </span>
                <span className="font-mono text-[9px] font-bold">
                  {isTranslucent ? `${cargoOpacity}%` : 'OFF'}
                </span>
              </button>
            </div>

            {/* If Translucent is ON, show compact opacity slider */}
            {isTranslucent && (
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[9px] text-slate-500 shrink-0 font-medium">{isJa ? '透明度' : 'Opacity'}</span>
                <input
                  id="cargo-opacity-slider"
                  type="range"
                  min="20"
                  max="95"
                  step="5"
                  value={cargoOpacity}
                  onChange={(e) => setCargoOpacity(Number(e.target.value))}
                  className="w-full h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-indigo-600"
                />
                <span className="font-mono text-[9px] font-semibold text-indigo-700 shrink-0 w-6 text-right">{cargoOpacity}%</span>
              </div>
            )}

            {/* Color Scheme selector */}
            <div className="grid grid-cols-4 p-0.5 bg-slate-100 rounded-md text-[9px]">
              <button
                id="color-mode-cargo-btn"
                onClick={() => setColorMode('cargo')}
                className={`py-0.5 rounded text-center transition-colors font-medium ${
                  colorMode === 'cargo' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isJa ? '種別' : 'Cargo'}
              </button>
              <button
                id="color-mode-vivid-btn"
                onClick={() => setColorMode('vivid')}
                title={isJa ? '鮮やかカラー' : 'Vivid Colors'}
                className={`py-0.5 rounded text-center transition-colors font-semibold ${
                  colorMode === 'vivid' ? 'bg-pink-600 text-white font-bold shadow-2xs' : 'text-pink-700 hover:text-pink-900'
                }`}
              >
                {isJa ? '鮮やか' : 'Vivid'}
              </button>
              <button
                id="color-mode-weight-btn"
                onClick={() => setColorMode('weight')}
                className={`py-0.5 rounded text-center transition-colors font-medium ${
                  colorMode === 'weight' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isJa ? '重量' : 'Weight'}
              </button>
              <button
                id="color-mode-seq-btn"
                onClick={() => setColorMode('sequence')}
                className={`py-0.5 rounded text-center transition-colors font-medium ${
                  colorMode === 'sequence' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isJa ? '順序' : 'Seq'}
              </button>
            </div>

            {onApplyVividColors && (
              <button
                type="button"
                id="panel-apply-vivid-colors-btn"
                onClick={() => onApplyVividColors('vivid_neon')}
                className="w-full py-1 rounded bg-slate-50 hover:bg-pink-50 border border-slate-200 hover:border-pink-200 text-pink-700 text-[9px] font-semibold flex items-center justify-center gap-1 transition-colors"
                title={isJa ? '貨物マニフェスト自体に鮮やかネオンカラーを一括保存' : 'Apply vivid colors directly to manifest items'}
              >
                <Palette className="w-2.5 h-2.5" />
                <span>{isJa ? '全貨物の色を鮮やかに変更' : 'Apply Vivid Colors to Cargo'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom Dock: Unplaced Cargo Tray (visible when in manual mode or toggled) */}
      {isManualMode && (
        <div 
          id="unplaced-cargo-tray-dock"
          className="absolute bottom-3 left-3 right-3 pointer-events-auto bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-xl z-20 overflow-hidden flex flex-col text-slate-800 transition-all duration-200"
        >
          {/* Tray Header */}
          <div className="px-3.5 py-2 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <PackagePlus className="w-4 h-4 text-amber-600" />
              <span className="font-bold text-slate-900">
                {isJa ? '手動配置・未積載荷物トレイ' : 'Manual Placement Cargo Tray'}
              </span>
              <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full text-[11px] font-bold border border-amber-300">
                {unplacedItems.reduce((acc, it) => acc + (it.count || 1), 0)} {isJa ? '個 未積載' : 'unplaced'}
              </span>
              <span className="text-slate-400 text-[11px] hidden sm:inline">
                {isJa ? '※荷物をクリックまたはドラッグして3Dコンテナ内の任意の位置に配置できます' : 'Click or drag item into the 3D container to place'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {heldUnplacedItem && (
                <button
                  type="button"
                  onClick={() => {
                    setHeldUnplacedItem(null);
                    setGhostCoords(null);
                  }}
                  className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-bold transition-colors"
                >
                  {isJa ? '配置キャンセル' : 'Cancel Placement'}
                </button>
              )}
              {onManualUnloadContainer && (
                <button
                  type="button"
                  id="tray-unload-container-btn"
                  onClick={handleUnloadContainerAll}
                  title={isJa 
                    ? 'コンテナ内の貨物をすべてアンロードして手動で載せる (Ctrl+Zで復元可能)' 
                    : 'Unload all container cargo to tray for manual loading (Ctrl+Z to undo)'}
                  className={`px-2 py-1 rounded text-[11px] font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                    confirmingUnload
                      ? 'bg-red-600 text-white border-red-700 animate-pulse'
                      : 'bg-white hover:bg-red-50 text-red-700 border-red-200'
                  }`}
                >
                  <PackageMinus className="w-3.5 h-3.5 text-current" />
                  <span>
                    {confirmingUnload
                      ? (isJa ? '本当に空にする？(確定)' : 'Confirm Unload?')
                      : (isJa ? '一括アンロード' : 'Unload All')}
                  </span>
                </button>
              )}
              <button
                type="button"
                id="toggle-tray-collapse-btn"
                onClick={() => setIsTrayCollapsed(!isTrayCollapsed)}
                className="p-1 text-slate-500 hover:text-slate-800 transition-colors"
                title={isTrayCollapsed ? (isJa ? 'トレイを展開' : 'Expand Tray') : (isJa ? 'トレイを折りたたむ' : 'Collapse Tray')}
              >
                {isTrayCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Tray Body: Horizontally scrollable items */}
          {!isTrayCollapsed && (
            <div className="p-2.5 overflow-x-auto flex items-center gap-2.5 max-h-36 scrollbar-thin">
              {unplacedItems.length === 0 ? (
                <div className="py-3 px-4 text-slate-600 text-xs flex flex-wrap items-center justify-between gap-3 w-full bg-slate-50/80 rounded-lg border border-dashed border-slate-300">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>
                      {isJa 
                        ? 'すべての貨物がコンテナ内に配置済みです。手動でゼロから載せ直す場合は一括アンロードを実行できます。' 
                        : 'All items are currently loaded. To manually pack from scratch, unload all items to tray.'}
                    </span>
                  </div>
                  {onManualUnloadContainer && (
                    <button
                      type="button"
                      id="tray-empty-state-unload-btn"
                      onClick={handleUnloadContainerAll}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer ${
                        confirmingUnload
                          ? 'bg-red-600 text-white animate-pulse'
                          : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-300'
                      }`}
                    >
                      <PackageMinus className="w-3.5 h-3.5 text-current" />
                      <span>
                        {confirmingUnload
                          ? (isJa ? '本当に空にしますか？ (クリックで確定)' : 'Confirm Unload All Cargo?')
                          : (isJa ? 'コンテナを空にして手動で載せる (一括アンロード)' : 'Unload Container & Pack Manually')}
                      </span>
                    </button>
                  )}
                </div>
              ) : (
                unplacedItems.map((item, idx) => {
                  const isHeld = heldUnplacedItem?.unplaced.sku === item.sku;
                  const itemColor = (item as any).color || '#3b82f6';
                  return (
                    <div
                      key={`${item.sku}-${idx}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', item.sku);
                        draggedUnplacedRef.current = {
                          unplaced: item,
                          rotation: 0,
                          color: itemColor
                        };
                      }}
                      onDragEnd={() => {
                        draggedUnplacedRef.current = null;
                        setGhostCoords(null);
                      }}
                      onClick={() => {
                        if (isHeld) {
                          setHeldUnplacedItem(null);
                          setGhostCoords(null);
                        } else {
                          setHeldUnplacedItem({
                            unplaced: item,
                            rotation: 0,
                            color: itemColor
                          });
                          showToast(isJa 
                            ? `「${item.name}」を選択しました。3Dコンテナ内の配置したい位置をクリックしてください` 
                            : `Selected "${item.name}". Click in 3D view to place.`);
                        }
                      }}
                      className={`shrink-0 flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-all duration-150 select-none ${
                        isHeld
                          ? 'bg-amber-100/90 border-amber-500 shadow-md ring-2 ring-amber-400 scale-[1.02]'
                          : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 shadow-xs'
                      }`}
                      style={{ minWidth: '190px' }}
                    >
                      <div 
                        className="w-5 h-5 rounded-md shrink-0 border border-black/10 flex items-center justify-center text-white shadow-2xs"
                        style={{ backgroundColor: itemColor }}
                      >
                        <Box className="w-3 h-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-slate-900 truncate text-[11px]">{item.name}</span>
                          <span className="bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded font-mono font-bold text-[10px]">
                            x{item.count}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                          <span>{item.dimensions.length}×{item.dimensions.width}×{item.dimensions.height}mm</span>
                          <span>•</span>
                          <span>{item.weight}kg</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-slate-400 hover:text-slate-700">
                        <Move className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 text-white text-xs px-4 py-2 rounded-xl shadow-2xl backdrop-blur-md border border-slate-700 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Software Calculation in Progress 3D Viewport Overlay */}
      {isCalculating && (
        <div 
          id="viewer-3d-calculating-overlay"
          className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px] z-30 flex flex-col items-center justify-center text-white pointer-events-none transition-all duration-200"
        >
          <div className="p-4 sm:p-5 bg-slate-900/95 rounded-2xl border border-slate-700/80 shadow-2xl flex flex-col items-center gap-3 max-w-xs text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="relative flex items-center justify-center">
              <div className="w-10 h-10 border-3 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
              <Box className="w-4 h-4 text-blue-400 absolute" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-100 flex items-center justify-center gap-1.5">
                <span>{isJa ? '3D積載 最適化演算実行中' : '3D Packing Optimization in Progress'}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                {isJa ? '空間配置・物理干渉・重心バランシング計算中...' : 'Evaluating 3D space, interference & balance...'}
              </p>
            </div>
            <div className="w-36 bg-slate-800 h-1 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-full w-2/3 rounded-full animate-pulse" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

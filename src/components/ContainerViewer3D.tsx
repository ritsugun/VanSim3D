import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Container, PackedItem, UnitSystem, Language, ContainerLoad } from '../types';
import { 
  Play, Pause, SkipBack, SkipForward, RotateCcw, 
  Layers, Camera, Maximize2, ShieldAlert, 
  Compass, Crosshair, SlidersHorizontal, Box, Grid3X3, X,
  GripVertical, Blend, Sparkles, Palette
} from 'lucide-react';
import { formatDimensions, formatCoordinates, formatWeightCompact } from '../utils/units';
import { VIVID_NEON_PALETTE, boostHexToVivid } from '../utils/colors';

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
}

export const ContainerViewer3D: React.FC<ContainerViewer3DProps> = ({
  container,
  containers,
  activeContainerIndex = 0,
  onChangeActiveContainerIndex,
  packedItems,
  centerOfGravity,
  unitSystem,
  language,
  onSelectItem,
  selectedItem: externalSelectedItem,
  onApplyVividColors
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const boxMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const cogGroupRef = useRef<THREE.Group | null>(null);
  const containersGroupRef = useRef<THREE.Group | null>(null);

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
      const targetIdx = typeof currentTab === 'number' ? currentTab : 0;
      const target = containers[targetIdx] || containers[0];
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

  const activeSelectedItem = externalSelectedItem || internalSelectedItem;

  // Max weight for weight color mapping
  const maxItemWeight = useMemo(() => {
    return Math.max(1, ...activeItemsToDisplay.map(p => p.weight));
  }, [activeItemsToDisplay]);

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
      const itemContIdx = typeof item.containerIndex === 'number' ? item.containerIndex : 0;
      const containerOffsetZ = isSideBySide ? itemContIdx * spacingM : 0;

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
        color: isSelected ? 0x000000 : 0x0f172a,
        linewidth: isSelected ? 3 : 1,
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
      const currentCoG = (typeof currentTab === 'number' && containers && containers[currentTab])
        ? containers[currentTab].metrics.centerOfGravity
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

  // Raycasting for Mouse Hover & Click
  useEffect(() => {
    const containerEl = containerRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!containerEl || !camera || !scene) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleMouseMove = (event: MouseEvent) => {
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
        containerEl.style.cursor = 'pointer';
      } else {
        setHoveredItem(null);
        containerEl.style.cursor = 'default';
      }
    };

    const handleClick = (event: MouseEvent) => {
      const rect = containerEl.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const meshes: THREE.Object3D[] = Array.from(boxMeshesRef.current.values());
      const intersects = raycaster.intersectObjects(meshes, false);

      if (intersects.length > 0) {
        const targetMesh = intersects[0].object as THREE.Mesh;
        const item = targetMesh.userData.packedItem as PackedItem;
        setInternalSelectedItem(item);
        if (onSelectItem) onSelectItem(item);
      } else {
        setInternalSelectedItem(null);
        if (onSelectItem) onSelectItem(null);
      }
    };

    containerEl.addEventListener('mousemove', handleMouseMove);
    containerEl.addEventListener('click', handleClick);

    return () => {
      containerEl.removeEventListener('mousemove', handleMouseMove);
      containerEl.removeEventListener('click', handleClick);
    };
  }, [onSelectItem]);

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

  const isJa = language === 'ja';
  const hasMultipleContainers = containers && containers.length > 1;

  return (
    <div 
      ref={viewerWrapperRef}
      id="container-viewer-3d-root" 
      className={`relative flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs text-slate-800 ${
        isFullScreen ? 'fixed inset-0 z-50 rounded-none' : 'w-full h-full min-h-[580px]'
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

          {hasMultipleContainers && (
            <div className="flex items-center gap-1 ml-2 border-l border-slate-200 pl-2">
              {containers.map((cLoad, idx) => {
                const isActive = currentTab === idx;
                return (
                  <button
                    key={cLoad.containerIndex}
                    type="button"
                    onClick={() => setTab(idx)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    #{idx + 1} ({(cLoad.metrics.volumeUtilization || 0).toFixed(0)}%)
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
            onClick={() => setIsFullScreen(!isFullScreen)}
            title={isJa ? '全画面表示' : 'Full Screen'}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Floating Hover/Selected Box Inspector Card */}
      {(hoveredItem || activeSelectedItem) && (
        <div className="absolute top-16 left-3 pointer-events-auto bg-white/95 backdrop-blur-md p-3.5 rounded-xl border border-slate-200 shadow-xl text-xs max-w-xs z-20 animate-fade-in text-slate-800">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2">
            <div className="flex items-center gap-1.5">
              <span 
                className="w-3 h-3 rounded-full shrink-0 border border-black/10" 
                style={{ backgroundColor: (activeSelectedItem || hoveredItem)?.color }} 
              />
              <span className="font-bold text-slate-900 truncate">
                {(activeSelectedItem || hoveredItem)?.name}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {(activeSelectedItem || hoveredItem)?.containerIndex && (
                <span className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-mono font-bold text-[10px] border border-slate-300">
                  C#{(activeSelectedItem || hoveredItem)?.containerIndex}
                </span>
              )}
              <span className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-mono font-bold text-[10px] border border-slate-300">
                #{(activeSelectedItem || hoveredItem)?.sequenceNumber}
              </span>
            </div>
          </div>

          {(() => {
            const target = activeSelectedItem || hoveredItem;
            if (!target) return null;
            const coords = formatCoordinates(target.x, target.y, target.z, unitSystem);
            return (
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
                  <span className="font-mono text-slate-800 font-medium">
                    {coords.x}, {coords.y}, {coords.z}
                  </span>
                </div>
              </div>
            );
          })()}

          {(activeSelectedItem || hoveredItem)?.fragile && (
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
          className={`absolute pointer-events-auto bg-white/95 backdrop-blur-md p-3.5 rounded-xl border border-slate-200 shadow-xl text-xs space-y-3.5 z-20 w-72 text-slate-700 animate-fade-in transition-shadow ${
            !panelPos ? 'top-16 right-3' : ''
          } ${isDragging ? 'shadow-2xl ring-2 ring-slate-900/30 select-none opacity-95' : ''}`}
        >
          {/* Header with Title, Drag Handle & Close Button */}
          <div 
            onMouseDown={handlePanelDragStart}
            onTouchStart={handlePanelDragStart}
            className="flex items-center justify-between border-b border-slate-100 pb-2 cursor-grab active:cursor-grabbing select-none group"
            title={isJa ? 'ドラッグして画面内の好きな位置へ移動できます' : 'Drag to reposition anywhere'}
          >
            <div className="flex items-center gap-1">
              <GripVertical className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors shrink-0" />
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-900" />
                {isJa ? '操作・視点コントロール' : 'Controls & Views'}
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
                  title={isJa ? '小窓の位置を初期位置（右上）に戻す' : 'Reset panel position to top-right'}
                  className="text-[10px] text-slate-500 hover:text-slate-800 font-semibold px-1 py-0.5 rounded hover:bg-slate-100 transition-colors"
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
                  className="text-[10px] text-slate-800 hover:text-black font-semibold px-1 hover:underline"
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
                title={isJa ? 'コントロールUIを非表示にする' : 'Hide Controls'}
                className="text-slate-400 hover:text-slate-700 p-0.5 rounded hover:bg-slate-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 1. Camera View Presets (3D, TOP, SIDE, DOOR) */}
          <div className="space-y-1.5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold flex items-center gap-1">
              <Compass className="w-3 h-3 text-slate-500" />
              {isJa ? 'カメラ視点切替' : 'Camera Views'}
            </span>
            <div className="grid grid-cols-4 gap-1 text-xs">
              <button
                id="camera-view-iso-btn"
                onClick={() => setCameraView('iso')}
                title={isJa ? '斜視図 (3D Isometric)' : '3D Isometric'}
                className={`py-1.5 px-1 rounded-md transition-all flex items-center justify-center gap-1 font-bold text-center ${
                  activeCameraView === 'iso'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <span>3D</span>
              </button>
              <button
                id="camera-view-top-btn"
                onClick={() => setCameraView('top')}
                title={isJa ? '上面図 (Top Plan)' : 'Top Plan'}
                className={`py-1.5 px-1 rounded-md transition-all font-bold text-center ${
                  activeCameraView === 'top'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <span>{isJa ? '天面' : 'TOP'}</span>
              </button>
              <button
                id="camera-view-side-btn"
                onClick={() => setCameraView('side')}
                title={isJa ? '側面図 (Side View)' : 'Side View'}
                className={`py-1.5 px-1 rounded-md transition-all font-bold text-center ${
                  activeCameraView === 'side'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <span>{isJa ? '側面' : 'SIDE'}</span>
              </button>
              <button
                id="camera-view-door-btn"
                onClick={() => setCameraView('door')}
                title={isJa ? '扉側 (Door Entrance)' : 'Door'}
                className={`py-1.5 px-1 rounded-md transition-all font-bold text-center ${
                  activeCameraView === 'door'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <span>{isJa ? '扉側' : 'DOOR'}</span>
              </button>
            </div>
          </div>

          {/* 2. Visual & Display Style Controls (Vivid & Translucent) */}
          <div className="bg-slate-50/90 border border-slate-200 p-2.5 rounded-lg space-y-2.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-pink-500" />
              {isJa ? '表示・カラー設定' : 'Display & Visuals'}
            </span>

            {/* Quick Toggle Buttons Grid for Vivid and Translucent */}
            <div className="grid grid-cols-2 gap-1.5">
              {/* Vivid Toggle Button */}
              <button
                type="button"
                id="panel-vivid-boost-toggle"
                onClick={() => setIsVividBoost(!isVividBoost)}
                className={`py-1.5 px-2 rounded-md font-bold text-xs flex items-center justify-between gap-1.5 transition-all border ${
                  isVividBoost
                    ? 'bg-pink-600 text-white border-pink-700 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-1">
                  <Sparkles className={`w-3.5 h-3.5 ${isVividBoost ? 'text-yellow-300' : 'text-pink-500'}`} />
                  <span>{isJa ? '鮮やか' : 'Vivid'}</span>
                </span>
                <span className={`text-[10px] px-1 py-0.2 rounded font-mono font-bold ${isVividBoost ? 'bg-pink-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
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
                className={`py-1.5 px-2 rounded-md font-bold text-xs flex items-center justify-between gap-1.5 transition-all border ${
                  isTranslucent
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-1">
                  <Blend className="w-3.5 h-3.5" />
                  <span>{isJa ? '半透明' : 'Translucent'}</span>
                </span>
                <span className={`text-[10px] px-1 py-0.2 rounded font-mono font-bold ${isTranslucent ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {isTranslucent ? `${cargoOpacity}%` : 'OFF'}
                </span>
              </button>
            </div>

            {/* If Translucent is ON, show opacity slider & presets */}
            {isTranslucent && (
              <div className="space-y-1.5 pt-1.5 border-t border-slate-200/80">
                <div className="flex items-center justify-between text-[11px] text-slate-600">
                  <span className="font-medium flex items-center gap-1">
                    <Blend className="w-3 h-3 text-indigo-600" />
                    {isJa ? '不透明度' : 'Opacity'}:
                  </span>
                  <span className="font-mono font-bold text-indigo-700">{cargoOpacity}%</span>
                </div>
                <input
                  id="cargo-opacity-slider"
                  type="range"
                  min="20"
                  max="95"
                  step="5"
                  value={cargoOpacity}
                  onChange={(e) => setCargoOpacity(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="grid grid-cols-4 gap-1 pt-0.5">
                  {[30, 50, 65, 85].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setCargoOpacity(val)}
                      className={`py-0.5 rounded text-[10px] font-medium border text-center transition-colors ${
                        cargoOpacity === val
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {val}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Color Scheme selector */}
            <div className="pt-1.5 border-t border-slate-200/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-medium">
                  {isJa ? '配色モード:' : 'Color Scheme:'}
                </span>
                <span className="text-[10px] text-slate-600 font-medium">
                  {colorMode === 'vivid' ? (isJa ? '✨ 鮮やかネオン' : '✨ Vivid Neon') : ''}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1 text-[10px]">
                <button
                  id="color-mode-cargo-btn"
                  onClick={() => setColorMode('cargo')}
                  className={`py-1 rounded-md text-center transition-colors font-semibold ${
                    colorMode === 'cargo' ? 'bg-slate-900 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {isJa ? '種別' : 'Cargo'}
                </button>
                <button
                  id="color-mode-vivid-btn"
                  onClick={() => setColorMode('vivid')}
                  title={isJa ? '超鮮やかなネオンカラーで表示' : 'Show with vivid neon colors'}
                  className={`py-1 rounded-md text-center transition-colors font-bold ${
                    colorMode === 'vivid' ? 'bg-pink-600 text-white shadow-xs' : 'bg-pink-50 text-pink-700 hover:bg-pink-100 border border-pink-200'
                  }`}
                >
                  {isJa ? '✨鮮やか' : '✨Vivid'}
                </button>
                <button
                  id="color-mode-weight-btn"
                  onClick={() => setColorMode('weight')}
                  className={`py-1 rounded-md text-center transition-colors font-semibold ${
                    colorMode === 'weight' ? 'bg-slate-900 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {isJa ? '重量' : 'Weight'}
                </button>
                <button
                  id="color-mode-seq-btn"
                  onClick={() => setColorMode('sequence')}
                  className={`py-1 rounded-md text-center transition-colors font-semibold ${
                    colorMode === 'sequence' ? 'bg-slate-900 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
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
                  className="w-full mt-1 py-1.5 px-2 rounded-lg bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 hover:from-pink-600 hover:via-purple-600 hover:to-cyan-600 text-white font-bold text-[10px] flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95"
                  title={isJa ? '貨物マニフェスト自体に鮮やかネオンカラーを一括保存' : 'Apply vivid colors directly to manifest items'}
                >
                  <Palette className="w-3 h-3" />
                  <span>{isJa ? '全貨物の色を鮮やかに変更' : 'Apply Vivid Colors to Cargo'}</span>
                </button>
              )}
            </div>
          </div>

          {/* 3. Play Load / Loading Simulation Player */}
          <div className="bg-white border border-slate-300 p-2.5 rounded-lg space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold flex items-center gap-1.5 text-slate-900">
                <Play className="w-3.5 h-3.5 text-slate-900 fill-slate-900" />
                {isJa ? '積載シミュレーション' : 'Loading Sequence'}
              </span>
              <span className="font-mono text-[11px] text-slate-900 font-bold bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                {currentStep} / {activeItemsToDisplay.length}
              </span>
            </div>

            {/* Play, Step, Speed Buttons */}
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1">
                <button
                  id="seq-reset-btn"
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentStep(0);
                  }}
                  title={isJa ? '最初に戻る' : 'Reset to Start'}
                  className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  id="seq-prev-btn"
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentStep(prev => Math.max(0, prev - 1));
                  }}
                  disabled={currentStep === 0}
                  title={isJa ? '前の荷物' : 'Previous Step'}
                  className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-700 hover:text-slate-900 border border-slate-200 transition-colors"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>
                <button
                  id="seq-play-pause-btn"
                  onClick={() => {
                    if (currentStep >= activeItemsToDisplay.length) {
                      setCurrentStep(0);
                    }
                    setIsPlaying(!isPlaying);
                  }}
                  className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center gap-1 shadow-xs transition-all active:scale-95 text-xs"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5 text-white" />
                      <span>{isJa ? '停止' : 'Pause'}</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current text-white" />
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
                  className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-700 hover:text-slate-900 border border-slate-200 transition-colors"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Speed Buttons */}
              <div className="flex items-center bg-slate-100 border border-slate-200 rounded p-0.5 text-[10px] font-semibold text-slate-600">
                {[1, 2, 4].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setPlaybackSpeed(speed)}
                    className={`px-1.5 py-0.5 rounded transition-colors ${
                      playbackSpeed === speed 
                        ? 'bg-slate-900 text-white font-bold shadow-xs' 
                        : 'hover:text-slate-900'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>

            {/* Step Slider */}
            <div>
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
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
              />
            </div>
          </div>

          {/* 4. Slicing Sliders */}
          <div className="space-y-2.5">
            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                <span className="flex items-center gap-1 font-medium">
                  <Layers className="w-3 h-3 text-slate-700" />
                  {isJa ? '高さ断面 (Z)' : 'Height Slice (Z)'}
                </span>
                <span className="font-mono text-slate-800 font-bold">{zSlicePercent}%</span>
              </div>
              <input
                id="z-slice-slider"
                type="range"
                min="10"
                max="100"
                value={zSlicePercent}
                onChange={(e) => setZSlicePercent(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                <span className="flex items-center gap-1 font-medium">
                  <SlidersHorizontal className="w-3 h-3 text-slate-700" />
                  {isJa ? '奥行断面 (X)' : 'Depth Slice (X)'}
                </span>
                <span className="font-mono text-slate-800 font-bold">{xSlicePercent}%</span>
              </div>
              <input
                id="x-slice-slider"
                type="range"
                min="10"
                max="100"
                value={xSlicePercent}
                onChange={(e) => setXSlicePercent(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

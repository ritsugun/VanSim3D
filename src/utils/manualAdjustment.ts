import { 
  Container, PackedItem, UnplacedItem, PackingResult, 
  PackingMetrics, ContainerLoad, OverallPackingMetrics 
} from '../types';

/**
 * Recalculates metrics for a container based on its packed items
 */
export function recalculateContainerMetrics(
  container: Container,
  packedItems: PackedItem[],
  totalItemCount: number,
  unplacedCount: number,
  algorithm: any = 'extreme_points_bfd'
): PackingMetrics {
  const containerVolMm3 = container.length * container.width * container.height;
  const containerVolumeCbm = containerVolMm3 / 1_000_000_000;

  let packedVolMm3 = 0;
  let totalWeight = 0;
  let cogWeightedX = 0;
  let cogWeightedY = 0;
  let cogWeightedZ = 0;

  for (let i = 0; i < packedItems.length; i++) {
    const p = packedItems[i];
    const itemVol = p.length * p.width * p.height;
    packedVolMm3 += itemVol;
    totalWeight += p.weight;

    const itemCenterX = p.x + p.length / 2;
    const itemCenterY = p.y + p.width / 2;
    const itemCenterZ = p.z + p.height / 2;

    cogWeightedX += itemCenterX * p.weight;
    cogWeightedY += itemCenterY * p.weight;
    cogWeightedZ += itemCenterZ * p.weight;
  }

  const packedVolumeCbm = packedVolMm3 / 1_000_000_000;
  const freeVolumeCbm = Math.max(0, containerVolumeCbm - packedVolumeCbm);
  const volumeUtilization = containerVolMm3 > 0 ? (packedVolMm3 / containerVolMm3) * 100 : 0;
  const weightUtilization = container.maxWeight > 0 ? (totalWeight / container.maxWeight) * 100 : 0;

  const cogX = totalWeight > 0 ? cogWeightedX / totalWeight : container.length / 2;
  const cogY = totalWeight > 0 ? cogWeightedY / totalWeight : container.width / 2;
  const cogZ = totalWeight > 0 ? cogWeightedZ / totalWeight : container.height / 2;

  const offsetXPercent = container.length > 0 ? ((cogX - container.length / 2) / container.length) * 100 : 0;
  const offsetYPercent = container.width > 0 ? ((cogY - container.width / 2) / container.width) * 100 : 0;
  const offsetZPercent = container.height > 0 ? ((cogZ - container.height / 2) / container.height) * 100 : 0;

  const frontRatio = Math.max(0, Math.min(1, 1 - (cogX / (container.length * 0.85))));
  const rearRatio = 1 - frontRatio;
  const frontAxleKg = totalWeight * frontRatio;
  const rearAxleKg = totalWeight * rearRatio;

  return {
    containerVolumeCbm,
    packedVolumeCbm,
    freeVolumeCbm,
    volumeUtilization: Math.min(100, volumeUtilization),
    containerMaxWeightKg: container.maxWeight,
    packedWeightKg: totalWeight,
    weightUtilization: Math.min(100, weightUtilization),
    totalItemCount,
    packedCount: packedItems.length,
    unplacedCount,
    centerOfGravity: {
      x: cogX,
      y: cogY,
      z: cogZ,
      offsetXPercent,
      offsetYPercent,
      offsetZPercent
    },
    axleDistribution: {
      frontAxlePercent: frontRatio * 100,
      rearAxlePercent: rearRatio * 100,
      frontAxleKg,
      rearAxleKg
    },
    calculationTimeMs: 0,
    algorithm,
    containersNeeded: 1
  };
}

/**
 * Calculates stacking height (Z coordinate in mm) for an item placed at (x, y) with (length, width).
 * If resting on top of another packed item, snaps Z to the top of that item.
 */
export function calculateSupportHeight(
  x: number,
  y: number,
  length: number,
  width: number,
  existingItems: PackedItem[],
  ignoreItemId?: string
): number {
  let highestZ = 0;

  for (const item of existingItems) {
    if (ignoreItemId && item.id === ignoreItemId) continue;

    // Check if horizontal bounding box overlaps
    const overlapX = x < (item.x + item.length) && (x + length) > item.x;
    const overlapY = y < (item.y + item.width) && (y + width) > item.y;

    if (overlapX && overlapY) {
      const topZ = item.z + item.height;
      if (topZ > highestZ) {
        highestZ = topZ;
      }
    }
  }

  return highestZ;
}

/**
 * Checks if placed item is within container bounds
 */
export function checkContainerBounds(
  x: number,
  y: number,
  z: number,
  length: number,
  width: number,
  height: number,
  container: Container
): { isValid: boolean; exceedsLength: boolean; exceedsWidth: boolean; exceedsHeight: boolean } {
  const exceedsLength = (x + length) > container.length || x < 0;
  const exceedsWidth = (y + width) > container.width || y < 0;
  const exceedsHeight = (z + height) > container.height || z < 0;

  return {
    isValid: !exceedsLength && !exceedsWidth && !exceedsHeight,
    exceedsLength,
    exceedsWidth,
    exceedsHeight
  };
}

/**
 * Applies a manual placement of an unplaced item into the PackingResult
 */
export function applyManualItemPlacement(
  currentResult: PackingResult,
  targetContainer: Container,
  targetContainerIndex: number,
  unplacedItem: UnplacedItem,
  placement: { x: number; y: number; z: number; length: number; width: number; height: number; rotationIndex?: number; color?: string }
): PackingResult {
  // 1. Create new PackedItem
  const currentItems = currentResult.containers?.[targetContainerIndex]?.packedItems ?? currentResult.packedItems;
  const nextSeq = (currentResult.packedItems.length || 0) + 1;

  const newPackedItem: PackedItem = {
    id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    cargoItemId: unplacedItem.cargoItemId,
    sku: unplacedItem.sku,
    name: unplacedItem.name,
    x: Math.round(placement.x),
    y: Math.round(placement.y),
    z: Math.round(placement.z),
    length: placement.length,
    width: placement.width,
    height: placement.height,
    weight: unplacedItem.weight,
    color: placement.color || '#3b82f6',
    fragile: false,
    sequenceNumber: nextSeq,
    stepIndex: nextSeq,
    rotationIndex: placement.rotationIndex ?? 0,
    containerIndex: targetContainerIndex,
    layer: Math.floor(placement.z / Math.max(100, placement.height)) + 1,
    isManual: true
  };

  // 2. Decrement unplaced items
  const updatedUnplacedItems: UnplacedItem[] = [];
  let decremented = false;

  for (const u of currentResult.unplacedItems) {
    if (!decremented && (u.cargoItemId === unplacedItem.cargoItemId || u.sku === unplacedItem.sku)) {
      if (u.count > 1) {
        updatedUnplacedItems.push({
          ...u,
          count: u.count - 1
        });
      }
      decremented = true;
    } else {
      updatedUnplacedItems.push(u);
    }
  }

  const totalUnplacedCount = updatedUnplacedItems.reduce((s, u) => s + u.count, 0);

  // 3. Update container packed items
  const updatedAllPackedItems = [...currentResult.packedItems, newPackedItem];

  let updatedContainers: ContainerLoad[] = [];
  if (currentResult.containers && currentResult.containers.length > 0) {
    updatedContainers = currentResult.containers.map((cLoad, idx) => {
      if (cLoad.containerIndex === targetContainerIndex || idx + 1 === targetContainerIndex) {
        const newContPacked = [...cLoad.packedItems, newPackedItem];
        const newContMetrics = recalculateContainerMetrics(
          cLoad.container,
          newContPacked,
          newContPacked.length + totalUnplacedCount,
          totalUnplacedCount,
          cLoad.metrics.algorithm
        );
        return {
          ...cLoad,
          packedItems: newContPacked,
          metrics: newContMetrics
        };
      }
      return cLoad;
    });
  } else {
    // Single container default
    const newMetrics = recalculateContainerMetrics(
      targetContainer,
      updatedAllPackedItems,
      updatedAllPackedItems.length + totalUnplacedCount,
      totalUnplacedCount,
      currentResult.metrics.algorithm
    );
    updatedContainers = [{
      containerIndex: 1,
      container: targetContainer,
      packedItems: updatedAllPackedItems,
      metrics: newMetrics
    }];
  }

  const activeContainerMetrics = updatedContainers.find(c => c.containerIndex === targetContainerIndex)?.metrics
    || updatedContainers[targetContainerIndex - 1]?.metrics
    || recalculateContainerMetrics(
      targetContainer,
      updatedAllPackedItems,
      updatedAllPackedItems.length + totalUnplacedCount,
      totalUnplacedCount,
      currentResult.metrics.algorithm
    );

  // 4. Update overall metrics
  const totalPackedCount = updatedAllPackedItems.length;
  const totalItemCount = totalPackedCount + totalUnplacedCount;
  const totalPackedVol = updatedAllPackedItems.reduce((s, p) => s + (p.length * p.width * p.height) / 1_000_000_000, 0);
  const totalPackedWeight = updatedAllPackedItems.reduce((s, p) => s + p.weight, 0);

  let updatedOverallMetrics: OverallPackingMetrics | undefined;
  if (currentResult.overallMetrics) {
    const totalCapVol = currentResult.overallMetrics.totalCapacityVolumeCbm;
    const totalCapWeight = currentResult.overallMetrics.totalCapacityWeightKg;
    updatedOverallMetrics = {
      ...currentResult.overallMetrics,
      totalPackedCount,
      totalUnplacedCount,
      totalPackedVolumeCbm: totalPackedVol,
      totalPackedWeightKg: totalPackedWeight,
      overallVolumeUtilization: totalCapVol > 0 ? (totalPackedVol / totalCapVol) * 100 : 0,
      overallWeightUtilization: totalCapWeight > 0 ? (totalPackedWeight / totalCapWeight) * 100 : 0,
      totalItemCount
    };
  }

  const prevManualCount = currentResult.manualAdjustmentsCount || 0;

  return {
    ...currentResult,
    packedItems: updatedAllPackedItems,
    containers: updatedContainers,
    unplacedItems: updatedUnplacedItems,
    metrics: activeContainerMetrics,
    overallMetrics: updatedOverallMetrics,
    hasManualAdjustments: true,
    manualAdjustmentsCount: prevManualCount + 1
  };
}

/**
 * Repositions an existing packed item manually
 */
export function applyManualItemMove(
  currentResult: PackingResult,
  targetContainer: Container,
  itemId: string,
  newCoords: { x: number; y: number; z: number; rotationIndex?: number; length?: number; width?: number; height?: number }
): PackingResult {
  const updatedAllPackedItems = currentResult.packedItems.map(item => {
    if (item.id === itemId) {
      return {
        ...item,
        x: Math.round(newCoords.x),
        y: Math.round(newCoords.y),
        z: Math.round(newCoords.z),
        length: newCoords.length ?? item.length,
        width: newCoords.width ?? item.width,
        height: newCoords.height ?? item.height,
        rotationIndex: newCoords.rotationIndex ?? item.rotationIndex,
        isManual: true
      };
    }
    return item;
  });

  const totalUnplacedCount = currentResult.unplacedItems.reduce((s, u) => s + u.count, 0);

  let updatedContainers: ContainerLoad[] = [];
  if (currentResult.containers && currentResult.containers.length > 0) {
    updatedContainers = currentResult.containers.map(cLoad => {
      const newContPacked = cLoad.packedItems.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            x: Math.round(newCoords.x),
            y: Math.round(newCoords.y),
            z: Math.round(newCoords.z),
            length: newCoords.length ?? item.length,
            width: newCoords.width ?? item.width,
            height: newCoords.height ?? item.height,
            rotationIndex: newCoords.rotationIndex ?? item.rotationIndex,
            isManual: true
          };
        }
        return item;
      });
      const newContMetrics = recalculateContainerMetrics(
        cLoad.container,
        newContPacked,
        newContPacked.length + totalUnplacedCount,
        totalUnplacedCount,
        cLoad.metrics.algorithm
      );
      return {
        ...cLoad,
        packedItems: newContPacked,
        metrics: newContMetrics
      };
    });
  }

  const activeIdx = 0;
  const activeMetrics = updatedContainers[activeIdx]?.metrics || recalculateContainerMetrics(
    targetContainer,
    updatedAllPackedItems,
    updatedAllPackedItems.length + totalUnplacedCount,
    totalUnplacedCount,
    currentResult.metrics.algorithm
  );

  return {
    ...currentResult,
    packedItems: updatedAllPackedItems,
    containers: updatedContainers.length > 0 ? updatedContainers : currentResult.containers,
    metrics: activeMetrics,
    hasManualAdjustments: true,
    manualAdjustmentsCount: (currentResult.manualAdjustmentsCount || 0) + 1
  };
}

/**
 * Removes a manually placed or existing item and returns it to unplaced
 */
export function applyManualItemRemove(
  currentResult: PackingResult,
  targetContainer: Container,
  itemId: string
): PackingResult {
  const itemToRemove = currentResult.packedItems.find(p => p.id === itemId);
  if (!itemToRemove) return currentResult;

  const updatedAllPackedItems = currentResult.packedItems.filter(p => p.id !== itemId);

  // Return to unplaced items
  const updatedUnplacedItems = [...currentResult.unplacedItems];
  const existingUnplaced = updatedUnplacedItems.find(u => u.sku === itemToRemove.sku || u.cargoItemId === itemToRemove.cargoItemId);

  if (existingUnplaced) {
    existingUnplaced.count += 1;
  } else {
    updatedUnplacedItems.push({
      cargoItemId: itemToRemove.cargoItemId,
      sku: itemToRemove.sku,
      name: itemToRemove.name,
      reason: 'no_spatial_fit',
      dimensions: {
        length: itemToRemove.length,
        width: itemToRemove.width,
        height: itemToRemove.height
      },
      weight: itemToRemove.weight,
      count: 1
    });
  }

  const totalUnplacedCount = updatedUnplacedItems.reduce((s, u) => s + u.count, 0);

  let updatedContainers: ContainerLoad[] = [];
  if (currentResult.containers && currentResult.containers.length > 0) {
    updatedContainers = currentResult.containers.map(cLoad => {
      const newContPacked = cLoad.packedItems.filter(p => p.id !== itemId);
      const newContMetrics = recalculateContainerMetrics(
        cLoad.container,
        newContPacked,
        newContPacked.length + totalUnplacedCount,
        totalUnplacedCount,
        cLoad.metrics.algorithm
      );
      return {
        ...cLoad,
        packedItems: newContPacked,
        metrics: newContMetrics
      };
    });
  }

  const activeIdx = 0;
  const activeMetrics = updatedContainers[activeIdx]?.metrics || recalculateContainerMetrics(
    targetContainer,
    updatedAllPackedItems,
    updatedAllPackedItems.length + totalUnplacedCount,
    totalUnplacedCount,
    currentResult.metrics.algorithm
  );

  return {
    ...currentResult,
    packedItems: updatedAllPackedItems,
    containers: updatedContainers.length > 0 ? updatedContainers : currentResult.containers,
    unplacedItems: updatedUnplacedItems,
    metrics: activeMetrics,
    hasManualAdjustments: true,
    manualAdjustmentsCount: Math.max(0, (currentResult.manualAdjustmentsCount || 1) - 1)
  };
}

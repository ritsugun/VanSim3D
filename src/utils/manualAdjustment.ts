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
 * Checks whether the item would rest directly on top of a fragile item
 */
export function isRestingOnFragile(
  x: number,
  y: number,
  z: number,
  length: number,
  width: number,
  existingItems: PackedItem[],
  ignoreItemId?: string
): boolean {
  if (z <= 0) return false; // Directly on the container floor is fine
  for (const item of existingItems) {
    if (ignoreItemId && item.id === ignoreItemId) continue;
    if (!item.fragile) continue;

    const overlapX = x < (item.x + item.length) && (x + length) > item.x;
    const overlapY = y < (item.y + item.width) && (y + width) > item.y;
    // If horizontally overlapping and height matches top surface of fragile item
    if (overlapX && overlapY && Math.abs(z - (item.z + item.height)) < 15) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether an item at (x, y, z) with dimensions (length, width, height)
 * collides (overlaps in 3D volume) with any existing packed item in the container.
 * Note: Surfaces touching (e.g. adjacent faces or resting on top) is allowed.
 */
export function check3DItemCollision(
  x: number,
  y: number,
  z: number,
  length: number,
  width: number,
  height: number,
  existingItems: PackedItem[],
  ignoreItemId?: string,
  toleranceMm: number = 0.5
): { hasCollision: boolean; collidingItem?: PackedItem } {
  for (const item of existingItems) {
    if (ignoreItemId && item.id === ignoreItemId) continue;

    // Check strict 3D AABB overlap with small tolerance to allow flush surface contact
    const overlapX = (x < item.x + item.length - toleranceMm) && (x + length > item.x + toleranceMm);
    const overlapY = (y < item.y + item.width - toleranceMm) && (y + width > item.y + toleranceMm);
    const overlapZ = (z < item.z + item.height - toleranceMm) && (z + height > item.z + toleranceMm);

    if (overlapX && overlapY && overlapZ) {
      return { hasCollision: true, collidingItem: item };
    }
  }

  return { hasCollision: false };
}

/**
 * Finds the maximum non-colliding position when nudging along an axis.
 * Returns the furthest valid coordinate without overlapping any other items or container walls.
 */
export function findMaxNonCollidingPosition(
  current: { x: number; y: number; z: number; length: number; width: number; height: number },
  target: { x: number; y: number; z: number },
  existingItems: PackedItem[],
  container: Container,
  ignoreItemId?: string
): { x: number; y: number; z: number; blocked: boolean; collidingItem?: PackedItem } {
  // Check container bounds
  const clampedTargetX = Math.max(0, Math.min(container.length - current.length, target.x));
  const clampedTargetY = Math.max(0, Math.min(container.width - current.width, target.y));
  const clampedTargetZ = Math.max(0, Math.min(container.height - current.height, target.z));

  // If no collision at clamped target, return immediately
  const initialCollision = check3DItemCollision(
    clampedTargetX, clampedTargetY, clampedTargetZ,
    current.length, current.width, current.height,
    existingItems, ignoreItemId
  );

  if (!initialCollision.hasCollision) {
    return {
      x: clampedTargetX,
      y: clampedTargetY,
      z: clampedTargetZ,
      blocked: false
    };
  }

  // If initial target collides, check if moving along individual axes or finding contact point
  // We check binary search or stepped resolution to find the flush contact position
  const dx = clampedTargetX - current.x;
  const dy = clampedTargetY - current.y;
  const dz = clampedTargetZ - current.z;

  let bestX = current.x;
  let bestY = current.y;
  let bestZ = current.z;
  let blocked = true;

  // Try sub-stepping (up to 10 steps) towards the target to stop flush against the obstacle
  const steps = 10;
  for (let step = 1; step <= steps; step++) {
    const testX = Math.round(current.x + (dx * step) / steps);
    const testY = Math.round(current.y + (dy * step) / steps);
    const testZ = Math.round(current.z + (dz * step) / steps);

    const collision = check3DItemCollision(
      testX, testY, testZ,
      current.length, current.width, current.height,
      existingItems, ignoreItemId
    );

    if (!collision.hasCollision) {
      bestX = testX;
      bestY = testY;
      bestZ = testZ;
      blocked = false;
    } else {
      break;
    }
  }

  return {
    x: bestX,
    y: bestY,
    z: bestZ,
    blocked: blocked || (bestX === current.x && bestY === current.y && bestZ === current.z),
    collidingItem: initialCollision.collidingItem
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
  // Guard: Verify that the item exists in unplacedItems with count > 0
  const availableUnplaced = currentResult.unplacedItems.find(
    u => (u.cargoItemId && u.cargoItemId === unplacedItem.cargoItemId) || (u.sku && u.sku === unplacedItem.sku)
  );
  if (!availableUnplaced || availableUnplaced.count <= 0) {
    // Inventory exhausted: do not allow placement
    return currentResult;
  }

  // Preserve fragile attribute from matching items if available
  const matchingItem = currentResult.packedItems.find(
    p => (p.sku && p.sku === unplacedItem.sku) || (p.cargoItemId && p.cargoItemId === unplacedItem.cargoItemId)
  );
  const isFragile = matchingItem?.fragile ?? (unplacedItem as any).fragile ?? false;

  // 1. Create new PackedItem
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
    color: placement.color || (matchingItem?.color || '#3b82f6'),
    fragile: isFragile,
    sequenceNumber: nextSeq,
    stepIndex: nextSeq,
    rotationIndex: placement.rotationIndex ?? 0,
    containerIndex: targetContainerIndex,
    layer: Math.floor(placement.z / Math.max(100, placement.height)) + 1,
    isManual: true
  };

  // 2. Decrement unplaced items immutably
  const updatedUnplacedItems: UnplacedItem[] = [];
  let decremented = false;

  for (const u of currentResult.unplacedItems) {
    if (!decremented && ((u.cargoItemId && u.cargoItemId === unplacedItem.cargoItemId) || (u.sku && u.sku === unplacedItem.sku))) {
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
  const totalItemCount = updatedAllPackedItems.length + totalUnplacedCount;

  let updatedContainers: ContainerLoad[] = [];
  if (currentResult.containers && currentResult.containers.length > 0) {
    updatedContainers = currentResult.containers.map((cLoad, idx) => {
      if (cLoad.containerIndex === targetContainerIndex || idx + 1 === targetContainerIndex) {
        const newContPacked = [...cLoad.packedItems, newPackedItem];
        const newContMetrics = recalculateContainerMetrics(
          cLoad.container,
          newContPacked,
          totalItemCount,
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
      totalItemCount,
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
    || updatedContainers[0]?.metrics
    || recalculateContainerMetrics(
      targetContainer,
      updatedAllPackedItems,
      totalItemCount,
      totalUnplacedCount,
      currentResult.metrics.algorithm
    );

  // 4. Update overall metrics
  const totalPackedCount = updatedAllPackedItems.length;
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
  const existingItem = currentResult.packedItems.find(p => p.id === itemId);
  if (!existingItem) return currentResult;

  const targetContainerIndex = existingItem.containerIndex || 1;

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
        layer: Math.floor(newCoords.z / Math.max(100, newCoords.height ?? item.height)) + 1,
        isManual: true
      };
    }
    return item;
  });

  const totalUnplacedCount = currentResult.unplacedItems.reduce((s, u) => s + u.count, 0);
  const totalItemCount = updatedAllPackedItems.length + totalUnplacedCount;

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
            layer: Math.floor(newCoords.z / Math.max(100, newCoords.height ?? item.height)) + 1,
            isManual: true
          };
        }
        return item;
      });
      const newContMetrics = recalculateContainerMetrics(
        cLoad.container,
        newContPacked,
        totalItemCount,
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

  const activeMetrics = updatedContainers.find(c => c.containerIndex === targetContainerIndex)?.metrics
    || updatedContainers[0]?.metrics
    || recalculateContainerMetrics(
      targetContainer,
      updatedAllPackedItems,
      totalItemCount,
      totalUnplacedCount,
      currentResult.metrics.algorithm
    );

  const prevManualCount = currentResult.manualAdjustmentsCount || 0;

  // Update overall metrics if present (center of gravity or axle distribution may have shifted)
  let updatedOverallMetrics: OverallPackingMetrics | undefined;
  if (currentResult.overallMetrics) {
    const totalPackedCount = updatedAllPackedItems.length;
    const totalPackedVol = updatedAllPackedItems.reduce((s, p) => s + (p.length * p.width * p.height) / 1_000_000_000, 0);
    const totalPackedWeight = updatedAllPackedItems.reduce((s, p) => s + p.weight, 0);
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

  return {
    ...currentResult,
    packedItems: updatedAllPackedItems,
    containers: updatedContainers.length > 0 ? updatedContainers : currentResult.containers,
    metrics: activeMetrics,
    overallMetrics: updatedOverallMetrics,
    hasManualAdjustments: true,
    manualAdjustmentsCount: prevManualCount + 1
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

  const targetContainerIndex = itemToRemove.containerIndex || 1;
  const updatedAllPackedItems = currentResult.packedItems.filter(p => p.id !== itemId);

  // Return to unplaced items immutably
  let found = false;
  const updatedUnplacedItems = currentResult.unplacedItems.map(u => {
    if (!found && ((u.cargoItemId && u.cargoItemId === itemToRemove.cargoItemId) || (u.sku && u.sku === itemToRemove.sku))) {
      found = true;
      return { ...u, count: u.count + 1 };
    }
    return u;
  });

  if (!found) {
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
  const totalItemCount = updatedAllPackedItems.length + totalUnplacedCount;

  let updatedContainers: ContainerLoad[] = [];
  if (currentResult.containers && currentResult.containers.length > 0) {
    updatedContainers = currentResult.containers.map(cLoad => {
      const newContPacked = cLoad.packedItems.filter(p => p.id !== itemId);
      const newContMetrics = recalculateContainerMetrics(
        cLoad.container,
        newContPacked,
        totalItemCount,
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

  const activeMetrics = updatedContainers.find(c => c.containerIndex === targetContainerIndex)?.metrics
    || updatedContainers[0]?.metrics
    || recalculateContainerMetrics(
      targetContainer,
      updatedAllPackedItems,
      totalItemCount,
      totalUnplacedCount,
      currentResult.metrics.algorithm
    );

  // Update overall metrics
  let updatedOverallMetrics: OverallPackingMetrics | undefined;
  if (currentResult.overallMetrics) {
    const totalPackedCount = updatedAllPackedItems.length;
    const totalPackedVol = updatedAllPackedItems.reduce((s, p) => s + (p.length * p.width * p.height) / 1_000_000_000, 0);
    const totalPackedWeight = updatedAllPackedItems.reduce((s, p) => s + p.weight, 0);
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

  return {
    ...currentResult,
    packedItems: updatedAllPackedItems,
    containers: updatedContainers.length > 0 ? updatedContainers : currentResult.containers,
    unplacedItems: updatedUnplacedItems,
    metrics: activeMetrics,
    overallMetrics: updatedOverallMetrics,
    hasManualAdjustments: true,
    manualAdjustmentsCount: Math.max(0, (currentResult.manualAdjustmentsCount || 1) - 1)
  };
}

/**
 * Unloads all packed items from the current container (or all containers)
 * and returns them to the unplaced items tray for full manual packing.
 */
export function applyManualUnloadContainer(
  currentResult: PackingResult,
  targetContainer: Container,
  targetContainerIndex?: number | 'all'
): PackingResult {
  // Determine which items to unload
  const itemsToUnload = currentResult.packedItems.filter(p => {
    if (targetContainerIndex === undefined || targetContainerIndex === 'all') {
      return true;
    }
    const cIdx = p.containerIndex || 1;
    return cIdx === targetContainerIndex;
  });

  if (itemsToUnload.length === 0) {
    return currentResult;
  }

  // Remaining items that stay packed
  const updatedAllPackedItems = currentResult.packedItems.filter(p => {
    if (targetContainerIndex === undefined || targetContainerIndex === 'all') {
      return false;
    }
    const cIdx = p.containerIndex || 1;
    return cIdx !== targetContainerIndex;
  });

  // Return unloaded items to unplaced list
  const updatedUnplacedItems = currentResult.unplacedItems.map(u => ({ ...u }));

  for (const item of itemsToUnload) {
    const existing = updatedUnplacedItems.find(u => 
      (u.cargoItemId && u.cargoItemId === item.cargoItemId) || 
      (u.sku && u.sku === item.sku)
    );

    if (existing) {
      existing.count += 1;
    } else {
      updatedUnplacedItems.push({
        cargoItemId: item.cargoItemId,
        sku: item.sku,
        name: item.name,
        reason: 'no_spatial_fit',
        dimensions: {
          length: item.length,
          width: item.width,
          height: item.height
        },
        weight: item.weight,
        count: 1
      });
    }
  }

  const totalUnplacedCount = updatedUnplacedItems.reduce((s, u) => s + u.count, 0);
  const totalItemCount = updatedAllPackedItems.length + totalUnplacedCount;

  // Update containers array
  let updatedContainers: ContainerLoad[] = [];
  if (currentResult.containers && currentResult.containers.length > 0) {
    updatedContainers = currentResult.containers.map(cLoad => {
      const isThisContainerUnloaded = 
        targetContainerIndex === undefined || 
        targetContainerIndex === 'all' || 
        cLoad.containerIndex === targetContainerIndex;

      const newContPacked = isThisContainerUnloaded
        ? []
        : cLoad.packedItems;

      const newContMetrics = recalculateContainerMetrics(
        cLoad.container,
        newContPacked,
        totalItemCount,
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

  const activeIdx = typeof targetContainerIndex === 'number' ? targetContainerIndex : 1;
  const activeMetrics = updatedContainers.find(c => c.containerIndex === activeIdx)?.metrics
    || updatedContainers[0]?.metrics
    || recalculateContainerMetrics(
      targetContainer,
      updatedAllPackedItems,
      totalItemCount,
      totalUnplacedCount,
      currentResult.metrics.algorithm
    );

  // Update overall metrics
  let updatedOverallMetrics: OverallPackingMetrics | undefined;
  if (currentResult.overallMetrics) {
    const totalPackedCount = updatedAllPackedItems.length;
    const totalPackedVol = updatedAllPackedItems.reduce((s, p) => s + (p.length * p.width * p.height) / 1_000_000_000, 0);
    const totalPackedWeight = updatedAllPackedItems.reduce((s, p) => s + p.weight, 0);
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

  return {
    ...currentResult,
    packedItems: updatedAllPackedItems,
    containers: updatedContainers.length > 0 ? updatedContainers : currentResult.containers,
    unplacedItems: updatedUnplacedItems,
    metrics: activeMetrics,
    overallMetrics: updatedOverallMetrics,
    hasManualAdjustments: true,
    manualAdjustmentsCount: (currentResult.manualAdjustmentsCount || 0) + 1
  };
}


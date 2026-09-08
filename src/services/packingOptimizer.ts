import { Container, CargoItem, PackedItem, UnplacedItem, PackingResult, AlgorithmType, ContainerLoad, OverallPackingMetrics, GAGoalConfig, AlgorithmBenchmarkEntry } from '../types';

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface BoxOrientation {
  length: number;
  width: number;
  height: number;
  rotationIndex: number;
}

interface UnpackedInstance {
  instanceId: string;
  item: CargoItem;
  volume: number;
  baseArea: number;
}

interface GAGene {
  instance: UnpackedInstance;
  preferredRotation: number; // 0: upright (L, W, H), 1: 90-deg yaw rotated (W, L, H)
}

interface GAIndividual {
  genes: GAGene[];
  fitness: number;
  containerLoad?: ContainerLoad;
  remainingInstances?: UnpackedInstance[];
  placedInstancesCount?: number;
}

/**
 * Generates all permitted orientations for a cargo item based on horizontal rotation flag.
 * Vertical rotation (changing height/tilting) is strictly prohibited.
 */
function getValidOrientations(item: CargoItem, preferredRotation: number = 0): BoxOrientation[] {
  const { length: l, width: w, height: h } = item;
  const orientations: BoxOrientation[] = [];
  const added = new Set<string>();

  const pushUnique = (len: number, wid: number, hei: number, rotIndex: number) => {
    const key = `${len}x${wid}x${hei}`;
    if (!added.has(key)) {
      added.add(key);
      orientations.push({ length: len, width: wid, height: hei, rotationIndex: rotIndex });
    }
  };

  const canRotateHorizontal = item.allowYaw !== false;

  if (preferredRotation === 1 && canRotateHorizontal) {
    pushUnique(w, l, h, 1);
    pushUnique(l, w, h, 0);
  } else {
    pushUnique(l, w, h, 0);
    if (canRotateHorizontal) {
      pushUnique(w, l, h, 1);
    }
  }

  return orientations;
}

/**
 * Checks if a candidate box collides with any already placed item
 */
function checkCollision(
  cand: { x: number; y: number; z: number; length: number; width: number; height: number },
  placedItems: PackedItem[]
): boolean {
  const cX2 = cand.x + cand.length;
  const cY2 = cand.y + cand.width;
  const cZ2 = cand.z + cand.height;

  for (let i = 0; i < placedItems.length; i++) {
    const p = placedItems[i];
    const pX2 = p.x + p.length;
    const pY2 = p.y + p.width;
    const pZ2 = p.z + p.height;

    // Intersection test (strictly inside or overlapping)
    if (
      cand.x < pX2 && cX2 > p.x &&
      cand.y < pY2 && cY2 > p.y &&
      cand.z < pZ2 && cZ2 > p.z
    ) {
      return true; // Collision detected
    }
  }
  return false;
}

/**
 * Checks bottom support (Gravity & Stability constraint):
 * The item must either rest on the container floor (z === 0),
 * or have 100% (>= 95% floating-point tolerance) of its bottom surface area directly supported by the tops of other items.
 * Also verifies that all 4 base corners and center point have physical support underneath,
 * and no items directly beneath it are fragile or exceeding their maxStackWeight.
 */
function checkSupportAndStacking(
  cand: { x: number; y: number; z: number; length: number; width: number; height: number; weight: number; floorPlacement?: boolean },
  placedItems: PackedItem[]
): boolean {
  if (cand.floorPlacement && cand.z !== 0) {
    return false; // Floor Placement constraint: Must be placed directly on container floor (z = 0)
  }
  if (cand.z === 0) return true; // Direct floor support (100% supported by container floor)

  const candBaseArea = cand.length * cand.width;
  let supportedArea = 0;
  const candX2 = cand.x + cand.length;
  const candY2 = cand.y + cand.width;

  const directSupportItems: PackedItem[] = [];

  for (let i = 0; i < placedItems.length; i++) {
    const p = placedItems[i];
    const pZ2 = p.z + p.height;

    // Is item p directly beneath candidate? (within 1mm tolerance)
    if (Math.abs(pZ2 - cand.z) <= 1) {
      const pX2 = p.x + p.length;
      const pY2 = p.y + p.width;

      // Calculate intersection on the XY plane
      const overlapX = Math.max(0, Math.min(candX2, pX2) - Math.max(cand.x, p.x));
      const overlapY = Math.max(0, Math.min(candY2, pY2) - Math.max(cand.y, p.y));
      const overlapArea = overlapX * overlapY;

      if (overlapArea > 0) {
        // If supporting item is fragile, we cannot place anything on it!
        if (p.fragile) {
          return false;
        }
        supportedArea += overlapArea;
        directSupportItems.push(p);
      }
    }
  }

  // If no supporting items beneath, immediately reject (cannot float in air)
  if (directSupportItems.length === 0) {
    return false;
  }

  // Require full bottom area support (>= 95% to allow 1mm edge/rounding tolerances)
  const supportRatio = supportedArea / candBaseArea;
  if (supportRatio < 0.95) {
    return false;
  }

  // Four-corner & Center point support check:
  // Strictly prevent any corner or side from overhanging into empty space without support
  const marginX = Math.min(5, cand.length * 0.05);
  const marginY = Math.min(5, cand.width * 0.05);
  const testPoints = [
    { x: cand.x + marginX, y: cand.y + marginY },
    { x: candX2 - marginX, y: cand.y + marginY },
    { x: cand.x + marginX, y: candY2 - marginY },
    { x: candX2 - marginX, y: candY2 - marginY },
    { x: cand.x + cand.length / 2, y: cand.y + cand.width / 2 } // Center of gravity support
  ];

  for (let ptIdx = 0; ptIdx < testPoints.length; ptIdx++) {
    const tp = testPoints[ptIdx];
    let pointSupported = false;
    for (let sIdx = 0; sIdx < directSupportItems.length; sIdx++) {
      const sp = directSupportItems[sIdx];
      const spX2 = sp.x + sp.length;
      const spY2 = sp.y + sp.width;
      if (tp.x >= sp.x - 1 && tp.x <= spX2 + 1 && tp.y >= sp.y - 1 && tp.y <= spY2 + 1) {
        pointSupported = true;
        break;
      }
    }
    if (!pointSupported) {
      return false; // Point hanging in mid-air with no support below
    }
  }

  return true;
}

/**
 * Packs instances or genes into a single container using 3D Extreme Points Placement
 */
function packSingleContainerWithGenes(
  container: Container,
  containerIndex: number,
  genes: GAGene[],
  algorithm: AlgorithmType,
  startSequenceNumber: number,
  maxPoints: number = 250
): {
  containerLoad: ContainerLoad;
  remainingInstances: UnpackedInstance[];
  placedInstancesCount: number;
} {
  const safeLength = Math.max(100, Number(container.length) || 6000);
  const safeWidth = Math.max(100, Number(container.width) || 2400);
  const safeHeight = Math.max(100, Number(container.height) || 2400);
  const safeMaxWeight = Math.max(10, Number(container.maxWeight) || 20000);

  const safeContainer: Container = {
    ...container,
    length: safeLength,
    width: safeWidth,
    height: safeHeight,
    maxWeight: safeMaxWeight
  };

  const packedItems: PackedItem[] = [];
  const remainingInstances: UnpackedInstance[] = [];
  let currentTotalWeight = 0;

  // Extreme Points Set (initialized at origin [0, 0, 0])
  let extremePoints: Point3D[] = [{ x: 0, y: 0, z: 0 }];

  const sortPoints = (pts: Point3D[]) => {
    pts.sort((a, b) => {
      if (algorithm === 'wall_building') {
        if (a.x !== b.x) return a.x - b.x;
        if (a.z !== b.z) return a.z - b.z;
        return a.y - b.y;
      } else if (algorithm === 'weight_balanced') {
        const aDistY = Math.abs(a.y - safeContainer.width / 2);
        const bDistY = Math.abs(b.y - safeContainer.width / 2);
        if (a.z !== b.z) return a.z - b.z;
        if (a.x !== b.x) return a.x - b.x;
        return aDistY - bDistY;
      } else if (algorithm === 'layer_stacking') {
        if (a.z !== b.z) return a.z - b.z;
        if (a.x !== b.x) return a.x - b.x;
        return a.y - b.y;
      } else {
        // Extreme Points Best Fit: prioritize bottom (z), then back (x), then left (y)
        if (a.z !== b.z) return a.z - b.z;
        if (a.x !== b.x) return a.x - b.x;
        return a.y - b.y;
      }
    });
  };

  const addExtremePoint = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || z < 0) return;
    if (x >= safeContainer.length || y >= safeContainer.width || z >= safeContainer.height) return;

    for (let i = 0; i < extremePoints.length; i++) {
      const ep = extremePoints[i];
      if (Math.abs(ep.x - x) < 2 && Math.abs(ep.y - y) < 2 && Math.abs(ep.z - z) < 2) return;
    }

    for (let i = 0; i < packedItems.length; i++) {
      const p = packedItems[i];
      if (
        x >= p.x && x < p.x + p.length &&
        y >= p.y && y < p.y + p.width &&
        z >= p.z && z < p.z + p.height
      ) {
        return;
      }
    }

    extremePoints.push({ x, y, z });
  };

  for (let i = 0; i < genes.length; i++) {
    const gene = genes[i];
    const inst = gene.instance;
    const cargo = inst.item;

    const cL = Math.max(10, Number(cargo.length) || 100);
    const cW = Math.max(10, Number(cargo.width) || 100);
    const cH = Math.max(10, Number(cargo.height) || 100);
    const cWt = Math.max(0.1, Number(cargo.weight) || 1);

    const safeCargo = { ...cargo, length: cL, width: cW, height: cH, weight: cWt };

    // Check weight limit
    if (currentTotalWeight + safeCargo.weight > safeContainer.maxWeight) {
      remainingInstances.push(inst);
      continue;
    }

    // Quick fit check
    const minItemDim = Math.min(cL, cW, cH);
    const maxContDim = Math.max(safeContainer.length, safeContainer.width, safeContainer.height);
    if (minItemDim > maxContDim) {
      remainingInstances.push(inst);
      continue;
    }

    const orientations = getValidOrientations(safeCargo, gene.preferredRotation);
    const isFloorOnly = safeCargo.floorPlacement === true;
    let bestPlacement: {
      point: Point3D;
      orientation: BoxOrientation;
      score: number;
    } | null = null;

    const pointsToTest = extremePoints.slice(0, maxPoints);

    for (let pIdx = 0; pIdx < pointsToTest.length; pIdx++) {
      const pt = pointsToTest[pIdx];

      // Floor placement constraint: if cargo must be on floor, only consider z = 0 positions
      if (isFloorOnly && pt.z !== 0) {
        continue;
      }

      for (let oIdx = 0; oIdx < orientations.length; oIdx++) {
        const ori = orientations[oIdx];

        if (
          pt.x + ori.length > safeContainer.length ||
          pt.y + ori.width > safeContainer.width ||
          pt.z + ori.height > safeContainer.height
        ) {
          continue;
        }

        const candidate = {
          x: pt.x,
          y: pt.y,
          z: pt.z,
          length: ori.length,
          width: ori.width,
          height: ori.height,
          weight: safeCargo.weight,
          floorPlacement: isFloorOnly
        };

        if (checkCollision(candidate, packedItems)) {
          continue;
        }

        if (!checkSupportAndStacking(candidate, packedItems)) {
          continue;
        }

        // Score based on position
        const cornerDistScore = (pt.z * 10.0) + (pt.x * 1.5) + (pt.y * 1.0);
        const score = cornerDistScore;

        if (!bestPlacement || score < bestPlacement.score) {
          bestPlacement = {
            point: pt,
            orientation: ori,
            score
          };
        }
      }
    }

    if (bestPlacement) {
      const { point, orientation } = bestPlacement;
      const layerNumber = Math.floor(point.z / (orientation.height || 100)) + 1;

      const newPackedItem: PackedItem = {
        id: `packed_c${containerIndex}_${packedItems.length + 1}`,
        cargoItemId: safeCargo.id,
        sku: safeCargo.sku,
        name: safeCargo.name,
        x: point.x,
        y: point.y,
        z: point.z,
        length: orientation.length,
        width: orientation.width,
        height: orientation.height,
        weight: safeCargo.weight,
        color: safeCargo.color,
        fragile: !!safeCargo.fragile,
        floorPlacement: isFloorOnly,
        sequenceNumber: startSequenceNumber + packedItems.length + 1,
        stepIndex: packedItems.length,
        rotationIndex: orientation.rotationIndex,
        containerIndex,
        layer: layerNumber
      };

      packedItems.push(newPackedItem);
      currentTotalWeight += safeCargo.weight;

      const pX2 = point.x + orientation.length;
      const pY2 = point.y + orientation.width;
      const pZ2 = point.z + orientation.height;

      addExtremePoint(pX2, point.y, point.z);
      addExtremePoint(point.x, pY2, point.z);
      addExtremePoint(point.x, point.y, pZ2);
      addExtremePoint(pX2, pY2, point.z);
      addExtremePoint(pX2, point.y, pZ2);
      addExtremePoint(point.x, pY2, pZ2);

      for (let k = 0; k < packedItems.length - 1; k++) {
        const other = packedItems[k];
        const oX2 = other.x + other.length;
        const oY2 = other.y + other.width;
        const oZ2 = other.z + other.height;

        if (oX2 <= safeContainer.length) addExtremePoint(oX2, point.y, point.z);
        if (oY2 <= safeContainer.width) addExtremePoint(point.x, oY2, point.z);
        if (oZ2 <= safeContainer.height) addExtremePoint(point.x, point.y, oZ2);
      }

      for (let epIdx = extremePoints.length - 1; epIdx >= 0; epIdx--) {
        const ep = extremePoints[epIdx];
        if (
          ep.x >= point.x && ep.x < pX2 &&
          ep.y >= point.y && ep.y < pY2 &&
          ep.z >= point.z && ep.z < pZ2
        ) {
          extremePoints.splice(epIdx, 1);
        }
      }

      sortPoints(extremePoints);
      if (extremePoints.length > maxPoints) {
        extremePoints = extremePoints.slice(0, maxPoints);
      }
    } else {
      remainingInstances.push(inst);
    }
  }

  const containerVolMm3 = safeContainer.length * safeContainer.width * safeContainer.height;
  const containerVolumeCbm = containerVolMm3 / 1_000_000_000;

  let packedVolMm3 = 0;
  let cogWeightedX = 0;
  let cogWeightedY = 0;
  let cogWeightedZ = 0;

  for (let i = 0; i < packedItems.length; i++) {
    const p = packedItems[i];
    const itemVol = p.length * p.width * p.height;
    packedVolMm3 += itemVol;

    const itemCenterX = p.x + p.length / 2;
    const itemCenterY = p.y + p.width / 2;
    const itemCenterZ = p.z + p.height / 2;

    cogWeightedX += itemCenterX * p.weight;
    cogWeightedY += itemCenterY * p.weight;
    cogWeightedZ += itemCenterZ * p.weight;
  }

  const packedVolumeCbm = packedVolMm3 / 1_000_000_000;
  const freeVolumeCbm = Math.max(0, containerVolumeCbm - packedVolumeCbm);
  const volumeUtilization = (packedVolMm3 / containerVolMm3) * 100;
  const weightUtilization = (currentTotalWeight / container.maxWeight) * 100;

  const cogX = currentTotalWeight > 0 ? cogWeightedX / currentTotalWeight : container.length / 2;
  const cogY = currentTotalWeight > 0 ? cogWeightedY / currentTotalWeight : container.width / 2;
  const cogZ = currentTotalWeight > 0 ? cogWeightedZ / currentTotalWeight : container.height / 2;

  const offsetXPercent = ((cogX - container.length / 2) / container.length) * 100;
  const offsetYPercent = ((cogY - container.width / 2) / container.width) * 100;
  const offsetZPercent = ((cogZ - container.height / 2) / container.height) * 100;

  const frontRatio = Math.max(0, Math.min(1, 1 - (cogX / (container.length * 0.85))));
  const rearRatio = 1 - frontRatio;
  const frontAxleKg = currentTotalWeight * frontRatio;
  const rearAxleKg = currentTotalWeight * rearRatio;

  const metrics = {
    containerVolumeCbm,
    packedVolumeCbm,
    freeVolumeCbm,
    volumeUtilization: Math.min(100, volumeUtilization),
    containerMaxWeightKg: container.maxWeight,
    packedWeightKg: currentTotalWeight,
    weightUtilization: Math.min(100, weightUtilization),
    totalItemCount: genes.length,
    packedCount: packedItems.length,
    unplacedCount: remainingInstances.length,
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

  return {
    containerLoad: {
      containerIndex,
      container,
      packedItems,
      metrics
    },
    remainingInstances,
    placedInstancesCount: packedItems.length
  };
}

/**
 * Helper to compute standardized metrics for a packed container
 */
function buildContainerMetricsHelper(
  container: Container,
  packedItems: PackedItem[],
  totalItemCount: number,
  unplacedCount: number,
  currentTotalWeight: number,
  algorithm: AlgorithmType
) {
  const containerVolMm3 = container.length * container.width * container.height;
  const containerVolumeCbm = containerVolMm3 / 1_000_000_000;

  let packedVolMm3 = 0;
  let cogWeightedX = 0;
  let cogWeightedY = 0;
  let cogWeightedZ = 0;

  for (let i = 0; i < packedItems.length; i++) {
    const p = packedItems[i];
    const itemVol = p.length * p.width * p.height;
    packedVolMm3 += itemVol;

    const itemCenterX = p.x + p.length / 2;
    const itemCenterY = p.y + p.width / 2;
    const itemCenterZ = p.z + p.height / 2;

    cogWeightedX += itemCenterX * p.weight;
    cogWeightedY += itemCenterY * p.weight;
    cogWeightedZ += itemCenterZ * p.weight;
  }

  const packedVolumeCbm = packedVolMm3 / 1_000_000_000;
  const freeVolumeCbm = Math.max(0, containerVolumeCbm - packedVolumeCbm);
  const volumeUtilization = (packedVolMm3 / containerVolMm3) * 100;
  const weightUtilization = (currentTotalWeight / container.maxWeight) * 100;

  const cogX = currentTotalWeight > 0 ? cogWeightedX / currentTotalWeight : container.length / 2;
  const cogY = currentTotalWeight > 0 ? cogWeightedY / currentTotalWeight : container.width / 2;
  const cogZ = currentTotalWeight > 0 ? cogWeightedZ / currentTotalWeight : container.height / 2;

  const offsetXPercent = ((cogX - container.length / 2) / container.length) * 100;
  const offsetYPercent = ((cogY - container.width / 2) / container.width) * 100;
  const offsetZPercent = ((cogZ - container.height / 2) / container.height) * 100;

  const frontRatio = Math.max(0, Math.min(1, 1 - (cogX / (container.length * 0.85))));
  const rearRatio = 1 - frontRatio;
  const frontAxleKg = currentTotalWeight * frontRatio;
  const rearAxleKg = currentTotalWeight * rearRatio;

  return {
    containerVolumeCbm,
    packedVolumeCbm,
    freeVolumeCbm,
    volumeUtilization: Math.min(100, volumeUtilization),
    containerMaxWeightKg: container.maxWeight,
    packedWeightKg: currentTotalWeight,
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
 * Block-Building Algorithm (ブロックビルディング法):
 * Groups identical items into uniform 3D rectangular blocks (e.g. nx * ny * nz pallets/layers)
 * and packs these solid composite blocks to guarantee 100% flat bottom support and maximum structural stability.
 */
function packSingleContainerBlockBuilding(
  container: Container,
  containerIndex: number,
  availableInstances: UnpackedInstance[],
  startSequenceNumber: number
): {
  containerLoad: ContainerLoad;
  remainingInstances: UnpackedInstance[];
  placedInstancesCount: number;
} {
  const safeLength = Math.max(100, Number(container.length) || 6000);
  const safeWidth = Math.max(100, Number(container.width) || 2400);
  const safeHeight = Math.max(100, Number(container.height) || 2400);
  const safeMaxWeight = Math.max(10, Number(container.maxWeight) || 20000);

  const safeContainer: Container = {
    ...container,
    length: safeLength,
    width: safeWidth,
    height: safeHeight,
    maxWeight: safeMaxWeight
  };

  const packedItems: PackedItem[] = [];
  let currentTotalWeight = 0;
  let extremePoints: Point3D[] = [{ x: 0, y: 0, z: 0 }];

  const addExtremePoint = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || z < 0) return;
    if (x >= safeContainer.length || y >= safeContainer.width || z >= safeContainer.height) return;

    for (let i = 0; i < extremePoints.length; i++) {
      const ep = extremePoints[i];
      if (Math.abs(ep.x - x) < 2 && Math.abs(ep.y - y) < 2 && Math.abs(ep.z - z) < 2) return;
    }

    for (let i = 0; i < packedItems.length; i++) {
      const p = packedItems[i];
      if (
        x >= p.x && x < p.x + p.length &&
        y >= p.y && y < p.y + p.width &&
        z >= p.z && z < p.z + p.height
      ) {
        return;
      }
    }
    extremePoints.push({ x, y, z });
  };

  // Group instances by cargoItemId
  const groupMap = new Map<string, UnpackedInstance[]>();
  availableInstances.forEach(inst => {
    const list = groupMap.get(inst.item.id) || [];
    list.push(inst);
    groupMap.set(inst.item.id, list);
  });

  // Sort groups by total volume descending
  const groups = Array.from(groupMap.entries()).sort((a, b) => {
    const volA = (a[1][0]?.volume || 0) * a[1].length;
    const volB = (b[1][0]?.volume || 0) * b[1].length;
    return volB - volA;
  });

  const remainingInstanceSet = new Set<string>(availableInstances.map(i => i.instanceId));
  const instanceLookup = new Map<string, UnpackedInstance>();
  availableInstances.forEach(i => instanceLookup.set(i.instanceId, i));

  // Phase 1: Try placing composite blocks for each cargo group
  for (const [, groupInstances] of groups) {
    const availableForGroup = groupInstances.filter(inst => remainingInstanceSet.has(inst.instanceId));
    if (availableForGroup.length === 0) continue;

    const sampleItem = availableForGroup[0].item;
    const isFloorOnly = sampleItem.floorPlacement === true;
    const orientations = getValidOrientations(sampleItem, 0);

    // Keep building blocks while we have enough items
    let madeProgress = true;
    while (madeProgress && availableForGroup.filter(i => remainingInstanceSet.has(i.instanceId)).length >= 2) {
      madeProgress = false;
      const currentAvailable = availableForGroup.filter(i => remainingInstanceSet.has(i.instanceId));
      const availCount = currentAvailable.length;

      // Find best block configuration (nx, ny, nz, orientation)
      let bestBlock: {
        nx: number;
        ny: number;
        nz: number;
        ori: BoxOrientation;
        totalItems: number;
        blockLength: number;
        blockWidth: number;
        blockHeight: number;
        blockWeight: number;
        placementPoint: Point3D;
      } | null = null;

      // Sort points prioritizing bottom-up, back-to-front
      extremePoints.sort((a, b) => {
        if (a.z !== b.z) return a.z - b.z;
        if (a.x !== b.x) return a.x - b.x;
        return a.y - b.y;
      });

      for (const ori of orientations) {
        const maxNx = Math.min(10, Math.floor(safeContainer.length / ori.length));
        const maxNy = Math.min(10, Math.floor(safeContainer.width / ori.width));
        // If item must be on the floor, block height in items must be 1 (nz = 1) and placed at z = 0
        const maxNz = isFloorOnly ? 1 : Math.min(10, Math.floor(safeContainer.height / ori.height));

        for (let nz = 1; nz <= maxNz; nz++) {
          for (let nx = 1; nx <= maxNx; nx++) {
            for (let ny = 1; ny <= maxNy; ny++) {
              const count = nx * ny * nz;
              if (count < 2 || count > availCount) continue;

              const bL = nx * ori.length;
              const bW = ny * ori.width;
              const bH = nz * ori.height;
              const bWeight = count * sampleItem.weight;

              if (currentTotalWeight + bWeight > safeContainer.maxWeight) continue;

              // Check if this block fits anywhere in extreme points
              for (const pt of extremePoints) {
                if (isFloorOnly && pt.z !== 0) continue;
                if (pt.x + bL > safeContainer.length || pt.y + bW > safeContainer.width || pt.z + bH > safeContainer.height) {
                  continue;
                }

                const cand = {
                  x: pt.x,
                  y: pt.y,
                  z: pt.z,
                  length: bL,
                  width: bW,
                  height: bH,
                  weight: bWeight,
                  floorPlacement: isFloorOnly
                };

                if (checkCollision(cand, packedItems)) continue;
                if (!checkSupportAndStacking(cand, packedItems)) continue;

                // Found a valid block placement
                if (!bestBlock || count > bestBlock.totalItems || (count === bestBlock.totalItems && cand.z < bestBlock.placementPoint.z)) {
                  bestBlock = {
                    nx,
                    ny,
                    nz,
                    ori,
                    totalItems: count,
                    blockLength: bL,
                    blockWidth: bW,
                    blockHeight: bH,
                    blockWeight: bWeight,
                    placementPoint: pt
                  };
                }
                break; // First valid point for this block dimension is optimal due to point sorting
              }
            }
          }
        }
      }

      if (bestBlock) {
        // Place all items in the block
        const { nx, ny, nz, ori, placementPoint, totalItems } = bestBlock;
        const itemsToPlace = currentAvailable.slice(0, totalItems);
        let itemIdx = 0;

        for (let iz = 0; iz < nz; iz++) {
          for (let ix = 0; ix < nx; ix++) {
            for (let iy = 0; iy < ny; iy++) {
              if (itemIdx >= itemsToPlace.length) break;
              const inst = itemsToPlace[itemIdx];
              const posX = placementPoint.x + ix * ori.length;
              const posY = placementPoint.y + iy * ori.width;
              const posZ = placementPoint.z + iz * ori.height;

              const packed: PackedItem = {
                id: `packed_c${containerIndex}_${packedItems.length + 1}`,
                cargoItemId: sampleItem.id,
                sku: sampleItem.sku,
                name: sampleItem.name,
                x: posX,
                y: posY,
                z: posZ,
                length: ori.length,
                width: ori.width,
                height: ori.height,
                weight: sampleItem.weight,
                color: sampleItem.color || '#3b82f6',
                fragile: !!sampleItem.fragile,
                floorPlacement: isFloorOnly,
                sequenceNumber: startSequenceNumber + packedItems.length + 1,
                stepIndex: packedItems.length,
                rotationIndex: ori.rotationIndex,
                containerIndex,
                layer: iz + 1
              };

              packedItems.push(packed);
              currentTotalWeight += sampleItem.weight;
              remainingInstanceSet.delete(inst.instanceId);
              itemIdx++;
            }
          }
        }

        // Add new extreme points around the composite block
        addExtremePoint(placementPoint.x + bestBlock.blockLength, placementPoint.y, placementPoint.z);
        addExtremePoint(placementPoint.x, placementPoint.y + bestBlock.blockWidth, placementPoint.z);
        addExtremePoint(placementPoint.x, placementPoint.y, placementPoint.z + bestBlock.blockHeight);
        addExtremePoint(placementPoint.x + bestBlock.blockLength, placementPoint.y + bestBlock.blockWidth, placementPoint.z);

        madeProgress = true;
      }
    }
  }

  // Phase 2: Place any remaining loose/odd individual items with Extreme Points
  const remainingLooseInstances = availableInstances.filter(i => remainingInstanceSet.has(i.instanceId));
  remainingLooseInstances.sort((a, b) => {
    const aF = a.item.floorPlacement ? 0 : 1;
    const bF = b.item.floorPlacement ? 0 : 1;
    if (aF !== bF) return aF - bF;
    return b.volume - a.volume;
  });

  for (const inst of remainingLooseInstances) {
    const cargo = inst.item;
    const isFloorOnly = cargo.floorPlacement === true;
    if (currentTotalWeight + cargo.weight > safeContainer.maxWeight) continue;

    const orientations = getValidOrientations(cargo, 0);
    extremePoints.sort((a, b) => {
      if (a.z !== b.z) return a.z - b.z;
      if (a.x !== b.x) return a.x - b.x;
      return a.y - b.y;
    });

    let placed = false;
    for (const pt of extremePoints) {
      if (isFloorOnly && pt.z !== 0) continue;
      for (const ori of orientations) {
        if (pt.x + ori.length > safeContainer.length || pt.y + ori.width > safeContainer.width || pt.z + ori.height > safeContainer.height) {
          continue;
        }

        const cand = {
          x: pt.x,
          y: pt.y,
          z: pt.z,
          length: ori.length,
          width: ori.width,
          height: ori.height,
          weight: cargo.weight,
          floorPlacement: isFloorOnly
        };

        if (checkCollision(cand, packedItems)) continue;
        if (!checkSupportAndStacking(cand, packedItems)) continue;

        const packed: PackedItem = {
          id: `packed_c${containerIndex}_${packedItems.length + 1}`,
          cargoItemId: cargo.id,
          sku: cargo.sku,
          name: cargo.name,
          x: pt.x,
          y: pt.y,
          z: pt.z,
          length: ori.length,
          width: ori.width,
          height: ori.height,
          weight: cargo.weight,
          color: cargo.color || '#3b82f6',
          fragile: !!cargo.fragile,
          floorPlacement: isFloorOnly,
          sequenceNumber: startSequenceNumber + packedItems.length + 1,
          stepIndex: packedItems.length,
          rotationIndex: ori.rotationIndex,
          containerIndex,
          layer: Math.floor(pt.z / (ori.height || 100)) + 1
        };

        packedItems.push(packed);
        currentTotalWeight += cargo.weight;
        remainingInstanceSet.delete(inst.instanceId);

        addExtremePoint(pt.x + ori.length, pt.y, pt.z);
        addExtremePoint(pt.x, pt.y + ori.width, pt.z);
        addExtremePoint(pt.x, pt.y, pt.z + ori.height);

        placed = true;
        break;
      }
      if (placed) break;
    }
  }

  const finalRemaining = availableInstances.filter(i => remainingInstanceSet.has(i.instanceId));
  const metrics = buildContainerMetricsHelper(
    safeContainer,
    packedItems,
    availableInstances.length,
    finalRemaining.length,
    currentTotalWeight,
    'block_building'
  );

  return {
    containerLoad: {
      containerIndex,
      container: safeContainer,
      packedItems,
      metrics
    },
    remainingInstances: finalRemaining,
    placedInstancesCount: packedItems.length
  };
}

/**
 * Beam Search Algorithm (ビームサーチ探索法):
 * Maintains top K (beam width) high-quality partial packing states, lookahead-evaluating multiple item candidates,
 * orientations, and positions to deterministically find globally cohesive, stable packing solutions.
 */
function packSingleContainerBeamSearch(
  container: Container,
  containerIndex: number,
  availableInstances: UnpackedInstance[],
  startSequenceNumber: number,
  beamWidth: number = 4
): {
  containerLoad: ContainerLoad;
  remainingInstances: UnpackedInstance[];
  placedInstancesCount: number;
} {
  const safeLength = Math.max(100, Number(container.length) || 6000);
  const safeWidth = Math.max(100, Number(container.width) || 2400);
  const safeHeight = Math.max(100, Number(container.height) || 2400);
  const safeMaxWeight = Math.max(10, Number(container.maxWeight) || 20000);

  const safeContainer: Container = {
    ...container,
    length: safeLength,
    width: safeWidth,
    height: safeHeight,
    maxWeight: safeMaxWeight
  };

  interface BeamState {
    packedItems: PackedItem[];
    remainingInstances: UnpackedInstance[];
    extremePoints: Point3D[];
    currentTotalWeight: number;
    score: number;
  }

  const addPointToSet = (pts: Point3D[], pItems: PackedItem[], x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || z < 0) return;
    if (x >= safeContainer.length || y >= safeContainer.width || z >= safeContainer.height) return;

    for (let i = 0; i < pts.length; i++) {
      const ep = pts[i];
      if (Math.abs(ep.x - x) < 2 && Math.abs(ep.y - y) < 2 && Math.abs(ep.z - z) < 2) return;
    }

    for (let i = 0; i < pItems.length; i++) {
      const p = pItems[i];
      if (
        x >= p.x && x < p.x + p.length &&
        y >= p.y && y < p.y + p.width &&
        z >= p.z && z < p.z + p.height
      ) {
        return;
      }
    }
    pts.push({ x, y, z });
  };

  // Evaluate candidate state score
  const evaluateState = (pItems: PackedItem[], currentWeight: number): number => {
    let packedVol = 0;
    let cogWeightedY = 0;
    let cogWeightedZ = 0;
    let groundCount = 0;

    for (let i = 0; i < pItems.length; i++) {
      const p = pItems[i];
      packedVol += p.length * p.width * p.height;
      cogWeightedY += (p.y + p.width / 2) * p.weight;
      cogWeightedZ += (p.z + p.height / 2) * p.weight;
      if (p.z === 0) groundCount++;
    }

    const volumeRatio = (packedVol / (safeContainer.length * safeContainer.width * safeContainer.height)) * 1000;
    const itemsCountBonus = pItems.length * 50;

    const cogY = currentWeight > 0 ? cogWeightedY / currentWeight : safeContainer.width / 2;
    const cogZ = currentWeight > 0 ? cogWeightedZ / currentWeight : safeContainer.height / 2;

    const lateralPenalty = (Math.abs(cogY - safeContainer.width / 2) / safeContainer.width) * 150;
    const heightPenalty = (cogZ / safeContainer.height) * 100;
    const groundBonus = groundCount * 25;

    return volumeRatio + itemsCountBonus + groundBonus - lateralPenalty - heightPenalty;
  };

  let beam: BeamState[] = [
    {
      packedItems: [],
      remainingInstances: [...availableInstances],
      extremePoints: [{ x: 0, y: 0, z: 0 }],
      currentTotalWeight: 0,
      score: 0
    }
  ];

  let active = true;
  const maxIterations = availableInstances.length;
  let iteration = 0;

  while (active && iteration < maxIterations) {
    iteration++;
    const nextCandidates: BeamState[] = [];

    for (const state of beam) {
      if (state.remainingInstances.length === 0) {
        nextCandidates.push(state);
        continue;
      }

      // Pick distinct top item types from remaining instances (up to 4 distinct items)
      const candidateItemTypes: UnpackedInstance[] = [];
      const seenCargoIds = new Set<string>();
      for (const inst of state.remainingInstances) {
        if (!seenCargoIds.has(inst.item.id)) {
          seenCargoIds.add(inst.item.id);
          candidateItemTypes.push(inst);
          if (candidateItemTypes.length >= 4) break;
        }
      }

      let stateExpanded = false;

      for (const instToPlace of candidateItemTypes) {
        const cargo = instToPlace.item;
        if (state.currentTotalWeight + cargo.weight > safeContainer.maxWeight) continue;

        const orientations = getValidOrientations(cargo, 0);
        const isFloorOnly = cargo.floorPlacement === true;

        // Sort extreme points
        const sortedPoints = [...state.extremePoints].sort((a, b) => {
          if (a.z !== b.z) return a.z - b.z;
          if (a.x !== b.x) return a.x - b.x;
          return a.y - b.y;
        });

        // Test top 12 extreme points
        for (let pIdx = 0; pIdx < Math.min(12, sortedPoints.length); pIdx++) {
          const pt = sortedPoints[pIdx];
          if (isFloorOnly && pt.z !== 0) continue;

          for (const ori of orientations) {
            if (pt.x + ori.length > safeContainer.length || pt.y + ori.width > safeContainer.width || pt.z + ori.height > safeContainer.height) {
              continue;
            }

            const cand = {
              x: pt.x,
              y: pt.y,
              z: pt.z,
              length: ori.length,
              width: ori.width,
              height: ori.height,
              weight: cargo.weight,
              floorPlacement: isFloorOnly
            };

            if (checkCollision(cand, state.packedItems)) continue;
            if (!checkSupportAndStacking(cand, state.packedItems)) continue;

            // Form next candidate state
            const newPackedItem: PackedItem = {
              id: `packed_c${containerIndex}_${state.packedItems.length + 1}`,
              cargoItemId: cargo.id,
              sku: cargo.sku,
              name: cargo.name,
              x: pt.x,
              y: pt.y,
              z: pt.z,
              length: ori.length,
              width: ori.width,
              height: ori.height,
              weight: cargo.weight,
              color: cargo.color || '#3b82f6',
              fragile: !!cargo.fragile,
              floorPlacement: isFloorOnly,
              sequenceNumber: startSequenceNumber + state.packedItems.length + 1,
              stepIndex: state.packedItems.length,
              rotationIndex: ori.rotationIndex,
              containerIndex,
              layer: Math.floor(pt.z / (ori.height || 100)) + 1
            };

            const nextPackedItems = [...state.packedItems, newPackedItem];
            const nextRemaining = state.remainingInstances.filter(i => i.instanceId !== instToPlace.instanceId);
            const nextPoints = [...state.extremePoints];

            addPointToSet(nextPoints, nextPackedItems, pt.x + ori.length, pt.y, pt.z);
            addPointToSet(nextPoints, nextPackedItems, pt.x, pt.y + ori.width, pt.z);
            addPointToSet(nextPoints, nextPackedItems, pt.x, pt.y, pt.z + ori.height);

            const nextWeight = state.currentTotalWeight + cargo.weight;
            const nextScore = evaluateState(nextPackedItems, nextWeight);

            nextCandidates.push({
              packedItems: nextPackedItems,
              remainingInstances: nextRemaining,
              extremePoints: nextPoints,
              currentTotalWeight: nextWeight,
              score: nextScore
            });

            stateExpanded = true;
          }
        }
      }

      if (!stateExpanded) {
        nextCandidates.push(state);
      }
    }

    if (nextCandidates.length === 0) {
      break;
    }

    // Sort next candidates by score descending and prune to beamWidth
    nextCandidates.sort((a, b) => b.score - a.score);

    // Check if progress was made
    const prevBestScore = beam[0]?.score || 0;
    const newBestScore = nextCandidates[0]?.score || 0;

    beam = nextCandidates.slice(0, beamWidth);

    if (newBestScore <= prevBestScore && nextCandidates.every(c => c.packedItems.length === beam[0].packedItems.length)) {
      // No further packing could be achieved
      active = false;
    }
  }

  const bestState = beam[0] || {
    packedItems: [],
    remainingInstances: availableInstances,
    extremePoints: [],
    currentTotalWeight: 0,
    score: 0
  };

  const metrics = buildContainerMetricsHelper(
    safeContainer,
    bestState.packedItems,
    availableInstances.length,
    bestState.remainingInstances.length,
    bestState.currentTotalWeight,
    'beam_search'
  );

  return {
    containerLoad: {
      containerIndex,
      container: safeContainer,
      packedItems: bestState.packedItems,
      metrics
    },
    remainingInstances: bestState.remainingInstances,
    placedInstancesCount: bestState.packedItems.length
  };
}

/**
 * Standard single container packer for heuristic algorithms
 */
function packSingleContainer(
  container: Container,
  containerIndex: number,
  availableInstances: UnpackedInstance[],
  algorithm: AlgorithmType,
  startSequenceNumber: number
): {
  containerLoad: ContainerLoad;
  remainingInstances: UnpackedInstance[];
  placedInstancesCount: number;
} {
  if (algorithm === 'block_building') {
    return packSingleContainerBlockBuilding(
      container,
      containerIndex,
      availableInstances,
      startSequenceNumber
    );
  }

  if (algorithm === 'beam_search') {
    return packSingleContainerBeamSearch(
      container,
      containerIndex,
      availableInstances,
      startSequenceNumber,
      4
    );
  }

  const genes: GAGene[] = availableInstances.map(inst => ({
    instance: inst,
    preferredRotation: 0
  }));
  return packSingleContainerWithGenes(
    container,
    containerIndex,
    genes,
    algorithm,
    startSequenceNumber,
    250
  );
}

/**
 * Evaluates the multi-objective fitness of an individual based on GA goal config
 */
function evaluateFitness(
  container: Container,
  containerLoad: ContainerLoad,
  totalCount: number,
  unplacedCount: number,
  gaConfig?: GAGoalConfig
): number {
  const m = containerLoad.metrics;
  const goal = gaConfig?.goal || 'max_volume';

  // Base factor weights (normalized)
  let wVolume = gaConfig?.volumeWeight ?? 100;
  let wCogBalance = gaConfig?.cogBalanceWeight ?? 50;
  let wLowCenter = gaConfig?.lowCenterWeight ?? 40;
  let wPriority = gaConfig?.priorityWeight ?? 30;

  if (goal === 'max_volume') {
    wVolume = 120;
    wCogBalance = 25;
    wLowCenter = 25;
    wPriority = 15;
  } else if (goal === 'min_containers') {
    // Strongly optimize to pack as many items as possible into the fewest containers
    wVolume = 100;
    wCogBalance = 20;
    wLowCenter = 20;
    wPriority = 10;
  } else if (goal === 'balance_weight') {
    // Heavily prioritize lateral symmetry and low center of gravity
    wVolume = 50;
    wCogBalance = 150;
    wLowCenter = 100;
    wPriority = 20;
  }

  // 1. Volume Utilization: 0..100 -> weighted
  const volumePts = (m.volumeUtilization * 10.0) * (wVolume / 100);

  // 2. Packed items count ratio
  const countPts = totalCount > 0 ? (m.packedCount / totalCount) * 350.0 : 0;

  // 3. Penalty for unplaced items (higher when goal is minimizing containers)
  const unplacedPenaltyMultiplier = goal === 'min_containers' ? 45.0 : 20.0;
  const unplacedPenalty = unplacedCount * unplacedPenaltyMultiplier;

  // 4. Center of Gravity balance (Y axis - lateral symmetry: 0..100 pts)
  const lateralOffset = Math.abs(m.centerOfGravity.offsetYPercent);
  const lateralScore = Math.max(0, 100.0 - (lateralOffset * 5.0)) * (wCogBalance / 100);

  // 5. Center of Gravity height (lower is better for stability): 0..80 pts
  const heightRatio = container.height > 0 ? m.centerOfGravity.z / container.height : 0.5;
  const heightStabilityScore = Math.max(0, (1.0 - heightRatio) * 80.0) * (wLowCenter / 100);

  return volumePts + countPts + lateralScore + heightStabilityScore - unplacedPenalty;
}

/**
 * Performs Order Crossover (OX1) between two parent gene arrays
 */
function orderCrossover(parent1: GAGene[], parent2: GAGene[]): GAGene[] {
  const n = parent1.length;
  if (n <= 2) return [...parent1];

  const pt1 = Math.floor(Math.random() * (n - 1));
  const pt2 = pt1 + 1 + Math.floor(Math.random() * (n - pt1 - 1));

  const child: (GAGene | null)[] = new Array(n).fill(null);
  const chosenIds = new Set<string>();

  // Copy slice from parent1
  for (let i = pt1; i <= pt2; i++) {
    child[i] = { ...parent1[i] };
    chosenIds.add(parent1[i].instance.instanceId);
  }

  // Fill remaining from parent2 in order
  let p2Idx = 0;
  for (let i = 0; i < n; i++) {
    if (child[i] === null) {
      while (p2Idx < n && chosenIds.has(parent2[p2Idx].instance.instanceId)) {
        p2Idx++;
      }
      if (p2Idx < n) {
        const geneFromP2 = parent2[p2Idx];
        // 10% chance of rotation flip mutation during inheritance
        const rot = Math.random() < 0.1 ? (geneFromP2.preferredRotation === 0 ? 1 : 0) : geneFromP2.preferredRotation;
        child[i] = {
          instance: geneFromP2.instance,
          preferredRotation: rot
        };
        chosenIds.add(geneFromP2.instance.instanceId);
        p2Idx++;
      }
    }
  }

  // Fallback check
  for (let i = 0; i < n; i++) {
    if (child[i] === null) {
      child[i] = parent1[i];
    }
  }

  return child as GAGene[];
}

/**
 * Applies genetic mutations (swap, inversion, rotation toggle, priority shift)
 */
function mutateGenes(genes: GAGene[]): GAGene[] {
  const mutated = genes.map(g => ({ ...g }));
  const n = mutated.length;
  if (n <= 1) return mutated;

  // 1. Swap Mutation (25% chance)
  if (Math.random() < 0.25) {
    const i = Math.floor(Math.random() * n);
    const j = Math.floor(Math.random() * n);
    if (i !== j) {
      const temp = mutated[i];
      mutated[i] = mutated[j];
      mutated[j] = temp;
    }
  }

  // 2. Subsequence Inversion Mutation (20% chance)
  if (n >= 4 && Math.random() < 0.20) {
    const start = Math.floor(Math.random() * (n - 2));
    const len = 2 + Math.floor(Math.random() * Math.min(6, n - start));
    const slice = mutated.slice(start, start + len).reverse();
    mutated.splice(start, len, ...slice);
  }

  // 3. Rotation Gene Toggle Mutation (25% chance)
  if (Math.random() < 0.25) {
    const idx = Math.floor(Math.random() * n);
    if (mutated[idx].instance.item.allowYaw !== false) {
      mutated[idx].preferredRotation = mutated[idx].preferredRotation === 0 ? 1 : 0;
    }
  }

  // 4. Priority Shift (15% chance - promote heavy or bulky item forward)
  if (n >= 5 && Math.random() < 0.15) {
    const fromIdx = Math.floor(n / 2) + Math.floor(Math.random() * Math.floor(n / 2));
    if (fromIdx < n) {
      const [item] = mutated.splice(fromIdx, 1);
      const toIdx = Math.floor(Math.random() * Math.floor(n / 2));
      mutated.splice(toIdx, 0, item);
    }
  }

  return mutated;
}

/**
 * Full Genetic Algorithm Packing Optimizer for a single container
 */
function packSingleContainerGA(
  container: Container,
  containerIndex: number,
  availableInstances: UnpackedInstance[],
  startSequenceNumber: number,
  gaConfig?: GAGoalConfig,
  isFastBenchmark?: boolean
): {
  containerLoad: ContainerLoad;
  remainingInstances: UnpackedInstance[];
  placedInstancesCount: number;
} {
  if (availableInstances.length <= 1) {
    return packSingleContainer(container, containerIndex, availableInstances, 'genetic_algorithm', startSequenceNumber);
  }

  const nItems = availableInstances.length;
  // Adaptive population and generation sizes for responsive UI (<100ms for benchmark, <300ms for full)
  const populationSize = isFastBenchmark 
    ? 8 
    : (nItems > 120 ? 16 : (nItems > 60 ? 20 : 24));
  const generations = isFastBenchmark 
    ? 5 
    : (nItems > 120 ? 15 : (nItems > 60 ? 20 : 25));
  const evaluationPointsLimit = isFastBenchmark 
    ? 35 
    : (nItems > 100 ? 120 : 180);

  // 1. Generate diverse initial seed individuals (prioritizing floorPlacement on the bottom layer)
  const seedChromosomes: GAGene[][] = [];
  const floorFirst = (a: UnpackedInstance, b: UnpackedInstance) => {
    const aF = a.item.floorPlacement ? 0 : 1;
    const bF = b.item.floorPlacement ? 0 : 1;
    return aF - bF;
  };

  // Seed 1: Volume Descending (BFD) - Upright
  const seed1: GAGene[] = [...availableInstances]
    .sort((a, b) => floorFirst(a, b) || b.volume - a.volume || b.item.weight - a.item.weight)
    .map(inst => ({ instance: inst, preferredRotation: 0 }));
  seedChromosomes.push(seed1);

  // Seed 2: Volume Descending - Rotated
  const seed2: GAGene[] = [...availableInstances]
    .sort((a, b) => floorFirst(a, b) || b.volume - a.volume || b.item.weight - a.item.weight)
    .map(inst => ({ instance: inst, preferredRotation: 1 }));
  seedChromosomes.push(seed2);

  // Seed 3: Weight Descending (Heavy first)
  const seed3: GAGene[] = [...availableInstances]
    .sort((a, b) => floorFirst(a, b) || b.item.weight - a.item.weight || b.volume - a.volume)
    .map(inst => ({ instance: inst, preferredRotation: 0 }));
  seedChromosomes.push(seed3);

  // Seed 4: Base Footprint Descending (Stable Floor)
  const seed4: GAGene[] = [...availableInstances]
    .sort((a, b) => floorFirst(a, b) || (b.baseArea - a.baseArea) || (b.item.weight - a.item.weight))
    .map(inst => ({ instance: inst, preferredRotation: 0 }));
  seedChromosomes.push(seed4);

  // Seed 5: Wall Building Order (Grouped by length / type)
  const seed5: GAGene[] = [...availableInstances]
    .sort((a, b) => {
      const f = floorFirst(a, b);
      if (f !== 0) return f;
      if (a.item.name !== b.item.name) return a.item.name.localeCompare(b.item.name);
      return b.volume - a.volume;
    })
    .map(inst => ({ instance: inst, preferredRotation: 0 }));
  seedChromosomes.push(seed5);

  // Seed 6: Layer Stacking (Height grouped)
  const seed6: GAGene[] = [...availableInstances]
    .sort((a, b) => floorFirst(a, b) || (b.item.height - a.item.height) || (b.baseArea - a.baseArea))
    .map(inst => ({ instance: inst, preferredRotation: 0 }));
  seedChromosomes.push(seed6);

  // Fill remainder of population with stochastic perturbations
  while (seedChromosomes.length < populationSize) {
    const baseSeed = seedChromosomes[Math.floor(Math.random() * Math.min(6, seedChromosomes.length))];
    const randomized = mutateGenes(baseSeed.map(g => ({
      instance: g.instance,
      preferredRotation: Math.random() < 0.5 ? 0 : 1
    })));
    seedChromosomes.push(randomized);
  }

  // 2. Initialize Population & Evaluate Initial Fitness
  let population: GAIndividual[] = seedChromosomes.map(genes => {
    const res = packSingleContainerWithGenes(
      container,
      containerIndex,
      genes,
      'genetic_algorithm',
      startSequenceNumber,
      evaluationPointsLimit
    );
    const fitness = evaluateFitness(
      container,
      res.containerLoad,
      availableInstances.length,
      res.remainingInstances.length,
      gaConfig
    );
    return {
      genes,
      fitness,
      containerLoad: res.containerLoad,
      remainingInstances: res.remainingInstances,
      placedInstancesCount: res.placedInstancesCount
    };
  });

  population.sort((a, b) => b.fitness - a.fitness);

  // 3. Genetic Evolution Loop
  for (let gen = 0; gen < generations; gen++) {
    const newPop: GAIndividual[] = [];

    // Elitism: Preserve top 2 best individuals
    newPop.push(population[0]);
    if (population.length > 1) {
      newPop.push(population[1]);
    }

    // Tournament Selection helper
    const selectParent = (): GAIndividual => {
      const tSize = 3;
      let best = population[Math.floor(Math.random() * population.length)];
      for (let t = 1; t < tSize; t++) {
        const cand = population[Math.floor(Math.random() * population.length)];
        if (cand.fitness > best.fitness) {
          best = cand;
        }
      }
      return best;
    };

    // Breed new generation
    while (newPop.length < populationSize) {
      const p1 = selectParent();
      const p2 = selectParent();

      let childGenes = orderCrossover(p1.genes, p2.genes);
      childGenes = mutateGenes(childGenes);

      const res = packSingleContainerWithGenes(
        container,
        containerIndex,
        childGenes,
        'genetic_algorithm',
        startSequenceNumber,
        evaluationPointsLimit
      );

      const fitness = evaluateFitness(
        container,
        res.containerLoad,
        availableInstances.length,
        res.remainingInstances.length,
        gaConfig
      );

      newPop.push({
        genes: childGenes,
        fitness,
        containerLoad: res.containerLoad,
        remainingInstances: res.remainingInstances,
        placedInstancesCount: res.placedInstancesCount
      });
    }

    newPop.sort((a, b) => b.fitness - a.fitness);
    population = newPop;
  }

  // 4. Final Best Individual Evaluation with Full Precision (up to 250 Extreme Points)
  const bestInd = population[0];
  const finalResult = packSingleContainerWithGenes(
    container,
    containerIndex,
    bestInd.genes,
    'genetic_algorithm',
    startSequenceNumber,
    250
  );

  return finalResult;
}

export const MAX_QTY_PER_ITEM = 500;

/**
 * Multi-Container 3D Packing Optimization Engine
 */
export function run3DPackingOptimizer(
  container: Container,
  cargoList: CargoItem[],
  algorithm: AlgorithmType = 'extreme_points_bfd',
  containerCount: number | 'auto' = 'auto',
  gaConfig?: GAGoalConfig,
  isFastBenchmark?: boolean
): PackingResult {
  const startTime = performance.now();

  const safeLength = Math.max(100, Number(container?.length) || 6000);
  const safeWidth = Math.max(100, Number(container?.width) || 2400);
  const safeHeight = Math.max(100, Number(container?.height) || 2400);
  const safeMaxWeight = Math.max(10, Number(container?.maxWeight) || 20000);

  const safeContainer: Container = {
    ...container,
    length: safeLength,
    width: safeWidth,
    height: safeHeight,
    maxWeight: safeMaxWeight
  };

  // Expand all active/enabled items based on quantity
  const instances: UnpackedInstance[] = [];
  const activeCargoList = cargoList.filter(cargo => cargo.enabled !== false);
  
  let safetyLimitTruncatedCount = 0;
  let rawTotalItemCount = 0;
  const truncatedItems: {
    cargoId: string;
    name: string;
    sku: string;
    requestedQty: number;
    cappedQty: number;
    truncatedQty: number;
  }[] = [];

  activeCargoList.forEach((cargo) => {
    const cL = Math.max(10, Number(cargo.length) || 100);
    const cW = Math.max(10, Number(cargo.width) || 100);
    const cH = Math.max(10, Number(cargo.height) || 100);
    const cWt = Math.max(0.1, Number(cargo.weight) || 1);
    const rawQty = Math.max(0, Number(cargo.quantity) || 0);
    rawTotalItemCount += rawQty;
    const cQty = Math.min(MAX_QTY_PER_ITEM, rawQty);

    if (rawQty > MAX_QTY_PER_ITEM) {
      const diff = rawQty - MAX_QTY_PER_ITEM;
      safetyLimitTruncatedCount += diff;
      truncatedItems.push({
        cargoId: cargo.id,
        name: cargo.name || cargo.sku || 'Cargo',
        sku: cargo.sku || '',
        requestedQty: rawQty,
        cappedQty: MAX_QTY_PER_ITEM,
        truncatedQty: diff
      });
    }

    const sanitizedCargo = {
      ...cargo,
      length: cL,
      width: cW,
      height: cH,
      weight: cWt,
      quantity: cQty
    };

    const vol = cL * cW * cH;
    const base = cL * cW;
    for (let q = 0; q < cQty; q++) {
      instances.push({
        instanceId: `${sanitizedCargo.id}_${q + 1}`,
        item: sanitizedCargo,
        volume: vol,
        baseArea: base
      });
    }
  });

  // Helper: Prioritize floor placement items so they secure floor space (z = 0)
  const compareFloorFirst = (a: UnpackedInstance, b: UnpackedInstance) => {
    const aF = a.item.floorPlacement ? 0 : 1;
    const bF = b.item.floorPlacement ? 0 : 1;
    return aF - bF;
  };

  // Sorting heuristics based on algorithm
  if (algorithm === 'weight_balanced') {
    instances.sort((a, b) => {
      const f = compareFloorFirst(a, b);
      if (f !== 0) return f;
      if ((a.item.priority || 3) !== (b.item.priority || 3)) {
        return (a.item.priority || 3) - (b.item.priority || 3);
      }
      if (b.item.weight !== a.item.weight) {
        return b.item.weight - a.item.weight;
      }
      return b.volume - a.volume;
    });
  } else if (algorithm === 'wall_building') {
    instances.sort((a, b) => {
      const f = compareFloorFirst(a, b);
      if (f !== 0) return f;
      if ((a.item.priority || 3) !== (b.item.priority || 3)) {
        return (a.item.priority || 3) - (b.item.priority || 3);
      }
      if (b.item.length !== a.item.length) {
        return b.item.length - a.item.length;
      }
      return b.volume - a.volume;
    });
  } else if (algorithm === 'layer_stacking') {
    instances.sort((a, b) => {
      const f = compareFloorFirst(a, b);
      if (f !== 0) return f;
      if (b.item.height !== a.item.height) {
        return b.item.height - a.item.height;
      }
      return b.baseArea - a.baseArea;
    });
  } else if (algorithm === 'block_building') {
    // Group identical items together, largest volume first, floor-only groups first
    instances.sort((a, b) => {
      const f = compareFloorFirst(a, b);
      if (f !== 0) return f;
      if (a.item.id !== b.item.id) {
        return b.volume - a.volume;
      }
      return (a.item.priority || 3) - (b.item.priority || 3);
    });
  } else if (algorithm === 'beam_search') {
    // Sort by volume descending with base area tie-breaker
    instances.sort((a, b) => {
      const f = compareFloorFirst(a, b);
      if (f !== 0) return f;
      if ((a.item.priority || 3) !== (b.item.priority || 3)) {
        return (a.item.priority || 3) - (b.item.priority || 3);
      }
      if (b.volume !== a.volume) {
        return b.volume - a.volume;
      }
      return b.baseArea - a.baseArea;
    });
  } else if (algorithm === 'genetic_algorithm') {
    // GA handles dynamic multi-heuristic seeding and evolutionary sorting
  } else {
    // Extreme Points Best-Fit Decreasing (Default)
    instances.sort((a, b) => {
      const f = compareFloorFirst(a, b);
      if (f !== 0) return f;
      if ((a.item.priority || 3) !== (b.item.priority || 3)) {
        return (a.item.priority || 3) - (b.item.priority || 3);
      }
      if (b.volume !== a.volume) {
        return b.volume - a.volume;
      }
      return b.item.weight - a.item.weight;
    });
  }

  const containerLoads: ContainerLoad[] = [];
  let remainingInstances = [...instances];
  let currentSeqNumber = 0;
  const maxAllowedContainers = containerCount === 'auto' ? 25 : Math.max(1, containerCount);

  let cIndex = 1;
  while (remainingInstances.length > 0 && containerLoads.length < maxAllowedContainers) {
    const prevCount = remainingInstances.length;
    
    // Choose appropriate packing executor
    const result = algorithm === 'genetic_algorithm'
      ? packSingleContainerGA(safeContainer, cIndex, remainingInstances, currentSeqNumber, gaConfig, isFastBenchmark)
      : packSingleContainer(safeContainer, cIndex, remainingInstances, algorithm, currentSeqNumber);

    // If an entire container was unable to pack even 1 single item, break to prevent infinite loops
    if (result.placedInstancesCount === 0 || result.remainingInstances.length === prevCount) {
      break;
    }

    containerLoads.push(result.containerLoad);
    currentSeqNumber += result.placedInstancesCount;
    remainingInstances = result.remainingInstances;
    cIndex++;

    // If user specified exact container count and we've reached it, stop
    if (containerCount !== 'auto' && containerLoads.length >= containerCount) {
      break;
    }
  }

  // If no containers were packed (e.g. 0 items), add 1 empty container load
  if (containerLoads.length === 0) {
    const emptyResult = packSingleContainer(safeContainer, 1, [], algorithm, 0);
    containerLoads.push(emptyResult.containerLoad);
  }

  // Aggregate all packed items across containers
  const allPackedItems: PackedItem[] = [];
  containerLoads.forEach(load => {
    allPackedItems.push(...load.packedItems);
  });

  // Calculate unplaced items summary
  const unplacedMap = new Map<string, { cargo: CargoItem; reason: 'exceeds_weight' | 'no_spatial_fit'; count: number }>();
  remainingInstances.forEach(inst => {
    const cargo = inst.item;
    const isWeightExceeded = cargo.weight > safeContainer.maxWeight;
    const existing = unplacedMap.get(cargo.id) || {
      cargo,
      reason: isWeightExceeded ? 'exceeds_weight' : 'no_spatial_fit',
      count: 0
    };
    existing.count++;
    unplacedMap.set(cargo.id, existing);
  });

  const unplacedItems: UnplacedItem[] = Array.from(unplacedMap.values()).map(val => ({
    cargoItemId: val.cargo.id,
    sku: val.cargo.sku,
    name: val.cargo.name,
    reason: val.reason,
    dimensions: { length: val.cargo.length, width: val.cargo.width, height: val.cargo.height },
    weight: val.cargo.weight,
    count: val.count
  }));

  const endTime = performance.now();
  const calculationTimeMs = Math.round(endTime - startTime);

  // Overall metrics calculation
  const totalItemCount = instances.length;
  const totalPackedCount = allPackedItems.length;
  const totalUnplacedCount = remainingInstances.length;

  const totalCapacityVolumeCbm = (containerLoads.length * safeContainer.length * safeContainer.width * safeContainer.height) / 1_000_000_000;
  const totalPackedVolumeCbm = containerLoads.reduce((sum, c) => sum + c.metrics.packedVolumeCbm, 0);
  const totalCapacityWeightKg = containerLoads.length * safeContainer.maxWeight;
  const totalPackedWeightKg = containerLoads.reduce((sum, c) => sum + c.metrics.packedWeightKg, 0);

  const overallMetrics: OverallPackingMetrics = {
    totalContainers: containerLoads.length,
    totalContainersCount: containerLoads.length,
    totalCapacityVolumeCbm,
    totalPackedVolumeCbm,
    totalCapacityWeightKg,
    totalPackedWeightKg,
    overallVolumeUtilization: totalCapacityVolumeCbm > 0 ? (totalPackedVolumeCbm / totalCapacityVolumeCbm) * 100 : 0,
    overallWeightUtilization: totalCapacityWeightKg > 0 ? (totalPackedWeightKg / totalCapacityWeightKg) * 100 : 0,
    totalItemCount,
    totalItemsCount: totalItemCount,
    rawTotalItemCount,
    safetyLimitTruncatedCount,
    totalPackedCount,
    totalUnplacedCount,
    totalCostEstimate: containerLoads.length * (safeContainer.costEstimate || 2000)
  };

  // Primary container metrics (Container #1)
  const primaryMetrics = {
    ...containerLoads[0].metrics,
    calculationTimeMs,
    totalItemCount,
    rawTotalItemCount,
    safetyLimitTruncatedCount,
    packedCount: totalPackedCount,
    unplacedCount: totalUnplacedCount,
    containersNeeded: containerLoads.length + (totalUnplacedCount > 0 ? 1 : 0)
  };

  return {
    container: safeContainer,
    containers: containerLoads,
    packedItems: allPackedItems,
    unplacedItems,
    metrics: primaryMetrics,
    overallMetrics,
    rawTotalItemCount,
    safetyLimitTruncatedCount,
    truncatedItems
  };
}

/**
 * Runs a comprehensive benchmark of all algorithms and strategy profiles on the current cargo and container set.
 * Returns an array of benchmark entries with comparative metrics, scoring, and best-in-class badges.
 */
export function runAllAlgorithmsBenchmark(
  container: Container,
  cargoList: CargoItem[],
  containerCount: number | 'auto' = 'auto'
): AlgorithmBenchmarkEntry[] {
  const configs: {
    id: string;
    algorithm: AlgorithmType;
    gaConfig?: GAGoalConfig;
    nameJa: string;
    nameEn: string;
    strategyLabelJa: string;
    strategyLabelEn: string;
    descriptionJa: string;
    descriptionEn: string;
    suitabilityJa: string;
    suitabilityEn: string;
    tag: string;
  }[] = [
    {
      id: 'extreme_points_bfd',
      algorithm: 'extreme_points_bfd',
      nameJa: 'Extreme Points 3D (幾何学最密充填)',
      nameEn: 'Extreme Points 3D (Geometric Space)',
      strategyLabelJa: '幾何学的最密探索 (Best-Fit Decreasing)',
      strategyLabelEn: 'Geometric Corner Heuristic (BFD)',
      descriptionJa: '角や隙間に大型品から順次充填する高速かつ強力な幾何学的配置アルゴリズム。',
      descriptionEn: 'High-speed geometric placement prioritizing largest volume items into optimal 3D corner coordinates.',
      suitabilityJa: '多様なサイズが混在する標準貨物、スピード重視の算出',
      suitabilityEn: 'Mixed-size standard cargo, rapid calculation',
      tag: 'HEURISTIC'
    },
    {
      id: 'ga_max_volume',
      algorithm: 'genetic_algorithm',
      gaConfig: { goal: 'max_volume', volumeWeight: 100, cogBalanceWeight: 30, lowCenterWeight: 30, priorityWeight: 20 },
      nameJa: '🧬 AI 遺伝的アルゴリズム (容積最大化)',
      nameEn: '🧬 AI Genetic Algorithm (Max Volume)',
      strategyLabelJa: '容積充填率 最大化特化探索',
      strategyLabelEn: 'Max Volume Evolutionary Search',
      descriptionJa: '多世代の突然変異・交叉により容積充填率を極限まで高める進化計算。',
      descriptionEn: 'Multi-generational evolutionary optimization maximizing volumetric packing density.',
      suitabilityJa: '容積上限まで徹底して詰め込みたい場合、高密度積載',
      suitabilityEn: 'High density packing, maximizing volume utilization',
      tag: 'AI OPTIMIZATION'
    },
    {
      id: 'ga_min_containers',
      algorithm: 'genetic_algorithm',
      gaConfig: { goal: 'min_containers', volumeWeight: 100, cogBalanceWeight: 20, lowCenterWeight: 20, priorityWeight: 10 },
      nameJa: '🧬 AI 遺伝的アルゴリズム (本数最小化)',
      nameEn: '🧬 AI Genetic Algorithm (Min Containers)',
      strategyLabelJa: 'コンテナ台数・運賃コスト削減特化',
      strategyLabelEn: 'Fleet Consolidation & Cost Reduction',
      descriptionJa: '各コンテナの積載限界まで集約し、必要コンテナ本数と輸送費を最小化。',
      descriptionEn: 'Aggressively consolidates cargo into fewest containers to minimize total freight cost.',
      suitabilityJa: '複数コンテナ案件、輸送コスト・運賃の最小化',
      suitabilityEn: 'Multi-container shipments, freight cost minimization',
      tag: 'AI OPTIMIZATION'
    },
    {
      id: 'ga_balance_weight',
      algorithm: 'genetic_algorithm',
      gaConfig: { goal: 'balance_weight', volumeWeight: 50, cogBalanceWeight: 100, lowCenterWeight: 80, priorityWeight: 20 },
      nameJa: '🧬 AI 遺伝的アルゴリズム (重量配分・軸重)',
      nameEn: '🧬 AI Genetic Algorithm (Axle & CoG)',
      strategyLabelJa: '左右均等・軸重分散特化探索',
      strategyLabelEn: 'Lateral Balance & Axle Weight Search',
      descriptionJa: '左右偏荷重（Y軸）と軸重バランスを多目的適応度関数で最適化。',
      descriptionEn: 'Balances lateral center of gravity (Y-axis) and prevents front/rear axle overloads.',
      suitabilityJa: '道路交通法規・軸重規制の厳しい陸上輸送、海上コンテナ安全輸送',
      suitabilityEn: 'Strict axle-limit road transit, maritime safety compliance',
      tag: 'AI OPTIMIZATION'
    },
    {
      id: 'wall_building',
      algorithm: 'wall_building',
      nameJa: 'ウォールビルディング (荷崩れ防止・奥面整列)',
      nameEn: 'Wall Building (Transit Stability)',
      strategyLabelJa: '奥から手前へのブロック壁状積載',
      strategyLabelEn: 'Transverse Cargo Wall Layering',
      descriptionJa: 'コンテナ奥面から手前に向けて強固な垂直壁を構築し、輸送中の荷崩れを強力に抑制。',
      descriptionEn: 'Builds stable transverse vertical cargo walls from front to back to prevent in-transit collapse.',
      suitabilityJa: '長距離海上輸送、急ブレーキや揺れによる荷崩れ防止',
      suitabilityEn: 'Long-haul ocean transit, transit collapse prevention',
      tag: 'HEURISTIC'
    },
    {
      id: 'weight_balanced',
      algorithm: 'weight_balanced',
      nameJa: '重量重心バランス重視 (偏荷重防止)',
      nameEn: 'Weight-Balanced (Center of Gravity)',
      strategyLabelJa: '重量物低重心・中央軸配置',
      strategyLabelEn: 'Heavy Items Center & Floor Alignment',
      descriptionJa: '重量物を底面かつ中央寄りに優先配置し、コンテナの転倒モーメントを低減。',
      descriptionEn: 'Places heavy cargo on the floor and along the center line to lower the center of gravity.',
      suitabilityJa: '重量差の激しい貨物群、トラック・トレーラーの横転防止',
      suitabilityEn: 'High variance item weights, rollover prevention',
      tag: 'HEURISTIC'
    },
    {
      id: 'layer_stacking',
      algorithm: 'layer_stacking',
      nameJa: 'レイヤースタッキング (均一多段積み)',
      nameEn: 'Layer Stacking (Tier Stability)',
      strategyLabelJa: '同一・類似高さの水平層形成',
      strategyLabelEn: 'Uniform Horizontal Tier Formation',
      descriptionJa: '高さを揃えた平面層を順次形成。荷役時の積み下ろし作業性と段積み安定性を両立。',
      descriptionEn: 'Creates flat horizontal layers for maximum tier stability and simplified manual loading.',
      suitabilityJa: '定型カートン、フォークリフトやパレット荷役',
      suitabilityEn: 'Uniform carton cases, pallet and forklift handling',
      tag: 'HEURISTIC'
    },
    {
      id: 'block_building',
      algorithm: 'block_building',
      nameJa: 'ブロックビルディング (組積・荷崩れ防止)',
      nameEn: 'Block-Building (Composite Blocks)',
      strategyLabelJa: '同種品ブロック化・底面完全支持',
      strategyLabelEn: 'Uniform Composite Blocks & Solid Base',
      descriptionJa: '同種貨物を直方体のブロック群にまとめて配置。100%フラットな底面支持と荷崩れ防止を最優先。',
      descriptionEn: 'Pre-assembles identical items into solid 3D composite blocks ensuring 100% base support and anti-collapse structure.',
      suitabilityJa: '同種・類似カートン多数、荷崩れ防止最優先、作業指示の明確化',
      suitabilityEn: 'High quantity uniform cartons, maximum physical stability, clear packing plans',
      tag: 'STABILITY FIRST'
    },
    {
      id: 'beam_search',
      algorithm: 'beam_search',
      nameJa: 'ビームサーチ探索 (先読み最適化)',
      nameEn: 'Beam Search (Lookahead Tree)',
      strategyLabelJa: '上位K状態の先読み同時探索',
      strategyLabelEn: 'Multi-State Lookahead Pruning',
      descriptionJa: '複数の積載候補状態を同時に保持・先読み評価し、局所解を回避しながら高速・決定論的に最適化。',
      descriptionEn: 'Maintains top K partial packing states simultaneously with multi-step lookahead evaluation for high-density stable loads.',
      suitabilityJa: '複雑な混載貨物、高充填率と計算速度・再現性の両立',
      suitabilityEn: 'Complex mixed freight, balanced volume efficiency and determinism',
      tag: 'TREE SEARCH'
    }
  ];

  const targetItemCount = cargoList
    .filter(c => c.enabled !== false)
    .reduce((s, c) => s + Math.min(MAX_QTY_PER_ITEM, Math.max(0, Number(c.quantity) || 0)), 0);

  // Run calculation for all configurations with fast benchmark mode
  const rawResults = configs.map(cfg => {
    const result = run3DPackingOptimizer(container, cargoList, cfg.algorithm, containerCount, cfg.gaConfig, true);
    const volumeUtilization = result.overallMetrics?.overallVolumeUtilization ?? result.metrics.volumeUtilization;
    const weightUtilization = result.overallMetrics?.overallWeightUtilization ?? result.metrics.weightUtilization;
    const containersCount = result.containers?.length || 1;
    const unplacedCount = result.overallMetrics?.totalUnplacedCount ?? result.metrics.unplacedCount;
    const packedCount = result.overallMetrics?.totalPackedCount ?? result.metrics.packedCount;
    const cogOffsetX = Math.abs(result.metrics.centerOfGravity.offsetXPercent);
    const cogOffsetY = Math.abs(result.metrics.centerOfGravity.offsetYPercent);

    // CoG stability score: 100 max, penalizing lateral and longitudinal offsets
    const cogStabilityScore = Math.max(0, Math.min(100, Math.round(100 - (cogOffsetX * 0.8 + cogOffsetY * 1.8))));

    // Composite score (0..100)
    // 1. Volume utilization: up to 45 pts
    const volumePts = Math.min(45, (volumeUtilization / 100) * 45);
    // 2. Unplaced penalty: subtract up to 40 pts if items are missing
    const unplacedPenalty = targetItemCount > 0 ? (unplacedCount / targetItemCount) * 40 : 0;
    // 3. Container efficiency: up to 20 pts
    const containerPts = 20 / Math.max(1, containersCount);
    // 4. CoG stability: up to 25 pts
    const stabilityPts = (cogStabilityScore / 100) * 25;
    // 5. Weight density bonus: up to 10 pts
    const weightPts = Math.min(10, (weightUtilization / 100) * 10);

    const compositeScore = Math.max(0, Math.min(100, Math.round(volumePts - unplacedPenalty + containerPts + stabilityPts + weightPts)));

    const estimatedCost = result.overallMetrics?.totalCostEstimate || (containersCount * (container.costEstimate || 2000));

    return {
      ...cfg,
      result,
      score: compositeScore,
      volumeUtilization: Math.round(volumeUtilization * 10) / 10,
      weightUtilization: Math.round(weightUtilization * 10) / 10,
      containersCount,
      unplacedCount,
      packedCount,
      totalItemsCount: targetItemCount,
      cogOffsetX: Math.round(result.metrics.centerOfGravity.offsetXPercent * 10) / 10,
      cogOffsetY: Math.round(result.metrics.centerOfGravity.offsetYPercent * 10) / 10,
      cogStabilityScore,
      calculationTimeMs: result.metrics.calculationTimeMs,
      estimatedCost
    };
  });

  // Determine Best-in-Class Winners
  let maxVolumeVal = -1;
  let minContainersVal = Infinity;
  let maxStabilityVal = -1;
  let maxScoreVal = -1;
  let minTimeVal = Infinity;

  rawResults.forEach(r => {
    if (r.volumeUtilization > maxVolumeVal) maxVolumeVal = r.volumeUtilization;
    if (r.containersCount < minContainersVal && r.unplacedCount === 0) minContainersVal = r.containersCount;
    if (r.cogStabilityScore > maxStabilityVal) maxStabilityVal = r.cogStabilityScore;
    if (r.score > maxScoreVal) maxScoreVal = r.score;
    if (r.calculationTimeMs < minTimeVal) minTimeVal = r.calculationTimeMs;
  });

  // If all have unplaced items, fallback for minContainers
  if (minContainersVal === Infinity) {
    rawResults.forEach(r => {
      if (r.containersCount < minContainersVal) minContainersVal = r.containersCount;
    });
  }

  const entries: AlgorithmBenchmarkEntry[] = rawResults.map(r => ({
    ...r,
    isBestVolume: r.volumeUtilization === maxVolumeVal,
    isBestContainers: r.containersCount === minContainersVal,
    isBestStability: r.cogStabilityScore === maxStabilityVal,
    isOverallBest: r.score === maxScoreVal,
    isFastest: r.calculationTimeMs === minTimeVal
  }));

  return entries;
}

/**
 * Selects the optimal algorithm entry based on the given user criteria
 */
export function getBestAlgorithmForCriteria(
  entries: AlgorithmBenchmarkEntry[],
  criteria: import('../types').AutoSelectCriteria = 'overall_best'
): AlgorithmBenchmarkEntry {
  if (!entries || entries.length === 0) {
    throw new Error('No benchmark entries provided');
  }

  const sorted = [...entries];

  switch (criteria) {
    case 'max_volume':
      sorted.sort((a, b) => {
        if (b.volumeUtilization !== a.volumeUtilization) return b.volumeUtilization - a.volumeUtilization;
        return a.unplacedCount - b.unplacedCount;
      });
      break;
    case 'min_containers':
      sorted.sort((a, b) => {
        if (a.containersCount !== b.containersCount) return a.containersCount - b.containersCount;
        if (a.unplacedCount !== b.unplacedCount) return a.unplacedCount - b.unplacedCount;
        return b.volumeUtilization - a.volumeUtilization;
      });
      break;
    case 'max_stability':
      sorted.sort((a, b) => {
        if (b.cogStabilityScore !== a.cogStabilityScore) return b.cogStabilityScore - a.cogStabilityScore;
        return b.score - a.score;
      });
      break;
    case 'fastest':
      sorted.sort((a, b) => a.calculationTimeMs - b.calculationTimeMs);
      break;
    case 'overall_best':
    default:
      sorted.sort((a, b) => b.score - a.score);
      break;
  }

  return sorted[0];
}



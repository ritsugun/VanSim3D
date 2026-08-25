import { Container, CargoItem } from '../types';

export const STANDARD_CONTAINERS: Container[] = [
  {
    id: '20gp',
    name: '20ft Standard Dry Container (20GP)',
    category: 'iso_sea',
    length: 5898, // mm
    width: 2352,  // mm
    height: 2393, // mm
    maxWeight: 28200, // kg payload
    tareWeight: 2300, // kg
    costEstimate: 2100,
    color: '#1e40af', // Blue
    description: 'ISO standard 20ft ocean container. Ideal for dense, heavy goods like machinery, metals, and standard pallets.'
  },
  {
    id: '40gp',
    name: '40ft Standard Dry Container (40GP)',
    category: 'iso_sea',
    length: 12032, // mm
    width: 2352,  // mm
    height: 2393, // mm
    maxWeight: 26600, // kg payload
    tareWeight: 3750, // kg
    costEstimate: 3400,
    color: '#0369a1', // Sky blue
    description: 'ISO standard 40ft ocean container. Standard for voluminous freight, e-commerce, and general dry cargo.'
  },
  {
    id: '40hc',
    name: '40ft High Cube Container (40HC)',
    category: 'iso_sea',
    length: 12032, // mm
    width: 2352,  // mm
    height: 2698, // mm (extra ~30cm height)
    maxWeight: 26400, // kg payload
    tareWeight: 3900, // kg
    costEstimate: 3650,
    color: '#0f766e', // Teal
    description: 'High Cube 40ft container with extra vertical clearance (2.7m height). Maximizes volume for lightweight bulky cargo.'
  },
  {
    id: '45hc',
    name: '45ft High Cube Container (45HC)',
    category: 'iso_sea',
    length: 13556, // mm
    width: 2352,  // mm
    height: 2698, // mm
    maxWeight: 27600, // kg payload
    tareWeight: 4800, // kg
    costEstimate: 4200,
    color: '#4338ca', // Indigo
    description: '45ft high-capacity container used for international intermodal routes with maximum CBM capacity (86 m³).'
  },
  {
    id: '53trailer',
    name: '53ft Semi-Trailer (Dry Van)',
    category: 'truck',
    length: 16000, // mm
    width: 2480,  // mm
    height: 2740, // mm
    maxWeight: 24000, // kg payload
    tareWeight: 6200, // kg
    costEstimate: 2800,
    color: '#b45309', // Amber / Brown
    description: 'Standard North American 53ft highway dry van trailer with high volume capacity (108 m³).'
  },
  {
    id: '10t_truck',
    name: '10-Ton Heavy Logistics Truck (10t 大型車)',
    category: 'truck',
    length: 9400, // mm
    width: 2350,  // mm
    height: 2400, // mm
    maxWeight: 10000, // kg payload
    tareWeight: 9800, // kg
    costEstimate: 1200,
    color: '#dc2626', // Red
    description: 'Japanese standard 10-ton wing/van heavy freight truck for domestic linehaul transport.'
  },
  {
    id: '4t_truck',
    name: '4-Ton Medium Freight Truck (4t 中型車)',
    category: 'truck',
    length: 6200, // mm
    width: 2150,  // mm
    height: 2200, // mm
    maxWeight: 4000, // kg payload
    tareWeight: 4100, // kg
    costEstimate: 750,
    color: '#ea580c', // Orange
    description: 'Versatile 4-ton freight truck for urban and regional multi-stop distribution.'
  },
  {
    id: 'eur_pallet',
    name: 'Euro Pallet (EUR-1 1200x800)',
    category: 'pallet',
    length: 1200, // mm
    width: 800,   // mm
    height: 1600, // mm max load height
    maxWeight: 1500, // kg payload
    tareWeight: 25,   // kg
    costEstimate: 60,
    color: '#854d0e', // Wooden
    description: 'Standard European pallet base unit load calculation.'
  },
  {
    id: 'us_pallet',
    name: 'US Industrial Pallet (GMA 1219x1016)',
    category: 'pallet',
    length: 1219, // mm
    width: 1016,  // mm
    height: 1800, // mm max load height
    maxWeight: 1800, // kg payload
    tareWeight: 22,   // kg
    costEstimate: 70,
    color: '#713f12', // Wood dark
    description: 'Standard Grocery Manufacturers Association (GMA) 48x40 inch pallet unit load.'
  }
];

export interface CargoPreset {
  id: string;
  nameJa: string;
  nameEn: string;
  descriptionJa: string;
  descriptionEn: string;
  recommendedContainerId: string;
  items: CargoItem[];
}

export const SAMPLE_CARGO_PRESETS: CargoPreset[] = [
  {
    id: 'hvac_equipment_csv',
    nameJa: '空調・冷熱機器 パッケージ混載 (指定CSVデータ)',
    nameEn: 'HVAC & Packaged Units (CSV Dataset)',
    descriptionJa: '空調機器・室外機・分岐ボックス（CMB/PURYシリーズ等）16品目75台の積載。指定CSVフォーマットに完全準拠。',
    descriptionEn: 'Mixed industrial shipment of 16 HVAC indoor/outdoor units and branch boxes (CMB & PURY series).',
    recommendedContainerId: '40gp',
    items: [
      {
        id: 'hvac_1',
        sku: 'CMB-M108V-KB1',
        name: 'CMB-M108V-KB1',
        width: 1100,
        height: 1230,
        length: 700,
        weight: 125,
        quantity: 1,
        minQuantity: 1,
        maxQuantity: 1,
        color: '#ef4444',
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 150,
        fragile: false,
        priority: 2
      },
      {
        id: 'hvac_2',
        sku: 'CMB-M1012V-JA1',
        name: 'CMB-M1012V-JA1',
        width: 1600,
        height: 380,
        length: 840,
        weight: 70,
        quantity: 5,
        minQuantity: 5,
        maxQuantity: 5,
        color: '#06b6d4',
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 100,
        fragile: false,
        priority: 3
      },
      {
        id: 'hvac_3',
        sku: 'CMB-M108V-JA1',
        name: 'CMB-M108V-JA1',
        width: 1380,
        height: 380,
        length: 840,
        weight: 57,
        quantity: 10,
        minQuantity: 10,
        maxQuantity: 10,
        color: '#eab308',
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 100,
        fragile: false,
        priority: 3
      },
      {
        id: 'hvac_4',
        sku: 'CMB-M1016V-JA1',
        name: 'CMB-M1016V-JA1',
        width: 1600,
        height: 380,
        length: 840,
        weight: 77,
        quantity: 15,
        minQuantity: 15,
        maxQuantity: 15,
        color: '#10b981',
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 120,
        fragile: false,
        priority: 3
      },
      {
        id: 'hvac_5',
        sku: 'CMB-M1012V-MA-SV',
        name: 'CMB-M1012V-MA-SV',
        width: 1750,
        height: 390,
        length: 1150,
        weight: 94,
        quantity: 3,
        minQuantity: 3,
        maxQuantity: 3,
        color: '#8b5cf6',
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 150,
        fragile: false,
        priority: 2
      },
      {
        id: 'hvac_6',
        sku: 'PURY-P350YNW-A2',
        name: 'PURY-P350YNW-A2',
        width: 1270,
        height: 1920,
        length: 760,
        weight: 292,
        quantity: 5,
        minQuantity: 5,
        maxQuantity: 5,
        color: '#f97316',
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 0,
        fragile: true,
        priority: 1
      },
      {
        id: 'hvac_7',
        sku: 'PURY-M200YNW-A1',
        name: 'PURY-M200YNW-A1',
        width: 950,
        height: 1920,
        length: 760,
        weight: 244,
        quantity: 2,
        minQuantity: 2,
        maxQuantity: 2,
        color: '#ec4899',
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 0,
        fragile: true,
        priority: 1
      },
      {
        id: 'hvac_8',
        sku: 'CMB-M104V-J1',
        name: 'CMB-M104V-J1',
        width: 1070,
        height: 380,
        length: 700,
        weight: 32,
        quantity: 2,
        minQuantity: 2,
        maxQuantity: 2,
        color: '#3b82f6',
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 80,
        fragile: false,
        priority: 4
      },
      {
        id: 'hvac_9',
        sku: 'CMB-M104V-KB1-A',
        name: 'CMB-M104V-KB1',
        width: 1100,
        height: 1230,
        length: 700,
        weight: 101,
        quantity: 1,
        minQuantity: 1,
        maxQuantity: 1,
        color: '#14b8a6',
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 120,
        fragile: false,
        priority: 2
      },
      {
        id: 'hvac_10',
        sku: 'CMB-M104V-KB1-B',
        name: 'CMB-M104V-KB1 (Low)',
        width: 1070,
        height: 380,
        length: 700,
        weight: 29,
        quantity: 2,
        minQuantity: 2,
        maxQuantity: 2,
        color: '#6366f1',
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 80,
        fragile: false,
        priority: 4
      },
      {
        id: 'hvac_11',
        sku: 'CMB-M106V-J1',
        name: 'CMB-M106V-J1',
        width: 1070,
        height: 380,
        length: 700,
        weight: 35,
        quantity: 5,
        minQuantity: 5,
        maxQuantity: 5,
        color: '#d97706',
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 80,
        fragile: false,
        priority: 4
      },
      {
        id: 'hvac_12',
        sku: 'CMB-M108V-J1',
        name: 'CMB-M108V-J1',
        width: 1070,
        height: 380,
        length: 700,
        weight: 39,
        quantity: 5,
        minQuantity: 5,
        maxQuantity: 5,
        color: '#059669',
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 80,
        fragile: false,
        priority: 4
      },
      {
        id: 'hvac_13',
        sku: 'CMB-M108V-KB1-C',
        name: 'CMB-M108V-KB1 (Tall)',
        width: 1100,
        height: 1230,
        length: 700,
        weight: 125,
        quantity: 3,
        minQuantity: 3,
        maxQuantity: 3,
        color: '#4f46e5',
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 150,
        fragile: false,
        priority: 2
      },
      {
        id: 'hvac_14',
        sku: 'CMB-M108V-KB1-D',
        name: 'CMB-M108V-KB1 (Flat)',
        width: 1070,
        height: 380,
        length: 700,
        weight: 37,
        quantity: 1,
        minQuantity: 1,
        maxQuantity: 1,
        color: '#e11d48',
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 80,
        fragile: false,
        priority: 4
      },
      {
        id: 'hvac_15',
        sku: 'CMB-M1012V-J1',
        name: 'CMB-M1012V-J1',
        width: 1380,
        height: 380,
        length: 840,
        weight: 58,
        quantity: 10,
        minQuantity: 10,
        maxQuantity: 10,
        color: '#0284c7',
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 100,
        fragile: false,
        priority: 3
      },
      {
        id: 'hvac_16',
        sku: 'CMB-M1012V-MA-SV-B',
        name: 'CMB-M1012V-MA-SV (5Qty)',
        width: 1750,
        height: 390,
        length: 1150,
        weight: 94,
        quantity: 5,
        minQuantity: 5,
        maxQuantity: 5,
        color: '#7c3aed',
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 150,
        fragile: false,
        priority: 2
      }
    ]
  },
  {
    id: 'ecommerce_mixed',
    nameJa: 'EC物流・混載カートン (E-Commerce Mixed)',
    nameEn: 'E-Commerce Mixed Freight (Cartons & Parcel)',
    descriptionJa: 'サイズと重量が異なる複数種類の段ボール箱。精密機器や割れ物（Fragile）を含む標準混載。',
    descriptionEn: 'Assorted e-commerce packages with various dimensions, weights, and fragile electronics.',
    recommendedContainerId: '20gp',
    items: [
      {
        id: 'box_l',
        sku: 'CTN-L-01',
        name: 'Large Master Carton (大箱)',
        length: 600,
        width: 400,
        height: 400,
        weight: 18,
        quantity: 72,
        color: '#2563eb', // Blue
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 120,
        fragile: false,
        priority: 2
      },
      {
        id: 'box_m',
        sku: 'CTN-M-02',
        name: 'Medium Goods Carton (中箱)',
        length: 400,
        width: 300,
        height: 300,
        weight: 10,
        quantity: 120,
        color: '#10b981', // Green
        allowTilt: true,
        allowRoll: true,
        allowYaw: true,
        maxStackWeight: 80,
        fragile: false,
        priority: 3
      },
      {
        id: 'box_s',
        sku: 'CTN-S-03',
        name: 'Small Parcel Carton (小箱)',
        length: 300,
        width: 200,
        height: 200,
        weight: 4,
        quantity: 150,
        color: '#f59e0b', // Amber
        allowTilt: true,
        allowRoll: true,
        allowYaw: true,
        maxStackWeight: 40,
        fragile: false,
        priority: 4
      },
      {
        id: 'box_fragile',
        sku: 'CTN-FRG-04',
        name: 'Fragile Electronics (割れ物・精密機器)',
        length: 500,
        width: 350,
        height: 250,
        weight: 7,
        quantity: 36,
        color: '#ef4444', // Red
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 0,
        fragile: true,
        priority: 5
      }
    ]
  },
  {
    id: 'machinery_auto',
    nameJa: '自動車・重機パーツ混載 (Automotive Machinery)',
    nameEn: 'Automotive & Heavy Equipment Parts',
    descriptionJa: 'エンジン部品、トランスミッション、金型など高重量の荷物と軽量パーツの組み合わせ。重心管理が重要。',
    descriptionEn: 'High-density engine blocks, metal gearboxes, and lightweight plastic filters with weight balance focus.',
    recommendedContainerId: '20gp',
    items: [
      {
        id: 'engine_crate',
        sku: 'ENG-BLOCK-X1',
        name: 'Heavy Engine Crate (エンジン木箱)',
        length: 1000,
        width: 800,
        height: 750,
        weight: 380,
        quantity: 16,
        color: '#475569', // Slate dark
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 500,
        fragile: false,
        priority: 1
      },
      {
        id: 'gearbox_box',
        sku: 'GEAR-BOX-M2',
        name: 'Gearbox Module (変速機ケース)',
        length: 600,
        width: 500,
        height: 450,
        weight: 120,
        quantity: 32,
        color: '#0284c7', // Sky
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 300,
        fragile: false,
        priority: 2
      },
      {
        id: 'light_parts',
        sku: 'FLTR-AC-03',
        name: 'Intake Air Filters (樹脂フィルター軽量箱)',
        length: 500,
        width: 400,
        height: 350,
        weight: 12,
        quantity: 80,
        color: '#14b8a6', // Teal
        allowTilt: true,
        allowRoll: true,
        allowYaw: true,
        maxStackWeight: 60,
        fragile: false,
        priority: 3
      }
    ]
  },
  {
    id: 'consumer_electronics',
    nameJa: '家電・ディスプレイ大型コンテナ (Consumer Electronics 40HC)',
    nameEn: 'Consumer Electronics & Display (40HC)',
    descriptionJa: '40ft High Cube用のテレビ・モニター・オーディオ機器。天地無用（This Side Up）指定。',
    descriptionEn: '40ft High Cube load plan for OLED TVs, display panels, soundbars, and consumer electronics.',
    recommendedContainerId: '40hc',
    items: [
      {
        id: 'tv_65',
        sku: 'OLED-TV-65',
        name: '65" OLED TV Master Box (65型テレビ天地無用)',
        length: 1600,
        width: 220,
        height: 980,
        weight: 28,
        quantity: 84,
        color: '#6366f1', // Indigo
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 90,
        fragile: true,
        priority: 2
      },
      {
        id: 'tv_43',
        sku: 'LED-TV-43',
        name: '43" Smart Display (43型ディスプレイ)',
        length: 1100,
        width: 180,
        height: 700,
        weight: 15,
        quantity: 110,
        color: '#8b5cf6', // Violet
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 75,
        fragile: true,
        priority: 3
      },
      {
        id: 'soundbar',
        sku: 'AUDIO-BAR-PRO',
        name: 'Soundbar Systems (長尺スピーカー箱)',
        length: 1050,
        width: 250,
        height: 200,
        weight: 8,
        quantity: 140,
        color: '#06b6d4', // Cyan
        allowTilt: true,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 60,
        fragile: false,
        priority: 4
      },
      {
        id: 'accessories',
        sku: 'ACC-CABLE-05',
        name: 'Accessory & Cable Cartons (周辺機器)',
        length: 450,
        width: 350,
        height: 300,
        weight: 12,
        quantity: 120,
        color: '#eab308', // Yellow
        allowTilt: true,
        allowRoll: true,
        allowYaw: true,
        maxStackWeight: 90,
        fragile: false,
        priority: 5
      }
    ]
  },
  {
    id: 'beverage_food',
    nameJa: '飲料ケース・酒類 (Beverage & Liquid Casks)',
    nameEn: 'Beverage Cases & Wine Cartons',
    descriptionJa: '均一サイズの飲料・ビールケース・ワインボトルの積載。最大積載重量と床面荷重の最適化。',
    descriptionEn: 'Uniform beverage cases, glass bottle boxes with strict floor density and max payload limits.',
    recommendedContainerId: '20gp',
    items: [
      {
        id: 'beer_case',
        sku: 'BEER-24CAN',
        name: 'Beer Cans 24-Pack Case (缶ビール24本箱)',
        length: 400,
        width: 270,
        height: 140,
        weight: 9.5,
        quantity: 480,
        color: '#f97316', // Orange
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 80,
        fragile: false,
        priority: 2
      },
      {
        id: 'wine_case',
        sku: 'WINE-12BTL',
        name: 'Wine 12-Bottle Carton (ワイン12本箱・割れ物)',
        length: 340,
        width: 260,
        height: 330,
        weight: 16.5,
        quantity: 260,
        color: '#991b1b', // Wine red
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 60,
        fragile: true,
        priority: 3
      },
      {
        id: 'water_bulk',
        sku: 'WATER-6BTL-2L',
        name: 'Mineral Water 2L x 6 (ミネラルウォーター箱)',
        length: 330,
        width: 220,
        height: 320,
        weight: 12.8,
        quantity: 320,
        color: '#0284c7', // Blue
        allowTilt: false,
        allowRoll: false,
        allowYaw: true,
        maxStackWeight: 100,
        fragile: false,
        priority: 1
      }
    ]
  }
];

export const SAMPLE_CSV_TEMPLATE = `貨物名,幅(mm),高さ(mm),奥行(mm),重量(kg),最小個数,最大個数,3D回転許可(1/0),カラー(16進数),割れ物(1/0)
CMB-M108V-KB1,1100,1230,700,125,1,1,0,#ef4444,0
CMB-M1012V-JA1,1600,380,840,70,5,5,0,#06b6d4,0
CMB-M108V-JA1,1380,380,840,57,10,10,0,#eab308,0
CMB-M1016V-JA1,1600,380,840,77,15,15,0,#10b981,0
CMB-M1012V-MA-SV,1750,390,1150,94,3,3,0,#8b5cf6,0
PURY-P350YNW-A2,1270,1920,760,292,5,5,0,#f97316,1
PURY-M200YNW-A1,950,1920,760,244,2,2,0,#ec4899,1
CMB-M104V-J1,1070,380,700,32,2,2,0,#3b82f6,0
CMB-M104V-KB1,1100,1230,700,101,1,1,0,#14b8a6,0
CMB-M104V-KB1,1070,380,700,29,2,2,0,#6366f1,0
CMB-M106V-J1,1070,380,700,35,5,5,0,#d97706,0
CMB-M108V-J1,1070,380,700,39,5,5,0,#059669,0
CMB-M108V-KB1,1100,1230,700,125,3,3,0,#4f46e5,0
CMB-M108V-KB1,1070,380,700,37,1,1,0,#e11d48,0
CMB-M1012V-J1,1380,380,840,58,10,10,0,#0284c7,0
CMB-M1012V-MA-SV,1750,390,1150,94,5,5,0,#7c3aed,0`;

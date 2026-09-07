import { CargoItem } from '../types';

export type ColorPaletteId = 'vivid_neon' | 'rainbow' | 'high_contrast' | 'jewel_bright' | 'pastel_pop';

export interface ColorPaletteTheme {
  id: ColorPaletteId;
  nameJa: string;
  nameEn: string;
  descriptionJa: string;
  descriptionEn: string;
  colors: string[];
}

/**
 * Super vivid, highly saturated neon colors that stand out in 3D views and lists
 */
export const VIVID_NEON_PALETTE: string[] = [
  '#ff0055', // Vivid Neon Rose
  '#00e5ff', // Electric Vivid Cyan
  '#ffd600', // Bright Sunshine Yellow
  '#00e676', // Electric Spring Green
  '#d946ef', // Neon Fuchsia / Magenta
  '#ff6d00', // Radiant Orange
  '#7928ca', // Electric Purple
  '#00b4d8', // Vivid Sky Blue
  '#ff1493', // Hot Pink
  '#76ff03', // Neon Lime / Chartreuse
  '#2563eb', // Royal Blue
  '#ff3d00', // Vivid Red-Orange
  '#10b981', // Emerald Mint
  '#8b5cf6', // Bright Violet
  '#ffab00', // Amber Gold
  '#06b6d4', // Bright Teal
  '#ec4899', // Cotton Candy Pink
  '#3b82f6', // Bright Cobalt
];

/**
 * Rainbow spectral progression with rich vibrant tones
 */
export const RAINBOW_PALETTE: string[] = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#facc15', // Yellow
  '#84cc16', // Lime
  '#10b981', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#d946ef', // Fuchsia
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#14b8a6', // Teal
  '#0284c7', // Sky Blue
];

/**
 * Maximally distinct complementary colors arranged for neighboring distinction
 */
export const HIGH_CONTRAST_PALETTE: string[] = [
  '#ff0055', // Vivid Magenta Red
  '#00e5ff', // Electric Cyan
  '#ffd600', // Bright Yellow
  '#7928ca', // Deep Electric Purple
  '#00e676', // Vivid Neon Green
  '#ff6d00', // Intense Orange
  '#2563eb', // Royal Blue
  '#ff1493', // Hot Pink
  '#00b4d8', // Vivid Sky
  '#76ff03', // Neon Lime
  '#d946ef', // Neon Fuchsia
  '#ff3d00', // Bright Flame
];

/**
 * Rich jewel tones with sparkling saturation
 */
export const JEWEL_BRIGHT_PALETTE: string[] = [
  '#e11d48', // Ruby Rose
  '#0284c7', // Sapphire Blue
  '#059669', // Vivid Emerald
  '#d97706', // Radiant Topaz
  '#7c3aed', // Royal Amethyst
  '#0891b2', // Aquamarine
  '#ea580c', // Garnet Orange
  '#c026d3', // Pink Tourmaline
  '#16a34a', // Peridot Green
  '#2563eb', // Cobalt Blue
  '#dc2626', // Crimson Red
  '#9333ea', // Purple Quartz
];

/**
 * Bright pastel pop with high visibility on dark backgrounds
 */
export const PASTEL_POP_PALETTE: string[] = [
  '#ff70a6', // Pastel Neon Pink
  '#ff9770', // Pastel Tangerine
  '#ffd670', // Pastel Butter Yellow
  '#e9ff70', // Pastel Lime
  '#70d6ff', // Pastel Sky Cyan
  '#b388eb', // Pastel Lavender
  '#64dfdf', // Pastel Mint Turquoise
  '#ff8fab', // Pastel Rose
  '#80ed99', // Pastel Emerald
  '#48cae4', // Pastel Cerulean
  '#f72585', // Pop Magenta
  '#4cc9f0', // Pop Cyan
];

export const COLOR_PALETTE_THEMES: ColorPaletteTheme[] = [
  {
    id: 'vivid_neon',
    nameJa: '✨ 鮮やかネオン (Vivid Neon)',
    nameEn: '✨ Vivid Neon',
    descriptionJa: '最高彩度で暗がりでも最も見やすく鮮烈なネオン発色',
    descriptionEn: 'High-saturation electric neon tones for maximum visibility',
    colors: VIVID_NEON_PALETTE,
  },
  {
    id: 'rainbow',
    nameJa: '🌈 レインボー (Rainbow)',
    nameEn: '🌈 Rainbow Spectrum',
    descriptionJa: '赤から紫へ美しく並ぶ虹色スペクトルグラデーション',
    descriptionEn: 'Smooth spectral rainbow sequence from red to violet',
    colors: RAINBOW_PALETTE,
  },
  {
    id: 'high_contrast',
    nameJa: '⚡ 高コントラスト (High Contrast)',
    nameEn: '⚡ High Contrast',
    descriptionJa: '隣り合う貨物が瞬時に見分けられる補色・対比配列',
    descriptionEn: 'Maximally distinct alternating complementary colors',
    colors: HIGH_CONTRAST_PALETTE,
  },
  {
    id: 'jewel_bright',
    nameJa: '💎 ジュエル・ブライト (Jewel Bright)',
    nameEn: '💎 Jewel Bright',
    descriptionJa: 'ルビー・サファイア・エメラルドのように輝く高彩度トーン',
    descriptionEn: 'Brilliant gemstone colors with rich saturation',
    colors: JEWEL_BRIGHT_PALETTE,
  },
  {
    id: 'pastel_pop',
    nameJa: '🎨 パステルポップ (Pastel Pop)',
    nameEn: '🎨 Pastel Pop',
    descriptionJa: '明るく清潔感のあるモダンなポップカラー',
    descriptionEn: 'Bright modern pop pastels with clean contrast',
    colors: PASTEL_POP_PALETTE,
  },
];

/**
 * Applies a selected vivid color palette to an existing list of cargo items.
 * If preserveAssignments is true and an item is duplicated by SKU, keeps consistent colors.
 */
export function applyVividColorsToCargoList(
  cargoList: CargoItem[],
  paletteId: ColorPaletteId = 'vivid_neon'
): CargoItem[] {
  const theme = COLOR_PALETTE_THEMES.find(t => t.id === paletteId) || COLOR_PALETTE_THEMES[0];
  const palette = theme.colors;

  // Map SKU to specific color to maintain consistency if same SKU occurs multiple times
  const skuColorMap = new Map<string, string>();
  let paletteIdx = 0;

  return cargoList.map((item, index) => {
    const key = (item.sku || item.name || `item_${index}`).trim().toLowerCase();
    let assignedColor = skuColorMap.get(key);

    if (!assignedColor) {
      assignedColor = palette[paletteIdx % palette.length];
      skuColorMap.set(key, assignedColor);
      paletteIdx++;
    }

    return {
      ...item,
      color: assignedColor,
    };
  });
}

/**
 * Boosts saturation and lightness of any hex color to make it look vivid
 */
export function boostHexToVivid(hex: string): string {
  // If not a valid hex, fallback to a vivid cyan
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return '#00e5ff';
  }

  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  // Boost saturation to high vibrant range (>= 90%)
  const newS = Math.min(1.0, Math.max(0.88, s * 1.4));
  // Keep lightness in vivid sweet spot (48% - 54%)
  const newL = Math.max(0.48, Math.min(0.56, l));

  // Convert HSL back to RGB
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };

  const q = newL < 0.5 ? newL * (1 + newS) : newL + newS - newL * newS;
  const p = 2 * newL - q;
  const rNew = Math.round(hue2rgb(p, q, h + 1/3) * 255);
  const gNew = Math.round(hue2rgb(p, q, h) * 255);
  const bNew = Math.round(hue2rgb(p, q, h - 1/3) * 255);

  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(rNew)}${toHex(gNew)}${toHex(bNew)}`;
}

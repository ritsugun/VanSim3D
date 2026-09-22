import React from 'react';
import { 
  X, Keyboard, Move, RotateCw, ArrowDownToLine, Undo2, Redo2, 
  Trash2, MousePointerClick, Zap, HelpCircle, CornerDownLeft, Magnet
} from 'lucide-react';
import { Language } from '../types';

interface ManualShortcutsHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
}

export const ManualShortcutsHelpModal: React.FC<ManualShortcutsHelpModalProps> = ({
  isOpen,
  onClose,
  language
}) => {
  if (!isOpen) return null;

  const isJa = language === 'ja';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center font-bold">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>{isJa ? 'マニュアル操作・キーボードショートカット一覧' : 'Manual Control & Keyboard Shortcuts'}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-mono font-medium">
                  ? / H
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isJa ? '3Dコンテナ内での貨物の配置・移動・回転・各種操作のキー割り当て' : 'Key bindings for cargo placement, movement, rotation and fine tuning'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={isJa ? '閉じる (Esc)' : 'Close (Esc)'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content - Scrollable */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          
          {/* Section 1: 移動と加速 */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200/80 dark:border-slate-700/60">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mb-2.5">
              <Move className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>{isJa ? '貨物の微調整・移動操作 (貨物選択中)' : 'Cargo Movement & Positioning (Selected Item)'}</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                <span className="text-slate-600 dark:text-slate-300">{isJa ? '前後左右の水平微動' : 'Planar Nudge (X / Y)'}</span>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">↑</kbd>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">↓</kbd>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">←</kbd>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">→</kbd>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 bg-amber-50/70 dark:bg-amber-950/30 rounded-lg border border-amber-200/80 dark:border-amber-800/40">
                <div className="flex items-center gap-1 text-amber-900 dark:text-amber-300 font-semibold">
                  <Zap className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>{isJa ? '長押しで自動加速' : 'Hold to Accelerate'}</span>
                </div>
                <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium font-mono">
                  {isJa ? '最大 6.0x 速' : 'Up to 6.0x'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                <span className="text-slate-600 dark:text-slate-300">{isJa ? '最高速ブースト移動' : 'Turbo Boost Move'}</span>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">Shift</kbd>
                  <span className="text-slate-400">+</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">矢印</kbd>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                <span className="text-slate-600 dark:text-slate-300">{isJa ? '垂直昇降 (Z軸 上下)' : 'Elevation (Z axis)'}</span>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">PgUp</kbd>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">PgDn</kbd>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: グリッドスナップ＆マグネット吸着システム */}
          <div className="bg-sky-50/70 dark:bg-sky-950/30 rounded-xl p-3 border border-sky-200/80 dark:border-sky-800/40">
            <h4 className="font-bold text-sky-900 dark:text-sky-200 flex items-center gap-1.5 mb-2.5">
              <Magnet className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>{isJa ? 'スナップ＆マグネット吸着システム (Snap & Magnetic Edge Snap)' : 'Grid Snap & Magnetic Edge Snap System'}</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg border border-sky-200/60 dark:border-sky-700/40">
                <div>
                  <span className="text-slate-800 dark:text-slate-200 font-bold">{isJa ? 'グリッドスナップ ⇄ 自由配置 切替' : 'Toggle Grid Snap / Free-form'}</span>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{isJa ? '刻み吸着とフリー配置をワンキーで即座に切り替え' : 'Toggle between snapped alignment and free placement'}</p>
                </div>
                <kbd className="px-2.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900 border border-sky-300 dark:border-sky-700 font-mono font-bold text-[11px] text-sky-900 dark:text-sky-200 shadow-xs">S</kbd>
              </div>

              <div className="flex items-center justify-between p-2 bg-cyan-50/80 dark:bg-cyan-950/30 rounded-lg border border-cyan-200/80 dark:border-cyan-800/40">
                <div>
                  <span className="text-cyan-950 dark:text-cyan-200 font-bold">{isJa ? '🧲 マグネット端面吸着 切替' : 'Toggle Magnetic Snap'}</span>
                  <p className="text-[10px] text-cyan-800 dark:text-cyan-300">{isJa ? '隣接貨物やコンテナ壁の端面へピタッと磁石吸着' : 'Snaps flush to adjacent cargo edges and container walls'}</p>
                </div>
                <kbd className="px-2.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-900 border border-cyan-300 dark:border-cyan-700 font-mono font-bold text-[11px] text-cyan-900 dark:text-cyan-200 shadow-xs">B</kbd>
              </div>

              <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg border border-sky-200/60 dark:border-sky-700/40">
                <div>
                  <span className="text-slate-800 dark:text-slate-200 font-bold">{isJa ? 'Altキー押下で一時無効・反転' : 'Hold Alt for Inverted Snap'}</span>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{isJa ? 'ドラッグ中にAltを押している間だけ完全フリー移動' : 'Temporarily disables snap while holding Alt'}</p>
                </div>
                <kbd className="px-2.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono font-bold text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">Alt</kbd>
              </div>

              <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg border border-sky-200/60 dark:border-sky-700/40">
                <div>
                  <span className="text-slate-800 dark:text-slate-200 font-bold">{isJa ? '3D視覚ガイドライン (シアン線)' : '3D Contact Guide Lines'}</span>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{isJa ? '端面吸着時に接合境界を鮮やかなシアン線と球マーカーで描画' : 'Vivid cyan lines & spheres highlight active edge contact'}</p>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-900/60 text-cyan-800 dark:text-cyan-300 font-mono font-semibold">Visual</span>
              </div>

              <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg border border-sky-200/60 dark:border-sky-700/40 col-span-1 sm:col-span-2">
                <span className="text-slate-600 dark:text-slate-300">
                  {isJa 
                    ? 'グリッド刻み幅 (1cm〜50cm) とマグネット距離 (30mm〜150mm) を個別調整可能' 
                    : 'Independently adjust grid step (1cm-50cm) and magnetic snap threshold (30mm-150mm)'}
                </span>
                <span className="text-sky-700 dark:text-sky-400 font-mono font-semibold text-[10px]">
                  {isJa ? '干渉・衝突を自動防止' : 'Auto-collision check'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: 回転・着地・再配置・奥左移動 */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200/80 dark:border-slate-700/60">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mb-2.5">
              <RotateCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>{isJa ? '奥左移動・回転・着地・再配置モード' : 'Positioning, Rotation, Landing & Reposition'}</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              {/* Q key: Snap to Back-Left */}
              <div className="flex items-center justify-between p-2 bg-amber-50/90 dark:bg-amber-950/40 rounded-lg border border-amber-300 dark:border-amber-700 shadow-2xs">
                <div>
                  <span className="text-amber-950 dark:text-amber-200 font-bold">{isJa ? '一番奥左の置ける場所へ一気に移動' : 'Snap to Furthest Back-Left'}</span>
                  <p className="text-[10px] text-amber-800 dark:text-amber-300">{isJa ? '選択貨物を干渉のない最奥左側へ自動スナップ' : 'Instantly snaps cargo to deepest back-left space'}</p>
                </div>
                <kbd className="px-2.5 py-0.5 rounded bg-amber-300 dark:bg-amber-700 border border-amber-400 dark:border-amber-600 font-mono font-bold text-[11px] text-amber-950 dark:text-amber-100 shadow-xs">Q</kbd>
              </div>

              <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                <span className="text-slate-600 dark:text-slate-300">{isJa ? '90°回転 (配置中・選択中)' : 'Rotate 90°'}</span>
                <kbd className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono font-bold text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">R</kbd>
              </div>

              <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                <span className="text-slate-600 dark:text-slate-300">{isJa ? '真下の床・荷物天面へ着地' : 'Gravity Drop to Support'}</span>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono font-bold text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">Space</kbd>
                  <span className="text-slate-400">/</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono font-bold text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">D</kbd>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800/30">
                <div>
                  <span className="text-slate-700 dark:text-slate-200 font-semibold">{isJa ? '選択貨物の「再配置」モード (移動)' : 'Reposition Cargo (Grab)'}</span>
                  <p className="text-[10px] text-slate-400">{isJa ? '再配置中に再度押すかEscでキャンセル' : 'Press again or Esc to cancel'}</p>
                </div>
                <kbd className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900 border border-amber-300 dark:border-amber-700 font-mono font-bold text-[10px] text-amber-900 dark:text-amber-200 shadow-2xs">G</kbd>
              </div>

              <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200/60 dark:border-slate-700/40 col-span-1 sm:col-span-2">
                <span className="text-slate-600 dark:text-slate-300">{isJa ? '選択貨物を未積載トレイに戻す' : 'Unload Selected Cargo'}</span>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">Del</kbd>
                  <span className="text-slate-400">/</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">Backspace</kbd>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: モード切替・履歴・キャンセル */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200/80 dark:border-slate-700/60">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mb-2.5">
              <Undo2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{isJa ? 'モード切替・履歴管理・ショートカット' : 'Modes, History & Shortcuts'}</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center justify-between p-2 bg-amber-50/90 dark:bg-amber-950/40 rounded-lg border border-amber-300 dark:border-amber-700 shadow-2xs">
                <div>
                  <span className="text-amber-950 dark:text-amber-200 font-bold">{isJa ? 'マニュアル ⇄ 通常モード切替' : 'Toggle Manual / Normal Mode'}</span>
                  <p className="text-[10px] text-amber-800 dark:text-amber-300">{isJa ? 'キー1つで手動調整のON/OFFを即座に切り替え' : 'Single key toggle for manual adjustment'}</p>
                </div>
                <kbd className="px-2.5 py-0.5 rounded bg-amber-300 dark:bg-amber-700 border border-amber-400 dark:border-amber-600 font-mono font-bold text-[11px] text-amber-950 dark:text-amber-100 shadow-xs">M</kbd>
              </div>
              <div className="flex items-center justify-between p-2 bg-amber-50/70 dark:bg-amber-950/20 rounded-lg border border-amber-300 dark:border-amber-800/40">
                <div>
                  <span className="text-amber-900 dark:text-amber-200 font-bold">{isJa ? '配置・再配置キャンセル (最優先)' : 'Cancel Placement (Top Priority)'}</span>
                  <p className="text-[10px] text-amber-700 dark:text-amber-300">{isJa ? '配置中・再配置モード時はキャンセルを最優先実行' : 'Cancels active placement mode immediately'}</p>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-800 border border-amber-400 dark:border-amber-700 font-mono font-bold text-[10px] text-amber-950 dark:text-amber-100 shadow-2xs">Esc</kbd>
                  <span className="text-slate-400 font-bold">/</span>
                  <kbd className="px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-800 border border-amber-400 dark:border-amber-700 font-mono font-bold text-[10px] text-amber-950 dark:text-amber-100 shadow-2xs">C</kbd>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                <span className="text-slate-600 dark:text-slate-300">{isJa ? '操作を元に戻す (Undo)' : 'Undo Adjustment'}</span>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">Ctrl / ⌘</kbd>
                  <span className="text-slate-400">+</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono font-bold text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">Z</kbd>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                <span className="text-slate-600 dark:text-slate-300">{isJa ? '操作をやり直す (Redo)' : 'Redo Adjustment'}</span>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">Ctrl</kbd>
                  <span className="text-slate-400">+</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono font-bold text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">Y</kbd>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                <span className="text-slate-600 dark:text-slate-300">{isJa ? 'このヘルプを表示' : 'Show This Help'}</span>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono font-bold text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">?</kbd>
                  <span className="text-slate-400">/</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-mono font-bold text-[10px] text-slate-800 dark:text-slate-200 shadow-2xs">H</kbd>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: マウス操作ガイド */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200/80 dark:border-slate-700/60">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mb-2">
              <MousePointerClick className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>{isJa ? 'マウス・タッチ操作' : 'Mouse & Touch Controls'}</span>
            </h4>
            <ul className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                <span><strong className="text-slate-800 dark:text-slate-100">{isJa ? '左クリック' : 'Left Click'}:</strong> {isJa ? '貨物の選択・配置確定' : 'Select cargo / Confirm placement'}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                <span><strong className="text-slate-800 dark:text-slate-100">{isJa ? 'ドラッグ＆ドロップ' : 'Drag & Drop'}:</strong> {isJa ? '未積載リストからコンテナ内の任意の位置へ直接積載' : 'Drag cargo directly from unplaced tray into 3D container'}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                <span><strong className="text-slate-800 dark:text-slate-100">{isJa ? '右クリック' : 'Right Click'}:</strong> {isJa ? '配置・再配置モードのキャンセル' : 'Cancel placement / reposition mode'}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                <span><strong className="text-slate-800 dark:text-slate-100">{isJa ? '右ボタンドラッグ / 2本指' : 'Right Drag / 2-Finger'}:</strong> {isJa ? '3D視点のパン（平行移動）' : 'Pan 3D camera'}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                <span><strong className="text-slate-800 dark:text-slate-100">{isJa ? 'ホイール回転' : 'Scroll Wheel'}:</strong> {isJa ? 'ズームイン / ズームアウト（未積載トレイ上では横スクロール）' : 'Zoom in / out (horizontal scroll over cargo tray)'}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                <span><strong className="text-slate-800 dark:text-slate-100">{isJa ? 'カード/パネルのドラッグ' : 'Drag Cards & Panels'}:</strong> {isJa ? '選択貨物カードや表示設定小窓のヘッダーをつかんで画面内の好きな位置へ自由に移動可能（位置初期化ボタンあり）' : 'Grab the header of cargo inspector card or controls panel to drag anywhere on screen (with Reset Pos button)'}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span><strong className="text-slate-800 dark:text-slate-100">{isJa ? '未積載荷物トレイ' : 'Cargo Tray'}:</strong> {isJa ? '重量順（重い順/軽い順）ソート、左右スクロールボタン、グリッド展開表示に対応' : 'Supports weight sorting (heavy/light), scroll buttons, and expanded grid view'}</span>
              </li>
            </ul>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {isJa ? 'Escキーまたは枠外クリックで閉じます' : 'Press Esc or click outside to close'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-black dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-bold transition-colors shadow-2xs"
          >
            {isJa ? '閉じる' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

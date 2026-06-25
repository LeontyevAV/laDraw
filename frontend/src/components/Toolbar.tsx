import type { ToolMode } from '../types'

interface ToolbarProps {
  mode: ToolMode
  isClosed: boolean
  canUndo: boolean
  canRedo: boolean
  onModeChange: (mode: ToolMode) => void
  onExportPNG: () => void
  onExportSVG: () => void
  onExportPDF: () => void
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  onLoad: () => void
}

export function Toolbar({
  mode, isClosed, canUndo, canRedo,
  onModeChange, onExportPNG, onExportSVG, onExportPDF,
  onUndo, onRedo, onSave, onLoad,
}: ToolbarProps) {
  const tools: { mode: ToolMode; label: string }[] = [
    { mode: 'draw', label: 'Рисовать' },
    { mode: 'select', label: 'Выбрать' },
    { mode: 'delete', label: 'Удалить' },
  ]

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        {tools.map(({ mode: m, label }) => (
          <button
            key={m}
            className={mode === m ? 'active' : ''}
            onClick={() => onModeChange(m)}
          >
            {label}
          </button>
        ))}
      </div>
      {isClosed && (
        <div className="toolbar-group">
          <button onClick={onSave}>Сохранить</button>
          <button onClick={onLoad}>Загрузить</button>
        </div>
      )}
      <div className="toolbar-group">
        <button onClick={onUndo} disabled={!canUndo} title="Ctrl+Z">
          Отменить<span className="kbd">Ctrl+Z</span>
        </button>
        <button onClick={onRedo} disabled={!canRedo} title="Ctrl+Shift+Z">
          Повторить<span className="kbd">Ctrl+Shift+Z</span>
        </button>
      </div>
      {isClosed && (
        <div className="toolbar-group">
          <button onClick={onExportPNG}>PNG</button>
          <button onClick={onExportSVG}>SVG</button>
          <button onClick={onExportPDF}>PDF</button>
        </div>
      )}
    </div>
  )
}

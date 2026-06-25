import { useState, useRef, useCallback, useEffect } from 'react'
import { Canvas as FabricCanvas } from 'fabric'
import { Toolbar } from './components/Toolbar'
import { PlotCanvas } from './components/PlotCanvas'
import { PropertiesPanel } from './components/PropertiesPanel'
import { ProjectsModal } from './components/ProjectsModal'
import { LogPanel } from './components/LogPanel'
import type { LogLevel, LogEntry } from './components/LogPanel'
import type { ToolMode, Point, PlotProject, ProjectResponse } from './types'
import './App.css'

const API = 'http://localhost:8000'

interface HistoryEntry {
  polygons: Point[][]
  vertices: Point[]
  isClosed: boolean
}

function ts() {
  const d = new Date()
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function App() {
  const [mode, setMode] = useState<ToolMode>('draw')
  const [isClosed, setIsClosed] = useState(false)
  const [polygons, setPolygons] = useState<Point[][]>([])
  const [project, setProject] = useState<PlotProject>({
    vertices: [],
    cadastralNumber: '',
    address: '',
  })
  const [area, setArea] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const fabricRef = useRef<FabricCanvas | null>(null)

  const addLog = useCallback((message: string, level: LogLevel = 'info') => {
    setLogs(prev => [...prev.slice(-99), { timestamp: ts(), message, level }])
  }, [])

  const projectRef = useRef(project)
  projectRef.current = project
  const closedRef = useRef(isClosed)
  closedRef.current = isClosed
  const polygonsRef = useRef(polygons)
  polygonsRef.current = polygons

  const undoStackRef = useRef<HistoryEntry[]>([])
  const redoStackRef = useRef<HistoryEntry[]>([])
  const autoSaveIdRef = useRef<number | null>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const AUTO_SAVE_KEY = 'laDraw_autoSaveId'

  const doAutoSave = useCallback(async () => {
    const p = projectRef.current
    const polys = polygonsRef.current
    const anyClosed = polys.length > 0 || (closedRef.current && p.vertices.length > 0)
    if (!anyClosed) return
    let id = autoSaveIdRef.current
    try {
      if (id) {
        const resp = await fetch(`${API}/api/projects/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cadastral_number: p.cadastralNumber,
            address: p.address,
            vertices: p.vertices,
            polygons: polys,
          }),
        })
        if (!resp.ok) throw new Error('Update failed')
        addLog(`Автосохранение #${id}`, 'success')
      } else {
        const resp = await fetch(`${API}/api/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cadastral_number: p.cadastralNumber,
            address: p.address,
            vertices: p.vertices,
            polygons: polys,
          }),
        })
        if (!resp.ok) throw new Error('Create failed')
        const saved = await resp.json()
        id = saved.id
        autoSaveIdRef.current = id
        localStorage.setItem(AUTO_SAVE_KEY, String(id))
        addLog(`Автосохранение #${id} создано`, 'success')
      }
    } catch (err) {
      console.error('Auto-save error:', err)
      addLog('Ошибка автосохранения', 'error')
    }
  }, [addLog])

  const pushHistory = useCallback(() => {
    undoStackRef.current.push({
      polygons: polygonsRef.current.map(p => [...p]),
      vertices: [...projectRef.current.vertices],
      isClosed: closedRef.current,
    })
    redoStackRef.current = []
    if (undoStackRef.current.length > 50) undoStackRef.current.shift()
  }, [])

  const canUndo = undoStackRef.current.length > 0
  const canRedo = redoStackRef.current.length > 0

  const handleVerticesChange = useCallback((vertices: Point[], polygonIdx?: number) => {
    pushHistory()
    if (polygonIdx !== undefined) {
      setPolygons(prev => { const n = [...prev]; n[polygonIdx] = vertices; return n })
    } else {
      setProject(prev => ({ ...prev, vertices }))
    }
  }, [pushHistory])

  const handleClose = useCallback(() => {
    const v = projectRef.current.vertices
    if (v.length < 3) return
    pushHistory()
    polygonsRef.current = [...polygonsRef.current, v]
    projectRef.current = { ...projectRef.current, vertices: [] }
    closedRef.current = true
    setPolygons(polygonsRef.current)
    setProject(prev => ({ ...prev, vertices: [] }))
    setIsClosed(true)
    addLog(`Полигон замкнут (${v.length} вершин)`, 'action')
    doAutoSave()
  }, [pushHistory, doAutoSave, addLog])

  const handleAreaChange = useCallback((a: number) => {
    setArea(a)
  }, [])

  const handleModeChange = useCallback((newMode: ToolMode) => {
    const modeLabels: Record<ToolMode, string> = { draw: 'Рисование', select: 'Выбор', delete: 'Удаление' }
    if (newMode === 'draw') {
      setProject({ vertices: [], cadastralNumber: '', address: '' })
      setIsClosed(false)
    }
    setMode(newMode)
    addLog(`Режим: ${modeLabels[newMode]}`, 'info')
  }, [addLog])

  const handleUndo = useCallback(() => {
    const undo = undoStackRef.current
    const redo = redoStackRef.current
    if (undo.length === 0) return
    redo.push({
      polygons: polygonsRef.current.map(p => [...p]),
      vertices: [...projectRef.current.vertices],
      isClosed: closedRef.current,
    })
    const entry = undo.pop()!
    setPolygons(entry.polygons)
    setProject(prev => ({ ...prev, vertices: entry.vertices }))
    setIsClosed(entry.isClosed)
    addLog('Отмена', 'action')
  }, [addLog])

  const handleRedo = useCallback(() => {
    const undo = undoStackRef.current
    const redo = redoStackRef.current
    if (redo.length === 0) return
    undo.push({
      polygons: polygonsRef.current.map(p => [...p]),
      vertices: [...projectRef.current.vertices],
      isClosed: closedRef.current,
    })
    const entry = redo.pop()!
    setPolygons(entry.polygons)
    setProject(prev => ({ ...prev, vertices: entry.vertices }))
    setIsClosed(entry.isClosed)
    addLog('Повтор', 'action')
  }, [addLog])

  const handleSave = useCallback(async () => {
    try {
      const resp = await fetch(`${API}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cadastral_number: project.cadastralNumber,
          address: project.address,
          vertices: project.vertices,
          polygons,
        }),
      })
      if (!resp.ok) throw new Error('Save failed')
      const saved = await resp.json()
      addLog(`Проект сохранён (id: ${saved.id})`, 'success')
      alert(`Проект сохранён (id: ${saved.id})`)
    } catch (err) {
      console.error('Save error:', err)
      addLog('Ошибка сохранения', 'error')
      alert('Ошибка сохранения. Убедитесь, что бэкенд запущен.')
    }
  }, [project, polygons, addLog])

  const handleLoad = useCallback((p: ProjectResponse) => {
    setProject({
      vertices: p.vertices,
      cadastralNumber: p.cadastral_number,
      address: p.address,
    })
    setPolygons(p.polygons || [])
    setIsClosed(true)
    setMode('select')
    setArea(0)
    setModalOpen(false)
    undoStackRef.current = []
    redoStackRef.current = []
    const polyCount = (p.polygons || []).length
    addLog(`Проект #${p.id} загружен (${polyCount} контуров)`, 'success')
  }, [addLog])

  const handleExportPNG = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = 'plot.png'
    a.click()
    addLog('Экспорт PNG', 'action')
  }, [addLog])

  const handleExportSVG = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const svg = canvas.toSVG()
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'plot.svg')
    addLog('Экспорт SVG', 'action')
  }, [addLog])

  const handleExportPDF = useCallback(async () => {
    try {
      const resp = await fetch(`${API}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cadastral_number: project.cadastralNumber,
          address: project.address,
          vertices: project.vertices,
          polygons,
        }),
      })
      if (!resp.ok) throw new Error('Save failed')
      const saved = await resp.json()
      const pdfResp = await fetch(`${API}/api/projects/${saved.id}/pdf`)
      if (!pdfResp.ok) throw new Error('PDF generation failed')
      const blob = await pdfResp.blob()
      downloadBlob(blob, `plot_${saved.id}.pdf`)
      addLog('Экспорт PDF', 'action')
    } catch (err) {
      console.error('Export PDF error:', err)
      addLog('Ошибка экспорта PDF', 'error')
      alert('Ошибка экспорта PDF. Убедитесь, что бэкенд запущен.')
    }
  }, [project, polygons, addLog])

  useEffect(() => {
    if (mode !== 'draw') {
      const anyData = polygons.length > 0 || (isClosed && project.vertices.length > 0)
      if (anyData) {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = setTimeout(doAutoSave, 300)
      }
    }
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [polygons, project.vertices, isClosed, mode, doAutoSave])

  useEffect(() => {
    const savedId = localStorage.getItem(AUTO_SAVE_KEY)
    if (!savedId) return
    const id = parseInt(savedId, 10)
    if (isNaN(id)) return
    fetch(`${API}/api/projects/${id}`)
      .then((resp) => {
        if (!resp.ok) throw new Error('Load failed')
        return resp.json()
      })
      .then((p: ProjectResponse) => {
        handleLoad(p)
        addLog(`Автозагрузка проекта #${p.id}`, 'success')
      })
      .catch(() => {
        localStorage.removeItem(AUTO_SAVE_KEY)
        addLog('Автозагрузка не удалась', 'warning')
      })
  }, [addLog])

  useEffect(() => {
    const hk = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); handleRedo(); return }
      if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); handleUndo(); return }
    }
    window.addEventListener('keydown', hk)
    return () => window.removeEventListener('keydown', hk)
  }, [handleUndo, handleRedo])

  return (
    <div className="app-layout">
      <Toolbar
        mode={mode}
        isClosed={isClosed}
        canUndo={canUndo}
        canRedo={canRedo}
        onModeChange={handleModeChange}
        onExportPNG={handleExportPNG}
        onExportSVG={handleExportSVG}
        onExportPDF={handleExportPDF}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={handleSave}
        onLoad={() => setModalOpen(true)}
      />
      <div className="main-area">
        <PlotCanvas
          mode={mode}
          vertices={project.vertices}
          polygons={polygons}
          cadastralNumber={project.cadastralNumber}
          address={project.address}
          onVerticesChange={handleVerticesChange}
          onClose={handleClose}
          onAreaChange={handleAreaChange}
          onModeChange={handleModeChange}
          canvasRef={fabricRef}
          isClosed={isClosed}
          onLog={addLog}
        />
        <PropertiesPanel
          project={project}
          polygons={polygons}
          onProjectChange={setProject}
          onVerticesChange={(v) => handleVerticesChange(v)}
          onPolygonVerticesChange={(v, idx) => handleVerticesChange(v, idx)}
          area={area}
        />
      </div>
      <LogPanel logs={logs} onClear={() => setLogs([])} />
      <ProjectsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onLoad={handleLoad}
      />
    </div>
  )
}

export default App
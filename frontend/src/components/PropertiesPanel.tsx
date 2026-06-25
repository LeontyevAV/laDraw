import { useState, useEffect } from 'react'
import type { PlotProject, Point } from '../types'

const PM = 0.05

interface PropertiesPanelProps {
  project: PlotProject
  polygons: Point[][]
  onProjectChange: (p: PlotProject) => void
  onVerticesChange: (v: Point[]) => void
  onPolygonVerticesChange: (v: Point[], polygonIdx: number) => void
  area: number
}

function CoordTable({ vertices, onChange }: { vertices: Point[]; onChange: (v: Point[]) => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  useEffect(() => { setDrafts({}) }, [vertices])

  const handleChange = (i: number, key: 'x' | 'y', val: string) => {
    setDrafts((prev) => ({ ...prev, [`${i}:${key}`]: val }))
  }

  const handleCommit = (i: number, key: 'x' | 'y') => {
    const k = `${i}:${key}`
    if (!(k in drafts)) return
    const m = parseFloat(drafts[k])
    if (isNaN(m)) return
    const px = m / PM
    const upd = [...vertices]
    upd[i] = { ...upd[i], [key]: px }
    onChange(upd)
    setDrafts((prev) => { const n = { ...prev }; delete n[k]; return n })
  }

  const getDisplay = (i: number, key: 'x' | 'y'): string => {
    const k = `${i}:${key}`
    return k in drafts ? drafts[k] : (vertices[i][key] * PM).toFixed(2)
  }

  const handleKeyDown = (i: number, key: 'x' | 'y', e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCommit(i, key)
  }

  return (
    <div className="coord-table">
      <div className="coord-header">
        <span>#</span>
        <span>X</span>
        <span>Y</span>
      </div>
      {vertices.map((pt, i) => (
        <div className="coord-row" key={i}>
          <span className="coord-idx">{i + 1}</span>
          <input
            type="number"
            step="0.01"
            value={getDisplay(i, 'x')}
            onChange={(e) => handleChange(i, 'x', e.target.value)}
            onBlur={() => handleCommit(i, 'x')}
            onKeyDown={(e) => handleKeyDown(i, 'x', e)}
          />
          <input
            type="number"
            step="0.01"
            value={getDisplay(i, 'y')}
            onChange={(e) => handleChange(i, 'y', e.target.value)}
            onBlur={() => handleCommit(i, 'y')}
            onKeyDown={(e) => handleKeyDown(i, 'y', e)}
          />
        </div>
      ))}
    </div>
  )
}

export function PropertiesPanel({ project, polygons, onProjectChange, onVerticesChange, onPolygonVerticesChange, area }: PropertiesPanelProps) {
  const totalVertices = project.vertices.length + polygons.reduce((s, p) => s + p.length, 0)

  return (
    <div className="properties-panel">
      <h3>Свойства</h3>

      <label>
        Кадастровый номер
        <input
          type="text"
          value={project.cadastralNumber}
          onChange={(e) => onProjectChange({ ...project, cadastralNumber: e.target.value })}
          placeholder="XX:XX:XXXXXX:XXXX"
        />
      </label>

      <label>
        Адрес
        <input
          type="text"
          value={project.address}
          onChange={(e) => onProjectChange({ ...project, address: e.target.value })}
          placeholder="г. Москва, ул. ..."
        />
      </label>

      <div className="property-info">
        <span>Контуров: {polygons.length + (project.vertices.length > 0 ? 1 : 0)}</span>
        <span>Вершин: {totalVertices}</span>
        {area > 0 && <span>Площадь: {area.toFixed(2)} м²</span>}
      </div>

      {project.vertices.length > 0 && (
        <div className="coord-section">
          <h4>Рисуемый контур</h4>
          <CoordTable vertices={project.vertices} onChange={onVerticesChange} />
        </div>
      )}

      {polygons.map((poly, idx) => (
        <div className="coord-section" key={idx}>
          <h4>Участок {idx + 1}</h4>
          <CoordTable vertices={poly} onChange={(v) => onPolygonVerticesChange(v, idx)} />
        </div>
      ))}
    </div>
  )
}

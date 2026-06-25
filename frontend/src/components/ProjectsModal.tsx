import { useEffect, useState } from 'react'
import type { ProjectResponse } from '../types'

const API = 'http://localhost:8000'

interface ProjectsModalProps {
  open: boolean
  onClose: () => void
  onLoad: (project: ProjectResponse) => void
}

export function ProjectsModal({ open, onClose, onLoad }: ProjectsModalProps) {
  const [projects, setProjects] = useState<ProjectResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError('')
    fetch(`${API}/api/projects`)
      .then((r) => { if (!r.ok) throw new Error('Ошибка загрузки'); return r.json() })
      .then((data) => setProjects(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open])

  const handleDelete = async (id: number) => {
    try {
      const r = await fetch(`${API}/api/projects/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Ошибка удаления')
      setProjects((prev) => prev.filter((p) => p.id !== id))
    } catch (e: any) {
      alert(e.message)
    }
  }

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Сохранённые проекты</h2>
        <div className="modal-body">
          {loading && <div className="loading">Загрузка...</div>}
          {error && <div className="empty-state">Ошибка: {error}</div>}
          {!loading && !error && projects.length === 0 && (
            <div className="empty-state">Нет сохранённых проектов</div>
          )}
          {!loading && !error && projects.length > 0 && (
            <ul className="project-list">
              {projects.map((p) => {
                const date = new Date(p.updated_at).toLocaleString()
                return (
                  <li key={p.id}>
                    <div className="info">
                      <div className="title">{p.cadastral_number || 'Без кадастрового номера'}</div>
                      <div className="sub">{p.address || 'Без адреса'} &mdash; {p.vertices.length} вершин &mdash; {date}</div>
                    </div>
                    <div className="actions">
                      <button className="btn-load" onClick={() => onLoad(p)}>Загрузить</button>
                      <button className="btn-delete" onClick={() => handleDelete(p.id)}>Удалить</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}

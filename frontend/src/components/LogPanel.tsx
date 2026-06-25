import { useEffect, useRef } from 'react'

export type LogLevel = 'info' | 'action' | 'success' | 'error' | 'warning'

export interface LogEntry {
  timestamp: string
  message: string
  level: LogLevel
}

interface LogPanelProps {
  logs: LogEntry[]
  onClear: () => void
}

const levelColors: Record<LogLevel, string> = {
  info: '#666',
  action: '#0066cc',
  success: '#28a745',
  error: '#dc3545',
  warning: '#e67e22',
}

export function LogPanel({ logs, onClear }: LogPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  return (
    <div className="log-panel">
      <div className="log-header">
        <span>Лог</span>
        <button className="log-clear" onClick={onClear}>Очистить</button>
      </div>
      <div className="log-body">
        {logs.length === 0 && <div className="log-empty">Нет событий</div>}
        {logs.slice(-5).map((entry, i) => (
          <div key={i} className="log-line" style={{ color: levelColors[entry.level] }}>
            <span className="log-time">{entry.timestamp}</span>
            <span className="log-msg">{entry.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { Canvas as FabricCanvas, Circle, Line, Polygon, Text, Point as FabricPoint } from 'fabric'
import type { ToolMode, Point } from '../types'
import type { LogLevel } from './LogPanel'

const VR = 5
const HIT = 12
const PM = 0.05
const GP = Math.round(1 / PM)
const MW = 100 / PM

function dist(a: Point, b: Point) { return Math.hypot(b.x - a.x, b.y - a.y) }
function pointToSegmentDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return dist(p, a)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy })
}
const snap = (v: number) => Math.round(v / GP) * GP

function calcArea(pts: Point[]): number {
  let a = 0; const n = pts.length
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += pts[i].x * pts[j].y; a -= pts[j].x * pts[i].y }
  return Math.abs(a) / 2
}

function center(pts: Point[]): Point {
  let cx = 0, cy = 0; for (const p of pts) { cx += p.x; cy += p.y }
  return { x: cx / pts.length, y: cy / pts.length }
}

function calcAngle(a: Point, b: Point, c: Point): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y }
  const v2 = { x: c.x - b.x, y: c.y - b.y }
  const dot = v1.x * v2.x + v1.y * v2.y
  const cross = v1.x * v2.y - v1.y * v2.x
  return Math.abs(Math.atan2(cross, dot) * 180 / Math.PI)
}

function roundToNice(v: number): number {
  if (v <= 0) return 1
  const e = Math.floor(Math.log10(v))
  const m = v / Math.pow(10, e)
  if (m < 1.5) return Math.pow(10, e)
  if (m < 3.5) return 2 * Math.pow(10, e)
  if (m < 7.5) return 5 * Math.pow(10, e)
  return 10 * Math.pow(10, e)
}

function calcScaleBar(zoom: number): { m: number; px: number } {
  const targetPx = 120
  const meters = (targetPx * PM) / zoom
  const m = roundToNice(meters)
  const px = m / PM * zoom
  return { m, px }
}

interface EdgeRef {
  polygonIdx: number
  from: number
  to: number
  line: Line
}

interface EdgesMap {
  items: EdgeRef[]
  byVertex: Map<string, EdgeRef[]>
}

interface PlotCanvasProps {
  mode: ToolMode
  vertices: Point[]
  polygons: Point[][]
  cadastralNumber: string
  address: string
  onVerticesChange: (v: Point[], polygonIdx?: number) => void
  onClose: () => void
  onAreaChange: (area: number) => void
  onModeChange: (m: ToolMode) => void
  canvasRef: React.MutableRefObject<FabricCanvas | null>
  isClosed: boolean
  onLog?: (msg: string, level?: LogLevel) => void
}

export function PlotCanvas({
  mode, vertices, polygons, cadastralNumber, address,
  onVerticesChange, onClose, onAreaChange, onModeChange,
  canvasRef, isClosed, onLog,
}: PlotCanvasProps) {
  const canvasEl = useRef<HTMLCanvasElement>(null)
  const vRef = useRef(vertices)
  vRef.current = vertices
  const polysRef = useRef(polygons)
  polysRef.current = polygons
  const modeRef = useRef(mode)
  modeRef.current = mode
  const closedRef = useRef(isClosed)
  closedRef.current = isClosed
  const edgesRef = useRef<EdgesMap>({ items: [], byVertex: new Map() })
  const spaceRef = useRef(false)
  const panningRef = useRef(false)
  const lastPanRef = useRef({ x: 0, y: 0 })
  const hintRef = useRef<Text | null>(null)
  const rubberRef = useRef<Line | null>(null)
  const scaleBarObjs = useRef<any[]>([])

  useEffect(() => {
    if (!canvasEl.current) return
    const c = new FabricCanvas(canvasEl.current, {
      width: 800, height: 600, backgroundColor: '#f8f9fa', selection: false,
    })
    canvasRef.current = c
    redraw(c, [], false, '', '', 'draw')
    updateScaleBar(c)

    c.on('mouse:wheel', (opt: { e: WheelEvent }) => {
      const delta = opt.e.deltaY
      let zoom = c.getZoom()
      zoom *= 0.999 ** delta
      zoom = Math.max(0.1, Math.min(20, zoom))
      c.zoomToPoint(new FabricPoint(opt.e.offsetX, opt.e.offsetY), zoom)
      updateScaleBar(c)
      opt.e.preventDefault()
    })

    c.on('mouse:down:before', (opt: { e: MouseEvent }) => {
      if (opt.e.button === 0 && !spaceRef.current && modeRef.current === 'select' && (opt.e.ctrlKey || opt.e.metaKey)) {
        c.selection = true
      } else {
        c.selection = false
      }
    })

    c.on('mouse:down', (opt: { e: MouseEvent }) => {
      if (opt.e.button === 0 && spaceRef.current) {
        c.selection = false
        panningRef.current = true
        lastPanRef.current = { x: opt.e.clientX, y: opt.e.clientY }
        opt.e.preventDefault()
      }
    })
    c.on('mouse:move', (opt: { e: MouseEvent }) => {
      if (panningRef.current) {
        const dx = opt.e.clientX - lastPanRef.current.x
        const dy = opt.e.clientY - lastPanRef.current.y
        c.relativePan(new FabricPoint(dx, dy))
        lastPanRef.current = { x: opt.e.clientX, y: opt.e.clientY }
      }
    })
    c.on('mouse:up', () => {
      panningRef.current = false
      c.selection = false
    })

    return () => {
      c.off('mouse:wheel')
      c.off('mouse:down:before')
      c.off('mouse:down')
      c.off('mouse:move')
      c.off('mouse:up')
      c.dispose()
      canvasRef.current = null
    }
  }, [])

  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (e.code === 'Space') { spaceRef.current = true; e.preventDefault() } }
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') spaceRef.current = false }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    c.defaultCursor = mode === 'draw' ? 'crosshair' : 'default'
  }, [mode])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    redraw(c, vertices, polygons, isClosed, cadastralNumber, address, mode)
    updateScaleBar(c)
    let total = 0
    for (const pts of polygons) total += calcArea(pts)
    if (isClosed && vertices.length > 0) total += calcArea(vertices)
    onAreaChange(total * PM * PM)
  }, [vertices, polygons, mode, isClosed, cadastralNumber, address])

  function updateScaleBar(c: FabricCanvas) {
    const zoom = c.getZoom()
    const bar = calcScaleBar(zoom)
    const h = c.height ?? 600
    scaleBarObjs.current.forEach((o: any) => c.remove(o))
    scaleBarObjs.current = []
    const bx = 20, by = h - 30
    const objs: any[] = []
    objs.push(new Line([bx, by, bx + bar.px, by], { stroke: '#666', strokeWidth: 2, selectable: false, evented: false }))
    for (const dx of [0, bar.px]) {
      objs.push(new Line([bx + dx, by - 4, bx + dx, by + 4], { stroke: '#666', strokeWidth: 1.5, selectable: false, evented: false }))
    }
    objs.push(new Text(`${bar.m} м`, {
      left: bx + bar.px / 2, top: by + 6, fontSize: 10, fill: '#666',
      originX: 'center', originY: 'top', selectable: false, evented: false,
    }))
    objs.forEach((o: any) => c.add(o))
    scaleBarObjs.current = objs
  }

  function redraw(c: FabricCanvas, pts: Point[], polys: Point[][], closed: boolean, cn: string, addr: string, m: ToolMode) {
    edgesRef.current = { items: [], byVertex: new Map() }
    hintRef.current = null
    rubberRef.current = null
    c.getObjects().forEach((o) => {
      if (scaleBarObjs.current.includes(o)) return
      c.remove(o)
    })

    const addLine = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw: number) => {
      const l = new Line([x1, y1, x2, y2], { stroke, strokeWidth: sw, selectable: false, evented: false })
      c.add(l)
      return l
    }
    const st = -MW / 2, en = MW / 2
    for (let x = st; x <= en; x += GP) addLine(x, st, x, en, '#e0e0e0', 0.5)
    for (let y = st; y <= en; y += GP) addLine(st, y, en, y, '#e0e0e0', 0.5)
    addLine(st, st, en, st, '#999', 2); addLine(en, st, en, en, '#999', 2)
    addLine(st, st, st, en, '#999', 2); addLine(st, en, en, en, '#999', 2)

    const sel = m === 'select'
    const del = m === 'delete'

    function drawPolygon(vertices: Point[], polyIdx: number, isClosed: boolean) {
      vertices.forEach((p, i) => {
        const cir = new Circle({
          left: p.x, top: p.y, radius: VR, fill: '#0066cc', stroke: '#fff', strokeWidth: 1.5,
          originX: 'center', originY: 'center',
          selectable: sel, evented: sel || del,
          hoverCursor: sel ? 'move' : del ? 'pointer' : 'default',
          hasControls: false, hasBorders: false,
          lockRotation: true, lockScalingX: true, lockScalingY: true,
        })
        cir.data = { vi: i, polygonIdx: polyIdx }
        c.add(cir)
      })

      function addEdge(i: number, j: number) {
        const l = new Line([vertices[i].x, vertices[i].y, vertices[j].x, vertices[j].y], {
          stroke: '#0066cc', strokeWidth: 2, selectable: false, evented: false,
        })
        c.add(l)
        const ref: EdgeRef = { polygonIdx: polyIdx, from: i, to: j, line: l }
        edgesRef.current.items.push(ref)
        const em = edgesRef.current.byVertex
        const ki = `${polyIdx}:${i}`, kj = `${polyIdx}:${j}`
        if (!em.has(ki)) em.set(ki, [])
        if (!em.has(kj)) em.set(kj, [])
        em.get(ki)!.push(ref)
        em.get(kj)!.push(ref)
      }

      for (let i = 0; i < vertices.length - 1; i++) addEdge(i, i + 1)
      if (isClosed && vertices.length > 0) addEdge(vertices.length - 1, 0)

      if (isClosed && vertices.length >= 3) {
        const pp = vertices.map((p) => new FabricPoint(p.x, p.y))
        c.add(new Polygon(pp, {
          fill: 'rgba(0, 102, 204, 0.1)', stroke: '#0066cc', strokeWidth: 2, selectable: false, evented: false,
        }))
        for (let i = 0; i < vertices.length; i++) {
          const a = vertices[i], b = vertices[(i + 1) % vertices.length]
          const d = Math.round(dist(a, b) * PM * 10) / 10
          c.add(new Text(`${d}м`, {
            left: (a.x + b.x) / 2, top: (a.y + b.y) / 2 - 10, fontSize: 11, fill: '#333',
            backgroundColor: 'rgba(255,255,255,0.8)', originX: 'center', originY: 'bottom',
            selectable: false, evented: false,
          }))
        }
        vertices.forEach((p, i) => {
          c.add(new Text(`${i + 1}`, {
            left: p.x + 7, top: p.y - 7, fontSize: 10, fill: '#555',
            originX: 'center', originY: 'center', selectable: false, evented: false,
          }))
        })
      }
    }

    for (let pi = 0; pi < polys.length; pi++) drawPolygon(polys[pi], pi, true)
    if (pts.length > 0) drawPolygon(pts, -1, closed)

    if (pts.length > 0 && closed) {
      const ct = center(pts)
      let ty = ct.y
      if (cn) {
        c.add(new Text(cn, { left: ct.x, top: ty, fontSize: 13, fill: '#222', fontWeight: 'bold' as any, originX: 'center', originY: 'center', selectable: false, evented: false }))
        ty += 18
      }
      if (addr) {
        c.add(new Text(addr, { left: ct.x, top: ty, fontSize: 11, fill: '#444', originX: 'center', originY: 'center', selectable: false, evented: false }))
      }
    }
    c.renderAll()
  }

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return

    if (mode === 'draw' && !isClosed) {
      const hd = (opt: { e: MouseEvent }) => {
        if (panningRef.current) return
        const p = c.getPointer(opt.e)
        const rawPt: Point = { x: p.x, y: p.y }
        const v = vRef.current
        const allPts: Point[] = [...v]
        for (const poly of polysRef.current) allPts.push(...poly)
        if (v.length >= 3 && Math.hypot(rawPt.x - v[0].x, rawPt.y - v[0].y) < HIT) {
          onClose(); onModeChange('select'); return
        }
        for (let i = 1; i < allPts.length; i++) {
          if (Math.hypot(rawPt.x - allPts[i].x, rawPt.y - allPts[i].y) < HIT) {
            onModeChange('select'); return
          }
        }
        const pt: Point = { x: snap(p.x), y: snap(p.y) }
        for (const ex of v) { if (ex.x === pt.x && ex.y === pt.y) return }
        onVerticesChange([...v, pt])
        onLog?.(`Вершина ${v.length + 1} добавлена`, 'action')
      }
      const db = () => {
        if (vRef.current.length >= 3) { onClose(); onModeChange('select') }
      }

      const hm = (opt: { e: MouseEvent }) => {
        const p = c.getPointer(opt.e)
        const v = vRef.current
        if (v.length === 0) return
        const last = v[v.length - 1]
        const rawPt: Point = { x: p.x, y: p.y }
        const d = Math.round(dist(last, rawPt) * PM * 100) / 100
        let text = `${d}м`
        if (v.length >= 2) {
          const prev = v[v.length - 2]
          const a = Math.round(calcAngle(prev, last, rawPt) * 10) / 10
          text += `, ${a}°`
        }
        if (v.length >= 3) {
          const closeD = Math.hypot(rawPt.x - v[0].x, rawPt.y - v[0].y)
          if (closeD < HIT) text = 'Замкнуть полигон'
        }
        if (!hintRef.current) {
          hintRef.current = new Text(text, {
            left: p.x + 10, top: p.y - 10, fontSize: 11, fill: '#333',
            backgroundColor: 'rgba(255,255,255,0.8)',
            originX: 'left', originY: 'bottom', selectable: false, evented: false,
          })
          c.add(hintRef.current)
        } else {
          hintRef.current.set({ text, left: p.x + 10, top: p.y - 10 })
          hintRef.current.setCoords()
        }
        if (!rubberRef.current) {
          const rl = new Line([last.x, last.y, rawPt.x, rawPt.y], {
            stroke: '#0066cc', strokeWidth: 1.5, strokeDashArray: [6, 4],
            selectable: false, evented: false,
          })
          rubberRef.current = rl
          c.add(rl)
        } else {
          rubberRef.current.set({ x1: last.x, y1: last.y, x2: rawPt.x, y2: rawPt.y })
          rubberRef.current.setCoords()
        }
        c.renderAll()
      }

      c.on('mouse:down', hd)
      c.on('mouse:dblclick', db)
      c.on('mouse:move', hm)
      return () => {
        c.off('mouse:down', hd)
        c.off('mouse:dblclick', db)
        c.off('mouse:move', hm)
        if (hintRef.current) { c.remove(hintRef.current); hintRef.current = null }
        if (rubberRef.current) { c.remove(rubberRef.current); rubberRef.current = null }
      }
    }

    if (mode === 'select') {
      const hd = (opt: { e: MouseEvent }) => {
        if (panningRef.current) return
        if (opt.e.button !== 0) return
        if (opt.e.ctrlKey || opt.e.metaKey) return
        const p = c.getPointer(opt.e)
        const allPts: Point[] = [...vRef.current]
        for (const poly of polysRef.current) allPts.push(...poly)
        const hitVertex = allPts.some(pt => Math.hypot(p.x - pt.x, p.y - pt.y) < HIT)
        if (!hitVertex) {
          c.selection = false
          panningRef.current = true
          lastPanRef.current = { x: opt.e.clientX, y: opt.e.clientY }
          opt.e.preventDefault()
        }
      }
      const hm = (opt: { target?: any }) => {
        const cir = opt.target
        if (!cir || cir.data?.vi === undefined) return
        const polyIdx = cir.data.polygonIdx as number
        const vi = cir.data.vi as number
        const np = cir.getCenterPoint()
        const key = `${polyIdx}:${vi}`
        const refs = edgesRef.current.byVertex.get(key) || []
        for (const ref of refs) {
          const l = ref.line
          let nx1 = l.x1, ny1 = l.y1, nx2 = l.x2, ny2 = l.y2
          if (ref.from === vi) { nx1 = np.x; ny1 = np.y }
          if (ref.to === vi) { nx2 = np.x; ny2 = np.y }
          l.set({ x1: nx1, y1: ny1, x2: nx2, y2: ny2, strokeDashArray: [6, 4] })
          l.setCoords()
        }
        c.renderAll()
      }
      const hmod = (opt: { target?: any }) => {
        const cir = opt.target
        if (!cir || cir.data?.vi === undefined) return
        const polyIdx = cir.data.polygonIdx as number
        const vi = cir.data.vi as number
        const np = cir.getCenterPoint()
        const pts = polyIdx === -1 ? vRef.current : polysRef.current[polyIdx]
        const snapped: Point = { x: snap(np.x), y: snap(np.y) }
        cir.set({ left: snapped.x, top: snapped.y })
        cir.setCoords()
        const key = `${polyIdx}:${vi}`
        const refs = edgesRef.current.byVertex.get(key) || []
        for (const ref of refs) ref.line.set({ strokeDashArray: undefined })
        const upd = [...pts]; upd[vi] = snapped; onVerticesChange(upd, polyIdx === -1 ? undefined : polyIdx)
        onLog?.('Вершина перемещена', 'action')
      }
      const hdbl = (opt: { e: MouseEvent }) => {
        const p = c.getPointer(opt.e)
        const raw: Point = { x: p.x, y: p.y }
        let bestDist = HIT, bestRef: EdgeRef | null = null, bestIdx = 0
        for (const ref of edgesRef.current.items) {
          const pts = ref.polygonIdx === -1 ? vRef.current : polysRef.current[ref.polygonIdx]
          const a = pts[ref.from], b = pts[ref.to]
          const d = pointToSegmentDist(raw, a, b)
          if (d < bestDist) { bestDist = d; bestRef = ref; bestIdx = ref.from + 1 }
        }
        if (!bestRef) return
        const polyIdx = bestRef.polygonIdx
        const pts = polyIdx === -1 ? vRef.current : polysRef.current[polyIdx]
        const pt: Point = { x: snap(p.x), y: snap(p.y) }
        const upd = [...pts]; upd.splice(bestIdx, 0, pt)
        onVerticesChange(upd, polyIdx === -1 ? undefined : polyIdx)
        onLog?.('Вершина добавлена на ребро', 'action')
      }
      c.on('mouse:down', hd)
      c.on('object:moving', hm)
      c.on('object:modified', hmod)
      c.on('mouse:dblclick', hdbl)
      return () => {
        c.off('mouse:down', hd)
        c.off('object:moving', hm)
        c.off('object:modified', hmod)
        c.off('mouse:dblclick', hdbl)
      }
    }

    if (mode === 'delete') {
      const hd = (opt: { e: MouseEvent; target?: any }) => {
        if (panningRef.current) return
        const cir = opt.target
        if (!cir || cir.data?.vi === undefined) return
        const polyIdx = cir.data.polygonIdx as number
        const vi = cir.data.vi as number
        const pts = polyIdx === -1 ? vRef.current : polysRef.current[polyIdx]
        if (pts.length <= 3) return
        const upd = pts.filter((_, i) => i !== vi)
        onVerticesChange(upd, polyIdx === -1 ? undefined : polyIdx)
      }
      c.on('mouse:down', hd)
      return () => c.off('mouse:down', hd)
    }
  }, [mode, isClosed, onVerticesChange, onClose, onModeChange])

  const modeLabel = mode === 'draw' ? 'Рисование' : mode === 'select' ? 'Выбор' : 'Удаление'

  return (
    <div className="canvas-container">
      <canvas ref={canvasEl} />
      <div className="mode-badge">{modeLabel}</div>
    </div>
  )
}

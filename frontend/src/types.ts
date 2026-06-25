export type ToolMode = 'draw' | 'select' | 'delete'

export interface Point {
  x: number
  y: number
}

export interface PlotProject {
  vertices: Point[]
  cadastralNumber: string
  address: string
}

export interface ProjectResponse {
  id: number
  cadastral_number: string
  address: string
  vertices: Point[]
  polygons: Point[][]
  created_at: string
  updated_at: string
}

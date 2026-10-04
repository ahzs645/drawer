import data from './clinicalCatalogData.json'

export interface ClinicalLandmarkDef {
  id: string
  label: string
  x: number
  y: number
  targetId?: string
}

export interface ClinicalAssetDef {
  key: string
  file: string
  label: string
  region: 'Body' | 'Hands' | 'Feet'
  side: 'left' | 'right' | 'unspecified'
  view: string
  source: string
  width: number
  height: number
  landmarks: ClinicalLandmarkDef[]
}

/** Generated from the same authored geometry as the SVGs and scene files. */
export const CLINICAL_ASSETS = data as ClinicalAssetDef[]

export const CLINICAL_TEMPLATES: {
  key: string
  file: string
  label: string
  region: 'Body' | 'Hands' | 'Feet' | 'All'
}[] = [
  { key: 'clinicalBody', file: 'clinical/body-chart.scene.json', label: 'Body chart — four views', region: 'Body' },
  { key: 'clinicalHands', file: 'clinical/hands-chart.scene.json', label: 'Hand chart — four views', region: 'Hands' },
  { key: 'clinicalFeet', file: 'clinical/feet-chart.scene.json', label: 'Foot chart — twelve views', region: 'Feet' },
  { key: 'clinicalAtlas', file: 'clinical/clinical-atlas.scene.json', label: 'Clinical atlas — all 20 views', region: 'All' },
]

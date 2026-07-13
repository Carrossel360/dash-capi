export interface SiteFile {
  path: string
  content: string
}

export interface GeneratedSite {
  files: SiteFile[]
  summary: string
}

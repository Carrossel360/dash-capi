export interface TaskStatusOption {
  id: string
  key: string
  name: string
  color: string
  category: string
  position: number
}

export interface TaskClientOption {
  id: string
  name: string
  services: { key: string; label: string }[]
}

export interface TaskSavedViewOption {
  id: string
  name: string
  viewType: 'board' | 'list'
  filters: TaskFilters | null
  isDefault: boolean
}

export interface TaskFilters {
  search: string
  statuses: string[]
  priorities: string[]
  assigneeId: string
  clientId: string
  serviceKey: string
  dueFrom: string
  dueTo: string
}

export const EMPTY_FILTERS: TaskFilters = {
  search: '', statuses: [], priorities: [], assigneeId: '', clientId: '', serviceKey: '', dueFrom: '', dueTo: '',
}

export function statusBg(color: string) {
  return `${color}20`
}

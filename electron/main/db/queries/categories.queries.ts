import type { Database } from 'sql.js'
import type { Category } from '../../../../shared/types'
import { queryAll, queryOne } from '../helpers'

export function getCategories(db: Database): Category[] {
  return queryAll<Category>(db, 'SELECT * FROM categories ORDER BY sort_order ASC, name ASC')
}

export function getCategoryById(db: Database, id: number): Category | undefined {
  return queryOne<Category>(db, 'SELECT * FROM categories WHERE id = ?', [id])
}

export function createCategory(
  db: Database,
  name: string,
  icon: string = 'folder',
  color: string = '#6366f1'
): Category {
  const maxOrderResult = db.exec('SELECT COALESCE(MAX(sort_order), 0) as max_order FROM categories')
  const maxOrder = maxOrderResult.length > 0 ? maxOrderResult[0].values[0][0] as number : 0

  db.run(
    'INSERT INTO categories (name, icon, color, sort_order) VALUES (?, ?, ?, ?)',
    [name, icon, color, maxOrder + 1]
  )

  const lastId = db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number
  return getCategoryById(db, lastId)!
}

export function updateCategory(
  db: Database,
  id: number,
  data: { name?: string; icon?: string; color?: string }
): void {
  const sets: string[] = []
  const values: any[] = []

  if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name) }
  if (data.icon !== undefined) { sets.push('icon = ?'); values.push(data.icon) }
  if (data.color !== undefined) { sets.push('color = ?'); values.push(data.color) }

  if (sets.length === 0) return
  values.push(id)

  db.run(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`, values)
}

export function deleteCategory(db: Database, id: number): void {
  db.run('DELETE FROM categories WHERE id = ?', [id])
}

export function reorderCategories(db: Database, ids: number[]): void {
  ids.forEach((id, index) => {
    db.run('UPDATE categories SET sort_order = ? WHERE id = ?', [index, id])
  })
}

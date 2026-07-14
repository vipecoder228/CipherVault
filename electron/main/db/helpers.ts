import type { Database } from 'sql.js'

export function queryAll<T>(db: Database, sql: string, params: any[] = []): T[] {
  const result = db.exec(sql, params)
  if (result.length === 0) return []
  const columns = result[0].columns
  return result[0].values.map((row) => {
    const obj: any = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return obj as T
  })
}

export function queryOne<T>(db: Database, sql: string, params: any[] = []): T | undefined {
  const rows = queryAll<T>(db, sql, params)
  return rows[0]
}

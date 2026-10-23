/**
 * Product CSV import for the admin panel.
 * Accepts the same format the admin "export products" tab produces
 * (see src/lib/product-export.ts) and simple hand-made CSVs:
 * required columns are `name` (or `slug`) and `price`; everything else is optional.
 */

export type ImportRow = Record<string, string>
export type ProductPayload = Record<string, any>

export type ParsedImport = {
  payloads: Array<ProductPayload & { _hasId: boolean }>
  errors: Array<{ line: number; message: string }>
  columns: string[]
}

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { cell += '"'; i++ }
        else inQuotes = false
      } else cell += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',' ) {
      row.push(cell); cell = ''
    } else if (ch === '\n') {
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function unquoteCell(value: string): string {
  // Export adds a leading ' to guard spreadsheet formulas — strip it back.
  const stripped = value.replace(/^'/, '')
  return stripped.trim()
}

function toNumber(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') return undefined
  const n = Number(value.replace(/[,\s]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

function toBool(value: string | undefined): boolean | undefined {
  if (value == null || value.trim() === '') return undefined
  const v = value.trim().toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(v)) return true
  if (['false', '0', 'no', 'n'].includes(v)) return false
  return undefined
}

function toJson(value: string | undefined): unknown {
  if (value == null || value.trim() === '') return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function parseProductCsv(text: string): ParsedImport {
  const table = parseCsv(text)
  if (!table.length) return { payloads: [], errors: [{ line: 1, message: 'File khali hai (empty file)' }], columns: [] }
  const headers = table[0].map((h) => unquoteCell(h).toLowerCase())
  const idx = (key: string) => headers.indexOf(key)
  const has = (key: string) => idx(key) >= 0

  const payloads: Array<ProductPayload & { _hasId: boolean }> = []
  const errors: Array<{ line: number; message: string }> = []

  for (let r = 1; r < table.length; r++) {
    const cells = table[r]
    const get = (key: string) => has(key) ? unquoteCell(cells[idx(key)] ?? '') : ''
    const line = r + 1
    const name = get('name')
    const slug = get('slug')
    if (!name && !slug) {
      errors.push({ line, message: 'Naam (name) column khali hai — row skip ki gayi' })
      continue
    }
    const price = toNumber(get('price'))
    if (price == null) {
      errors.push({ line, message: 'Price theek nahi (number hona chahiye) — row skip ki gayi' })
      continue
    }
    const id = toNumber(get('id'))
    const finalName = name || slug
    const payload: ProductPayload & { _hasId: boolean } = { _hasId: false }

    if (id != null) { payload.id = id; payload._hasId = true }
    payload.name = finalName
    payload.slug = slug || slugify(finalName) + '-' + Date.now().toString(36) + '-' + r
    payload.price = price
    const compareAt = toNumber(get('compare_at'))
    if (compareAt != null) payload.compare_at = compareAt
    const stock = toNumber(get('stock'))
    if (stock != null) payload.stock = stock
    const sold = toNumber(get('sold'))
    if (sold != null) payload.sold = sold
    const rating = toNumber(get('rating'))
    if (rating != null) payload.rating = rating
    const reviewCount = toNumber(get('review_count'))
    if (reviewCount != null) payload.review_count = reviewCount
    const featured = toBool(get('featured'))
    if (featured != null) payload.featured = featured
    const category = get('category')
    if (category) payload.category = category.toLowerCase()
    const subcategory = get('subcategory')
    if (subcategory) payload.subcategory = subcategory
    const brand = get('brand')
    if (brand) payload.brand = brand
    const shortDescription = get('short_description')
    if (shortDescription) payload.short_description = shortDescription
    const description = get('description')
    if (description) payload.description = description

    const highlights = toJson(get('highlights'))
    if (highlights != null) payload.highlights = highlights
    const specs = toJson(get('specs'))
    if (specs != null) payload.specs = specs
    const variants = toJson(get('variants'))
    if (variants != null) payload.variants = variants

    // Images: image column, image_1..image_N columns, or a pipe/newline-separated list.
    const gallery: string[] = []
    const main = get('image')
    if (main) gallery.push(main)
    const imageCount = toNumber(get('image_count')) ?? 0
    for (let i = 1; i <= Math.max(imageCount, 12); i++) {
      const img = get(`image_${i}`)
      if (img) gallery.push(img)
    }
    const listField = get('images')
    if (listField && !listField.startsWith('[')) {
      listField.split(/[|\n]+/).forEach((u) => { if (u.trim()) gallery.push(u.trim()) })
    }
    const unique = [...new Set(gallery.filter((u) => /^(https?:\/\/|\/)/.test(u)))]
    if (unique.length) {
      payload.image = unique[0]
      payload.images = unique
    }

    payloads.push(payload)
  }

  return { payloads, errors, columns: headers }
}

export async function importProductsToSupabase(
  parsed: ParsedImport,
  upsert: (chunk: ProductPayload[], conflictKey: 'id' | 'slug') => Promise<string | null>,
  onProgress?: (done: number, total: number) => void,
): Promise<{ saved: number; errors: string[] }> {
  const withId = parsed.payloads.filter((p) => p._hasId)
  const withoutId = parsed.payloads.filter((p) => !p._hasId)
  const clean = (p: ProductPayload) => { const { _hasId, ...rest } = p; return rest }
  const savedRows: string[] = []
  const CHUNK = 50
  let done = 0

  for (const [group, key] of [[withId, 'id'], [withoutId, 'slug']] as const) {
    for (let i = 0; i < group.length; i += CHUNK) {
      const chunk = group.slice(i, i + CHUNK).map(clean)
      const error = await upsert(chunk, key)
      if (error) {
        // Chunk failed — retry one-by-one so one bad row doesn't sink the batch.
        for (const payload of chunk) {
          const single = await upsert([payload], key)
          savedRows.push(single ?? '')
        }
      } else {
        savedRows.push('', ...Array<string>(chunk.length - 1).fill(''))
      }
      done += chunk.length
      onProgress?.(done, parsed.payloads.length)
    }
  }
  return { saved: savedRows.filter((e) => e === '').length, errors: savedRows.filter((e) => e !== '') }
}

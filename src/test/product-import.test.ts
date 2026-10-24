import { describe, expect, it } from 'vitest'
import { importProductsToSupabase, parseCsv, parseProductCsv } from '@/lib/product-import'

const EXPORT_CSV = [
  'id,slug,name,brand,category,subcategory,price,compare_at,stock,featured,image,image_count,image_1,image_2',
  '7,electric-kettle,"Stainless ""Steel"" Electric Kettle",Noor,home-kitchen,,3299,3999,15,true,https://img.test/kettle.jpg,2,https://img.test/kettle.jpg,https://img.test/kettle2.jpg',
  ',,"Lawn Suit 3pc",,women,summer,4999,,,false,https://img.test/lawn.jpg,1,https://img.test/lawn.jpg,',
  ',,"Bad Row",,women,,not-a-number,,,false,,,',
].join('\n')

describe('parseCsv', () => {
  it('handles BOM, CRLF, quoted cells and escaped quotes', () => {
    const rows = parseCsv('\uFEFF"name","a,b","say ""hi"""\r\n"1","2","3"')
    expect(rows).toEqual([['name', 'a,b', 'say "hi"'], ['1', '2', '3']])
  })
})

describe('parseProductCsv', () => {
  it('parses an exported row into an id-upsert payload with gallery images', () => {
    const { payloads, errors } = parseProductCsv(EXPORT_CSV)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.line).toBe(4)
    expect(payloads).toHaveLength(2)
    const first = payloads[0]!
    expect(first.id).toBe(7)
    expect(first._hasId).toBe(true)
    expect(first.name).toBe('Stainless "Steel" Electric Kettle')
    expect(first.price).toBe(3299)
    expect(first.compare_at).toBe(3999)
    expect(first.stock).toBe(15)
    expect(first.featured).toBe(true)
    expect(first.category).toBe('home-kitchen')
    expect(first.images).toEqual(['https://img.test/kettle.jpg', 'https://img.test/kettle2.jpg'])
    expect(first.image).toBe('https://img.test/kettle.jpg')
  })

  it('builds a slug-upsert payload when id is missing and reports bad price rows', () => {
    const { payloads, errors } = parseProductCsv(EXPORT_CSV)
    const second = payloads[1]!
    expect(second._hasId).toBe(false)
    expect(second.slug.startsWith('lawn-suit-3pc')).toBe(true)
    expect(second.featured).toBe(false)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.message).toContain('Price')
  })
})

describe('importProductsToSupabase', () => {
  it('saves chunked rows and counts per-row failures', async () => {
    const { payloads } = parseProductCsv(EXPORT_CSV)
    const upserted: Array<{ rows: unknown[]; key: string }> = []
    let failOnce = true
    const result = await importProductsToSupabase(
      { payloads, errors: [], columns: [] },
      async (rows, key) => {
        upserted.push({ rows, key })
        if (failOnce && key === 'id') { failOnce = false; return 'duplicate key' }
        return null
      },
    )
    expect(result.saved).toBe(payloads.length)
    expect(result.failed).toBe(0)
    expect(upserted.some((u) => u.key === 'id' && (u.rows[0] as { id?: number }).id === 7)).toBe(true)
    expect(upserted.some((u) => u.key === 'slug')).toBe(true)
  })
})

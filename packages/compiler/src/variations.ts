import { view, Writer } from './binary'

const EMBEDDED_PEAK_TUPLE = 0x8000
const PRIVATE_POINT_NUMBERS = 0x2000
const DELTAS_ARE_ZERO = 0x80
const DELTAS_ARE_WORDS = 0x40

function packDeltas(w: Writer, deltas: number[]): void {
  for (let i = 0; i < deltas.length; i += 64) {
    const run = deltas.slice(i, i + 64)
    if (run.every(d => d === 0)) {
      w.u8(DELTAS_ARE_ZERO | (run.length - 1))
    }
    else if (run.every(d => d >= -128 && d <= 127)) {
      w.u8(run.length - 1)
      run.forEach(d => w.u8(d))
    }
    else {
      w.u8(DELTAS_ARE_WORDS | (run.length - 1))
      run.forEach(d => w.u16(d))
    }
  }
}

/** One glyph's variation data: a tuple per master its components move at, each moving every point. */
function glyphVariations(deltas: [number, number][][], peaks: number[][], advances: number[]): Uint8Array {
  const tuples = deltas.flatMap((points, m) => {
    const advance = advances[m] ?? 0
    // The right phantom moves by the whole string's width change. Keep gvar
    // metrics consistent with HVAR, including readers that only consult gvar.
    const phantoms: [number, number][] = [[0, 0], [advance, 0], [0, 0], [0, 0]]
    return advance || points.some(([x, y]) => x || y) ? [{ points: [...points, ...phantoms], peak: peaks[m]! }] : []
  })
  if (!tuples.length)
    return new Uint8Array()
  const data = tuples.map(({ points }) => {
    // Point numbers: 0, every point.
    const w = new Writer().u8(0)
    packDeltas(w, points.map(([x]) => x))
    packDeltas(w, points.map(([, y]) => y))
    return w.finish()
  })
  const w = new Writer().u16(tuples.length)
  const dataOffset = w.slot16()
  tuples.forEach(({ peak }, t) => {
    w.u16(data[t]!.length).u16(EMBEDDED_PEAK_TUPLE | PRIVATE_POINT_NUMBERS)
    peak.forEach(coord => w.u16(coord * 0x4000))
  })
  w.link16(dataOffset)
  data.forEach(d => w.bytes(d))
  if (w.length % 2)
    w.u8(0)
  return w.finish()
}

/**
 * Appends the new glyphs' variation data to gvar: `deltas` moves each one's
 * components at each master, which `peaks` places in normalized coordinates.
 */
export function appendGlyphVariations(gvar: Uint8Array, deltas: [number, number][][][], peaks: number[][], advances: number[][]): Uint8Array {
  const d = view(gvar)
  const axisCount = d.getUint16(4)
  const sharedCount = d.getUint16(6)
  const glyphCount = d.getUint16(12)
  const long = (d.getUint16(14) & 1) === 1
  const arrayOffset = d.getUint32(16)
  const offset = (g: number): number => long ? d.getUint32(20 + g * 4) : d.getUint16(20 + g * 2) * 2
  const shared = gvar.subarray(d.getUint32(8), d.getUint32(8) + sharedCount * axisCount * 2)
  const glyphs = [
    ...Array.from({ length: glyphCount }, (_, g) => gvar.subarray(arrayOffset + offset(g), arrayOffset + offset(g + 1))),
    ...deltas.map((glyph, i) => glyphVariations(glyph, peaks, advances[i]!)),
  ]
  const sharedOffset = 20 + (glyphs.length + 1) * 4
  const w = new Writer().u16(1).u16(0).u16(axisCount).u16(sharedCount).u32(sharedOffset).u16(glyphs.length).u16(1).u32(sharedOffset + shared.length)
  let at = 0
  for (const glyph of glyphs) {
    w.u32(at)
    at += glyph.length
  }
  w.u32(at).bytes(shared)
  glyphs.forEach(glyph => w.bytes(glyph))
  return w.finish()
}

/**
 * Gives each new glyph in HVAR or VVAR the advance variation of the base glyph
 * it is `like`. The `sideMaps` after the advance map in the header (side
 * bearings, and VVAR's vertical origins), which would not cover the new
 * glyphs, go. Without an advance map, the table goes: gvar's phantom points
 * then vary the advances.
 */
export function appendAdvanceMap(table: Uint8Array, sideMaps: number, baseCount: number, likes: number[]): Uint8Array | undefined {
  const d = view(table)
  const map = d.getUint32(8)
  if (!map)
    return undefined
  const format = d.getUint8(map)
  const entryFormat = d.getUint8(map + 1)
  const size = ((entryFormat >> 4) & 3) + 1
  const count = format === 0 ? d.getUint16(map + 2) : d.getUint32(map + 2)
  const first = map + (format === 0 ? 4 : 6)
  // A glyph past the map takes its last entry.
  const entry = (g: number): Uint8Array => table.subarray(first + Math.min(g, count - 1) * size, first + Math.min(g, count - 1) * size + size)
  const w = new Writer().bytes(table)
  while (w.length % 2)
    w.u8(0)
  const start = w.length
  // Format 0, which every reader knows: a glyph count fits its 16 bits.
  w.u8(0).u8(entryFormat).u16(baseCount + likes.length)
  for (let g = 0; g < baseCount; g++)
    w.bytes(entry(g))
  likes.forEach(g => w.bytes(entry(g)))
  const out = w.finish()
  view(out).setUint32(8, start)
  for (let i = 0; i < sideMaps; i++)
    view(out).setUint32(12 + i * 4, 0)
  return out
}

/** Decode the optional packed map, retaining implicit and repeated-last indices. */
function advanceIndices(table: Uint8Array): (glyph: number) => number {
  const d = view(table)
  const map = d.getUint32(8)
  // An absent advance map means outer index 0, inner index = glyph ID.
  if (!map)
    return glyph => glyph
  const format = d.getUint8(map)
  const entryFormat = d.getUint8(map + 1)
  const size = ((entryFormat >> 4) & 3) + 1
  const innerBits = (entryFormat & 15) + 1
  const count = format === 0 ? d.getUint16(map + 2) : d.getUint32(map + 2)
  return (glyph) => {
    const at = map + (format === 0 ? 4 : 6) + Math.min(glyph, count - 1) * size
    let packed = 0
    for (let i = 0; i < size; i++)
      packed = packed * 256 + d.getUint8(at + i)
    return Math.floor(packed / 2 ** innerBits) * 0x10000 + packed % 2 ** innerBits
  }
}

const signedDelta = (d: DataView, at: number, bytes: number): number => bytes === 4 ? d.getInt32(at) : bytes === 2 ? d.getInt16(at) : d.getInt8(at)

/** An item's sparse deltas keyed by the shared region index. */
function advanceDeltas(table: Uint8Array, index: number): Map<number, number> {
  const d = view(table)
  const store = d.getUint32(4)
  const dataCount = d.getUint16(store + 6)
  const deltas = new Map<number, number>()
  const outer = Math.floor(index / 0x10000)
  if (outer >= dataCount)
    return deltas
  const offset = d.getUint32(store + 8 + outer * 4)
  if (!offset)
    return deltas
  const at = store + offset
  const inner = index % 0x10000
  if (inner >= d.getUint16(at))
    return deltas
  const words = d.getUint16(at + 2)
  const long = (words & 0x8000) !== 0
  const wordCount = words & 0x7FFF
  const regions = d.getUint16(at + 4)
  let row = at + 6 + regions * 2 + inner * (regions + wordCount) * (long ? 2 : 1)
  for (let i = 0; i < regions; i++) {
    const bytes = (i < wordCount ? 2 : 1) * (long ? 2 : 1)
    const delta = signedDelta(d, row, bytes)
    if (delta)
      deltas.set(d.getUint16(at + 6 + i * 2), delta)
    row += bytes
  }
  return deltas
}

/** Preserve the original variation store and append the combined delta rows. */
function appendAdvanceStore(w: Writer, table: Uint8Array, rows: Map<number, number>[]): void {
  const d = view(table)
  const store = d.getUint32(4)
  const dataCount = d.getUint16(store + 6)
  if (dataCount >= 0xFFFF || rows.length > 0xFFFF)
    throw new Error('too many horizontal advance variation rows')
  const regions = [...new Set(rows.flatMap(row => [...row.keys()]))].sort((a, b) => a - b)
  const newStore = w.length
  // Add one data offset to the header, copying all original regions and
  // subtables byte-for-byte with their relative offsets shifted by four.
  const headerSize = 8 + dataCount * 4
  w.u16(1).u32(d.getUint32(store + 2) + 4).u16(dataCount + 1)
  for (let i = 0; i < dataCount; i++) {
    const offset = d.getUint32(store + 8 + i * 4)
    w.u32(offset ? offset + 4 : 0)
  }
  const addedOffset = w.slot32()
  w.bytes(table.subarray(store + headerSize))
  w.link32(addedOffset, newStore)
  w.u16(rows.length).u16(regions.length).u16(regions.length)
  regions.forEach(region => w.u16(region))
  for (const row of rows) {
    for (const region of regions) {
      const delta = row.get(region) ?? 0
      if (delta < -0x8000 || delta > 0x7FFF)
        throw new Error('a horizontal advance variation delta exceeds 16 bits')
      w.u16(delta)
    }
  }
  w.set32(4, newStore)
}

/** HVAR deltas are additive by region: a ligature takes the sum of its bases. */
export function appendHorizontalAdvances(table: Uint8Array, baseCount: number, bases: number[][]): Uint8Array {
  const d = view(table)
  const store = d.getUint32(4)
  const dataCount = d.getUint16(store + 6)
  const noVariation = 0xFFFFFFFF
  const indexOf = advanceIndices(table)
  const cached = new Map<number, Map<number, number>>()
  const deltasOf = (index: number): Map<number, number> => {
    let deltas = cached.get(index)
    if (!deltas) {
      deltas = advanceDeltas(table, index)
      cached.set(index, deltas)
    }
    return deltas
  }
  const rows: Map<number, number>[] = []
  const rowIndices = new Map<string, number>()
  const indices = bases.map((glyphs) => {
    if (glyphs.length === 1)
      return indexOf(glyphs[0]!)
    const sum = new Map<number, number>()
    for (const glyph of glyphs) {
      for (const [region, delta] of deltasOf(indexOf(glyph)))
        sum.set(region, (sum.get(region) ?? 0) + delta)
    }
    const nonzero = [...sum].filter(([, delta]) => delta).sort((a, b) => a[0] - b[0])
    if (!nonzero.length)
      return noVariation
    const key = JSON.stringify(nonzero)
    let inner = rowIndices.get(key)
    if (inner === undefined) {
      inner = rows.length
      rowIndices.set(key, inner)
      rows.push(new Map(nonzero))
    }
    return dataCount * 0x10000 + inner
  })
  const w = new Writer().bytes(table)
  if (rows.length)
    appendAdvanceStore(w, table, rows)
  const newMap = w.length
  // Four bytes per entry: full 16-bit outer and inner indices.
  w.u8(0).u8(0x3F).u16(baseCount + bases.length)
  for (let glyph = 0; glyph < baseCount; glyph++)
    w.u32(indexOf(glyph))
  indices.forEach(index => w.u32(index))
  w.set32(8, newMap)
  // Outline-derived bearings cover new glyphs as well as the preserved bases.
  w.set32(12, 0)
  w.set32(16, 0)
  return w.finish()
}

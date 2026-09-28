/** A ZIP entry. `data` is consumed only when the response stream is read. */
export type ZipEntry = {
  path: string
  data: Uint8Array | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>
  modifiedAt?: Date
}

type CentralEntry = {
  name: Uint8Array
  crc: number
  size: bigint
  offset: bigint
  time: number
  date: number
}

const encoder = new TextEncoder()
const MAX_CHUNK = 64 * 1024

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true)
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true)
}

function writeU64(view: DataView, offset: number, value: bigint): void {
  if (value < BigInt(0) || value > BigInt('0xffffffffffffffff')) throw new Error('ZIP size limit exceeded')
  view.setBigUint64(offset, value, true)
}

function validPath(path: string): Uint8Array {
  // ZIP uses forward slashes. Reject traversal and ambiguous names before emitting a header.
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\0') ||
      path.split('/').some((part) => !part || part === '.' || part === '..') ||
      /^[a-zA-Z]:/.test(path)) {
    throw new Error(`Unsafe ZIP path: ${path}`)
  }
  const name = encoder.encode(path)
  if (name.length > 0xffff) throw new Error('ZIP path is too long')
  return name
}

function dosDateTime(value?: Date): { date: number; time: number } {
  const date = value ?? new Date('1980-01-01T00:00:00.000Z')
  if (Number.isNaN(date.getTime())) throw new Error('Invalid ZIP modification date')
  const year = Math.max(1980, Math.min(2107, date.getUTCFullYear()))
  return {
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1),
  }
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  return crc >>> 0
})

function updateCrc(crc: number, chunk: Uint8Array): number {
  for (const byte of chunk) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]
  return crc >>> 0
}

function localHeader(name: Uint8Array, time: number, date: number): Uint8Array {
  const bytes = new Uint8Array(30 + name.length + 20)
  const view = new DataView(bytes.buffer)
  writeU32(view, 0, 0x04034b50)
  writeU16(view, 4, 45) // ZIP64
  writeU16(view, 6, 0x0808) // UTF-8 path and trailing data descriptor
  writeU16(view, 8, 0) // Stored, without compression
  writeU16(view, 10, time)
  writeU16(view, 12, date)
  writeU32(view, 18, 0xffffffff)
  writeU32(view, 22, 0xffffffff)
  writeU16(view, 26, name.length)
  writeU16(view, 28, 20)
  bytes.set(name, 30)
  const extra = 30 + name.length
  writeU16(view, extra, 0x0001) // ZIP64 extra field
  writeU16(view, extra + 2, 16)
  // Sizes are unknown until the stream has been consumed.
  return bytes
}

function dataDescriptor(crc: number, size: bigint): Uint8Array {
  const bytes = new Uint8Array(24)
  const view = new DataView(bytes.buffer)
  writeU32(view, 0, 0x08074b50)
  writeU32(view, 4, crc)
  writeU64(view, 8, size)
  writeU64(view, 16, size)
  return bytes
}

function centralHeader(entry: CentralEntry): Uint8Array {
  const bytes = new Uint8Array(46 + entry.name.length + 28)
  const view = new DataView(bytes.buffer)
  writeU32(view, 0, 0x02014b50)
  writeU16(view, 4, 45)
  writeU16(view, 6, 45)
  writeU16(view, 8, 0x0808)
  writeU16(view, 10, 0)
  writeU16(view, 12, entry.time)
  writeU16(view, 14, entry.date)
  writeU32(view, 16, entry.crc)
  writeU32(view, 20, 0xffffffff)
  writeU32(view, 24, 0xffffffff)
  writeU16(view, 28, entry.name.length)
  writeU16(view, 30, 28)
  writeU32(view, 42, 0xffffffff)
  bytes.set(entry.name, 46)
  const extra = 46 + entry.name.length
  writeU16(view, extra, 0x0001)
  writeU16(view, extra + 2, 24)
  writeU64(view, extra + 4, entry.size)
  writeU64(view, extra + 12, entry.size)
  writeU64(view, extra + 20, entry.offset)
  return bytes
}

function endRecords(count: bigint, centralSize: bigint, centralOffset: bigint, zip64Offset: bigint): Uint8Array {
  const bytes = new Uint8Array(56 + 20 + 22)
  const view = new DataView(bytes.buffer)
  writeU32(view, 0, 0x06064b50)
  writeU64(view, 4, BigInt(44))
  writeU16(view, 12, 45)
  writeU16(view, 14, 45)
  writeU64(view, 24, count)
  writeU64(view, 32, count)
  writeU64(view, 40, centralSize)
  writeU64(view, 48, centralOffset)
  writeU32(view, 56, 0x07064b50)
  writeU64(view, 64, zip64Offset)
  writeU32(view, 72, 1)
  writeU32(view, 76, 0x06054b50)
  writeU16(view, 84, 0xffff)
  writeU16(view, 86, 0xffff)
  writeU32(view, 88, 0xffffffff)
  writeU32(view, 92, 0xffffffff)
  return bytes
}

async function* dataChunks(data: ZipEntry['data']): AsyncGenerator<Uint8Array> {
  if (data instanceof Uint8Array) {
    for (let offset = 0; offset < data.length; offset += MAX_CHUNK) {
      yield data.subarray(offset, offset + MAX_CHUNK)
    }
    return
  }
  if (data instanceof ReadableStream) {
    const reader = data.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return
        if (!(value instanceof Uint8Array)) throw new Error('ZIP entry data must be bytes')
        for (let offset = 0; offset < value.length; offset += MAX_CHUNK) {
          yield value.subarray(offset, offset + MAX_CHUNK)
        }
      }
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
  for await (const value of data) {
    if (!(value instanceof Uint8Array)) throw new Error('ZIP entry data must be bytes')
    for (let offset = 0; offset < value.length; offset += MAX_CHUNK) {
      yield value.subarray(offset, offset + MAX_CHUNK)
    }
  }
}

/** Stream a UTF-8 ZIP64 archive, keeping only central-directory metadata in memory. */
export function createZipStream(entries: Iterable<ZipEntry> | AsyncIterable<ZipEntry>): ReadableStream<Uint8Array> {
  async function* generate(): AsyncGenerator<Uint8Array> {
    const directory: CentralEntry[] = []
    const paths = new Set<string>()
  let offset = BigInt(0)
    for await (const entry of entries) {
      const name = validPath(entry.path)
      if (paths.has(entry.path)) throw new Error(`Duplicate ZIP path: ${entry.path}`)
      paths.add(entry.path)
      const { date, time } = dosDateTime(entry.modifiedAt)
      const localOffset = offset
      const header = localHeader(name, time, date)
      yield header
      offset += BigInt(header.length)

      let crc = 0xffffffff
      let size = BigInt(0)
      for await (const chunk of dataChunks(entry.data)) {
        crc = updateCrc(crc, chunk)
        size += BigInt(chunk.length)
        yield chunk
        offset += BigInt(chunk.length)
      }
      crc = (crc ^ 0xffffffff) >>> 0
      const descriptor = dataDescriptor(crc, size)
      yield descriptor
      offset += BigInt(descriptor.length)
      directory.push({ name, crc, size, offset: localOffset, time, date })
    }

    const centralOffset = offset
    for (const entry of directory) {
      const header = centralHeader(entry)
      yield header
      offset += BigInt(header.length)
    }
    const end = endRecords(BigInt(directory.length), offset - centralOffset, centralOffset, offset)
    yield end
  }

  const iterator = generate()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await iterator.next()
        if (done) controller.close()
        else controller.enqueue(value)
      } catch (error) {
        controller.error(error)
      }
    },
    async cancel() { await iterator.return(undefined) },
  })
}

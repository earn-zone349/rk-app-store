/**
 * Phase 6, steps 42 & 49: metadata extraction + permission display.
 *
 * An .apk file is a zip archive. Inside it, AndroidManifest.xml is stored
 * in Android's compiled "AXML" binary format (not plain text) — this is
 * the same format `aapt dump xmltree` decodes on the command line. This
 * module implements a minimal, purpose-built AXML reader entirely in the
 * browser: unzip the APK (via fflate), find AndroidManifest.xml, walk its
 * binary structure, and pull out exactly the fields the store needs
 * (package name, version, SDK range, permission list) — not a full
 * general-purpose XML-to-DOM converter.
 *
 * Format reference (AOSP frameworks/base, ResourceTypes.h — public, and
 * the same structure every open-source AXML reader implements):
 *   - Every chunk starts with a ResChunk_header: type(u16) headerSize(u16)
 *     size(u32), little-endian throughout.
 *   - Chunk 0x0003 (RES_XML_TYPE) wraps the whole file.
 *   - Chunk 0x0001 is the string pool: every string used anywhere in the
 *     document (tag names, attribute names, attribute string values) is
 *     interned here once and referenced everywhere else by index.
 *   - Chunks 0x0100-0x0104 are the actual XML node stream (namespaces,
 *     start/end tags, cdata).
 *
 * LIMITATION (documented, not hidden): this reads attribute/element names
 * straight out of the string pool by index, which is how every real-world
 * AAPT/AAPT2-compiled manifest stores them and is what makes this simple
 * approach work. A manifest deliberately mangled by an obfuscator to strip
 * the string pool would defeat this — in that case parseManifest() returns
 * null and the caller should treat it as "couldn't extract metadata," not
 * as a security pass/fail on its own (the magic-byte + hash + VirusTotal
 * checks in apkValidation.ts / security.ts don't depend on this parsing).
 */

import { unzipSync } from 'fflate'

export interface ParsedManifest {
  packageName: string | null
  versionCode: number | null
  versionName: string | null
  minSdkVersion: number | null
  targetSdkVersion: number | null
  permissions: string[]
}

const CHUNK_STRING_POOL = 0x0001
const CHUNK_XML_START_NAMESPACE = 0x0100
const CHUNK_XML_END_NAMESPACE = 0x0101
const CHUNK_XML_START_ELEMENT = 0x0102
const CHUNK_XML_END_ELEMENT = 0x0103
const CHUNK_XML_CDATA = 0x0104

const UTF8_FLAG = 0x100
const TYPE_STRING = 0x03

interface ChunkHeader {
  type: number
  headerSize: number
  size: number
}

function readChunkHeader(view: DataView, offset: number): ChunkHeader {
  return {
    type: view.getUint16(offset, true),
    headerSize: view.getUint16(offset + 2, true),
    size: view.getUint32(offset + 4, true),
  }
}

/** Reads the whole string pool chunk into a plain string[] indexed exactly like the AXML file indexes it. */
function readStringPool(view: DataView, chunkStart: number, header: ChunkHeader): string[] {
  const stringCount = view.getUint32(chunkStart + 8, true)
  const flags = view.getUint32(chunkStart + 16, true)
  const stringsStart = view.getUint32(chunkStart + 20, true)
  const isUtf8 = (flags & UTF8_FLAG) !== 0

  const strings: string[] = []
  const offsetsStart = chunkStart + header.headerSize
  const dataStart = chunkStart + stringsStart

  for (let i = 0; i < stringCount; i++) {
    const strOffset = dataStart + view.getUint32(offsetsStart + i * 4, true)
    strings.push(isUtf8 ? readUtf8String(view, strOffset) : readUtf16String(view, strOffset))
  }

  return strings
}

function readUtf16String(view: DataView, offset: number): string {
  // Length is normally a single u16 (character count). Values above 0x7FFF
  // use a two-u16 encoding with the high bit set on the first unit — rare
  // in practice for manifest strings (tag/attribute names, package ids,
  // permission strings are all short), but handled for correctness.
  let pos = offset
  let length = view.getUint16(pos, true)
  pos += 2
  if (length & 0x8000) {
    length = ((length & 0x7fff) << 16) | view.getUint16(pos, true)
    pos += 2
  }
  const codeUnits: number[] = []
  for (let i = 0; i < length; i++) {
    codeUnits.push(view.getUint16(pos, true))
    pos += 2
  }
  return String.fromCharCode(...codeUnits)
}

function readUtf8String(view: DataView, offset: number): string {
  // UTF-8 pool entries store TWO length fields: character length, then
  // byte length (each independently using the same 1-or-2-byte varint
  // encoding) — we only need the byte length to know how much to decode.
  let pos = offset
  const skipLength = (p: number) => {
    const first = view.getUint8(p)
    return first & 0x80 ? p + 2 : p + 1
  }
  pos = skipLength(pos) // character length, unused
  const byteLenFirst = view.getUint8(pos)
  let byteLength: number
  if (byteLenFirst & 0x80) {
    byteLength = ((byteLenFirst & 0x7f) << 8) | view.getUint8(pos + 1)
    pos += 2
  } else {
    byteLength = byteLenFirst
    pos += 1
  }
  const bytes = new Uint8Array(view.buffer, view.byteOffset + pos, byteLength)
  return new TextDecoder('utf-8').decode(bytes)
}

interface RawAttribute {
  nameIdx: number
  rawValueIdx: number
  dataType: number
  data: number
}

function resolveString(strings: string[], idx: number): string | null {
  return idx >= 0 && idx < strings.length ? strings[idx] : null
}

/** A permission/package/version string always comes through as one of these two encodings — same rule for every attribute in the format. */
function attributeValue(attr: RawAttribute, strings: string[]): string | number | null {
  if (attr.rawValueIdx !== 0xffffffff) return resolveString(strings, attr.rawValueIdx)
  if (attr.dataType === TYPE_STRING) return resolveString(strings, attr.data)
  // Everything else (TYPE_INT_DEC, TYPE_INT_HEX, TYPE_INT_BOOLEAN, ...) —
  // for the fields we care about (versionCode, minSdkVersion,
  // targetSdkVersion) the raw integer is exactly the value we want.
  return attr.data
}

/**
 * Walks the AXML node stream and pulls out just the elements/attributes
 * this store cares about. A generic AXML-to-DOM parser would build a full
 * tree here; this one stays purpose-built to keep it auditable.
 */
function walkXmlTree(view: DataView, bodyStart: number, bodyEnd: number, strings: string[]): ParsedManifest {
  const result: ParsedManifest = {
    packageName: null,
    versionCode: null,
    versionName: null,
    minSdkVersion: null,
    targetSdkVersion: null,
    permissions: [],
  }

  let offset = bodyStart
  while (offset < bodyEnd) {
    const header = readChunkHeader(view, offset)
    if (header.size <= 0) break // malformed/truncated chunk — stop rather than loop forever

    if (header.type === CHUNK_XML_START_ELEMENT) {
      // ResXMLTree_node (8 bytes: lineNumber, comment) precedes the
      // ResXMLTree_attrExt payload, both counted inside headerSize.
      const extStart = offset + header.headerSize
      const nameIdx = view.getUint32(extStart + 4, true)
      const attributeCount = view.getUint16(extStart + 12, true)
      const attributeStart = extStart + view.getUint16(extStart + 8, true)
      const attributeSize = view.getUint16(extStart + 10, true)

      const tagName = resolveString(strings, nameIdx)
      const attrs: RawAttribute[] = []
      for (let i = 0; i < attributeCount; i++) {
        const attrOffset = attributeStart + i * attributeSize
        attrs.push({
          nameIdx: view.getUint32(attrOffset + 4, true),
          rawValueIdx: view.getUint32(attrOffset + 8, true),
          // typedValue = size(u16) res0(u8) dataType(u8) data(u32), starting at +12
          dataType: view.getUint8(attrOffset + 12 + 3),
          data: view.getUint32(attrOffset + 16, true),
        })
      }

      const attrByName = (name: string) => {
        const a = attrs.find((x) => resolveString(strings, x.nameIdx) === name)
        return a ? attributeValue(a, strings) : null
      }

      if (tagName === 'manifest') {
        const pkg = attrByName('package')
        if (typeof pkg === 'string') result.packageName = pkg
        const vCode = attrByName('versionCode')
        if (typeof vCode === 'number') result.versionCode = vCode
        const vName = attrByName('versionName')
        if (typeof vName === 'string') result.versionName = vName
      } else if (tagName === 'uses-sdk') {
        const minSdk = attrByName('minSdkVersion')
        if (typeof minSdk === 'number') result.minSdkVersion = minSdk
        const targetSdk = attrByName('targetSdkVersion')
        if (typeof targetSdk === 'number') result.targetSdkVersion = targetSdk
      } else if (tagName === 'uses-permission' || tagName === 'uses-permission-sdk-23') {
        const permName = attrByName('name')
        if (typeof permName === 'string' && !result.permissions.includes(permName)) {
          result.permissions.push(permName)
        }
      }
    }

    offset += header.size
  }

  return result
}

/**
 * Top-level entry point. Returns null (never throws) if the file isn't a
 * zip, doesn't contain AndroidManifest.xml, or the manifest doesn't parse
 * as valid AXML — any of those just means "no metadata available," which
 * the UI shows as such rather than blocking the upload on its own.
 */
export async function parseApkManifest(file: File): Promise<ParsedManifest | null> {
  try {
    const buffer = new Uint8Array(await file.arrayBuffer())
    const entries = unzipSync(buffer, {
      // Only decompress the one file we actually need — a 150MB APK with
      // hundreds of resource/asset entries shouldn't be fully inflated
      // just to read a 5-10KB manifest.
      filter: (entry) => entry.name === 'AndroidManifest.xml',
    })

    const manifestBytes = entries['AndroidManifest.xml']
    if (!manifestBytes) return null

    const view = new DataView(manifestBytes.buffer, manifestBytes.byteOffset, manifestBytes.byteLength)
    const fileHeader = readChunkHeader(view, 0)
    if (fileHeader.type !== 0x0003) return null // not RES_XML_TYPE — not a real compiled manifest

    let offset = fileHeader.headerSize
    let strings: string[] = []
    let bodyStart = -1

    // First pass: locate the string pool (it always comes before the XML
    // node stream) and the start of that node stream.
    while (offset < manifestBytes.byteLength) {
      const header = readChunkHeader(view, offset)
      if (header.size <= 0) break

      if (header.type === CHUNK_STRING_POOL) {
        strings = readStringPool(view, offset, header)
      } else if (
        header.type === CHUNK_XML_START_NAMESPACE ||
        header.type === CHUNK_XML_END_NAMESPACE ||
        header.type === CHUNK_XML_START_ELEMENT ||
        header.type === CHUNK_XML_END_ELEMENT ||
        header.type === CHUNK_XML_CDATA
      ) {
        if (bodyStart === -1) bodyStart = offset
      }

      offset += header.size
    }

    if (bodyStart === -1 || strings.length === 0) return null

    return walkXmlTree(view, bodyStart, manifestBytes.byteLength, strings)
  } catch {
    // Any parsing failure (corrupt zip, truncated manifest, unexpected
    // encoding) degrades to "no metadata" rather than crashing the upload
    // flow — this function is an enrichment step, not a gatekeeper.
    return null
  }
}

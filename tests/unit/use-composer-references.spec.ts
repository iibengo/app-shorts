import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import {
  useComposerReferences,
  type UseComposerReferencesReturn,
} from '~/composables/useComposerReferences'
import type { ComposerReferenceMimeType } from '~/models/composer'

function makeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { configurable: true, value: size })
  return file
}

async function setupReferences() {
  let api!: UseComposerReferencesReturn
  const wrapper = await mountSuspended(
    defineComponent({
      setup() {
        api = useComposerReferences()
        return () => h('div')
      },
    }),
  )

  return { api, wrapper }
}

const createObjectURL = vi.fn((file: File) => `blob:mock/${file.name}`)
const revokeObjectURL = vi.fn()

beforeEach(() => {
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useComposerReferences initial state', () => {
  it('starts empty with no issues and can add more', async () => {
    const { api } = await setupReferences()

    expect(api.references.value).toEqual([])
    expect(api.issues.value).toEqual([])
    expect(api.canAddMore.value).toBe(true)
  })
})

describe('useComposerReferences validation', () => {
  it('adds an image reference with a created ObjectURL and no File exposure', async () => {
    const { api } = await setupReferences()
    const file = makeFile('foto.png', 'image/png', 2048)

    api.addFiles([file])

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(createObjectURL).toHaveBeenCalledWith(file)
    expect(api.references.value).toEqual([
      {
        id: 'ref-1',
        kind: 'image',
        name: 'foto.png',
        mimeType: 'image/png',
        sizeBytes: 2048,
        thumbnailUrl: 'blob:mock/foto.png',
        durationSeconds: null,
      },
    ])
    expect(Object.keys(api.references.value[0]!)).not.toContain('file')
    expect(JSON.stringify(api.references.value[0])).not.toContain('File')
    expect(api.issues.value).toEqual([])
  })

  it('adds a video reference without creating an ObjectURL', async () => {
    const { api } = await setupReferences()

    api.addFiles([makeFile('clip.mp4', 'video/mp4', 4096)])

    expect(createObjectURL).not.toHaveBeenCalled()
    expect(api.references.value[0]).toMatchObject({
      id: 'ref-1',
      kind: 'video',
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 4096,
      thumbnailUrl: null,
      durationSeconds: null,
    })
  })

  it('normalises MIME parameters before accepting the file', async () => {
    const { api } = await setupReferences()

    api.addFiles([makeFile('foto.png', 'image/png; charset=binary', 1024)])

    expect(api.references.value[0]).toMatchObject({
      kind: 'image',
      mimeType: 'image/png',
    })
  })

  it('rejects empty, unknown and oversized files with the exact messages', async () => {
    const { api } = await setupReferences()

    api.addFiles([makeFile('vacio.png', 'image/png', 0)])
    expect(api.issues.value).toEqual([
      {
        code: 'reference-empty',
        field: 'references',
        message: 'El archivo está vacío.',
      },
    ])

    api.addFiles([makeFile('raro.txt', 'text/plain', 10)])
    expect(api.issues.value).toEqual([
      {
        code: 'reference-type',
        field: 'references',
        message: 'Formato no admitido. Usa PNG, JPG, WebP, MP4, WebM o MOV.',
      },
    ])

    api.addFiles([makeFile('grande.png', 'image/png', 8_388_609)])
    expect(api.issues.value).toEqual([
      {
        code: 'reference-too-large',
        field: 'references',
        message: 'La imagen supera el máximo de 8 MB.',
      },
    ])

    api.addFiles([makeFile('grande.mp4', 'video/mp4', 52_428_801)])
    expect(api.issues.value).toEqual([
      {
        code: 'reference-too-large',
        field: 'references',
        message: 'El vídeo supera el máximo de 50 MB.',
      },
    ])

    expect(api.references.value).toEqual([])
  })

  it('accepts files exactly at the byte limits', async () => {
    const { api } = await setupReferences()

    api.addFiles([
      makeFile('limite.png', 'image/png', 8_388_608),
      makeFile('limite.mp4', 'video/mp4', 52_428_800),
    ])

    expect(api.references.value).toHaveLength(2)
    expect(api.issues.value).toEqual([])
  })

  it('deduplicates issues by code within a single selection', async () => {
    const { api } = await setupReferences()

    api.addFiles([
      makeFile('a.txt', 'text/plain', 10),
      makeFile('b.gif', 'image/gif', 10),
    ])

    expect(api.issues.value).toHaveLength(1)
    expect(api.issues.value[0]?.code).toBe('reference-type')
  })

  it('keeps distinct issue codes from the same selection', async () => {
    const { api } = await setupReferences()

    api.addFiles([
      makeFile('vacio.png', 'image/png', 0),
      makeFile('raro.txt', 'text/plain', 10),
      makeFile('grande.png', 'image/png', 8_388_609),
    ])

    expect(api.issues.value.map((issue) => issue.code)).toEqual([
      'reference-empty',
      'reference-type',
      'reference-too-large',
    ])
  })

  it('never creates a reference for an invalid file', async () => {
    const { api } = await setupReferences()

    api.addFiles([makeFile('raro.txt', 'text/plain', 10)])

    expect(api.references.value).toEqual([])
    expect(createObjectURL).not.toHaveBeenCalled()
  })
})

describe('useComposerReferences limit and ids', () => {
  it('accepts at most three valid files and emits one references-limit issue', async () => {
    const { api } = await setupReferences()

    api.addFiles([
      makeFile('a.png', 'image/png', 1024),
      makeFile('b.jpg', 'image/jpeg', 1024),
      makeFile('c.webp', 'image/webp', 1024),
      makeFile('d.mp4', 'video/mp4', 1024),
    ])

    expect(api.references.value.map((reference) => reference.id)).toEqual([
      'ref-1',
      'ref-2',
      'ref-3',
    ])
    expect(api.canAddMore.value).toBe(false)
    expect(api.issues.value).toEqual([
      {
        code: 'references-limit',
        field: 'references',
        message: 'Puedes añadir hasta 3 referencias.',
      },
    ])
    expect(createObjectURL).toHaveBeenCalledTimes(3)
  })

  it('keeps protecting the limit on later programmatic calls', async () => {
    const { api } = await setupReferences()

    api.addFiles([
      makeFile('a.png', 'image/png', 1024),
      makeFile('b.png', 'image/png', 1024),
      makeFile('c.png', 'image/png', 1024),
    ])
    api.addFiles([makeFile('d.png', 'image/png', 1024)])

    expect(api.references.value).toHaveLength(3)
    expect(api.issues.value.map((issue) => issue.code)).toEqual(['references-limit'])
  })

  it('does not reuse ids after removals or clears', async () => {
    const { api } = await setupReferences()

    api.addFiles([makeFile('a.png', 'image/png', 1024)])
    expect(api.references.value[0]?.id).toBe('ref-1')

    api.removeReference('ref-1')
    api.addFiles([makeFile('b.png', 'image/png', 1024)])
    expect(api.references.value[0]?.id).toBe('ref-2')

    api.removeReference('ref-2')
    api.clearReferences()
    api.addFiles([makeFile('c.png', 'image/png', 1024)])
    expect(api.references.value[0]?.id).toBe('ref-3')
  })

  it('clears the visible limit issue when a reference is removed', async () => {
    const { api } = await setupReferences()

    api.addFiles([
      makeFile('a.png', 'image/png', 1024),
      makeFile('b.png', 'image/png', 1024),
      makeFile('c.png', 'image/png', 1024),
      makeFile('d.png', 'image/png', 1024),
    ])

    expect(api.issues.value.map((issue) => issue.code)).toEqual(['references-limit'])

    api.removeReference('ref-1')

    expect(api.references.value).toHaveLength(2)
    expect(api.canAddMore.value).toBe(true)
    expect(api.issues.value).toEqual([])
  })

  it('allows selecting the same file twice with a new id and ObjectURL', async () => {
    const { api } = await setupReferences()
    const file = makeFile('misma.png', 'image/png', 1024)

    api.addFiles([file])
    api.addFiles([file])

    expect(api.references.value.map((reference) => reference.id)).toEqual([
      'ref-1',
      'ref-2',
    ])
    expect(createObjectURL).toHaveBeenCalledTimes(2)
  })
})

describe('useComposerReferences ObjectURL lifecycle', () => {
  it('revokes the image ObjectURL on remove and forgets the retained File', async () => {
    const { api } = await setupReferences()

    api.addFiles([makeFile('a.png', 'image/png', 1024)])
    const url = api.references.value[0]?.thumbnailUrl
    expect(url).toBe('blob:mock/a.png')

    api.removeReference('ref-1')

    expect(revokeObjectURL).toHaveBeenCalledWith(url)
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(api.references.value).toEqual([])
  })

  it('does not revoke anything for a video or an unknown id', async () => {
    const { api } = await setupReferences()

    api.addFiles([makeFile('clip.mp4', 'video/mp4', 1024)])
    api.removeReference('ref-1')
    api.removeReference('ref-99')

    expect(revokeObjectURL).not.toHaveBeenCalled()
  })

  it('revokes every image URL on clear and leaves videos untouched', async () => {
    const { api } = await setupReferences()

    api.addFiles([
      makeFile('a.png', 'image/png', 1024),
      makeFile('b.jpg', 'image/jpeg', 1024),
      makeFile('c.mp4', 'video/mp4', 1024),
    ])

    api.clearReferences()

    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock/a.png')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock/b.jpg')
    expect(api.references.value).toEqual([])
    expect(api.canAddMore.value).toBe(true)
  })

  it('revokes every image URL when the composable owner unmounts', async () => {
    const { api, wrapper } = await setupReferences()

    api.addFiles([
      makeFile('a.png', 'image/png', 1024),
      makeFile('b.png', 'image/png', 1024),
    ])

    wrapper.unmount()

    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock/a.png')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock/b.png')
  })

  it('falls back to a null thumbnail when createObjectURL throws', async () => {
    const { api } = await setupReferences()
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => {
      throw new Error('not available')
    })

    expect(() => api.addFiles([makeFile('a.png', 'image/png', 1024)])).not.toThrow()
    expect(api.references.value[0]?.thumbnailUrl).toBeNull()
    expect(api.issues.value).toEqual([])
  })

  it('falls back to a null thumbnail when createObjectURL does not exist', async () => {
    const { api } = await setupReferences()
    const original = URL.createObjectURL
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: undefined,
    })

    try {
      expect(() => api.addFiles([makeFile('a.png', 'image/png', 1024)])).not.toThrow()
      expect(api.references.value[0]?.thumbnailUrl).toBeNull()
    } finally {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: original,
      })
    }
  })

  it('ignores a missing or throwing revokeObjectURL', async () => {
    const { api } = await setupReferences()
    api.addFiles([makeFile('a.png', 'image/png', 1024)])

    const original = URL.revokeObjectURL
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: undefined,
    })

    try {
      expect(() => api.removeReference('ref-1')).not.toThrow()
    } finally {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: original,
      })
    }

    vi.mocked(URL.revokeObjectURL).mockImplementationOnce(() => {
      throw new Error('cannot revoke')
    })

    api.addFiles([makeFile('b.png', 'image/png', 1024)])
    expect(() => api.removeReference('ref-2')).not.toThrow()
  })
})

describe('useComposerReferences issue clearing', () => {
  it('clears issues on demand and replaces them on the next selection', async () => {
    const { api } = await setupReferences()

    api.addFiles([makeFile('raro.txt', 'text/plain', 10)])
    expect(api.issues.value).toHaveLength(1)

    api.clearIssues()
    expect(api.issues.value).toEqual([])

    api.addFiles([makeFile('a.png', 'image/png', 1024)])
    expect(api.issues.value).toEqual([])
  })

  it('accepts a valid MIME union reference at compile time', async () => {
    const { api } = await setupReferences()
    const mime: ComposerReferenceMimeType = 'image/webp'

    api.addFiles([makeFile('a.webp', mime, 1024)])
    expect(api.references.value[0]?.mimeType).toBe('image/webp')
  })
})

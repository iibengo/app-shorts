import type { Short } from '~/types/short'

export const shorts: readonly Short[] = [
  {
    id: 'short-001',
    title: 'Tu primera idea en un short',
    creator: {
      name: 'Marina Solís',
      handle: '@marinasolis',
    },
    media: {
      type: 'poster',
      poster: {
        src: '/mock/shorts/short-001.svg',
        alt: 'Póster abstracto violeta con un destello de luz.',
        width: 1080,
        height: 1920,
      },
    },
    durationSeconds: 18,
    tags: ['IA', 'Guion'],
    stats: {
      likes: 128,
      saves: 34,
    },
    publishedAt: '2026-10-01T09:00:00.000Z',
    initialState: {
      isLiked: false,
      isSaved: false,
    },
  },
  {
    id: 'short-002',
    title: 'De idea a guion en 60 segundos',
    creator: {
      name: 'Diego Ferrán',
      handle: '@diegoferran',
    },
    media: {
      type: 'poster',
      poster: {
        src: '/mock/shorts/short-002.svg',
        alt: 'Póster abstracto fucsia con líneas que convergen.',
        width: 1080,
        height: 1920,
      },
    },
    durationSeconds: 24,
    tags: ['Guion', 'Productividad'],
    stats: {
      likes: 96,
      saves: 21,
    },
    publishedAt: '2026-10-02T09:00:00.000Z',
    initialState: {
      isLiked: false,
      isSaved: true,
    },
  },
  {
    id: 'short-003',
    title: 'El encuadre que arruina tu vertical',
    creator: {
      name: 'Nuria Vega',
      handle: '@nuriavega',
    },
    media: {
      type: 'poster',
      poster: {
        src: '/mock/shorts/short-003.svg',
        alt: 'Póster abstracto índigo con un marco vertical.',
        width: 1080,
        height: 1920,
      },
    },
    durationSeconds: 15,
    tags: ['Vertical', 'Cámara'],
    stats: {
      likes: 214,
      saves: 58,
    },
    publishedAt: '2026-10-03T09:00:00.000Z',
    initialState: {
      isLiked: true,
      isSaved: false,
    },
  },
  {
    id: 'short-004',
    title: 'Ilumina tu set con una lámpara',
    creator: {
      name: 'Tomás Riera',
      handle: '@tomasriera',
    },
    media: {
      type: 'poster',
      poster: {
        src: '/mock/shorts/short-004.svg',
        alt: 'Póster abstracto ámbar con un haz de luz.',
        width: 1080,
        height: 1920,
      },
    },
    durationSeconds: 21,
    tags: ['Luz', 'Set'],
    stats: {
      likes: 173,
      saves: 47,
    },
    publishedAt: '2026-10-04T09:00:00.000Z',
    initialState: {
      isLiked: false,
      isSaved: false,
    },
  },
  {
    id: 'short-005',
    title: 'Ritmo y corte en tres pasos',
    creator: {
      name: 'Alba Quiroga',
      handle: '@albaquiroga',
    },
    media: {
      type: 'poster',
      poster: {
        src: '/mock/shorts/short-005.svg',
        alt: 'Póster abstracto violeta con bloques rítmicos.',
        width: 1080,
        height: 1920,
      },
    },
    durationSeconds: 27,
    tags: ['Edición', 'Ritmo'],
    stats: {
      likes: 302,
      saves: 88,
    },
    publishedAt: '2026-10-05T09:00:00.000Z',
    initialState: {
      isLiked: true,
      isSaved: true,
    },
  },
  {
    id: 'short-006',
    title: 'Publica con intención, no por inercia',
    creator: {
      name: 'Iker Salas',
      handle: '@ikersalas',
    },
    media: {
      type: 'poster',
      poster: {
        src: '/mock/shorts/short-006.svg',
        alt: 'Póster abstracto fucsia con ondas concéntricas.',
        width: 1080,
        height: 1920,
      },
    },
    durationSeconds: 19,
    tags: ['Publicación', 'Estrategia'],
    stats: {
      likes: 145,
      saves: 39,
    },
    publishedAt: '2026-10-06T09:00:00.000Z',
    initialState: {
      isLiked: false,
      isSaved: false,
    },
  },
]

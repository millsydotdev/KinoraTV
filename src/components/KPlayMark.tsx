interface KPlayMarkProps {
  size?: number
  className?: string
  idPrefix?: string
}

export function KPlayMark({ size = 28, className, idPrefix = 'kp' }: KPlayMarkProps) {
  const stemId = `${idPrefix}-stem`
  const upperTopId = `${idPrefix}-upper-top`
  const upperUnderId = `${idPrefix}-upper-under`
  const lowerUpperId = `${idPrefix}-lower-upper`
  const lowerBaseId = `${idPrefix}-lower-base`
  const playCoreId = `${idPrefix}-play-core`

  return (
    <svg
      className={className ?? 'logo-mark'}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={stemId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#b80610" />
          <stop offset="40%" stopColor="#e50914" />
          <stop offset="100%" stopColor="#ff3d4a" />
        </linearGradient>
        <linearGradient id={upperTopId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#e50914" />
          <stop offset="55%" stopColor="#ff3d4a" />
          <stop offset="100%" stopColor="#ff6b75" />
        </linearGradient>
        <linearGradient id={upperUnderId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d60813" />
          <stop offset="100%" stopColor="#9e040c" />
        </linearGradient>
        <linearGradient id={lowerUpperId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e50914" />
          <stop offset="100%" stopColor="#ad060f" />
        </linearGradient>
        <linearGradient id={lowerBaseId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9e040c" />
          <stop offset="100%" stopColor="#5e0105" />
        </linearGradient>
        <linearGradient id={playCoreId} x1="0" y1="0" x2="1" y2="0.5">
          <stop offset="0%" stopColor="#ff4f5c" />
          <stop offset="50%" stopColor="#e50914" />
          <stop offset="100%" stopColor="#b80610" />
        </linearGradient>
      </defs>

      {/* 1. Left Vertical Stem */}
      <path
        d="M6 5.5 C6 4.7 6.7 4 7.5 4 L10.5 4 C11.3 4 12 4.7 12 5.5 L12 26.5 C12 27.3 11.3 28 10.5 28 L7.5 28 C6.7 28 6 27.3 6 26.5 Z"
        fill={`url(#${stemId})`}
      />

      {/* 2. Upper Right Diagonal Arm */}
      <path
        d="M11 15 L20.5 4.8 C21 4.3 21.7 4 22.4 4 L25 4 C25.8 4 26.4 4.8 26 5.6 L24 10 L15.5 15.5 Z"
        fill={`url(#${upperTopId})`}
      />
      <path
        d="M15.5 15.5 L24 10 L23.2 13 C22.9 13.8 22.2 14.4 21.4 14.4 L14.5 15.6 Z"
        fill={`url(#${upperUnderId})`}
      />

      {/* 3. Lower Right Diagonal Arm */}
      <path
        d="M14 16.8 L21.4 17.6 C22.2 17.6 22.9 18.2 23.2 19 L24 22 L15.5 16.5 Z"
        fill={`url(#${lowerUpperId})`}
      />
      <path
        d="M15.5 16.5 L24 22 L26 26.4 C26.4 27.2 25.8 28 25 28 L22.4 28 C21.7 28 21 27.7 20.5 27.2 L11 17 Z"
        fill={`url(#${lowerBaseId})`}
      />

      {/* 4. Play Cutout Well (High-Contrast Inset Frame) */}
      <path
        d="M7.5 9.5 C7.5 8.8 8.3 8.3 8.9 8.7 L19 15.2 C19.6 15.6 19.6 16.4 19 16.8 L8.9 23.3 C8.3 23.7 7.5 23.2 7.5 22.5 Z"
        fill="#080a0e"
        stroke="#191e28"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />

      {/* 5. Inner Solid Play Core */}
      <path
        d="M9.2 11.4 C9.2 10.9 9.8 10.6 10.2 10.8 L17 15.5 C17.4 15.8 17.4 16.2 17 16.5 L10.2 21.2 C9.8 21.4 9.2 21.1 9.2 20.6 Z"
        fill={`url(#${playCoreId})`}
      />
      {/* Specular Bevel on Core */}
      <path d="M9.8 12 L16 16 L9.8 12.8 Z" fill="#ffffff" opacity="0.25" />
    </svg>
  )
}

import type { CSSProperties } from 'react'

export function Icon(props: { name: string; size?: number; className?: string; style?: CSSProperties; title?: string }) {
  const size = props.size ?? 18
  return (
    <svg
      className={props.className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden={props.title ? undefined : true}
      role={props.title ? 'img' : 'presentation'}
      style={props.style}
    >
      {props.title ? <title>{props.title}</title> : null}
      <use href={`/icons.svg#${props.name}`} />
    </svg>
  )
}


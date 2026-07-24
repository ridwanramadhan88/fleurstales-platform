import type { SVGProps } from 'react'

/** Lightweight WhatsApp-style contact icon used for customer contact fields. */
export const WhatsAppIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d="M20.3 11.7a8.3 8.3 0 0 1-12.1 7.4L4 20l1-4a8.3 8.3 0 1 1 15.3-4.3Z" />
    <path d="M8.8 7.8c.2-.4.4-.4.7-.4h.4c.2 0 .4.1.5.4l.8 1.9c.1.3.1.5-.1.7l-.7.8c-.2.2-.2.4 0 .7.6 1.1 1.5 2 2.7 2.6.3.2.5.2.7 0l.9-1c.2-.2.4-.3.7-.2l1.9.9c.3.1.4.3.4.5 0 .3-.1 1.3-.8 2-.6.6-1.5.9-2.4.7-1.4-.3-3.2-1-5-2.7-1.5-1.4-2.5-3.1-2.8-4.5-.2-.9 0-1.8.6-2.4.2-.2.3-.3.5-.5Z" />
  </svg>
)

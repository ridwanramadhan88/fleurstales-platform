import type { FC, ReactNode } from 'react'
import type { StoreProfileSettings } from '../../types/settings'
import { StorefrontContainer } from './StorefrontContainer'
import { StorefrontBrand } from './StorefrontBrand'
import instagramIcon from '../../assets/storefront-shop/IG_Fleur.svg'
import tiktokIcon from '../../assets/storefront-shop/Tiktok_Fleur.svg'
import whatsappIcon from '../../assets/storefront-shop/WA_Fleur.svg'
import { getPublicStoreContact, getStorefrontWhatsappHref } from '../../domain/storefrontContactDomain'

interface Props {
  storeProfile: StoreProfileSettings
}

interface SocialItemProps {
  label: string
  href?: string | null
  icon: ReactNode
}

const SocialItem: FC<SocialItemProps> = ({ label, href, icon }) => {
  const content = <span className="inline-flex size-12 items-center justify-center">{icon}</span>
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="tap-scale rounded-full outline-none focus-visible:ring-2 focus-visible:ring-black/25" aria-label={label}>{content}</a>
  ) : (
    <span aria-label={label}>{content}</span>
  )
}

export const StorefrontFooter: FC<Props> = ({ storeProfile }) => {
  const whatsapp = getPublicStoreContact(storeProfile.whatsapp || storeProfile.phone)
  const whatsappHref = getStorefrontWhatsappHref(whatsapp)
  const email = getPublicStoreContact(storeProfile.email)
  const legalName = storeProfile.legalName?.trim()

  return (
    <footer className="storefront-footer-bleed pt-10 text-black sm:pt-12 lg:pt-10">
      <div className="storefront-footer-panel">
        <StorefrontContainer>
          <div className="storefront-footer-panel__content grid gap-8 md:grid-cols-[minmax(0,1.15fr)_minmax(220px,0.85fr)] md:items-end md:gap-10 lg:gap-12">
            <div className="max-w-xl">
              <div>
                <StorefrontBrand variant="footer" showIcon={false} />
                {legalName && legalName !== 'Fleurstales' && legalName !== storeProfile.storeName.trim() && (
                  <p className="mt-2 sf-type-2 leading-[1.45] text-black/52">{legalName}</p>
                )}
              </div>

              <div className="mt-6 space-y-1.5 sf-type-2 leading-[1.45] text-black/72">
                <p><a className="inline-flex min-h-11 items-center font-medium underline decoration-black/35 underline-offset-2" href="/track">Track Order</a></p>
                {whatsapp.trim() && (
                  <p>{whatsappHref ? <a className="inline-flex min-h-11 items-center underline decoration-black/35 underline-offset-2" href={whatsappHref} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${whatsapp}`}>{whatsapp}</a> : whatsapp}</p>
                )}
                {email && <p><a className="inline-flex min-h-11 items-center underline decoration-black/35 underline-offset-2" href={`mailto:${email}`}>{email}</a></p>}
                {storeProfile.address.trim() && <p className="max-w-lg pt-1">{storeProfile.address}</p>}
              </div>
            </div>

            <div className="md:justify-self-end md:self-end">
              <div className="flex items-start gap-3 md:justify-end">
                <SocialItem label="Instagram" icon={<img src={instagramIcon} alt="" className="size-12 object-contain" />} />
                <SocialItem label="TikTok" icon={<img src={tiktokIcon} alt="" className="size-12 object-contain" />} />
                {whatsappHref ? <SocialItem label={`WhatsApp: ${whatsapp}`} href={whatsappHref} icon={<img src={whatsappIcon} alt="" className="size-12 object-contain" />} /> : null}
              </div>
            </div>
          </div>
        </StorefrontContainer>
      </div>
    </footer>
  )
}

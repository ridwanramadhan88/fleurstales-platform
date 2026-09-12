import type { FC } from 'react'
import { CheckCircle2, Gift } from 'lucide-react'
import type { PublicOrderTrackingDetails } from '../../data/orderTracking'
import { StorefrontReviewForm } from './StorefrontReviewForm'

const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

interface StorefrontCompletedReviewSectionProps {
  trackingId: string
  details: PublicOrderTrackingDetails
  onSubmitted: () => Promise<void>
}

export const StorefrontCompletedReviewSection: FC<StorefrontCompletedReviewSectionProps> = ({
  trackingId,
  details,
  onSubmitted,
}) => {
  const reward = details.reviewReward
  const rewardAvailable = reward?.status === 'available'
  const rewardRedeemed = reward?.status === 'redeemed'

  return (
    <section
      className="rounded-[var(--sf-radius-card)] border border-[#00813f]/15 bg-white/55 p-4 shadow-[0_10px_35px_rgba(0,0,0,0.035)] sm:p-6 lg:p-8"
      data-completed-review-section
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full sm:size-11 ${details.reviewSubmitted ? 'bg-[#00813f] text-white' : 'bg-[#00813f]/10 text-[#006f36]'}`}>
          {details.reviewSubmitted ? <CheckCircle2 className="size-5" /> : <Gift className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="sf-label text-[#006f36]">
            {details.reviewSubmitted ? 'Review terkirim' : 'Review & reward'}
          </p>
          <h2 className="mt-1.5 max-w-2xl font-display text-[1.65rem] font-medium leading-[1.08] tracking-[-0.02em] sm:text-[2rem]">
            {rewardAvailable
              ? `Diskon ${Number(reward.percentOff)}% untuk pesanan berikutnya sudah aktif`
              : rewardRedeemed
                ? 'Terima kasih, reward review sudah digunakan'
                : details.reviewSubmitted
                  ? 'Terima kasih untuk review-nya'
                  : 'Dapatkan diskon untuk pesanan berikutnya'}
          </h2>
          <p className="mt-2 max-w-2xl sf-type-2 leading-6 text-black/58">
            {details.reviewSubmitted
              ? rewardAvailable
                ? `Gunakan reward ini untuk order berikutnya dengan minimum belanja ${currencyFormatter.format(reward.minOrderIdr)}.`
                : rewardRedeemed
                  ? 'Reward dari review ini sudah dipakai pada pesanan berikutnya.'
                  : 'Review kamu sudah tersimpan. Terima kasih sudah membantu Fleurstales jadi lebih baik.'
              : 'Isi review singkat tentang pesanan ini. Setelah dikirim, diskon akan otomatis aktif untuk pesanan berikutnya.'}
          </p>
        </div>
      </div>

      {details.reviewSubmitted ? (
        details.review?.note ? (
          <blockquote className="mt-5 border-l-2 border-[#00813f]/30 pl-4 sf-type-2 italic leading-6 text-black/55">
            “{details.review.note}”
          </blockquote>
        ) : null
      ) : (
        <div className="mt-6 border-t border-black/10 pt-6">
          <StorefrontReviewForm
            trackingId={trackingId}
            details={details}
            onSubmitted={onSubmitted}
          />
        </div>
      )}
    </section>
  )
}

export default StorefrontCompletedReviewSection

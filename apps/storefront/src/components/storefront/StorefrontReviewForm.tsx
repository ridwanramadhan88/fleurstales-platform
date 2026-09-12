import { useMemo, useState, type FC, type FormEvent, type ReactNode } from 'react'
import { Check, Star } from 'lucide-react'
import {
  submitPublicOrderReview,
  type PublicOrderTrackingDetails,
  type PublicReviewProfileInput,
} from '../../data/orderTracking'

interface Props {
  trackingId: string
  details: PublicOrderTrackingDetails
  onSubmitted: () => Promise<void>
}

const DOMICILES = [
  'Bumi Waras',
  'Enggal',
  'Kedaton',
  'Kemiling',
  'Labuhan Ratu',
  'Langkapura',
  'Panjang',
  'Rajabasa',
  'Sukabumi',
  'Sukarame',
  'Tanjung Karang Barat',
  'Tanjung Karang Timur',
  'Tanjung Karang Pusat',
  'Tanjung Senang',
  'Teluk Betung Barat',
  'Teluk Betung Selatan',
  'Teluk Betung Timur',
  'Teluk Betung Utara',
  'Way Halim',
] as const

const OCCUPATIONS = [
  { value: 'student', label: 'Pelajar / mahasiswa' },
  { value: 'employee', label: 'Karyawan' },
  { value: 'private_employee', label: 'Karyawan swasta' },
  { value: 'entrepreneur', label: 'Wirausaha' },
] as const

const ACQUISITION_SOURCES = [
  { value: 'social_content', label: 'Konten media sosial' },
  { value: 'social_ads', label: 'Iklan Instagram / Facebook' },
  { value: 'influencer', label: 'Influencer' },
  { value: 'google_maps', label: 'Google Maps' },
  { value: 'local_ads', label: 'Iklan di area sekitar' },
  { value: 'friends_family', label: 'Teman / keluarga' },
] as const

const PROMOS = [
  { value: 'discount', label: 'Diskon' },
  { value: 'cashback', label: 'Cashback' },
  { value: 'bundling', label: 'Bundling' },
  { value: 'flash_sale', label: 'Flash sale' },
] as const

type AgeRange = NonNullable<PublicReviewProfileInput['ageRange']>
type Gender = NonNullable<PublicReviewProfileInput['gender']>

const deriveAgeRange = (birthday: string): AgeRange | '' => {
  if (!birthday) return ''
  const date = new Date(`${birthday}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  const today = new Date()
  let age = today.getFullYear() - date.getFullYear()
  const monthDelta = today.getMonth() - date.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < date.getDate())) age -= 1
  if (age < 0) return ''
  if (age < 18) return 'under_18'
  if (age <= 24) return '18_24'
  if (age <= 34) return '25_34'
  return '35_plus'
}

const fieldClass =
  'min-h-12 w-full rounded-[14px] border border-black/12 bg-white/70 px-4 text-[16px] leading-6 text-black outline-none transition placeholder:text-black/30 focus:border-[#00813f]/55 focus:ring-2 focus:ring-[#00813f]/10 sm:text-sm'

const sectionClass = 'border-t border-black/10 pt-6 sm:pt-7'

const SectionHeading: FC<{
  index: string
  title: string
  description?: string
}> = ({ index, title, description }) => (
  <div className="mb-5 flex items-start gap-3">
    <span className="mt-0.5 sf-type-1 font-semibold tabular-nums text-[#00813f]">{index}</span>
    <div>
      <h3 className="sf-type-3 font-semibold text-black">{title}</h3>
      {description ? <p className="mt-1 sf-type-1 leading-5 text-black/44">{description}</p> : null}
    </div>
  </div>
)

const FieldLabel: FC<{ children: ReactNode; required?: boolean }> = ({ children, required }) => (
  <span className="mb-2 block sf-type-1 font-semibold text-black/64">
    {children}{required ? <span className="ml-1 text-[#d84b72]">*</span> : null}
  </span>
)

const RatingRow: FC<{
  question: string
  score: number
  onChange: (score: number) => void
}> = ({ question, score, onChange }) => (
  <fieldset className="border-b border-black/[0.07] py-5 first:pt-0 last:border-b-0 last:pb-0">
    <legend className="w-full">
      <span className="sf-type-2 font-semibold leading-5 text-black">{question}</span>
    </legend>
    <div className="mt-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-0.5 sm:gap-1" aria-label="Rating 1 sampai 5">
        {[1, 2, 3, 4, 5].map((value) => {
          const active = value <= score
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChange(value)}
              className={`tap-scale grid size-9 place-items-center rounded-full transition sm:size-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00813f]/35 ${active ? 'text-[#d84b72]' : 'text-black/20 hover:text-black/40'}`}
              aria-label={`Nilai ${value} dari 5`}
              aria-pressed={score === value}
            >
              <Star className="size-5 sm:size-6" strokeWidth={1.7} fill={active ? 'currentColor' : 'none'} />
            </button>
          )
        })}
      </div>
      <span className={`min-w-[3.4rem] rounded-full px-2.5 py-1.5 text-center sf-type-1 font-semibold tabular-nums ${score ? 'bg-[#f8d9e4] text-[#a72f58]' : 'bg-black/[0.045] text-black/35'}`}>
        {score || 0}/5
      </span>
    </div>
  </fieldset>
)

export const StorefrontReviewForm: FC<Props> = ({ trackingId, details, onSubmitted }) => {
  const existingDomicile = details.customerProfile?.domicile ?? ''
  const knownDomicile = DOMICILES.includes(existingDomicile as (typeof DOMICILES)[number])
  const [name, setName] = useState(details.customerName ?? '')
  const [email, setEmail] = useState(details.customerEmail ?? '')
  const [birthday, setBirthday] = useState(details.customerBirthday ?? '')
  const [domicile, setDomicile] = useState(knownDomicile ? existingDomicile : existingDomicile ? 'other' : '')
  const [otherDomicile, setOtherDomicile] = useState(knownDomicile ? '' : existingDomicile)
  const [ageRange, setAgeRange] = useState<AgeRange | ''>(
    details.customerProfile?.ageRange ?? deriveAgeRange(details.customerBirthday ?? ''),
  )
  const [gender, setGender] = useState<Gender | ''>(details.customerProfile?.gender ?? '')
  const existingOccupation = details.customerProfile?.occupation ?? ''
  const knownOccupation = OCCUPATIONS.some((option) => option.value === existingOccupation)
  const [occupation, setOccupation] = useState(knownOccupation ? existingOccupation : existingOccupation ? 'other' : '')
  const [otherOccupation, setOtherOccupation] = useState(knownOccupation ? '' : existingOccupation)
  const existingSource = details.customerProfile?.acquisitionSource ?? ''
  const knownSource = ACQUISITION_SOURCES.some((option) => option.value === existingSource)
  const [acquisitionSource, setAcquisitionSource] = useState(knownSource ? existingSource : existingSource ? 'other' : '')
  const [otherSource, setOtherSource] = useState(knownSource ? '' : existingSource)
  const [promoPreferences, setPromoPreferences] = useState<string[]>(details.customerProfile?.promoPreferences ?? [])
  const [scores, setScores] = useState<Record<string, number>>({})
  const [reviewNote, setReviewNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const questions = details.reviewQuestions ?? []
  const allRatingsComplete = questions.length > 0 && questions.every((question) => Boolean(scores[question.id]))
  const resolvedDomicile = domicile === 'other' ? otherDomicile.trim() : domicile
  const resolvedOccupation = occupation === 'other' ? otherOccupation.trim() : occupation
  const resolvedSource = acquisitionSource === 'other' ? otherSource.trim() : acquisitionSource

  const formComplete = useMemo(
    () =>
      name.trim().length > 0 &&
      resolvedDomicile.length > 0 &&
      birthday.length > 0 &&
      Boolean(ageRange) &&
      Boolean(gender) &&
      resolvedOccupation.length > 0 &&
      resolvedSource.length > 0 &&
      promoPreferences.length > 0 &&
      allRatingsComplete,
    [
      ageRange,
      allRatingsComplete,
      birthday,
      gender,
      name,
      promoPreferences.length,
      resolvedDomicile,
      resolvedOccupation,
      resolvedSource,
    ],
  )

  const togglePromo = (value: string) => {
    setPromoPreferences((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    )
  }

  const handleBirthdayChange = (value: string) => {
    setBirthday(value)
    setAgeRange(deriveAgeRange(value))
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!formComplete || busy) {
      setMessage('Lengkapi semua kolom wajib dan rating terlebih dahulu.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const result = await submitPublicOrderReview(
        trackingId,
        questions.map((question) => ({ questionId: question.id, score: scores[question.id] })),
        reviewNote,
        {
          name: name.trim(),
          email: email.trim(),
          birthday,
          domicile: resolvedDomicile,
          ageRange: ageRange || undefined,
          gender: gender || undefined,
          occupation: resolvedOccupation,
          acquisitionSource: resolvedSource,
          promoPreferences,
        },
      )
      setSubmitted(true)
      setMessage(
        result.reward
          ? `Terima kasih! Diskon ${Number(result.reward.percentOff)}% untuk pesanan berikutnya sudah aktif.`
          : 'Terima kasih untuk review-nya!',
      )
      await onSubmitted()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Review belum berhasil dikirim. Coba lagi ya.')
    } finally {
      setBusy(false)
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl bg-[#00813f]/[0.055] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#00813f] text-white">
            <Check className="size-4" />
          </span>
          <div>
            <p className="sf-type-3 font-semibold">Review terkirim.</p>
            {message ? <p className="mt-1.5 sf-type-2 leading-6 text-black/58">{message}</p> : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <form className="space-y-6 sm:space-y-7" onSubmit={handleSubmit}>
      <section>
        <SectionHeading
          index="01"
          title="Nilai pengalaman kamu"
          description="Tap bintang untuk setiap bagian. Semua rating wajib diisi."
        />
        <div>
          {questions.map((question) => (
            <RatingRow
              key={question.id}
              question={question.question}
              score={scores[question.id] ?? 0}
              onChange={(score) => setScores((current) => ({ ...current, [question.id]: score }))}
            />
          ))}
        </div>
        <label className="mt-6 block border-t border-black/[0.07] pt-5">
          <FieldLabel>Saran atau catatan</FieldLabel>
          <textarea
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            rows={4}
            maxLength={2000}
            className={`${fieldClass} min-h-28 resize-none py-3`}
            placeholder="Ceritakan yang kamu suka atau yang bisa kami perbaiki…"
          />
        </label>
      </section>

      <section className={sectionClass}>
        <SectionHeading
          index="02"
          title="Data kamu"
          description="Data yang sudah kami punya otomatis terisi."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <FieldLabel required>Nama lengkap</FieldLabel>
            <input value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} autoComplete="name" maxLength={120} required />
          </label>
          <label>
            <FieldLabel>Email</FieldLabel>
            <input value={email} onChange={(event) => setEmail(event.target.value)} className={fieldClass} type="email" autoComplete="email" placeholder="nama@email.com" maxLength={254} />
          </label>
          <div className="sm:col-span-2 rounded-[14px] bg-black/[0.035] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="sf-type-1 font-semibold text-black/48">WhatsApp pesanan</span>
              <span className="sf-type-2 font-medium text-black/72">{details.customerWhatsapp || '—'}</span>
            </div>
            <p className="mt-1 sf-type-1 text-black/36">Nomor ini mengikuti data pesanan dan tidak bisa diubah dari form review.</p>
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <SectionHeading
          index="03"
          title="Sedikit tentang kamu"
          description="Membantu kami memahami pelanggan Fleurstales dengan lebih baik."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <FieldLabel required>Domisili</FieldLabel>
            <select value={domicile} onChange={(event) => setDomicile(event.target.value)} className={fieldClass} required>
              <option value="">Pilih domisili</option>
              {DOMICILES.map((value) => <option key={value} value={value}>{value}</option>)}
              <option value="other">Lainnya</option>
            </select>
          </label>
          {domicile === 'other' ? (
            <label className="sm:col-span-2">
              <FieldLabel required>Domisili lainnya</FieldLabel>
              <input value={otherDomicile} onChange={(event) => setOtherDomicile(event.target.value)} className={fieldClass} maxLength={100} required />
            </label>
          ) : null}

          <label>
            <FieldLabel required>Tanggal lahir</FieldLabel>
            <input value={birthday} onChange={(event) => handleBirthdayChange(event.target.value)} className={fieldClass} type="date" max={new Date().toISOString().slice(0, 10)} required />
          </label>

          <fieldset>
            <FieldLabel required>Gender</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['male', 'Laki-laki'],
                ['female', 'Perempuan'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGender(value)}
                  className={`min-h-12 rounded-[14px] border px-3 sf-type-2 font-semibold transition ${gender === value ? 'border-[#00813f] bg-[#00813f] text-white' : 'border-black/12 bg-white/60 text-black/58'}`}
                  aria-pressed={gender === value}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="sm:col-span-2">
            <FieldLabel required>Pekerjaan saat ini</FieldLabel>
            <select value={occupation} onChange={(event) => setOccupation(event.target.value)} className={fieldClass} required>
              <option value="">Pilih pekerjaan</option>
              {OCCUPATIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              <option value="other">Lainnya</option>
            </select>
          </label>
          {occupation === 'other' ? (
            <label className="sm:col-span-2">
              <FieldLabel required>Pekerjaan lainnya</FieldLabel>
              <input value={otherOccupation} onChange={(event) => setOtherOccupation(event.target.value)} className={fieldClass} maxLength={100} required />
            </label>
          ) : null}
        </div>
      </section>

      <section className={sectionClass}>
        <SectionHeading
          index="04"
          title="Preferensi"
          description="Biar promo dan komunikasi berikutnya lebih relevan."
        />
        <label>
          <FieldLabel required>Tahu Fleurstales dari mana?</FieldLabel>
          <select value={acquisitionSource} onChange={(event) => setAcquisitionSource(event.target.value)} className={fieldClass} required>
            <option value="">Pilih sumber</option>
            {ACQUISITION_SOURCES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            <option value="other">Lainnya</option>
          </select>
        </label>
        {acquisitionSource === 'other' ? (
          <label className="mt-4 block">
            <FieldLabel required>Sumber lainnya</FieldLabel>
            <input value={otherSource} onChange={(event) => setOtherSource(event.target.value)} className={fieldClass} maxLength={120} required />
          </label>
        ) : null}

        <fieldset className="mt-5">
          <FieldLabel required>Promo yang paling menarik buat kamu</FieldLabel>
          <p className="-mt-1 mb-3 sf-type-1 text-black/38">Boleh pilih lebih dari satu.</p>
          <div className="flex flex-wrap gap-2">
            {PROMOS.map((option) => {
              const active = promoPreferences.includes(option.value)
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => togglePromo(option.value)}
                  className={`min-h-11 rounded-full border px-4 sf-type-2 font-semibold transition ${active ? 'border-[#d84b72] bg-[#f8d9e4] text-[#9e2b52]' : 'border-black/12 bg-white/60 text-black/58'}`}
                  aria-pressed={active}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </fieldset>
      </section>

      {message ? (
        <p role="alert" className="rounded-xl bg-[#d84b72]/[0.07] px-4 py-3 sf-type-2 text-[#8f2448]">{message}</p>
      ) : null}

      <div className="border-t border-black/10 pt-5">
        <p className="mb-3 sf-type-1 text-black/40">Kolom bertanda * wajib diisi sebelum review bisa dikirim.</p>
        <button
          type="submit"
          disabled={busy || !formComplete}
          className="sf-primary-action tap-scale min-h-12 w-full px-6 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {busy ? 'Mengirim…' : 'Kirim review & aktifkan diskon'}
        </button>
      </div>
    </form>
  )
}

export default StorefrontReviewForm

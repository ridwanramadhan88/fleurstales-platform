import { useEffect, useState, type FC } from 'react'
import { Gift, MessageSquareText, Plus, Save, Trash2 } from 'lucide-react'
import { useUserStore } from '../../store/userStore'
import {
  getReviewConfiguration,
  saveReviewQuestions,
  saveReviewRewardSettings,
  type ReviewConfiguration,
  type ReviewQuestionConfig,
} from '../../data/reviewConfiguration'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'

const moneyFormatter = new Intl.NumberFormat('id-ID')
const inputClass = 'h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20'

const normalizeQuestion = (question: ReviewQuestionConfig, index: number): ReviewQuestionConfig => ({
  ...question,
  question: question.question.trim(),
  displayOrder: (index + 1) * 10,
})

export const ReviewPromoSettings: FC = () => {
  const role = useUserStore((state) => state.role)
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState<ReviewConfiguration | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || (role !== 'owner' && role !== 'admin')) return
    let active = true
    setLoading(true)
    setError(null)
    setMessage(null)
    void getReviewConfiguration()
      .then((result) => { if (active) setConfig(result) })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load review settings.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open, role])

  if (role !== 'owner' && role !== 'admin') return null

  const updateQuestion = (id: string, value: string) => {
    setConfig((current) => current ? {
      ...current,
      questions: current.questions.map((question) => question.id === id ? { ...question, question: value } : question),
    } : current)
  }

  const toggleQuestion = (id: string) => {
    setConfig((current) => current ? {
      ...current,
      questions: current.questions.map((question) => question.id === id ? { ...question, isActive: !question.isActive } : question),
    } : current)
  }

  const removeQuestion = (id: string) => {
    setConfig((current) => current ? {
      ...current,
      questions: current.questions.filter((question) => question.id !== id),
    } : current)
  }

  const addQuestion = () => {
    setConfig((current) => {
      if (!current || current.questions.length >= 5) return current
      return {
        ...current,
        questions: [...current.questions, {
          id: `review_q_${Date.now().toString(36)}`,
          question: '',
          displayOrder: (current.questions.length + 1) * 10,
          isActive: true,
        }],
      }
    })
  }

  const save = async () => {
    if (!config || saving) return
    const questions = config.questions.map(normalizeQuestion)
    if (questions.length === 0 || questions.some((question) => !question.question)) {
      setError('Add at least one review question and complete every question text.')
      return
    }
    if (!questions.some((question) => question.isActive)) {
      setError('At least one review question must stay active.')
      return
    }
    if (!(config.reward.percentOff > 0 && config.reward.percentOff <= 100)) {
      setError('Review reward must be between 1% and 100%.')
      return
    }
    if (config.reward.minOrderIdr < 0) {
      setError('Minimum order cannot be negative.')
      return
    }

    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const withQuestions = await saveReviewQuestions(questions)
      const saved = await saveReviewRewardSettings({
        ...config.reward,
        revision: withQuestions.reward.revision,
      })
      setConfig(saved)
      setMessage('Review questions and next-order promo saved.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save review settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap-scale inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground shadow-ios-sm hover:bg-primary/90 sm:w-auto"
      >
        <Gift className="size-4" />
        Review &amp; promo
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Review &amp; next-order promo</DialogTitle>
            <DialogDescription>
              Configure customer review questions and the automatic promo earned after one completed review.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[68vh] overflow-y-auto px-1 pb-1">
            {loading && <p className="py-4 text-xs text-muted-foreground">Loading review settings…</p>}
            {error && <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
            {message && <p role="status" className="mb-4 rounded-lg bg-success/10 px-3 py-2 text-xs text-success">{message}</p>}

            {config && !loading && (
              <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
                <div className="space-y-3 rounded-xl bg-surface-panel p-4 ring-1 ring-border/60">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Review promo</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Automatically available for the customer's next eligible Storefront order.</p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs font-medium">
                      <input type="checkbox" checked={config.reward.enabled} onChange={(event) => setConfig((current) => current ? { ...current, reward: { ...current.reward, enabled: event.target.checked } } : current)} />
                      Enabled
                    </label>
                  </div>

                  <label className="block space-y-1.5 text-xs font-medium">
                    Discount (%)
                    <input type="number" min={1} max={100} value={config.reward.percentOff} onChange={(event) => setConfig((current) => current ? { ...current, reward: { ...current.reward, percentOff: Number(event.target.value) } } : current)} className={inputClass} />
                  </label>
                  <label className="block space-y-1.5 text-xs font-medium">
                    Minimum order (IDR)
                    <input type="number" min={0} step={1000} value={config.reward.minOrderIdr} onChange={(event) => setConfig((current) => current ? { ...current, reward: { ...current.reward, minOrderIdr: Math.max(0, Number(event.target.value)) } } : current)} className={inputClass} />
                    <span className="block text-2xs font-normal text-muted-foreground">Current minimum: Rp {moneyFormatter.format(config.reward.minOrderIdr)}</span>
                  </label>
                </div>

                <div className="space-y-3 rounded-xl bg-surface-panel p-4 ring-1 ring-border/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <MessageSquareText className="mt-0.5 size-4 text-primary" />
                      <div>
                        <p className="text-sm font-semibold">Review questions</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Customers score each active question from 1–5. Kritik &amp; saran stays optional.</p>
                      </div>
                    </div>
                    <button type="button" disabled={config.questions.length >= 5} onClick={addQuestion} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold disabled:opacity-35">
                      <Plus className="size-3.5" /> Add
                    </button>
                  </div>

                  <div className="space-y-2">
                    {config.questions.map((question, index) => (
                      <div key={question.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-card p-2 ring-1 ring-border/60">
                        <span className="flex size-7 items-center justify-center rounded-full bg-muted text-2xs font-semibold text-muted-foreground">{index + 1}</span>
                        <input value={question.question} onChange={(event) => updateQuestion(question.id, event.target.value)} maxLength={160} placeholder="Review question" className="h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50" />
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => toggleQuestion(question.id)} className={`h-9 rounded-full px-3 text-2xs font-semibold ${question.isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>{question.isActive ? 'Active' : 'Hidden'}</button>
                          <button type="button" disabled={config.questions.length <= 1} onClick={() => removeQuestion(question.id)} aria-label={`Remove question ${index + 1}`} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-25"><Trash2 className="size-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-11 items-center justify-center rounded-full px-[18px] text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || loading || !config}
              onClick={() => void save()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              <Save className="size-4" /> {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default ReviewPromoSettings

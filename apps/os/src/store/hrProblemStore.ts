import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { apiStorage } from './persistApiStorage'
import type { HrProblemStatus } from '../domain/hrProblemDomain'

export interface HrProblemReview {
  problemId: string
  status: HrProblemStatus
  reviewNote?: string
  reviewedBy?: string
  reviewedAt?: string
  resolvedAt?: string
}

interface HrProblemState {
  reviews: Record<string, HrProblemReview>
  setProblemStatus: (problemId: string, status: HrProblemStatus, note?: string, actor?: string) => void
}

const withoutAttendanceMirrors = (reviews: Record<string, HrProblemReview> = {}) =>
  Object.fromEntries(Object.entries(reviews).filter(([problemId]) => !problemId.startsWith('attendance:')))

export const useHrProblemStore = create<HrProblemState>()(persist((set) => ({
  reviews: {},
  setProblemStatus: (problemId, status, note, actor) => set((state) => {
    // Attendance cases are authoritative and must be reviewed through hrStore.reviewAttendanceCase.
    if (problemId.startsWith('attendance:')) return state
    return {
      reviews: {
        ...state.reviews,
        [problemId]: {
          problemId,
          status,
          reviewNote: note?.trim() || state.reviews[problemId]?.reviewNote,
          reviewedBy: actor,
          reviewedAt: new Date().toISOString(),
          resolvedAt: status === 'solved' ? new Date().toISOString() : undefined,
        },
      },
    }
  }),
}), {
  name: 'hr-problem-reviews',
  version: 1,
  storage: createJSONStorage(() => apiStorage),
  migrate: (persistedState) => {
    const state = (persistedState ?? {}) as Partial<HrProblemState>
    return { ...state, reviews: withoutAttendanceMirrors(state.reviews) } as HrProblemState
  },
  partialize: (state) => ({ reviews: withoutAttendanceMirrors(state.reviews) }) as HrProblemState,
}))

import type { FC } from 'react'
import { CalendarDays, Clock3, MapPin, RefreshCw } from 'lucide-react'
import { useHrStore, todayIsoDate } from '../../store/hrStore'
import { useUserStore } from '../../store/userStore'
import { getMondayForDate, getWeekDates, toIsoDate } from '../../domain/hrSchedulingDomain'
import { StatusChip } from '../ui/chip'
import { surfaceCardClass } from '../ui/card'

const formatDay = (date:string) => new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'2-digit',month:'short'}).format(new Date(`${date}T00:00:00`))

export const MySchedulePanel:FC = () => {
  const employeeId = useUserStore((state)=>state.employeeId)
  const overrides = useHrStore((state)=>state.scheduleOverrides)
  const publications = useHrStore((state)=>state.weeklySchedulePublications)
  const revisions = useHrStore((state)=>state.scheduleRevisions)
  const today = todayIsoDate()
  const weekStart = toIsoDate(getMondayForDate(today))
  const dates = getWeekDates(weekStart)
  const week = dates.map((date)=>({date,assignment:overrides.find((item)=>item.employeeId===employeeId&&item.date===date)}))
  const todayItem = week.find((item)=>item.date===today)
  const nextOff = week.find((item)=>item.date>=today && item.assignment && !item.assignment.shift.isWorking)
  const publication = publications.find((item)=>item.weekStart===weekStart && (item.branchId==='All'||week.some((cell)=>cell.assignment?.shift.branchId===item.branchId)))
  const latestRevision = revisions.find((item)=>item.employeeId===employeeId && dates.includes(item.date))

  return <section className={surfaceCardClass('standard')}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><CalendarDays className="size-5 text-primary"/><h2 className="text-base font-semibold leading-6">My schedule</h2></div>
        <p className="mt-1 text-xs text-muted-foreground">Your published branch and shift for this week.</p>
      </div>
      <StatusChip tone={publication?.status==='published' ? 'success' : 'info'}>{publication?.status==='published'?'Published':'Schedule update pending'}</StatusChip>
    </div>

    <div className="mt-4 grid grid-cols-2 gap-2.5">
      <div className="rounded-xl bg-primary/5 p-3 ring-1 ring-primary/15 sm:p-4">
        <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Today</p>
        {!todayItem?.assignment ? <p className="mt-2 text-sm font-semibold">Not assigned</p> : !todayItem.assignment.shift.isWorking ? <><p className="mt-2 text-lg font-semibold">OFF</p><p className="text-xs text-muted-foreground">Weekly rest</p></> : <>
          <p className="mt-2 text-lg font-semibold">{todayItem.assignment.shift.branchId}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="size-3.5"/>{todayItem.assignment.shift.startTime}–{todayItem.assignment.shift.endTime}</div>
        </>}
      </div>
      <div className="rounded-xl bg-surface-panel p-3 ring-1 ring-border/60 sm:p-4">
        <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Next rest day</p>
        <p className="mt-2 text-lg font-semibold">{nextOff?formatDay(nextOff.date):'Not assigned'}</p>
        {latestRevision&&<p className="mt-2 flex items-center gap-1.5 text-xs text-warning"><RefreshCw className="size-3.5"/>Changed by {latestRevision.changedBy}</p>}
      </div>
    </div>

    <div className="no-scrollbar -mx-4 mt-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 scroll-px-4 sm:-mx-5 sm:px-5 md:mx-0 md:grid md:grid-cols-7 md:gap-2 md:overflow-visible md:px-0">
      {week.map(({date,assignment})=><div key={date} className={`w-[5.25rem] shrink-0 snap-start rounded-xl px-2 py-3 text-center ring-1 md:w-auto ${date===today?'bg-primary/10 ring-primary/30':'bg-background ring-border/60'}`}>
        <p className="text-2xs font-semibold text-muted-foreground">{formatDay(date).split(' ')[0]}</p>
        <p className="mt-0.5 text-xs font-semibold">{new Date(`${date}T00:00:00`).getDate()}</p>
        {!assignment?<p className="mt-1 truncate text-2xs text-muted-foreground">Not set</p>:!assignment.shift.isWorking?<p className="mt-1 text-2xs font-semibold text-destructive">OFF</p>:<><p className="mt-1 truncate text-2xs font-semibold">{assignment.shift.branchId==='Kedamaian'?'KDM':'PHM'}</p><p className="truncate text-2xs text-muted-foreground">{assignment.shift.startTime}</p></>}
      </div>)}
    </div>
    {todayItem?.assignment?.shift.isWorking&&<p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground"><MapPin className="mt-0.5 size-3.5 shrink-0"/><span>Attendance will be checked against {todayItem.assignment.shift.branchId} and the scheduled shift.</span></p>}
  </section>
}

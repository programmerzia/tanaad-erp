import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Camera, Check, CheckCircle2, CreditCard, History, IdCard, Printer, RotateCcw, ScanFace, Timer, UserCheck, UserPlus, Users, type LucideIcon } from 'lucide-react';
import type { Person } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useGo, useRefList, useSite } from '@/app/hooks';
import { Avatar, Badge, Bar, Button, ChipGroup, DataGrid, Empty, Input, Note, NumberPad, PageHeader, Panel, Status, cn, useIsTouch, useTimer, type Column } from '@/components/ui';
import { QR } from '@/components/Sticker';
import { printer } from '@/devices';
import { activeEngagement, addDays, currentShiftKind, rosterFor, shiftId } from '@/data/selectors';
import { fmtDayShort, fmtNum, fmtUGX } from '@/data/format';
import { SITES } from '@/config/sites';
import { EngTag, IconChip, MasterEmpty } from './kit';

/** "Monday gate": a casual worker registered in under a minute, camera first, everything on one screen. */
export function Signup() {
  const [run, setRun] = useState(0);
  return <SignupDesk key={run} onRestart={() => setRun((r) => r + 1)} />;
}

const say = (t: { kind: 'ok' | 'warn' | 'error' | 'info'; title: string; detail?: string }) => useStore.getState().toast(t);

function SignupDesk({ onRestart }: { onRestart: () => void }) {
  const s = useStore(); const site = useSite(); const go = useGo(); const touch = useIsTouch(); const kind = currentShiftKind();
  const rates = useRefList('daily_rate').filter((r) => (r.value ?? 0) > 0);
  const [started, setStarted] = useState(false);
  const [idShot, setIdShot] = useState(false);
  const [faceShot, setFaceShot] = useState(false);
  const [idNumber, setIdNumber] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sector, setSector] = useState<string | null>(null);
  const [rate, setRate] = useState('');
  const [done, setDone] = useState<{ person: Person; seconds: number } | null>(null);
  const [marked, setMarked] = useState(false);
  const [badge, setBadge] = useState<'hidden' | 'printing' | 'shown'>('hidden');
  const elapsed = useTimer(started && !done);
  const faceRef = useRef<HTMLButtonElement>(null); const nameRef = useRef<HTMLInputElement>(null);
  const begin = () => setStarted(true);

  const phoneOwner = phone.length >= 10 ? s.people.find((p) => p.phoneMomo === phone && p.status === 'active') : undefined;
  const rateN = parseInt(rate || '0', 10);
  const ok = { id: idShot, face: faceShot, name: name.trim().length >= 3, phone: phone.length === 10 && !phoneOwner, sector: !!sector, rate: rateN > 0 };
  const missing = [!ok.id && 'ID photo', !ok.face && 'face photo', !ok.name && 'name', !ok.phone && (phoneOwner ? 'a phone not already in use' : 'phone'), !ok.sector && 'sector', !ok.rate && 'rate'].filter((x): x is string => !!x);
  const doneCount = 6 - missing.length; const ready = missing.length === 0;

  const register = () => {
    if (!ready || !sector) return;
    const seconds = Math.round(elapsed);
    const person = s.registerCasual({ siteId: site.id, fullName: name.trim(), phoneMomo: phone, sector, rate: rateN, idNumber: idNumber || 'to be read' });
    setDone({ person, seconds });
    say({ kind: 'ok', title: `${person.fullName} signed up`, detail: `${seconds} seconds · ${sector} · ${fmtUGX(rateN)} per day` });
  };
  const markNow = () => {
    if (!done || marked) return;
    s.markAttendance({ shiftId: shiftId(site.id, s.today, kind), personId: done.person.id, siteId: site.id, status: 'present' });
    setMarked(true);
    say({ kind: 'ok', title: 'Marked present', detail: `${done.person.fullName} on the ${kind} shift` });
  };
  const printBadge = async () => { if (!done || badge === 'printing') return; setBadge('printing'); await printer.print({ code: done.person.id, lines: [done.person.fullName, done.person.sector] }); setBadge('shown'); say({ kind: 'ok', title: 'Badge printed' }); };

  const seconds = done ? done.seconds : Math.floor(elapsed); const over = seconds >= 60;
  const today = s.people.filter((p) => p.homeSiteId === site.id && p.joinedOn === s.today);
  const week = s.people.filter((p) => p.homeSiteId === site.id && p.joinedOn > addDays(s.today, -7)).length;
  const onShift = (id: string) => s.attendance.some((a) => a.personId === id && a.shiftId === shiftId(site.id, s.today, kind) && a.status !== 'absent');
  const shiftNow = shiftId(site.id, s.today, kind);
  const onNow = new Set(s.attendance.filter((a) => a.shiftId === shiftNow && a.status !== 'absent').map((a) => a.personId));
  const roster = rosterFor(s, site.id);
  const load = site.sectors.map((x) => { const g = roster.filter((r) => r.person.sector === x); return { sector: x, total: g.length, on: g.filter((r) => onNow.has(r.person.id)).length, casuals: g.filter((r) => r.engagement?.type === 'casual').length }; });
  const logCols: Column<Person>[] = [
    { key: 'n', header: 'Worker', truncate: 150, cell: (p) => <span className="inline-flex items-center gap-1.5"><Avatar name={p.fullName} seed={p.avatarSeed} size={18} /><span className="font-medium">{p.fullName}</span></span> },
    { key: 's', header: 'Sector', cell: (p) => <span className="text-[var(--text-2)]">{p.sector}</span> },
    { key: 'r', header: 'Rate', align: 'right', mono: true, cell: (p) => fmtNum(activeEngagement(s, p.id)?.rate ?? 0) },
    { key: 'a', header: 'Shift', cell: (p) => <Status tone={onShift(p.id) ? 'ok' : 'neutral'}>{onShift(p.id) ? 'Present' : 'Not marked'}</Status> },
  ];

  const card = done ? { name: done.person.fullName, sector: done.person.sector, idNumber: done.person.idNumber, phone: done.person.phoneMomo, since: done.person.joinedOn, code: done.person.id } : { name: name.trim(), sector: sector ?? '', idNumber, phone, since: s.today, code: '' };

  return (
    <div>
      <PageHeader eyebrow={`People · ${site.name}`} title="Casual sign-up" meta={<><Badge>{kind === 'day' ? 'Day' : 'Night'} shift</Badge><Badge>{fmtDayShort(s.today)}</Badge></>}
        subtitle="Camera first, then four fields. The timer starts with the first photo or keystroke."
        actions={(
          <div className={cn('surface flex items-center gap-3.5 pl-2.5 pr-4 py-2 max-sm:w-full', over && !done && 'border-[var(--warn)]')} role="timer" aria-label="Sign-up timer">
            <IconChip icon={done ? CheckCircle2 : Timer} color={done ? 'var(--ok)' : over ? 'var(--warn)' : started ? 'var(--accent)' : 'var(--text-3)'} className="size-10 [&_svg]:size-5" />
            <div className={cn('num t-hero leading-none min-w-[74px]', done && !over && 'text-[var(--ok)]', over && !done && 'text-[var(--warn)]')}>{seconds}<span className="t-base font-medium text-[var(--text-3)]"> s</span></div>
            <div className="w-[190px] max-sm:flex-1">
              <div className="flex justify-between t-sm mb-1.5"><span className="inline-flex items-center gap-1.5 font-medium">{started && !done && <span className="size-1.5 rounded-full bg-[var(--accent)] anim-live" />}{done ? 'Registered' : !started ? 'Not started' : over ? 'Over a minute' : 'Running'}</span><span className="num text-[var(--text-3)]">{done || !started ? 'target 60 s' : over ? `${seconds - 60} s over` : `${60 - seconds} s left`}</span></div>
              <Bar value={Math.min(seconds, 60)} max={60} tone={over ? 'warn' : 'ok'} height={6} />
              <div className="flex justify-between t-xs text-[var(--text-3)] mt-1 num"><span>{done ? 6 : doneCount} of 6 steps</span><span>{today.length} signed up today</span></div>
            </div>
          </div>
        )} />

      <div className="grid gap-[var(--gap)] items-start min-[1180px]:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 flex flex-col gap-[var(--gap)]">
        {done ? (
          <Panel icon={CheckCircle2} title="Registered" sub={`${site.name} · ready for the ${kind} shift`} pad={false}
            footer={<div className="flex flex-wrap items-center justify-between gap-2"><span>{marked ? 'On the attendance sheet for today.' : 'Not on the attendance sheet yet.'}</span><span className="flex flex-wrap items-center justify-end gap-1.5 ml-auto">
              <Button variant="ghost" icon={Printer} hotkey="p" hotkeyLabel="Print QR badge" onClick={printBadge} disabled={badge === 'printing'}>{badge === 'printing' ? 'Printing…' : badge === 'shown' ? 'Print again' : 'Print QR badge'}</Button>
              <Button icon={UserPlus} hotkey="n" hotkeyLabel="Sign up another worker" onClick={onRestart}>Sign up another</Button>
              <Button variant="primary" icon={UserCheck} hotkey="mod+enter" hotkeyLabel="Mark present now" onClick={markNow} disabled={marked}>{marked ? 'Present on this shift' : 'Mark present now'}</Button>
            </span></div>}>
            <div className="p-[var(--pad)] flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[var(--line)] anim-pop">
              <Avatar name={done.person.fullName} seed={done.person.avatarSeed} size={56} ring={marked ? 'ok' : 'none'} />
              <div className="min-w-0 flex-1">
                <div className="t-title truncate">{done.person.fullName}</div>
                <div className="t-base text-[var(--text-2)] mt-0.5">{done.person.sector} · {fmtUGX(rateN)} per day · <span className="num">{done.person.phoneMomo}</span></div>
              </div>
              <div className="text-right">
                <div className={cn('num t-hero', done.seconds < 60 && 'text-[var(--ok)]')}>{done.seconds}<span className="t-lg font-medium text-[var(--text-3)]"> s</span></div>
                <Badge tone={done.seconds < 60 ? 'ok' : 'neutral'} dot className="mt-1">{done.seconds < 60 ? 'Under a minute' : 'Done'}</Badge>
              </div>
            </div>
            <dl className="grid sm:grid-cols-2 gap-x-8 px-[var(--pad)] py-2">
              {([['ID number', <span className="code">{done.person.idNumber}</span>], ['Mobile money', <span className="num">{done.person.phoneMomo}</span>], ['Sector', done.person.sector], ['Daily rate', <span className="num">{fmtUGX(rateN)}</span>], ['Engagement', <EngTag type="casual" />], ['Settlement', 'Weekly, with the casual run'], ['Joined', fmtDayShort(done.person.joinedOn)], ['Photos on file', 'ID card and face']] as [string, ReactNode][]).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 h-[var(--row-h)] border-b border-[var(--line)] t-base"><dt className="text-[var(--text-2)]">{k}</dt><dd className="font-medium m-0 text-right truncate">{v}</dd></div>
              ))}
            </dl>
          </Panel>
        ) : (
          <Panel icon={UserPlus} title="New casual worker" sub="six steps, one screen" pad={false}
            actions={<span className="flex items-center gap-2 pr-2"><Bar value={doneCount} max={6} tone={ready ? 'ok' : 'series'} className="w-[72px]" /><span className="num t-sm text-[var(--text-2)]">{doneCount}/6</span></span>}
            footer={<div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0">{ready ? <span className="inline-flex items-center gap-1.5 text-[var(--ok)] font-medium"><Check className="size-3.5" strokeWidth={3} />Ready to register</span> : <>Still needed: {missing.join(', ')}.</>}</span>
              <span className="flex items-center gap-1.5 ml-auto"><Button variant="ghost" icon={RotateCcw} onClick={onRestart} disabled={!started && !name && !phone && !sector && !rate}>Clear</Button><Button variant="primary" icon={Check} hotkey="mod+enter" hotkeyLabel="Register worker" onClick={register} disabled={!ready}>Register worker</Button></span>
            </div>}>
            <div className="grid sm:grid-cols-2 gap-[var(--gap)] p-[var(--pad)] border-b border-[var(--line)]">
              <CaptureTile n={1} icon={CreditCard} title="ID card" hint="Hold the card flat" captured={idShot} autoFocus={!touch}
                detail={idNumber ? <>Number read: <span className="code text-[var(--text)]">{idNumber}</span></> : undefined}
                onCapture={() => { begin(); setIdShot(true); if (!idNumber) setIdNumber(`CM${90 + Math.floor(Math.random() * 9)}${Math.floor(1000000 + Math.random() * 8999999)}`); setTimeout(() => (faceShot ? nameRef : faceRef).current?.focus(), 30); }} onRetake={() => setIdShot(false)} />
              <CaptureTile n={2} icon={ScanFace} title="Face" hint="Face in the circle, good light" captured={faceShot} round btnRef={faceRef}
                detail="Stored with the worker record"
                onCapture={() => { begin(); setFaceShot(true); setTimeout(() => nameRef.current?.focus(), 30); }} onRetake={() => setFaceShot(false)} />
            </div>
            <Step n={3} title="Full name" hint="As printed on the ID card" done={ok.name}>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <Input ref={nameRef} aria-label="Full name" placeholder="Full name" value={name} onChange={(e) => { begin(); setName(e.target.value); }} autoComplete="off" />
                <Input aria-label="ID number" placeholder="ID number" value={idNumber} onChange={(e) => setIdNumber(e.target.value.toUpperCase())} className="code" autoComplete="off" />
              </div>
              <div className="t-xs text-[var(--text-3)] mt-1">The ID number is read from the photo. Correct it if the camera misread a digit.</div>
            </Step>
            <Step n={4} title="Mobile money number" hint="10 digits, used for payouts" done={ok.phone}>
              <div className="relative max-w-[280px]">
                <Input aria-label="Mobile money number" inputMode="numeric" placeholder="10-digit number" value={phone} onChange={(e) => { begin(); setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); }} className="num pr-14" autoComplete="off" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 t-sm num text-[var(--text-3)] pointer-events-none">{ok.phone ? <Check className="size-4 text-[var(--ok)]" strokeWidth={3} /> : `${phone.length}/10`}</span>
              </div>
              {phoneOwner && <Note tone="bad" className="mt-2"><b>Already registered to {phoneOwner.fullName}</b> ({phoneOwner.sector}, {SITES[phoneOwner.homeSiteId].shortName}). One number, one worker. Check the ID card.</Note>}
            </Step>
            <Step n={5} title="Sector" hint="Where they start today" done={ok.sector}>
              {site.sectors.length === 0 ? <MasterEmpty compact title="No sectors set up" hint="Add sectors in Settings → Master data." />
                : <ChipGroup ariaLabel="Sector" options={site.sectors.map((x) => ({ value: x, label: x }))} value={sector} onChange={(v) => { begin(); setSector(v); }} />}
            </Step>
            <Step n={6} title="Daily rate" hint="UGX per day worked" done={ok.rate}>
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                {rates.length > 0 && <ChipGroup ariaLabel="Usual rates" options={rates.map((r) => ({ value: String(r.value), label: fmtNum(r.value ?? 0) }))} value={rates.some((r) => String(r.value) === rate) ? rate : null} onChange={(v) => { begin(); setRate(v); }} />}
                <div className="w-full compact:max-w-[220px] touch:max-w-[340px] compact:[&_input]:!h-[var(--ctl-h)] compact:[&_input]:!text-[length:var(--fs)]"><NumberPad value={rate} onChange={(v) => { begin(); setRate(v); }} suffix="UGX" /></div>
              </div>
              {rates.length === 0 ? <div className="mt-2"><MasterEmpty compact title="No usual rates set up" hint="Type the rate, or add daily rates in Settings → Master data." /></div>
                : <div className="t-xs text-[var(--text-3)] mt-1">Pick a usual rate or type another. Paid weekly with the casual settlement run.</div>}
            </Step>
          </Panel>
        )}
          {load.length > 0 && (
            <Panel icon={Users} title="Sectors right now" sub={`on the ${kind} shift · of roster${done ? '' : ' · select a row to place the worker'}`} pad={false}>
              <div className="grid sm:grid-cols-2 xl:grid-cols-4">
                {load.map((x) => {
                  const picked = (done ? done.person.sector : sector) === x.sector;
                  return (
                    <button key={x.sector} type="button" tabIndex={-1} disabled={!!done} onClick={() => { begin(); setSector(x.sector); }} aria-label={`${x.sector}: ${x.on} of ${x.total} on shift`}
                      className={cn('text-left px-[var(--pad)] py-2.5 border-b border-r border-[var(--line)] -mr-px -mb-px', !done && 'hover:bg-[var(--hover)]', picked && 'bg-[var(--selected)] shadow-[inset_2px_0_0_var(--accent)]')}>
                      <div className="flex items-baseline justify-between gap-2 mb-1.5"><span className="t-base font-medium truncate">{x.sector}</span><span className="num t-base font-medium shrink-0">{x.on}<span className="text-[var(--text-3)] font-normal"> / {x.total}</span></span></div>
                      <Bar value={x.on} max={x.total || 1} tone="series" height={5} />
                      <div className="t-xs text-[var(--text-3)] mt-1.5 num">{x.casuals} casual{x.casuals === 1 ? '' : 's'} on the roster</div>
                    </button>
                  );
                })}
              </div>
            </Panel>
          )}
        </div>

        <aside className="min-w-0 grid gap-[var(--gap)] items-start md:max-[1179px]:grid-cols-2">
          <Panel icon={IdCard} title="Worker card" sub={done ? undefined : 'live preview'} actions={<Badge tone={done ? 'ok' : 'neutral'} dot>{done ? 'Registered' : 'Draft'}</Badge>}>
            <div className="flex items-center gap-3">
              <Avatar name={card.name || '?'} size={44} className={cn(!card.name && 'opacity-40')} ring={marked ? 'ok' : 'none'} />
              <div className="min-w-0 flex-1">
                <div className={cn('t-lg font-semibold truncate', !card.name && 'text-[var(--text-4)] font-normal')}>{card.name || 'Name as on the ID card'}</div>
                <div className="t-sm text-[var(--text-3)] truncate">{card.sector || 'Sector'} · {rateN ? `${fmtUGX(rateN)} per day` : 'rate not set'}</div>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3 grid place-items-center overflow-hidden">
              <div className={cn('relative bg-white text-black rounded-md border border-neutral-300 shadow-[var(--shadow-raise)] font-mono select-none p-3 w-full max-w-[272px]', badge === 'printing' && 'anim-print')}>
                <div className="flex items-start justify-between gap-3">
                  <div><div className="font-black tracking-[0.18em] italic leading-none text-[15px]">TANAAD</div><div className="uppercase tracking-[0.12em] text-neutral-500 text-[8px] mt-0.5">{site.legalName}</div></div>
                  <div className={cn(!done && 'opacity-25')}><QR value={`PER:${card.code || 'preview'}`} size={60} /></div>
                </div>
                <div className="mt-2 text-[12px] grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <div className="text-neutral-500 tracking-wider">NAME</div><div className="font-bold truncate">{card.name || '—'}</div>
                  <div className="text-neutral-500 tracking-wider">SECTOR</div><div className="font-bold truncate">{card.sector || '—'}</div>
                  <div className="text-neutral-500 tracking-wider">ID</div><div className="font-bold truncate">{card.idNumber || '—'}</div>
                  <div className="text-neutral-500 tracking-wider">SINCE</div><div className="font-bold">{card.since}</div>
                </div>
                <div className="mt-2 pt-1.5 border-t border-dashed border-neutral-400 text-[10px] font-bold tracking-wider flex justify-between"><span>CASUAL</span><span className="text-neutral-500 font-normal">{done ? done.person.id.slice(-6).toUpperCase() : 'NOT ISSUED'}</span></div>
              </div>
            </div>
            <div className="t-xs text-[var(--text-3)] mt-2">{done ? (badge === 'shown' ? 'Badge printed. The QR code opens this worker on any scanner.' : 'Press P to print this badge.') : 'The QR badge is issued when the worker is registered.'}</div>
          </Panel>

          <Panel icon={History} title="Registered today" sub={today.length ? `${today.length} at ${site.shortName}` : undefined} pad={false} footer={`${week} casual${week === 1 ? '' : 's'} joined in the last 7 days.`}>
            {today.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={UserPlus} title="Nobody registered yet today" hint="Each sign-up lands here and on the attendance sheet." /></div>
              : <DataGrid bare dense rows={today} columns={logCols} rowKey={(p) => p.id} onRowClick={(p) => go.site('people/registry', undefined, p.fullName)} maxHeight={280} />}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function StepNo({ n, done }: { n: number; done: boolean }) {
  return <span className={cn('size-5 touch:size-6 rounded-md grid place-items-center t-xs font-semibold shrink-0 num', done ? 'bg-[var(--ok-bg)] text-[var(--ok)]' : 'bg-[var(--surface-3)] text-[var(--text-2)]')} aria-label={done ? `Step ${n}, done` : `Step ${n}`}>{done ? <Check className="size-3" strokeWidth={3.5} /> : n}</span>;
}

/** One numbered row of the form: label on the left on desktop, stacked in touch density. */
function Step({ n, title, hint, done, children }: { n: number; title: string; hint?: string; done: boolean; children: ReactNode }) {
  return (
    <div className="grid gap-x-5 gap-y-2 px-[var(--pad)] py-3 border-b border-[var(--line)] last:border-b-0 compact:md:grid-cols-[190px_minmax(0,1fr)]">
      <div className="flex items-start gap-2.5 compact:md:pt-1.5"><StepNo n={n} done={done} /><div className="min-w-0 -mt-px"><div className="t-base font-medium">{title}</div>{hint && <div className="t-xs text-[var(--text-3)]">{hint}</div>}</div></div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Simulated camera: press, shutter, captured frame with a tick. */
function CaptureTile({ n, icon: Icon, title, hint, captured, round, detail, autoFocus, btnRef, onCapture, onRetake }: { n: number; icon: LucideIcon; title: string; hint: string; captured: boolean; round?: boolean; detail?: ReactNode; autoFocus?: boolean; btnRef?: RefObject<HTMLButtonElement | null>; onCapture: () => void; onRetake: () => void }) {
  const [shutter, setShutter] = useState(false);
  const t = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(t.current), []);
  const snap = () => { if (shutter || captured) return; setShutter(true); t.current = window.setTimeout(() => { setShutter(false); onCapture(); }, 450); };
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-1.5 min-h-[var(--ctl-h-sm)]">
        <StepNo n={n} done={captured} /><span className="t-base font-medium">{title}</span><span className="t-xs text-[var(--text-3)] truncate">{hint}</span>
        {captured && <Button size="sm" variant="ghost" className="ml-auto" onClick={onRetake}>Retake</Button>}
      </div>
      {captured ? (
        <div className="h-[124px] touch:h-[148px] rounded-lg border border-[color-mix(in_srgb,var(--ok)_45%,transparent)] bg-[var(--ok-bg)] flex items-center gap-4 px-4 anim-pop">
          <div className={cn('grid place-items-center shrink-0 bg-[linear-gradient(135deg,var(--color-ink-600),var(--color-ink-900))] text-white/80', round ? 'size-[84px] rounded-full' : 'w-[128px] h-[82px] rounded-md')}><Icon className="size-8" strokeWidth={1.5} /></div>
          <div className="min-w-0"><div className="inline-flex items-center gap-1.5 t-base font-semibold text-[var(--ok)]"><Check className="size-4" strokeWidth={3} />Captured</div>{detail && <div className="t-sm text-[var(--text-2)] mt-0.5">{detail}</div>}</div>
        </div>
      ) : (
        <button ref={btnRef} type="button" autoFocus={autoFocus} onClick={snap} aria-label={`Take the ${title.toLowerCase()} photo`}
          className="relative w-full h-[124px] touch:h-[148px] rounded-lg overflow-hidden border border-dashed border-[var(--line-2)] bg-[var(--surface-2)] hover:border-[var(--text-3)] focus-visible:border-[var(--focus)] flex items-center gap-4 px-4 text-left select-none">
          <span className={cn('relative grid place-items-center shrink-0 border border-dashed border-[var(--text-4)]', round ? 'size-[84px] rounded-full' : 'w-[128px] h-[82px] rounded-md')}><span className="size-9 rounded-full bg-[var(--brand)] text-[var(--brand-contrast)] grid place-items-center"><Camera className="size-4" /></span></span>
          <span className="min-w-0"><span className="block t-base font-medium">Take the photo</span><span className="block t-sm text-[var(--text-3)]">Press <span className="touch:hidden">Enter or </span>the frame.</span></span>
          {shutter && <span className="absolute inset-0 bg-white anim-fade" />}
        </button>
      )}
    </div>
  );
}

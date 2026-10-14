// Notifications: in-app pop-ups (stored in db.notifications, polled by the rider and driver apps), e-mails, and time-based reminders.
import nodemailer from 'nodemailer'
import { randomBytes } from 'node:crypto'
import { db, save, type Notification, type Ride } from './db'
import { CARS, phoneOf, rideWindow } from './dispatch'

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env
const mailer = SMTP_HOST && SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT ?? 465), secure: Number(SMTP_PORT ?? 465) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } })
  : null

export const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, (_m, a, d) => `${a}***${d}`)

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
const IST = 'Asia/Kolkata'
export const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit' })

async function sendMail(to: string, subject: string, text: string, html?: string): Promise<'sent' | 'failed' | 'not-configured'> {
  if (!to || !mailer) { console.log(`[mail not configured] to ${to || 'nobody'}: ${subject}`); return 'not-configured' }
  try { await mailer.sendMail({ from: SMTP_FROM ?? SMTP_USER, to, subject, text, html }); return 'sent' } catch (err) {
    console.log(`[mail failed] ${subject}: ${(err as Error).message}`)
    return 'failed'
  }
}

// When the ride is planned for, in words.
export function whenText(r: Ride) {
  if (r.tripType === 'multiday' && r.startAt && r.endAt) return `${fmtWhen(r.startAt)} to ${fmtWhen(r.endAt)}`
  if (r.startAt) return fmtWhen(r.startAt)
  return 'As soon as possible'
}

// The allocation as label/value rows: shown as a table in the rider app pop-up and in the e-mail.
export function allocationRows(r: Ride, withPin: boolean): [string, string][] {
  const car = CARS.find((c) => c.name === r.vehicle)
  const route = [r.pickup, ...(r.stops ?? []).map((s) => s.label), r.destination].join('  →  ')
  const rows: [string, string][] = [
    ['Booking', r.id],
    ['Passenger', `${r.riderName}${r.passengers > 1 ? ` (+${r.passengers - 1})` : ''}`],
    ['Route', route],
    [r.tripType === 'multiday' ? 'Dates' : 'Pickup time', whenText(r)],
    ['Car', `${r.vehicle}${car?.model ? ` · ${car.model}` : ''}`],
    ['Car number', r.plate],
    ['Seats', car ? String(car.seats) : '—'],
    ['Driver', r.driverName],
    ['Driver phone', phoneOf(r.driverId) || '—'],
  ]
  if (withPin) rows.push(['Ride PIN', r.otp])
  return rows
}

export function addNotification(n: Omit<Notification, 'createdAt' | 'read' | 'id'> & { id?: string }) {
  const id = n.id ?? `n-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
  if (db.notifications.some((x) => x.id === id)) return null
  const note: Notification = { ...n, id, createdAt: new Date().toISOString(), read: false }
  db.notifications.push(note)
  // Keep the list small: drop the oldest read ones once it grows.
  if (db.notifications.length > 600) {
    const keep = db.notifications.filter((x) => !x.read).concat(db.notifications.filter((x) => x.read).slice(-300))
    db.notifications.splice(0, db.notifications.length, ...keep)
  }
  save.notifications()
  return note
}

const rideLine = (r: Ride) => `${r.pickup}${r.stops?.length ? ` → ${r.stops.map((s) => s.label).join(' → ')}` : ''} → ${r.destination}`

// Admin approved the request and assigned a car and driver.
export async function notifyApproved(r: Ride) {
  if (r.riderId) {
    addNotification({
      role: 'rider', userId: r.riderId, rideId: r.id, kind: 'approved', title: 'Request approved',
      message: `Request approved, driver assigned: ${r.driverName} with ${r.vehicle} (${r.plate}).`,
      data: { rows: allocationRows(r, true) },
    })
  }
  addNotification({
    role: 'driver', userId: r.driverId, rideId: r.id, kind: 'assigned', title: 'New passenger assigned',
    message: `${r.riderName} (${r.phone || 'no phone'}) · ${rideLine(r)} · ${whenText(r)}`,
    data: { rows: allocationRows(r, false) },
  })
  if (!r.riderEmail) { r.otpDelivery = 'not-configured'; save.rides(); return }
  const rows = allocationRows(r, true)
  const text = `Hi ${r.riderName},\n\nRequest approved, driver assigned.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nTell the PIN to your driver when they arrive.\n`
  const html = `<p>Hi ${esc(r.riderName)},</p><p><strong>Request approved, driver assigned.</strong></p><table cellpadding="8" style="border-collapse:collapse;border:1px solid #dde3ea">${rows.map(([k, v]) => `<tr><td style="background:#f4f7fa;border:1px solid #dde3ea"><b>${esc(k)}</b></td><td style="border:1px solid #dde3ea">${esc(v)}</td></tr>`).join('')}</table><p>Tell the PIN to your driver when they arrive.</p>`
  r.otpDelivery = await sendMail(r.riderEmail, `MCCIA ride approved: ${r.vehicle}, driver ${r.driverName}`, text, html)
  save.rides()
}

export async function notifyHeld(r: Ride) {
  if (r.riderId) addNotification({ role: 'rider', userId: r.riderId, rideId: r.id, kind: 'held', title: 'Request on hold', message: r.holdNote ? `Your request is on hold: ${r.holdNote}` : 'Your request is on hold. The admin will get back to you.' })
  if (r.riderEmail) await sendMail(r.riderEmail, 'MCCIA ride request on hold', `Hi ${r.riderName},\n\nYour request ${r.id} (${rideLine(r)}) is on hold.${r.holdNote ? `\nNote: ${r.holdNote}` : ''}\n`)
}

export async function notifyCancelled(r: Ride) {
  const by = r.cancelledBy === 'rider' ? 'You cancelled this request.' : `Your request was cancelled by the admin${r.cancelReason ? `: ${r.cancelReason}` : '.'}`
  if (r.riderId && r.cancelledBy !== 'rider') addNotification({ role: 'rider', userId: r.riderId, rideId: r.id, kind: 'cancelled', title: 'Request cancelled', message: by })
  if (r.driverId) addNotification({ role: 'driver', userId: r.driverId, rideId: r.id, kind: 'cancelled', title: 'Ride cancelled', message: `${r.riderName}'s ride (${rideLine(r)}) was cancelled.` })
  if (r.riderEmail && r.cancelledBy !== 'rider') await sendMail(r.riderEmail, 'MCCIA ride request cancelled', `Hi ${r.riderName},\n\n${by}\nRequest ${r.id}: ${rideLine(r)}\n`)
}

/* ---------- Time-based reminders ----------
 * Approved rides remind the rider and the driver 30 minutes before the planned start. There is no background timer:
 * this runs on API requests (the apps poll every few seconds). Notification ids are fixed per ride and threshold, so two
 * API replicas can never send the same reminder twice. */
// Minutes before the planned start; override with REMINDER_MIN (e.g. 2 to test quickly).
const REMINDER_MIN = Number(process.env.REMINDER_MIN) > 0 ? Number(process.env.REMINDER_MIN) : 30
let lastRun = 0
export function runReminders() {
  const now = Date.now()
  if (now - lastRun < 10_000) return
  lastRun = now
  for (const r of db.rides) {
    if (r.status !== 'approved' || !r.startAt || !r.driverId) continue
    const start = rideWindow(r).start
    if (now >= start) continue
    const left = Math.max(1, Math.round((start - now) / 60_000))
    const at = fmtTime(new Date(start).toISOString())
    const day = new Date(start).toLocaleDateString('en-IN', { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short' })
    const today = new Date(now).toLocaleDateString('en-IN', { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short' })
    const label = day === today ? at : `${day}, ${at}`
    // The closest threshold that has been reached; an earlier one is never sent late.
    const t = [REMINDER_MIN].find((x) => now >= start - x * 60_000)
    if (t) {
      const key = `rem${t}-${r.id}`
      if (db.notifications.some((n) => n.id === `${key}-driver`)) continue
      if (r.riderId) {
        addNotification({
          id: `${key}-rider`, role: 'rider', userId: r.riderId, rideId: r.id, kind: 'reminder', title: `Your ride is in ${left} min`,
          message: `Your ride is at ${label}. Driver ${r.driverName} (${phoneOf(r.driverId) || 'no phone'}) in ${r.vehicle} ${r.plate} will pick you up. Need anything? Contact the driver.`,
          data: { phone: phoneOf(r.driverId), driver: r.driverName },
        })
        if (r.riderEmail) void sendMail(r.riderEmail, `Reminder: your MCCIA ride is at ${label}`, `Hi ${r.riderName},\n\nYour ride ${r.id} is at ${label}.\nDriver: ${r.driverName} (${phoneOf(r.driverId)})\nCar: ${r.vehicle} ${r.plate}\nIf you need anything, contact the driver.\n`)
      }
      addNotification({
        id: `${key}-driver`, role: 'driver', userId: r.driverId, rideId: r.id, kind: 'reminder', title: `Pickup in ${left} min`,
        message: `Your ride is at ${label}: ${r.riderName} (${r.phone || 'no phone'}), ${rideLine(r)}.`,
        data: { phone: r.phone, rider: r.riderName },
      })
    }
  }
}

import React, { useState } from 'react';
import { calendar } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, FieldError, Input, Modal, Segmented, Select, Switch, Textarea } from '../../ui';
import { durationMinutes, nextHour, plusMinutes } from './dates';
import AttendeePicker from './AttendeePicker';
import TaskSearchPicker from '../../components/taskExtras/TaskSearchPicker';

const REMINDERS = [['', 'No reminder'], ['0', 'At start time'], ['5', '5 minutes before'], ['10', '10 minutes before'], ['15', '15 minutes before'], ['30', '30 minutes before'], ['60', '1 hour before'], ['120', '2 hours before'], ['1440', '1 day before']];
const TYPES = [['EVENT', 'Event'], ['MEETING', 'Meeting'], ['REMINDER', 'Reminder']];
const errorOf = (error, fallback) => error?.response?.data?.error || fallback;
const nowLocal = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

function initialForm(event, defaults) {
  if (event) {
    return {
      title: event.title, event_type: event.event_type, all_day: event.all_day, description: event.description || '', location: event.location || '',
      start: event.start_at, end: event.end_at, reminder_minutes: event.reminder_minutes === null ? '' : String(event.reminder_minutes),
      attendee_ids: event.attendees.map((a) => a.user_id),
      task: event.task_id ? { id: event.task_id, title: event.task_title || 'A task you cannot open' } : null,
    };
  }
  // A task window opens this pre-filled: a reminder about that task (defaults.task).
  const start = defaults.start || nextHour(defaults.day);
  const type = defaults.event_type || 'EVENT';
  return {
    title: defaults.title || '', event_type: type, all_day: false, description: '', location: '', start,
    end: plusMinutes(start, type === 'REMINDER' ? 15 : 60),
    reminder_minutes: defaults.reminder_minutes ?? (type === 'REMINDER' ? '0' : '15'), attendee_ids: [], task: defaults.task || null,
  };
}

export default function EventFormModal({ event, defaults = {}, members, selfId, onClose, onSaved }) {
  const [form, setForm] = useState(() => initialForm(event, defaults));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  // Moving the start keeps the duration, like Google Calendar.
  const setStart = (start) => set({ start, end: plusMinutes(start, Math.max(15, durationMinutes(form.start, form.end) || 60)) });
  const setDatePart = (key, date) => (key === 'start' ? setStart(`${date}${form.start.slice(10)}`) : set({ end: `${date}${form.end.slice(10)}` }));
  const setTimePart = (key, time) => (key === 'start' ? setStart(`${form.start.slice(0, 11)}${time}`) : set({ end: `${form.end.slice(0, 11)}${time}` }));

  const save = async () => {
    const next = {};
    if (!form.title.trim()) next.title = 'Add a title.';
    const endCheck = form.all_day ? form.end.slice(0, 10) < form.start.slice(0, 10) : form.end <= form.start;
    if (endCheck) next.end_at = 'End must be after the start.';
    // A reminder for a time already gone would never go off.
    if (!next.end_at && form.event_type === 'REMINDER' && !form.all_day && (!event || form.start !== event.start_at) && form.start < nowLocal()) {
      next.start_at = 'Pick a time that has not passed yet.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    const payload = {
      title: form.title, event_type: form.event_type, all_day: form.all_day, description: form.description, location: form.location,
      start_at: form.all_day ? form.start.slice(0, 10) : form.start, end_at: form.all_day ? form.end.slice(0, 10) : form.end,
      reminder_minutes: form.reminder_minutes === '' ? null : Number(form.reminder_minutes), attendee_ids: form.attendee_ids,
      task_id: form.task ? form.task.id : null,
    };
    setSaving(true);
    try {
      if (event) await calendar.update(event.id, { ...payload, version: event.version });
      else await calendar.create(payload);
      notify(event ? 'Event updated.' : `${form.event_type === 'MEETING' ? 'Meeting' : form.event_type === 'REMINDER' ? 'Reminder' : 'Event'} saved.${form.attendee_ids.length ? ' The people on it are notified and emailed.' : ''}`, 'success');
      onSaved();
    } catch (error) {
      setErrors(error?.response?.data?.fields || {});
      notify(errorOf(error, 'Could not save the event.'));
    } finally { setSaving(false); }
  };

  const footer = <>
    <span className="flex-1" />
    <Button onClick={onClose}>Cancel</Button>
    <Button variant="primary" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</Button>
  </>;
  const isMeeting = form.event_type === 'MEETING';

  return (
    <Modal title={event ? 'Edit event' : 'New event'} onClose={onClose} footer={footer} size="md">
      <div className="flex flex-col gap-4">
        <div>
          <Input autoFocus aria-label="Title" placeholder="Add title" className="border-0 border-b !border-line bg-transparent px-0 text-lg font-semibold focus:!shadow-none" value={form.title} onChange={(e) => set({ title: e.target.value })} />
          <FieldError text={errors.title} />
        </div>
        <Segmented label="Event type" value={form.event_type} onChange={(value) => set({ event_type: value, reminder_minutes: value === 'REMINDER' && form.reminder_minutes === '15' ? '0' : form.reminder_minutes })} options={TYPES} />
        <div className="flex flex-col gap-2 rounded-md border border-line p-3">
          <label className="flex items-center justify-between text-sm"><span className="font-medium">All day</span><Switch checked={form.all_day} onChange={(value) => set({ all_day: value })} label="All day" /></label>
          {['start', 'end'].map((key) => (
            <div key={key} className="grid grid-cols-[48px_minmax(0,1fr)_minmax(0,120px)] items-center gap-2">
              <span className="text-xs font-medium text-muted">{key === 'start' ? 'Starts' : 'Ends'}</span>
              <Input type="date" aria-label={`${key} date`} value={form[key].slice(0, 10)} onChange={(e) => e.target.value && setDatePart(key, e.target.value)} />
              {!form.all_day && <Input type="time" step="900" aria-label={`${key} time`} value={form[key].slice(11, 16)} onChange={(e) => e.target.value && setTimePart(key, e.target.value)} />}
            </div>
          ))}
          <FieldError text={errors.end_at || errors.start_at} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Related task <span className="font-normal">· optional, find it by key or title</span></span>
          {form.task ? (
            <div className="flex items-center gap-2 rounded-md border border-line bg-subtle px-2.5 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{form.task.title}</span>
              <button type="button" onClick={() => set({ task: null })} className="text-xs font-semibold text-muted hover:text-danger">Remove</button>
            </div>
          ) : (
            <TaskSearchPicker label="Related task" placeholder="Search by key (ACC-142) or title"
              onPick={(task) => set({ task: { id: task.id, title: task.title }, ...(form.title.trim() ? {} : { title: task.title }) })} />
          )}
          <FieldError text={errors.task_id} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="cal-location" className="text-xs font-medium text-muted">{isMeeting ? 'Meeting link or room' : 'Location'}</label>
          <Input id="cal-location" placeholder={isMeeting ? 'https://meet.google.com/... or Room 2' : 'Optional'} value={form.location} onChange={(e) => set({ location: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">{isMeeting ? 'Invite people' : form.event_type === 'REMINDER' ? 'Remind others too' : 'Share with people'} <span className="font-normal">· they get a notification and an email</span></span>
          <AttendeePicker members={members} value={form.attendee_ids} selfId={selfId} onChange={(ids) => set({ attendee_ids: ids })} />
          <FieldError text={errors.attendee_ids} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="cal-reminder" className="text-xs font-medium text-muted">Notify me and attendees</label>
          <Select id="cal-reminder" value={form.reminder_minutes} onChange={(e) => set({ reminder_minutes: e.target.value })}>
            {REMINDERS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="cal-description" className="text-xs font-medium text-muted">Description</label>
          <Textarea id="cal-description" maxLength={2000} placeholder="Agenda, notes or details" value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
}

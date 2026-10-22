import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { calendar } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Chip, Modal } from '../../ui';
import { whenText } from './dates';
import { TYPE_LABEL, toneOf } from './items';

const RESPONSE = { ACCEPTED: ['ok', 'Going'], DECLINED: ['danger', 'Not going'], PENDING: ['neutral', 'Awaiting reply'] };
const isLink = (value) => /^https?:\/\//i.test(value || '');

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

function TaskDetail({ item, onClose }) {
  const navigate = useNavigate();
  const task = item.raw;
  return (
    <Modal title={task.title} subtitle="Task due date" onClose={onClose}
      footer={<><span className="flex-1" /><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => navigate(`/dashboard?task=${task.id}`)}>Open task</Button></>}>
      <Row label="Due">{whenText(item).replace(' · All day', '')}</Row>
      <Row label="Status">{task.status.replaceAll('_', ' ')}{item.overdue && <span className="ml-2"><Chip tone="danger">Overdue</Chip></span>}</Row>
      <Row label="Priority">{task.priority}</Row>
    </Modal>
  );
}

export default function EventDetailModal({ item, onClose, onEdit, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (item.kind === 'task') return <TaskDetail item={item} onClose={onClose} />;
  const event = item.raw;

  const act = async (fn, message) => {
    setBusy(true);
    try { await fn(); notify(message, 'success'); onChanged(); return true; }
    catch (error) { notify(error?.response?.data?.error || 'Could not complete that action.'); return false; }
    finally { setBusy(false); }
  };

  const footer = <>
    {event.my_response !== null && !event.is_organizer && (
      <span className="flex items-center gap-1.5 text-sm">
        <span className="text-muted">Going?</span>
        {[['ACCEPTED', 'Yes'], ['DECLINED', 'No']].map(([value, text]) => (
          <Button key={value} size="sm" variant={event.my_response === value ? 'primary' : 'secondary'} aria-pressed={event.my_response === value} disabled={busy}
            onClick={() => act(() => calendar.respond(event.id, value), value === 'ACCEPTED' ? 'You accepted.' : 'You declined.')}>{text}</Button>
        ))}
      </span>
    )}
    <span className="flex-1" />
    {event.is_organizer && (confirming
      ? <span className="flex items-center gap-2 text-sm">Delete for everyone?
          <Button size="sm" variant="danger" disabled={busy} onClick={async () => { if (await act(() => calendar.remove(event.id), 'Event deleted.')) onClose(); }}>Delete</Button>
          <Button size="sm" onClick={() => setConfirming(false)}>Keep</Button></span>
      : <>
          <Button variant="danger" onClick={() => setConfirming(true)}>Delete</Button>
          <Button onClick={() => onEdit(event)}>Edit</Button>
        </>)}
  </>;

  return (
    <Modal title={event.title} onClose={onClose} footer={footer} size="md">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${toneOf(item).chip}`}>{TYPE_LABEL[event.event_type]}</span>
        {event.reminder_minutes !== null && <Chip>Reminder set</Chip>}
      </div>
      <Row label="When">{whenText(item)}</Row>
      {event.location && <Row label={event.event_type === 'MEETING' ? 'Join' : 'Where'}>
        {isLink(event.location) ? <a href={event.location} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline">{event.location}</a> : event.location}
      </Row>}
      <Row label="Organizer">{event.is_organizer ? 'You' : event.created_by_name}</Row>
      {event.attendees.length > 0 && (
        <Row label="Guests">
          <ul className="flex flex-col gap-1.5">
            {event.attendees.map((guest) => (
              <li key={guest.user_id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">{guest.name[0]?.toUpperCase()}</span>{guest.name}</span>
                <Chip tone={RESPONSE[guest.response][0]}>{RESPONSE[guest.response][1]}</Chip>
              </li>
            ))}
          </ul>
        </Row>
      )}
      {event.description && <Row label="Details"><p className="whitespace-pre-wrap">{event.description}</p></Row>}
    </Modal>
  );
}

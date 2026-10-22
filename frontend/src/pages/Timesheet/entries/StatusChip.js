import React from 'react';
import { Chip } from '../../../ui';
import { fmtDate } from '../format';

export default function StatusChip({ entry }) {
  if (entry.status === 'DRAFT') return <Chip>Draft</Chip>;
  if (entry.lock?.unlocked_until) return <Chip tone="info">Unlocked till {fmtDate(entry.lock.unlocked_until)}</Chip>;
  if (entry.lock?.locked) return <><Chip tone="warn">Locked</Chip>{entry.has_pending_unlock && <Chip tone="info">Unlock requested</Chip>}</>;
  return <Chip tone="ok">Editable till {fmtDate(entry.lock?.editable_until)}</Chip>;
}

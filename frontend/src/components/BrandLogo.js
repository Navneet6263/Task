import React from 'react';
import './BrandLogo.css';

export default function BrandLogo({ compact = false, inverse = false, iconOnly = false, subtitle }) {
  const base = process.env.PUBLIC_URL || '';
  return (
    <div className={`greentask-brand${compact ? ' greentask-brand--compact' : ''}${inverse ? ' greentask-brand--inverse' : ''}`}>
      <img className="greentask-brand__mark" src={`${base}/brand/greentask-mark-192.png?v=blue-2`}
        width={compact ? 36 : 48} height={compact ? 36 : 48}
        alt={iconOnly ? 'GreenTask' : ''} draggable="false" />
      {!iconOnly && <div className="greentask-brand__copy">
        <strong className="greentask-brand__name">Green<b>Task</b></strong>
        {subtitle && <small className="greentask-brand__subtitle">{subtitle}</small>}
      </div>}
    </div>
  );
}

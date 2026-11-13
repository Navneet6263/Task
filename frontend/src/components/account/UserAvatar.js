import React, { useEffect, useState } from 'react';
import { users } from '../../services/api';

export const initialsOf = (name) => {
  const parts = String(name || '').split(' ').filter(Boolean);
  return parts.length ? (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase() : '?';
};

// A person's photo, or their initials when there is none (or it fails to load).
export default function UserAvatar({ name, src, size = 'h-8 w-8 text-xs', tint = 'bg-accent-soft text-accent', className = '' }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);
  if (src && !broken) {
    return <img src={src} alt="" onError={() => setBroken(true)} className={`shrink-0 rounded-full object-cover ${size} ${className}`} />;
  }
  return <span className={`grid shrink-0 place-items-center rounded-full font-bold ${size} ${tint} ${className}`} aria-hidden="true">{initialsOf(name)}</span>;
}

// Shrink any picture to a 256 px square (centre crop) in the browser, as a small JPEG.
export function squarePhoto(file, side = 256) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file?.type || '')) { reject(new Error('Choose a PNG, JPEG or WebP picture')); return; }
    if (file.size > 15 * 1024 * 1024) { reject(new Error('The picture is too big (over 15 MB)')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const crop = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = side; canvas.height = side;
      canvas.getContext('2d').drawImage(img, (img.width - crop) / 2, (img.height - crop) / 2, crop, crop, 0, 0, side, side);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a picture')); };
    img.src = url;
  });
}

// The signed-in person's photo, kept in step across the app after an upload.
export const AVATAR_CHANGED = 'greentask:avatar-changed';
export function useMyAvatar() {
  const read = () => { try { return JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}').avatar || null; } catch { return null; } };
  const [avatar, setAvatar] = useState(read);
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => users.me()).then(({ data }) => { if (alive && data?.avatar !== undefined) setAvatar(data.avatar || null); }).catch(() => {});
    const sync = (e) => setAvatar(e.detail ?? read());
    window.addEventListener(AVATAR_CHANGED, sync);
    return () => { alive = false; window.removeEventListener(AVATAR_CHANGED, sync); };
  }, []);
  return avatar;
}

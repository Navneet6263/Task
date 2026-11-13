import React, { useEffect, useRef, useState } from 'react';
import { Button, Modal } from '../../ui';

const OUT = 256; // saved picture: 256 x 256
const MAX_ZOOM = 4;

// The picture covers the frame at zoom 1. These are pure so they can be tested without a browser.
export const coverScale = (w, h, frame) => Math.max(frame / w, frame / h);
// Keep the picture covering the frame: no empty edges.
export function clampOffset({ w, h, frame, zoom, x, y }) {
  const s = coverScale(w, h, frame) * zoom;
  const maxX = Math.max(0, (w * s - frame) / 2);
  const maxY = Math.max(0, (h * s - frame) / 2);
  return { x: Math.min(maxX, Math.max(-maxX, x)) + 0, y: Math.min(maxY, Math.max(-maxY, y)) + 0 }; // + 0 turns -0 into 0
}
// The part of the original picture inside the frame, in the picture's own pixels.
export function cropRect({ w, h, frame, zoom, x, y }) {
  const s = coverScale(w, h, frame) * zoom;
  const left = (frame - w * s) / 2 + x;
  const top = (frame - h * s) / 2 + y;
  return { sx: -left / s + 0, sy: -top / s + 0, side: frame / s };
}

// Choose exactly which part of a picture to keep: drag to move, slide (or scroll) to zoom.
// What is inside the frame is what gets saved. shape: 'circle' for people, 'square' for teams.
export default function PhotoCropper({ file, shape = 'circle', title = 'Adjust your photo', onCancel, onDone }) {
  const [img, setImg] = useState(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [frame, setFrame] = useState(280);
  const drag = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => setError('That file could not be read as a picture.');
    image.src = url;
    setFrame(Math.max(200, Math.min(280, window.innerWidth - 96)));
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const dims = img ? { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height, frame } : null;
  const place = (next) => setPos((prev) => (dims ? clampOffset({ ...dims, zoom: next.zoom ?? zoom, ...(next.x === undefined ? prev : next) }) : prev));
  const setZoomTo = (value) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, value));
    setZoom(z);
    if (dims) setPos((prev) => clampOffset({ ...dims, zoom: z, ...prev }));
  };

  const onPointerDown = (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, ...pos }; };
  const onPointerMove = (e) => { if (drag.current) place({ x: drag.current.x + e.clientX - drag.current.px, y: drag.current.y + e.clientY - drag.current.py }); };
  const onPointerUp = () => { drag.current = null; };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 20 : 6;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) { e.preventDefault(); place({ x: pos.x + moves[e.key][0], y: pos.y + moves[e.key][1] }); }
    if (e.key === '+' || e.key === '=') setZoomTo(zoom + 0.1);
    if (e.key === '-') setZoomTo(zoom - 0.1);
  };

  const save = () => {
    const { sx, sy, side } = cropRect({ ...dims, zoom, ...pos });
    const canvas = document.createElement('canvas');
    canvas.width = OUT; canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, OUT, OUT); // see-through PNGs get a white background
    ctx.drawImage(img, sx, sy, side, side, 0, 0, OUT, OUT);
    onDone(canvas.toDataURL('image/jpeg', 0.88));
  };

  const s = dims ? coverScale(dims.w, dims.h, frame) * zoom : 1;
  const round = shape === 'circle' ? 'rounded-full' : 'rounded-xl';
  return (
    <Modal size="md" title={title} subtitle="Drag the picture to move it and use the slider to zoom. Only what is inside the frame is saved." onClose={onCancel}
      footer={<><Button onClick={onCancel}>Cancel</Button><Button variant="primary" disabled={!img} onClick={save}>Save photo</Button></>}>
      <div className="flex flex-col items-center gap-4">
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {!img && !error && <p role="status" className="py-16 text-sm text-muted">Opening the picture…</p>}
        {img && (
          <>
            <div role="slider" tabIndex={0} aria-label="Picture position. Use arrow keys to move, plus and minus to zoom." aria-valuenow={Math.round(zoom * 100)} aria-valuemin={100} aria-valuemax={MAX_ZOOM * 100} aria-valuetext={`Zoom ${Math.round(zoom * 100)}%`}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
              onWheel={(e) => setZoomTo(zoom - e.deltaY * 0.0015)} onKeyDown={onKeyDown}
              className="relative cursor-grab touch-none select-none overflow-hidden rounded-lg bg-subtle outline-none ring-accent/40 focus-visible:ring-2 active:cursor-grabbing"
              style={{ width: frame, height: frame }}>
              <img src={img.src} alt="" draggable={false} className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                style={{ width: dims.w * s, height: dims.h * s, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }} />
              {/* Everything outside the frame is dimmed: that part is not saved. */}
              <span aria-hidden="true" className={`pointer-events-none absolute inset-0 ${round} border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]`} />
            </div>
            <label className="flex w-full max-w-[280px] items-center gap-3 text-sm">
              <span className="text-muted">Zoom</span>
              <input type="range" min="1" max={MAX_ZOOM} step="0.01" value={zoom} aria-label="Zoom" onChange={(e) => setZoomTo(Number(e.target.value))}
                className="flex-1 accent-[rgb(var(--c-accent))]" />
              <span className="w-12 text-right tabular-nums text-muted">{Math.round(zoom * 100)}%</span>
            </label>
          </>
        )}
      </div>
    </Modal>
  );
}

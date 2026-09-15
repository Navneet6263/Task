import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import BrandLogo from './BrandLogo';

test('shared wordmark uses the blue leaf asset with cache-busting', () => {
  const markup = renderToStaticMarkup(<BrandLogo subtitle="Workspace" compact />);
  expect(markup).toContain('Green<b>Task</b>');
  expect(markup).toContain('/brand/greentask-mark-192.png?v=blue-2');
  expect(markup).toContain('greentask-brand--compact');
  expect(markup).toContain('Workspace');
  expect(markup).toContain('alt=""');
  const css = fs.readFileSync(path.join(__dirname, 'BrandLogo.css'), 'utf8');
  expect(css).toContain('#2563eb');
  expect(css).toContain('#1686cf');
  expect(css).not.toContain('#07543d');
});

test('standalone mark has an accessible name and dark surfaces have a light wordmark', () => {
  expect(renderToStaticMarkup(<BrandLogo iconOnly />)).toContain('alt="GreenTask"');
  expect(renderToStaticMarkup(<BrandLogo inverse />)).toContain('greentask-brand--inverse');
});

test('browser and home-screen icons exist at their declared dimensions', () => {
  const publicDir = path.resolve(__dirname, '../../public');
  const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.json'), 'utf8'));
  expect(manifest.short_name).toBe('GreenTask');
  const icons = [...manifest.icons,
    { src: 'brand/favicon-16.png', sizes: '16x16' },
    { src: 'brand/favicon-32.png', sizes: '32x32' },
    { src: 'brand/apple-touch-icon.png', sizes: '180x180' },
  ];
  for (const icon of icons) {
    const png = fs.readFileSync(path.join(publicDir, icon.src.split('?')[0]));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
  }
  const favicon = fs.readFileSync(path.join(publicDir, 'favicon.ico'));
  expect(favicon.readUInt16LE(2)).toBe(1);
  expect(favicon.readUInt16LE(4)).toBe(3);
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  expect(html).toContain('<title>GreenTask</title>');
  expect(html).toContain('%PUBLIC_URL%/manifest.json');
  expect(html).toContain('%PUBLIC_URL%/brand/favicon-32.png');
});

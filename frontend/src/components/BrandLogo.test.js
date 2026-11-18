import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import BrandLogo from './BrandLogo';

test('the logo image has a light and a dark copy, and keeps its subtitle', () => {
  const markup = renderToStaticMarkup(<BrandLogo subtitle="Workspace" compact />);
  expect(markup).toMatch(/greentask-logo\.png[^>]*class="h-8 w-auto dark:hidden"/);
  expect(markup).toMatch(/greentask-logo-dark\.png[^>]*class="hidden h-8 w-auto dark:block"/);
  expect(markup).toContain('greentask-brand--compact');
  expect(markup).toContain('Workspace');
  expect(markup).toContain('alt="GreenTask"');
});

test('icon-only use shows the G mark, and always-dark surfaces get only the dark copy', () => {
  const iconOnly = renderToStaticMarkup(<BrandLogo iconOnly subtitle="Hidden" />);
  expect(iconOnly).toContain('alt="GreenTask"');
  expect(iconOnly).toContain('favicon-48.png');
  expect(iconOnly).not.toContain('Hidden');
  const inverse = renderToStaticMarkup(<BrandLogo inverse />);
  expect(inverse).toContain('greentask-brand--inverse');
  expect(inverse).toContain('greentask-logo-dark.png');
  expect(inverse).not.toContain('greentask-logo.png');
});

test('the logo files exist for light, dark and email', () => {
  const brand = path.resolve(__dirname, '../../public/brand');
  ['greentask-logo.png', 'greentask-logo-dark.png', 'greentask-logo-email.png'].forEach((name) => {
    expect(fs.readFileSync(path.join(brand, name)).subarray(1, 4).toString()).toBe('PNG');
  });
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

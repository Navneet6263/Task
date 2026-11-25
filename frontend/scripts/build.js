// `npm run build`: the normal Create React App build with three production safety settings.
// Set here (not in .env.production) so a server's own env files never conflict on `git pull`.
//  - No source maps: they would publish the app's full source code.
//  - No inline runtime script: the Content-Security-Policy below allows scripts from our own files only.
//  - REACT_APP_CSP fills the <meta http-equiv="Content-Security-Policy"> in public/index.html.
//    Emergency switch: GREENTASK_CSP=off npm run build (builds without the policy).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
].join('; ');

process.env.GENERATE_SOURCEMAP = 'false';
process.env.INLINE_RUNTIME_CHUNK = 'false';
if (process.env.REACT_APP_CSP === undefined) process.env.REACT_APP_CSP = process.env.GREENTASK_CSP === 'off' ? '' : CSP;

require('react-scripts/scripts/build');

// The signed-in person as stored at sign-in. Employees imported from an HRMS sheet may still have to
// choose their own password (must_change_password) or add an email (needs_email).
export function storedUser() {
  try { return JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}') || {}; } catch { return {}; }
}

export function updateStoredUser(patch) {
  ['user', 'company_user'].forEach((key) => {
    try {
      const current = JSON.parse(localStorage.getItem(key) || 'null');
      if (current) localStorage.setItem(key, JSON.stringify({ ...current, ...patch }));
    } catch { /* ignore unreadable storage */ }
  });
  window.dispatchEvent(new Event('account-changed'));
}

export const needsAccountSetup = (user) => Boolean(user?.must_change_password);

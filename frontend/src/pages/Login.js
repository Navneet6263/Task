import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../services/api';
import AuthLayout, { TopLink } from '../components/auth/AuthLayout';
import { AuthAlert, AuthHeading, AuthIcon, AuthInput, PasswordInput, SubmitButton, TextLink } from '../components/auth/AuthFields';
import RegisterFields from './auth/RegisterFields';
import SystemAdminForm from './auth/SystemAdminForm';

const initialForm = {
  name: '', email: '', password: '', mobile: '', employee_id: '', role: 'person', team_code: '', company_code: '', company_name: '',
  employee_code: '',
};

// Remembered on this device: how the person signs in, and their company code if they ever needed it.
const remembered = (key, fallback = '') => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
const storeValue = (key, value) => { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* ignore */ } };

const persistWorkspaceSession = (responseData) => {
  const userPayload = {
    id: responseData.id || responseData.user_id, org_id: responseData.org_id, org_ids: responseData.org_ids || [],
    name: responseData.name, email: responseData.email, role: responseData.role, limits: responseData.limits,
    must_change_password: Boolean(responseData.must_change_password), needs_email: Boolean(responseData.needs_email),
    login_code: responseData.login_code || null,
  };
  if (responseData?.role === 'company_admin') {
    localStorage.removeItem('token');
    localStorage.setItem('company_token', responseData.token);
    localStorage.setItem('company_user', JSON.stringify(userPayload));
  } else {
    localStorage.removeItem('company_token');
    localStorage.removeItem('company_user');
    localStorage.setItem('token', responseData.token);
  }
  if (responseData.org_id) localStorage.setItem('active_org_id', String(responseData.org_id));
  else localStorage.removeItem('active_org_id');
  localStorage.setItem('user', JSON.stringify(userPayload));
};

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [accessMode, setAccessMode] = useState('workspace');
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);
  const [adminHint, setAdminHint] = useState(null);
  const [loginWith, setLoginWith] = useState(() => (remembered('login_with') === 'code' ? 'code' : 'email'));
  const [companyCode, setCompanyCode] = useState(() => remembered('login_company_code'));
  const [showCompany, setShowCompany] = useState(() => Boolean(remembered('login_company_code')));
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const mode = searchParams.get('mode') === 'system-admin' ? 'system-admin' : 'workspace';
    setAccessMode((prev) => (prev === mode ? prev : mode));
  }, [searchParams]);

  const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const switchAccessMode = (mode) => {
    setError(''); setAdminHint(null);
    const next = new URLSearchParams(searchParams);
    if (mode === 'system-admin') next.set('mode', 'system-admin');
    else next.delete('mode');
    setSearchParams(next, { replace: true });
    setAccessMode(mode);
  };

  const handleWorkspaceSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError(''); setBusy(true);
    const byCode = isLogin && loginWith === 'code';
    try {
      const payload = byCode
        ? { employee_code: form.employee_code.trim(), password: form.password, ...(companyCode.trim() ? { company_code: companyCode.trim().toUpperCase() } : {}) }
        : isLogin
        ? { email: form.email.trim(), password: form.password }
        : {
            name: form.name.trim(), email: form.email.trim(), password: form.password, mobile: form.mobile.trim(),
            employee_id: form.employee_id.trim(), role: form.role, team_code: form.team_code.trim().toUpperCase(),
            company_code: form.company_code.trim().toUpperCase(), company_name: form.company_name.trim(),
          };
      const response = isLogin ? await auth.login(payload) : await auth.register(payload);
      persistWorkspaceSession(response.data);
      if (isLogin) storeValue('login_with', loginWith);
      if (byCode) storeValue('login_company_code', companyCode.trim().toUpperCase());
      navigate(response.data.must_change_password || response.data.needs_email ? '/account-setup' : '/dashboard');
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'COMPANY_CODE_REQUIRED') { setShowCompany(true); setError('Two companies use this employee code. Add your company code (ask your admin) and sign in again.'); }
      else if (code === 'PENDING') setError('This company account is still waiting for approval.');
      else if (code === 'REJECTED') setError(err.response?.data?.error || 'This account was rejected.');
      else setError(err.response?.data?.error || 'Unable to process the request right now.');
    } finally { setBusy(false); }
  };

  const toggleRegister = () => { setIsLogin((prev) => !prev); setError(''); };
  const isSystemAdmin = accessMode === 'system-admin';
  const heading = isSystemAdmin
    ? adminHint
      ? { eyebrow: 'Step 2 of 2', title: 'Check your email', text: `Enter the 6-digit code we sent to ${adminHint}.` }
      : { eyebrow: 'Protected access', title: 'Platform admin sign in', text: 'Sign in with your admin email and password. We then email you a code to confirm it\'s you.' }
    : isLogin
      ? { eyebrow: 'Welcome back', title: 'Sign in to GreenTask', text: 'Employees, managers and company admins all sign in here.' }
      : { eyebrow: 'Create account', title: 'Join your workspace', text: 'Pick your role, then fill in a few details. It takes a minute.' };

  return (
    <AuthLayout variant={isSystemAdmin ? 'security' : 'workspace'} topAction={<TopLink to="/register-company">Register your company</TopLink>}>
      <AuthHeading eyebrow={heading.eyebrow} title={heading.title}>{heading.text}</AuthHeading>

      <div role="group" aria-label="Sign-in type" className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-subtle p-1">
        {[['workspace', 'Workspace'], ['system-admin', 'Platform admin']].map(([mode, label]) => (
          <button key={mode} type="button" aria-pressed={accessMode === mode} onClick={() => switchAccessMode(mode)}
            className={`rounded-md py-2 text-sm font-semibold transition ${accessMode === mode ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>{label}</button>
        ))}
      </div>

      {isSystemAdmin ? (
        <SystemAdminForm onBack={() => switchAccessMode('workspace')} onStepChange={(step, info) => setAdminHint(step === 2 ? info?.email_hint || 'your email' : null)} />
      ) : (
        <>
          <form onSubmit={handleWorkspaceSubmit} className="flex flex-col gap-4">
            <AuthAlert>{error}</AuthAlert>
            {notice && !error && <AuthAlert tone="ok">{notice}</AuthAlert>}
            {!isLogin && <RegisterFields form={form} update={updateField} />}
            {isLogin && (
              <div role="group" aria-label="Sign in with" className="flex items-center gap-1 self-start rounded-lg border border-line bg-subtle p-0.5 text-xs font-semibold">
                {[['email', 'Email'], ['code', 'Employee code']].map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={loginWith === key} onClick={() => { setLoginWith(key); setError(''); setNotice(''); }}
                    className={`rounded-md px-3 py-1.5 transition ${loginWith === key ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>{label}</button>
                ))}
              </div>
            )}
            {isLogin && loginWith === 'code' ? (
              <>
                <AuthInput label="Employee code" icon="badge" autoComplete="username" placeholder="e.g. ACT05" required autoCapitalize="characters"
                  hint="The same code as in your HR system (HRMS)."
                  value={form.employee_code} onChange={(e) => updateField('employee_code', e.target.value.toUpperCase())}
                  right={!showCompany && <TextLink onClick={() => setShowCompany(true)}>Add company code</TextLink>} />
                {showCompany && (
                  <AuthInput label="Company code" icon="building" placeholder="e.g. ORG-ABCD-12X" autoCapitalize="characters"
                    hint="Only needed if your admin gave you one. We remember it on this device."
                    value={companyCode} onChange={(e) => setCompanyCode(e.target.value.toUpperCase())} />
                )}
              </>
            ) : (
              <AuthInput label="Work email" type="email" icon="mail" autoComplete="email" placeholder="name@company.com" required
                value={form.email} onChange={(e) => updateField('email', e.target.value)} />
            )}
            <PasswordInput key={isLogin ? 'login' : 'register'} autoComplete={isLogin ? 'current-password' : 'new-password'} strength={!isLogin}
              placeholder={isLogin ? (loginWith === 'code' ? 'Your password (first time: the one from your admin)' : 'Enter your password') : 'Create a password'} required value={form.password} onChange={(e) => updateField('password', e.target.value)}
              right={isLogin && (loginWith === 'code'
                ? <TextLink onClick={() => { setError(''); setNotice('Ask your admin for a new one-time password. If you already added your email, switch to Email and use Forgot password.'); }}>Forgot password?</TextLink>
                : <TextLink onClick={() => navigate('/forgot-password')}>Forgot password?</TextLink>)} />
            {isLogin && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
                <input type="checkbox" className="h-4 w-4 rounded accent-[rgb(var(--c-accent))]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Keep me signed in on this device
              </label>
            )}
            <SubmitButton busy={busy} busyText={isLogin ? 'Signing in…' : 'Creating account…'}>{isLogin ? 'Sign in' : 'Create account'}</SubmitButton>
          </form>

          {isLogin ? (
            <>
              <div className="my-6 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />New to GreenTask?<span className="h-px flex-1 bg-line" /></div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button type="button" onClick={toggleRegister} className="group rounded-lg border border-line p-3 text-left transition hover:border-accent hover:bg-accent-soft/50">
                  <span className="flex items-center gap-2 text-sm font-semibold"><AuthIcon name="user" className="text-accent" />Join your team</span>
                  <span className="mt-0.5 block text-xs text-muted">Have a team code? Create your account.</span>
                </button>
                <button type="button" onClick={() => navigate('/register-company')} className="group rounded-lg border border-line p-3 text-left transition hover:border-accent hover:bg-accent-soft/50">
                  <span className="flex items-center gap-2 text-sm font-semibold"><AuthIcon name="building" className="text-accent" />Register company</span>
                  <span className="mt-0.5 block text-xs text-muted">Set up GreenTask for your business.</span>
                </button>
              </div>
            </>
          ) : (
            <p className="mt-6 text-center text-sm text-muted">Already have an account? <TextLink onClick={toggleRegister}>Sign in</TextLink></p>
          )}
        </>
      )}
    </AuthLayout>
  );
};

export default Login;

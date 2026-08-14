'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { getSupabase, isSupabaseEnabled } from '@/lib/supabase/client';
import { flushPendingPublicationWithdrawal } from '@/features/profile/publication';

export type AppUser = {
  id: string;
  email: string | null;
  provider: 'apple' | 'google' | 'email' | 'test';
  isTest: boolean;
};

type AuthState = 'loading' | 'guest' | 'authenticated';

type LoginRequest = {
  returnTo?: string;
  reason?: string;
};

type AuthContextValue = {
  state: AuthState;
  user: AppUser | null;
  isAuthenticated: boolean;
  requestLogin: (request?: LoginRequest) => void;
  closeLogin: () => void;
  signOut: () => Promise<void>;
};

type LoginPanelState = {
  open: boolean;
  returnTo: string | null;
  reason: string;
};

const TEST_SESSION_KEY = 'project-encounter:test-auth:v1';
const AuthContext = createContext<AuthContextValue | null>(null);

export const TEST_LOGIN_ENABLED =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === '1';

function providerFromUser(user: {
  app_metadata?: { provider?: string };
}): AppUser['provider'] {
  const provider = user.app_metadata?.provider;
  if (provider === 'apple' || provider === 'google' || provider === 'email') return provider;
  return 'email';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>('loading');
  const [user, setUser] = useState<AppUser | null>(null);
  const [panel, setPanel] = useState<LoginPanelState>({
    open: false,
    returnTo: null,
    reason: 'この機能はログインすると使えます。',
  });

  useEffect(() => {
    let active = true;
    const sb = getSupabase();
    const testId = TEST_LOGIN_ENABLED ? window.localStorage.getItem(TEST_SESSION_KEY) : null;

    if (testId) {
      setUser({ id: testId, email: 'tester@local', provider: 'test', isTest: true });
      setState('authenticated');
    } else if (!sb) {
      setState('guest');
    } else {
      sb.auth
        .getSession()
        .then(({ data }) => {
          if (!active) return;
          const authUser = data.session?.user;
          // 旧仕様の匿名セッションは、明示ログイン済みとして扱わない。
          if (!authUser || authUser.is_anonymous) {
            setUser(null);
            setState('guest');
            return;
          }
          setUser({
            id: authUser.id,
            email: authUser.email ?? null,
            provider: providerFromUser(authUser),
            isTest: false,
          });
          setState('authenticated');
          flushPendingPublicationWithdrawal(authUser.id).catch((error) => {
            console.warn('[auth] pending profile withdrawal failed:', error);
          });
        })
        .catch((error) => {
          console.warn('[auth] session restore failed:', error);
          if (!active) return;
          setUser(null);
          setState('guest');
        });
    }

    const subscription = sb?.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const authUser = session?.user;
      if (!authUser || authUser.is_anonymous) {
        if (!window.localStorage.getItem(TEST_SESSION_KEY)) {
          setUser(null);
          setState('guest');
        }
        return;
      }
      setUser({
        id: authUser.id,
        email: authUser.email ?? null,
        provider: providerFromUser(authUser),
        isTest: false,
      });
      setState('authenticated');
      flushPendingPublicationWithdrawal(authUser.id).catch((error) => {
        console.warn('[auth] pending profile withdrawal failed:', error);
      });
      setPanel((current) => ({ ...current, open: false }));
    });

    return () => {
      active = false;
      subscription?.data.subscription.unsubscribe();
    };
  }, []);

  const requestLogin = useCallback((request: LoginRequest = {}) => {
    setPanel({
      open: true,
      returnTo: request.returnTo ?? null,
      reason: request.reason ?? 'この機能はログインすると使えます。',
    });
  }, []);

  const closeLogin = useCallback(() => {
    setPanel((current) => ({ ...current, open: false }));
  }, []);

  const finishTestLogin = useCallback(() => {
    const id = `test-${crypto.randomUUID()}`;
    window.localStorage.setItem(TEST_SESSION_KEY, id);
    setUser({ id, email: 'tester@local', provider: 'test', isTest: true });
    setState('authenticated');
    const returnTo = panel.returnTo;
    setPanel((current) => ({ ...current, open: false }));
    if (returnTo) router.push(returnTo);
  }, [panel.returnTo, router]);

  const signOut = useCallback(async () => {
    window.localStorage.removeItem(TEST_SESSION_KEY);
    await getSupabase()?.auth.signOut().catch((error) => {
      console.warn('[auth] sign-out failed:', error);
    });
    setUser(null);
    setState('guest');
    router.push('/');
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      user,
      isAuthenticated: state === 'authenticated' && user !== null,
      requestLogin,
      closeLogin,
      signOut,
    }),
    [closeLogin, requestLogin, signOut, state, user],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {panel.open && (
        <LoginDialog
          reason={panel.reason}
          returnTo={panel.returnTo}
          onClose={closeLogin}
          onTestLogin={finishTestLogin}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

export function RequireAuth({
  children,
  reason,
  returnTo,
}: {
  children: ReactNode;
  reason: string;
  returnTo: string;
}) {
  const { state, isAuthenticated, requestLogin } = useAuth();

  if (state === 'loading') {
    return (
      <main className="access-loading" data-app-ready="true">
        <span className="access-loading__mark" aria-hidden />
        <p>準備しています…</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="access-gate" data-app-ready="true">
        <div className="access-gate__tower" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <section className="access-gate__card" aria-labelledby="access-gate-title">
          <p className="access-gate__eyebrow">GUEST MODE</p>
          <h1 id="access-gate-title">ここから先は、あなたの記録を使います</h1>
          <p>{reason}</p>
          <button
            type="button"
            className="paper-action paper-action--yellow"
            onClick={() => requestLogin({ reason, returnTo })}
          >
            ログインして続ける
          </button>
          <button type="button" className="text-action" onClick={() => history.back()}>
            ゲストのまま戻る
          </button>
        </section>
      </main>
    );
  }

  return children;
}

function LoginDialog({
  reason,
  returnTo,
  onClose,
  onTestLogin,
}: {
  reason: string;
  returnTo: string | null;
  onClose: () => void;
  onTestLogin: () => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const redirectTo = () => {
    const target = returnTo ?? window.location.pathname;
    return `${window.location.origin}${target}`;
  };

  const signInWithProvider = async (provider: 'apple' | 'google') => {
    const sb = getSupabase();
    if (!sb) {
      setError('ログイン接続がまだ設定されていません。開発版ではテストログインを使えます。');
      return;
    }
    setBusy(provider);
    setError(null);
    const { error: authError } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectTo() },
    });
    if (authError) {
      setError(authError.message);
      setBusy(null);
    }
  };

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault();
    const sb = getSupabase();
    if (!sb) {
      setError('メールログインを使うには Supabase の公開設定が必要です。');
      return;
    }
    setBusy('email');
    setError(null);
    const { error: authError } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo() },
    });
    setBusy(null);
    if (authError) {
      setError(authError.message);
      return;
    }
    setNotice('ログイン用のリンクをメールへ送りました。この画面は閉じてかまいません。');
  };

  return (
    <div className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <button className="auth-dialog__scrim" type="button" aria-label="閉じる" onClick={onClose} />
      <section className="auth-dialog__sheet">
        <div className="auth-dialog__ticket" aria-hidden>
          ENCOUNTER PASS
        </div>
        <button className="auth-dialog__close" type="button" onClick={onClose} aria-label="閉じる">
          ×
        </button>
        <p className="auth-dialog__eyebrow">記録をひらく</p>
        <h2 id="login-title">ログイン</h2>
        <p className="auth-dialog__reason">{reason}</p>

        <div className="auth-dialog__providers">
          <button type="button" onClick={() => signInWithProvider('apple')} disabled={busy !== null}>
            <span aria-hidden>●</span> Appleで続ける
          </button>
          <button type="button" onClick={() => signInWithProvider('google')} disabled={busy !== null}>
            <span aria-hidden>G</span> Googleで続ける
          </button>
        </div>

        <div className="auth-dialog__divider"><span>または</span></div>

        <form onSubmit={submitEmail} className="auth-dialog__email">
          <label htmlFor="login-email">メールアドレス</label>
          <div>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
            <button type="submit" disabled={busy !== null}>リンクを送る</button>
          </div>
        </form>

        {TEST_LOGIN_ENABLED && (
          <button
            type="button"
            className="auth-dialog__test"
            onClick={onTestLogin}
            disabled={busy !== null}
            data-testid="test-login"
          >
            開発用ログイン（決済なし）
          </button>
        )}

        {notice && <p className="auth-dialog__notice" role="status">{notice}</p>}
        {error && <p className="auth-dialog__error" role="alert">{error}</p>}

        <p className="auth-dialog__legal">
          続けると、<button type="button" onClick={() => router.push('/legal/terms')}>利用規約</button>と
          <button type="button" onClick={() => router.push('/legal/privacy')}>プライバシーポリシー</button>に同意したものとみなされます。
        </p>
        {!isSupabaseEnabled() && !TEST_LOGIN_ENABLED && (
          <p className="auth-dialog__error">現在ログイン接続を準備中です。</p>
        )}
      </section>
    </div>
  );
}

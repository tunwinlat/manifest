import { A, useLocation, useSearchParams } from '@solidjs/router';
import { Title } from '@solidjs/meta';
import { createResource, Show, type Component } from 'solid-js';
import { appendSearch } from '../services/auth-redirects.js';
import { checkSignupEnabled } from '../services/setup-status.js';
import Register from './Register.jsx';

/**
 * Fork: `/register` when the administrator closed public sign-up shows who to
 * ask instead of a form the backend would refuse. The plan step stays
 * reachable — it runs after an account exists.
 */
const SignupGate: Component = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [enabled] = createResource(checkSignupEnabled);
  const closed = () => enabled() === false && searchParams.step !== 'plan';

  return (
    <Show when={!enabled.loading}>
      <Show when={closed()} fallback={<Register />}>
        <Title>Sign-up is closed - Manifest</Title>
        <div class="auth-header">
          <h1 class="auth-header__title">Sign-up is closed</h1>
          <p class="auth-header__subtitle">
            Accounts on this Manifest are created by an administrator. Ask them to add you, then
            sign in with the email and password they give you.
          </p>
        </div>
        <div class="auth-footer">
          <span>Already have an account? </span>
          <A href={appendSearch('/login', location.search)} class="auth-footer__link">
            Sign in
          </A>
        </div>
      </Show>
    </Show>
  );
};

export default SignupGate;

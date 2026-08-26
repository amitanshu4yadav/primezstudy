const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const fieldName = document.getElementById('field-name');
const nameInput = document.getElementById('name');
const form = document.getElementById('auth-form');
const submitBtn = document.getElementById('submit-btn');
const formMsg = document.getElementById('form-msg');
const googleBtn = document.getElementById('google-btn');

let mode = 'login';

function setMode(next) {
  mode = next;
  const isSignup = mode === 'signup';
  tabLogin.classList.toggle('active', !isSignup);
  tabSignup.classList.toggle('active', isSignup);
  fieldName.style.display = isSignup ? '' : 'none';
  nameInput.required = isSignup;
  submitBtn.textContent = isSignup ? 'Create account' : 'Log in';
  formMsg.textContent = '';
  formMsg.className = 'form-msg';
}

tabLogin.addEventListener('click', () => setMode('login'));
tabSignup.addEventListener('click', () => setMode('signup'));

function showMsg(text, isError) {
  formMsg.textContent = text;
  formMsg.className = 'form-msg' + (isError ? ' error' : ' success');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  submitBtn.disabled = true;
  showMsg('Working…', false);

  try {
    if (mode === 'signup') {
      const name = nameInput.value.trim();
      const { error } = await sb.auth.signUp({
        email, password,
        options: { data: { full_name: name } }
      });
      if (error) throw error;
      showMsg('Account created — check your email if confirmation is required, then log in.', false);
      setMode('login');
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = 'dashboard.html';
    }
  } catch (err) {
    showMsg(err.message || 'Something went wrong.', true);
  } finally {
    submitBtn.disabled = false;
  }
});

googleBtn.addEventListener('click', async () => {
  await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/dashboard.html' }
  });
});

(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) window.location.href = 'dashboard.html';
})();

setMode('login');

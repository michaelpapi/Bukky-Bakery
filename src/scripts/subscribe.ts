// Subscribe form: checks the fields, sends one record to the client's Google Sheet, shows a thank-you.
import { site, postLead } from './data';

const form = document.querySelector<HTMLFormElement>('[data-subscribe]');
if (form) {
  const msg = form.querySelector<HTMLElement>('[data-msg]')!;
  const done = document.querySelector<HTMLElement>('[data-sub-done]')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const label = submit.textContent || 'Subscribe';
  const val = (n: string) => (form.elements.namedItem(n) as HTMLInputElement).value.trim();

  const fail = (text: string, field?: string) => {
    msg.textContent = text; msg.classList.add('err');
    if (field) (form.elements.namedItem(field) as HTMLInputElement).focus();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = ''; msg.classList.remove('err');
    const email = val('email');
    const digits = val('phone').replace(/[^\d]/g, '');
    if (!email && !digits) return fail('Please add your email or your phone number.', 'email');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail('That email does not look right.', 'email');
    if (digits && (digits.length < 10 || digits.length > 15)) return fail('That phone number does not look right.', 'phone');
    if (!(form.elements.namedItem('consent') as HTMLInputElement).checked) return fail('Please tick the box to agree.', 'consent');
    if (val('website')) { form.hidden = true; done.hidden = false; return; } // a bot filled the hidden field: pretend it worked

    submit.disabled = true; submit.textContent = 'Sending...';
    const ok = site.leads?.url
      ? await postLead('subscribe', { name: val('name'), email, phone: val('phone'), consent: true, at: new Date().toISOString() })
      : true; // no Sheet connected yet (preview only)
    submit.disabled = false; submit.textContent = label;
    if (!ok) return fail('No connection. Please check your network and try again.');

    form.hidden = true;
    done.hidden = false;
    if (!site.leads?.url) done.textContent += ' (Preview only: nothing was saved because no Google Sheet is connected yet.)';
    done.focus({ preventScroll: true });
  });
}
import { api, request } from './api.js';
import { escape as e, label, date, money, rate, badge, empty, heading, pager, loanTable, productCards, modal, errorSlot, actions, field } from './views.js';

const $ = selector => document.querySelector(selector);
const state = { user: null, route: '', page: 0, reviewStatus: 'SUBMITTED', products: new Map(), loan: null, generation: 0, capabilities: null };
let registerMode = false, toastTimer;
const has = role => state.user?.roles.includes(role);
const button = (action, text) => '<button class="button primary" data-action="' + action + '">' + text + '</button>';
function toast(message, error = false) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.toggle('error', error);
  $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5000);
}
function showAuth() {
  state.user = null; state.generation++; $('#modal').close(); $('#workspace').hidden = true; $('#auth-screen').hidden = false; $('#boot').hidden = true;
}
function setAuthMode(register) {
  registerMode = register; $('#name-field').hidden = !register; $('#name-field input').required = register;
  $('#auth-password').minLength = register ? 12 : 1;
  $('#auth-password').autocomplete = register ? 'new-password' : 'current-password';
  $('#password-help').hidden = !register;
  $('#auth-title').textContent = register ? 'Make your next move.' : 'Welcome back.';
  $('#auth-description').textContent = register ? 'Create your account to start a loan application.' : 'Sign in to pick up where you left off.';
  $('#show-login').classList.toggle('selected', !register); $('#show-register').classList.toggle('selected', register);
  $('#auth-submit').innerHTML = (register ? 'Create account' : 'Sign in') + ' <span>↗</span>'; $('#auth-error').hidden = true;
}
$('#show-login').onclick = () => setAuthMode(false);
$('#show-register').onclick = () => setAuthMode(true);
$('#toggle-password').onclick = () => {
  const input = $('#auth-password'); input.type = input.type === 'password' ? 'text' : 'password';
  $('#toggle-password').textContent = input.type === 'password' ? 'Show' : 'Hide';
  $('#toggle-password').setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
};
$('#auth-form').onsubmit = async event => {
  event.preventDefault(); $('#auth-error').hidden = true; $('#auth-submit').disabled = true;
  const form = Object.fromEntries(new FormData(event.currentTarget)); if (!registerMode) delete form.name;
  try { state.user = await request(registerMode ? '/auth/register' : '/auth/login', { method: 'POST', body: form }); $('#auth-form').reset(); await enterWorkspace(); }
  catch (error) { $('#auth-error').textContent = error.message; $('#auth-error').hidden = false; }
  finally { $('#auth-submit').disabled = false; }
};
async function enterWorkspace() {
  state.capabilities = await api('/capabilities');
  $('#boot').hidden = true; $('#auth-screen').hidden = true; $('#workspace').hidden = false;
  $('#account-name').textContent = state.user.name; $('#account-role').textContent = label(state.user.roles[0]);
  $('#avatar').textContent = state.user.name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase();
  const links = [['overview', '◫', 'Overview']];
  if (has('CUSTOMER')) links.push(['applications', '▤', 'My applications']);
  if (has('OFFICER')) links.push(['reviews', '▤', 'Review queue']);
  links.push(['products', '◇', has('ADMIN') ? 'Product catalogue' : 'Loan products']);
  if (has('ADMIN')) links.push(['team', '♧', 'Team access']);
  $('#navigation').innerHTML = links.map(([route, icon, title]) => '<a href="#/' + route + '" data-nav="' + route + '"><span class="nav-icon" aria-hidden="true">' + icon + '</span>' + title + '</a>').join('');
  if (!location.hash) location.hash = '/overview'; else await navigate();
}
$('#logout').onclick = async () => {
  try { await request('/auth/logout', { method: 'POST' }); location.hash = '/overview'; showAuth(); }
  catch (error) { toast(error.message, true); }
};
window.addEventListener('session-expired', () => { showAuth(); toast('Your session ended. Please sign in again.'); });
window.addEventListener('hashchange', () => { state.page = 0; navigate(); });
$('#refresh').onclick = () => navigate();
async function navigate() {
  if (!state.user) return;
  state.route = location.hash.slice(2) || 'overview'; const generation = ++state.generation;
  const route = state.route.split('/')[0];
  const names = { overview: 'Overview', applications: 'My applications', reviews: 'Review queue', products: 'Loan products', team: 'Team access', application: 'Application details' };
  $('#breadcrumb').textContent = names[route] ?? 'Overview';
  document.querySelectorAll('[data-nav]').forEach(link => link.classList.toggle('active', link.dataset.nav === route));
  $('#content').innerHTML = '<div class="loading" role="status">Loading your workspace…</div>';
  try {
    let html;
    if (route === 'overview') html = await overview();
    else if (route === 'products') html = await products();
    else if (route === 'applications' && has('CUSTOMER')) html = await applications();
    else if (route === 'reviews' && has('OFFICER')) html = await reviews();
    else if (route === 'team' && has('ADMIN')) html = await team();
    else if (route === 'application' && /^[0-9a-f-]{36}$/i.test(state.route.split('/')[1])) html = await details(state.route.split('/')[1]);
    else html = empty('This page isn’t available.', 'Choose a page from your workspace navigation.');
    if (generation === state.generation) $('#content').innerHTML = html;
  } catch (error) {
    if (generation === state.generation) $('#content').innerHTML = '<div class="inline-error" role="alert">' + e(error.message) + ' <button class="button secondary" data-action="retry">Try again</button></div>';
  }
}
const hero = (title, description, link, text) => '<section class="hero"><div class="hero-copy"><span class="eyebrow">ONE STEP CLOSER</span><h2>' + title + '</h2><p>' + description + '</p><a class="button primary" href="#/' + link + '">' + text + ' <span>↗</span></a></div><div class="hero-art" aria-hidden="true"><div class="orbit"><span>↗</span></div><div class="orbit-label"><b>●</b> A clearer way forward</div></div></section>';
async function overview() {
  const name = state.user.name.split(' ')[0];
  if (has('ADMIN')) {
    const page = await api('/products?size=6'); page.content.forEach(product => state.products.set(product.id, product));
    return heading('Welcome, ' + name + '.', 'A thoughtful foundation for every application.', button('new-product', 'Create product ＋'), 'LENDING OPERATIONS') +
      hero('Good lending starts<br>with clear terms.', 'Set the products, policies, and document requirements that guide every application.', 'products', 'Manage catalogue') +
      '<div class="section-heading"><h3>Active loan products <span class="muted">(' + page.totalElements + ')</span></h3><a class="row-link" href="#/products">View catalogue ↗</a></div>' +
      productCards(page, true) + steps();
  }
  if (has('OFFICER')) {
    const page = await api('/reviews?status=SUBMITTED&size=6');
    return heading('Welcome, ' + name + '.', 'Give every application the attention it deserves.', '', 'BANK WORKSPACE') +
      hero('A careful review.<br>A confident next step.', 'Review the evidence, verify the details, and keep each applicant informed through their timeline.', 'reviews', 'Open review queue') +
      '<div class="section-heading"><h3>Awaiting review <span class="muted">(' + page.totalElements + ')</span></h3></div>' + loanTable(page, true);
  }
  const page = await api('/applications?size=6');
  return heading('Hello, ' + name + '.', 'Here’s where things stand. Let’s keep moving forward.', '<a class="button primary" href="#/products">New application ＋</a>', 'YOUR NEXT CHAPTER') +
    hero('Big plans.<br>A simple place to start.', 'Find a loan that fits your next step. Apply online and follow your progress, all in one place.', 'products', 'Explore loan products') +
    '<div class="section-heading"><h3>Your applications <span class="muted">(' + page.totalElements + ')</span></h3><a class="row-link" href="#/applications">View all ↗</a></div>' + loanTable(page) + steps();
}
function steps() {
  return '<div class="step-list"><article><span>01</span><div><strong>Find the right fit</strong><p>Clear terms, before you apply.</p></div></article><article><span>02</span><div><strong>Keep it all together</strong><p>Your documents in one place.</p></div></article><article><span>03</span><div><strong>Follow every step</strong><p>Updates throughout your review.</p></div></article></div>';
}
async function products() {
  const page = await api('/products?page=' + state.page + '&size=8'); page.content.forEach(product => state.products.set(product.id, product));
  return heading(has('ADMIN') ? 'Your lending catalogue.' : 'Find your next step.',
    has('ADMIN') ? 'Set clear terms for the applications you receive.' : 'Explore the available products and choose what fits your plans.',
    has('ADMIN') ? button('new-product', 'Create product ＋') : '', 'LOAN PRODUCTS') + productCards(page, has('ADMIN'), has('CUSTOMER'));
}
async function applications() {
  const page = await api('/applications?page=' + state.page + '&size=10');
  return heading('Your applications.', 'Everything you’ve started, and every step ahead.', '<a class="button primary" href="#/products">New application ＋</a>', 'YOUR PROGRESS') + loanTable(page);
}
async function reviews() {
  const page = await api('/reviews?status=' + state.reviewStatus + '&page=' + state.page + '&size=10');
  return heading('One review at a time.', 'Open an application to verify documents and record a decision.', '', 'BANK WORKSPACE') +
    '<div class="filter-bar"><label class="muted small" for="queue-status">Application status</label><select id="queue-status">' +
    ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN'].map(status => '<option value="' + status + '"' +
      (status === state.reviewStatus ? ' selected' : '') + '>' + label(status) + '</option>').join('') + '</select></div>' + loanTable(page, true);
}
async function team() {
  const users = await api('/admin/users?page=' + state.page + '&size=20');
  return heading('The people behind progress.', 'Give your bank team access to the right workspace.', button('new-staff', 'Add team member ＋'), 'TEAM ACCESS') +
    '<div class="panel"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Email address</th><th>Access level</th></tr></thead><tbody>' +
    users.content.map(user => '<tr><td><strong>' + e(user.name) + '</strong></td><td>' + e(user.email) + '</td><td>' + e(label(user.roles[0])) + '</td></tr>').join('') +
    '</tbody></table></div>' + pager(users) + '</div><div class="notice">Share initial credentials through a trusted channel. Staff accounts can’t review their own applications.</div>';
}
async function details(id) {
  const [loan, documents, events] = await Promise.all([api('/applications/' + id), api('/applications/' + id + '/documents'), api('/applications/' + id + '/events?size=100')]);
  state.loan = loan;
  const owner = has('CUSTOMER') && loan.applicantId === state.user.id;
  const reviewer = has('OFFICER') && loan.reviewerId === state.user.id && loan.status === 'UNDER_REVIEW';
  let controls = '';
  if (owner && loan.status === 'DRAFT') controls += button('submit', 'Submit application ↗');
  if (owner && ['DRAFT', 'SUBMITTED'].includes(loan.status)) controls += '<button class="button secondary" data-action="withdraw">Withdraw</button>';
  if (has('OFFICER') && loan.status === 'SUBMITTED') controls += button('start-review', 'Start review ↗');
  if (reviewer) controls += button('decision', 'Record decision ↗');
  const facts = [['Loan amount', money(loan.amount, loan.product)], ['Repayment term', loan.termMonths + ' months'],
    ['Annual fixed interest', rate(loan.product.annualInterestRate) + '%'], ['Monthly income', money(loan.monthlyIncome, loan.product)],
    ['Existing monthly debt', money(loan.monthlyDebt, loan.product)], ['Applied on', date(loan.createdAt)]];
  const documentRows = state.capabilities.documentTypes.filter(type => loan.product.requiredDocuments.includes(type) || documents.some(document => document.type === type)).map(type => {
    const document = documents.find(item => item.type === type);
    return '<div class="document-row"><div><strong>' + e(label(type)) + '</strong><small>' + (document ? Math.ceil(document.sizeBytes / 1024) + ' KB · ' + date(document.uploadedAt) :
      'Required before submission') + '</small>' + (document?.verificationNote ? '<p class="small muted">' + e(document.verificationNote) + '</p>' : '') + '</div><div class="document-actions">' +
      (document ? badge(document.status) + '<a class="button secondary" href="/api/v1/applications/' + id + '/documents/' + document.id + '/content">Download ↓</a>' +
        (owner && loan.status === 'DRAFT' ? '<button class="button secondary" data-action="remove-document" data-id="' + document.id + '">Remove</button>' : '') +
        (reviewer && document.status === 'PENDING' ? '<button class="button primary" data-action="verify" data-id="' + document.id + '">Review</button>' : '') :
        owner && loan.status === 'DRAFT' ? '<button class="button secondary" data-action="upload" data-type="' + type + '">Upload ↑</button>' : '<span class="badge">Missing</span>') +
      '</div></div>';
  }).join('');
  return '<button class="back-link" data-action="back">← Back to applications</button>' + heading(loan.product.name, 'Application #' + loan.id.slice(0, 8).toUpperCase(), '<div class="toolbar">' + controls + '</div>', 'APPLICATION DETAILS') +
    '<div class="detail-layout"><div><section class="panel detail-section"><div class="section-heading"><h3>Application summary</h3>' + badge(loan.status) +
    '</div><div class="key-values">' + facts.map(([key, value]) => '<div><small>' + key + '</small><strong>' + e(value) + '</strong></div>').join('') +
    '</div><div class="notice"><strong>Purpose</strong><br>' + e(loan.purpose) + '</div></section><section class="panel detail-section"><h3>Your documents</h3>' + documentRows +
    '<p class="small muted">PDF, PNG or JPEG. Maximum file size: ' + (state.capabilities.maxDocumentBytes / 1048576).toLocaleString() + ' MB.</p></section></div><aside><section class="panel detail-section"><span class="eyebrow">REPAYMENT ESTIMATE</span><p class="detail-amount">' +
    e(money(loan.assessment.monthlyPayment, loan.product)) + '</p><span class="small muted">per month · ' + loan.termMonths + ' months</span><div class="notice ' +
    (loan.assessment.withinPolicy ? '' : 'warning') + '">' + (loan.assessment.withinPolicy ? 'Within the product’s affordability limit. A bank review is still required.' :
      'The declared income and debt are outside this product’s affordability limit.') + '</div><p class="small muted">Fixed interest calculation. The final decision follows document verification.</p></section>' +
    '<section class="panel detail-section"><h3>Application timeline</h3><ol class="timeline">' + events.content.map(event => '<li><strong>' + e(label(event.action)) +
      '</strong><small>' + date(event.occurredAt) + '</small>' + (event.note ? '<p>' + e(event.note) + '</p>' : '') + '</li>').join('') +
    '</ol>' + (events.totalElements > events.content.length ? '<p class="small muted">Showing the first ' + events.content.length + ' updates.</p>' : '') + '</section></aside></div>';
}
function openModal(title, content, onSubmit) {
  $('#modal-body').innerHTML = modal(title, content); $('#modal').showModal();
  const form = $('#modal form');
  if (form && onSubmit) form.onsubmit = async event => {
    event.preventDefault(); const error = form.querySelector('[data-form-error]'); if (error) error.hidden = true;
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    try { await onSubmit(new FormData(form), form); }
    catch (failure) { if (error) { error.textContent = failure.message; error.hidden = false; } else toast(failure.message, true); }
    finally { submit.disabled = false; }
  };
}
function confirmAction(title, description, perform, text = 'Confirm') {
  openModal(title, '<form><p class="muted">' + e(description) + '</p>' + errorSlot + actions(text) + '</form>',
    async () => { await perform(); $('#modal').close(); await navigate(); });
}
function newProduct() {
  openModal('Create a loan product', '<form><div class="form-grid">' +
    field('name', 'Product name', 'text', 'maxlength="120"') + field('code', 'Unique product code', 'text', 'pattern="[A-Z0-9_-]{1,80}" placeholder="PERSONAL_V1"') +
    field('currency', 'Currency code', 'text', 'pattern="[A-Z]{3}" placeholder="USD" maxlength="3"') +
    field('currencyScale', 'Currency decimal places', 'number', 'min="0" max="4" step="1"') +
    field('minAmount', 'Minimum loan amount', 'number', 'min="0.0001" step="0.0001"') +
    field('maxAmount', 'Maximum loan amount', 'number', 'min="0.0001" step="0.0001"') +
    field('minTermMonths', 'Minimum term (months)', 'number', 'min="1" max="1200" step="1"') +
    field('maxTermMonths', 'Maximum term (months)', 'number', 'min="1" max="1200" step="1"') +
    field('annualInterestRate', 'Annual fixed interest (%)', 'number', 'min="0" max="100" step="0.000001"') +
    field('maxDebtToIncomeRatio', 'Maximum debt-to-income (%)', 'number', 'min="0.0001" max="100" step="0.0001"') +
    '</div><span class="small">Required documents</span><div class="checks">' + state.capabilities.documentTypes.map(type =>
      '<label><input type="checkbox" name="requiredDocuments" value="' + type + '">' + label(type) + '</label>').join('') +
    '</div>' + errorSlot + actions('Create product') + '</form>', async data => {
      const body = Object.fromEntries(data); body.requiredDocuments = data.getAll('requiredDocuments');
      if (!body.requiredDocuments.length) throw new Error('Choose at least one required document.');
      for (const key of ['currencyScale', 'minTermMonths', 'maxTermMonths']) body[key] = Number(body[key]);
      body.maxDebtToIncomeRatio = (Number(body.maxDebtToIncomeRatio) / 100).toFixed(6);
      await api('/products', { method: 'POST', body }); $('#modal').close(); toast('Loan product created.'); await navigate();
    });
}
function newApplication(product) {
  let key = crypto.randomUUID(), lastPayload = null;
  openModal('Start your application', '<form><p class="small muted">' + e(product.name) + ' · ' + rate(product.annualInterestRate) + '% annual fixed interest</p><div class="form-grid">' +
    field('amount', 'Loan amount (' + e(product.currency) + ')', 'number', 'min="' + product.minAmount + '" max="' + product.maxAmount + '" step="' + (10 ** -product.currencyScale) + '"') +
    field('termMonths', 'Repayment term (months)', 'number', 'min="' + product.minTermMonths + '" max="' + product.maxTermMonths + '" step="1"') +
    field('monthlyIncome', 'Monthly income (' + e(product.currency) + ')', 'number', 'min="' + (10 ** -product.currencyScale) + '" step="' + (10 ** -product.currencyScale) + '"') +
    field('monthlyDebt', 'Existing monthly debt (' + e(product.currency) + ')', 'number', 'min="0" step="' + (10 ** -product.currencyScale) + '"') +
    '<label class="full">What will you use this loan for?<textarea name="purpose" required maxlength="1000"></textarea></label></div>' +
    '<p class="small muted">This creates a draft. You can upload your documents before submitting it for review.</p>' + errorSlot + actions('Create draft') + '</form>',
    async data => {
      const body = Object.fromEntries(data); body.productId = product.id;
      body.termMonths = Number(body.termMonths);
      const payload = JSON.stringify(body); if (lastPayload && lastPayload !== payload) key = crypto.randomUUID(); lastPayload = payload;
      const loan = await api('/applications', { method: 'POST', body, headers: { 'Idempotency-Key': key } });
      $('#modal').close(); toast('Your application draft is ready.'); location.hash = '/application/' + loan.id;
    });
}
function newStaff() {
  openModal('Add a team member', '<form>' + field('name', 'Display name', 'text', 'maxlength="100"') + field('email', 'Email address', 'email', 'maxlength="254"') +
    '<label>Access level<select name="role"><option value="OFFICER">Bank officer — review applications</option><option value="ADMIN">Administrator — products and team</option></select></label>' +
    field('password', 'Initial password', 'password', 'minlength="12" maxlength="72" autocomplete="new-password"') +
    '<p class="small muted">Use at least 12 characters and share credentials privately.</p>' + errorSlot + actions('Create account') + '</form>', async data => {
      await api('/admin/users', { method: 'POST', body: Object.fromEntries(data) }); $('#modal').close(); toast('Team account created.'); await navigate();
    });
}
document.addEventListener('change', event => {
  if (event.target.id === 'queue-status') { state.reviewStatus = event.target.value; state.page = 0; navigate(); }
});
document.addEventListener('click', async event => {
  const page = event.target.closest('[data-page]');
  if (page && !page.disabled) {
    state.page = Number(page.dataset.page);
    if (state.route === 'overview') { location.hash = has('ADMIN') ? '/products' : has('OFFICER') ? '/reviews' : '/applications'; }
    else await navigate();
    return;
  }
  const element = event.target.closest('[data-action]'); if (!element) return;
  const action = element.dataset.action, id = element.dataset.id, loan = state.loan;
  try {
    if (action === 'close-modal') $('#modal').close();
    else if (action === 'retry') await navigate();
    else if (action === 'back') location.hash = has('OFFICER') ? '/reviews' : '/applications';
    else if (action === 'new-product') newProduct();
    else if (action === 'new-staff') newStaff();
    else if (action === 'apply') newApplication(state.products.get(id));
    else if (action === 'deactivate-product') confirmAction('Deactivate this product?', 'It will no longer accept new applications. Existing application terms are preserved.',
      () => api('/products/' + id, { method: 'DELETE' }), 'Deactivate');
    else if (action === 'submit') confirmAction('Ready for review?', 'Your documents and application details will be locked once submitted. Make sure all required documents are uploaded.',
      () => api('/applications/' + loan.id + '/submit', { method: 'POST' }), 'Submit application');
    else if (action === 'withdraw') confirmAction('Withdraw this application?', 'This closes the application. You can start a new application later.',
      () => api('/applications/' + loan.id + '/withdraw', { method: 'POST' }), 'Withdraw');
    else if (action === 'start-review') confirmAction('Start this review?', 'You’ll become the assigned officer responsible for document verification and the final decision.',
      () => api('/reviews/' + loan.id + '/start', { method: 'POST' }), 'Start review');
    else if (action === 'remove-document') confirmAction('Remove this document?', 'You can upload a replacement before submitting your application.',
      () => api('/applications/' + loan.id + '/documents/' + id, { method: 'DELETE' }), 'Remove');
    else if (action === 'upload') {
      const type = element.dataset.type;
      openModal('Upload ' + label(type).toLowerCase(), '<form><label>Choose a document<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg" required></label>' +
        '<p class="small muted">PDF, PNG or JPEG. Files are stored encrypted.</p>' + errorSlot + actions('Upload document') + '</form>', async data => {
          await api('/applications/' + loan.id + '/documents?type=' + type, { method: 'POST', body: data });
          $('#modal').close(); toast('Document uploaded.'); await navigate();
        });
    } else if (action === 'verify') openModal('Record document verification', '<form><label>Verification result<select name="verified"><option value="true">Verified</option><option value="false">Rejected</option></select></label>' +
      '<label>Review note<textarea name="note" required maxlength="2000"></textarea></label>' + errorSlot + actions('Save verification') + '</form>', async data => {
        await api('/applications/' + loan.id + '/documents/' + id + '/verification', { method: 'POST', body: { verified: data.get('verified') === 'true', note: data.get('note') } });
        $('#modal').close(); await navigate(); toast('Verification recorded.');
      });
    else if (action === 'decision') openModal('Record your decision', '<form><label>Decision<select name="outcome"><option value="APPROVE">Approve application</option><option value="REJECT">Reject application</option></select></label>' +
      '<label>Decision reason<textarea name="reason" required maxlength="2000"></textarea></label><p class="small muted">This decision is final and will appear in the customer’s timeline.</p>' + errorSlot + actions('Record decision') + '</form>', async data => {
        await api('/reviews/' + loan.id + '/decision', { method: 'POST', body: Object.fromEntries(data) });
        $('#modal').close(); await navigate(); toast('Decision recorded.');
      });
  } catch (error) { toast(error.message, true); }
});
try { state.user = await request('/auth/me'); await enterWorkspace(); }
catch (error) { showAuth(); if (error.status !== 401) toast(error.message, true); }

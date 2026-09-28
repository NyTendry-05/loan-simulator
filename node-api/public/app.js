import { api, request } from './api.js';
import { escape as e, label, date, timestamp, money, rate, badge, empty, heading, pager, loanTable, productCards, modal, errorSlot, actions, field, icon, progress, statusMessage } from './views.js';

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
  state.user = null; state.loan = null; state.products.clear(); state.generation++;
  $('#modal').close(); $('#workspace').hidden = true; $('#auth-screen').hidden = false; $('#boot').hidden = true;
  setAuthMode(false); $('#auth-form').reset(); setMenu(false);
}
function setAuthMode(register) {
  registerMode = register; $('#name-field').hidden = !register; $('#name-field input').required = register;
  $('#auth-password').minLength = register ? 12 : 1;
  $('#auth-password').autocomplete = register ? 'new-password' : 'current-password';
  $('#password-help').hidden = !register;
  $('#auth-title').textContent = register ? 'Create your account.' : 'Welcome back.';
  $('#auth-description').textContent = register ? 'Register to apply for a loan and track its progress.' : 'Sign in to manage your applications.';
  $('#show-login').classList.toggle('selected', !register); $('#show-register').classList.toggle('selected', register);
  $('#show-login').setAttribute('aria-pressed', String(!register)); $('#show-register').setAttribute('aria-pressed', String(register));
  $('#auth-password').type = 'password'; $('#toggle-password').textContent = 'Show'; $('#toggle-password').setAttribute('aria-label', 'Show password');
  $('#auth-submit').textContent = register ? 'Create account' : 'Sign in'; $('#auth-error').hidden = true;
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
  $('#portal-name').textContent = has('ADMIN') ? 'Lending administration' : has('OFFICER') ? 'Lending operations' : 'Personal lending';
  const links = [['overview', 'overview', 'Overview']];
  if (has('CUSTOMER')) links.push(['applications', 'document', 'My applications']);
  if (has('OFFICER')) links.push(['reviews', 'document', 'Review queue']);
  links.push(['products', 'products', has('ADMIN') ? 'Product catalogue' : 'Loan products']);
  if (has('ADMIN')) links.push(['team', 'team', 'Team access']);
  $('#navigation').innerHTML = links.map(([route, symbol, title]) => '<a href="#/' + route + '" data-nav="' + route + '">' + icon(symbol) + title + '</a>').join('');
  if (!location.hash) location.hash = '/overview'; else await navigate();
}
$('#logout').onclick = async () => {
  try { await request('/auth/logout', { method: 'POST' }); location.hash = '/overview'; showAuth(); }
  catch (error) { toast(error.message, true); }
};
window.addEventListener('session-expired', () => { showAuth(); toast('Your session ended. Please sign in again.'); });
function setMenu(open) {
  $('.sidebar').classList.toggle('menu-open', open); $('#menu-toggle').setAttribute('aria-expanded', String(open));
}
$('#menu-toggle').onclick = () => setMenu($('#menu-toggle').getAttribute('aria-expanded') !== 'true');
$('.skip-link').onclick = event => { event.preventDefault(); $('#content').focus(); };
$('#navigation').onclick = event => { if (event.target.closest('a')) setMenu(false); };
document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('#menu-toggle').getAttribute('aria-expanded') === 'true') { setMenu(false); $('#menu-toggle').focus(); } });
$('#modal').addEventListener('close', () => { $('#modal-body').replaceChildren(); });
window.addEventListener('hashchange', () => { state.page = 0; navigate(true); });
$('#refresh').onclick = () => navigate();
async function navigate(focus = false) {
  if (!state.user) return;
  state.route = location.hash.slice(2) || 'overview'; const generation = ++state.generation;
  const route = state.route.split('/')[0];
  const names = { overview: 'Overview', applications: 'My applications', reviews: 'Review queue', products: 'Loan products', team: 'Team access', application: 'Application details' };
  $('#breadcrumb').textContent = names[route] ?? 'Overview';
  const activeRoute = route === 'application' ? (has('OFFICER') ? 'reviews' : 'applications') : route;
  document.querySelectorAll('[data-nav]').forEach(link => {
    const active = link.dataset.nav === activeRoute; link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  $('#content').setAttribute('aria-busy', 'true');
  $('#content').innerHTML = '<div class="loading" role="status">Loading account information…</div>';
  try {
    let html;
    if (route === 'overview') html = await overview();
    else if (route === 'products') html = await products();
    else if (route === 'applications' && has('CUSTOMER')) html = await applications();
    else if (route === 'reviews' && has('OFFICER')) html = await reviews();
    else if (route === 'team' && has('ADMIN')) html = await team();
    else if (route === 'application' && /^[0-9a-f-]{36}$/i.test(state.route.split('/')[1])) html = await details(state.route.split('/')[1]);
    else html = empty('This page isn’t available.', 'Choose a page from your workspace navigation.');
    if (generation === state.generation) { $('#content').innerHTML = html; if (focus) $('#content').focus({ preventScroll: true }); }
  } catch (error) {
    if (generation === state.generation) $('#content').innerHTML = '<div class="inline-error" role="alert">' + e(error.message) + ' <button class="button secondary" data-action="retry">Try again</button></div>';
  } finally { if (generation === state.generation) $('#content').setAttribute('aria-busy', 'false'); }
}
const metric = (title, value, description, route) => '<a class="metric" href="#/' + route + '"><span>' + e(title) + '</span><strong>' + e(value) + '</strong><small>' + e(description) + '</small></a>';
const rail = (title, content) => '<aside class="rail"><h2>' + e(title) + '</h2>' + content + '<button class="text-button" data-action="guide">Read the application guide →</button></aside>';
const railLink = (title, route) => '<a class="rail-link" href="#/' + route + '">' + e(title) + '<span aria-hidden="true">→</span></a>';
async function overview() {
  const name = state.user.name.split(' ')[0];
  if (has('ADMIN')) {
    const [page, staff] = await Promise.all([api('/products?size=6'), api('/admin/users?size=1')]);
    page.content.forEach(product => state.products.set(product.id, product));
    return heading('Welcome, ' + name + '.', 'Manage loan products, lending terms, and staff access.', button('new-product', 'Create product'), 'ADMINISTRATION') +
      '<div class="overview-grid"><div><div class="metrics">' + metric('Active loan products', page.totalElements, 'Available for new applications', 'products') +
      metric('Staff accounts', staff.totalElements, 'Administrators and loan officers', 'team') + '</div>' +
      '<div class="section-heading"><h2>Active products</h2><a class="row-link" href="#/products">View catalogue →</a></div>' + productCards(page, true) + '</div>' +
      rail('Administration', '<p>Product terms determine the amount, repayment period, and documents available to applicants.</p>' + railLink('Manage loan products', 'products') + railLink('Manage team access', 'team') +
        '<div class="notice">To change an existing product’s terms, create a new product and deactivate the old one.</div>') + '</div>';
  }
  if (has('OFFICER')) {
    const [page, reviewing] = await Promise.all([api('/reviews?status=SUBMITTED&size=6'), api('/reviews?status=UNDER_REVIEW&size=1')]);
    return heading('Review overview', 'Welcome, ' + name + '. Review the applications awaiting a bank decision.', '<a class="button primary" href="#/reviews">Open review queue</a>', 'LENDING OPERATIONS') +
      '<div class="overview-grid"><div><div class="metrics">' + metric('Awaiting review', page.totalElements, 'Submitted and ready to be assigned', 'reviews') +
      '<div class="metric"><span>Under review</span><strong>' + reviewing.totalElements + '</strong><small>Across all loan officers</small></div></div>' +
      '<div class="section-heading"><h2>Awaiting review</h2><span class="count">Newest applications first</span></div>' + loanTable(page, true) + '</div>' +
      rail('Review checklist', '<ol><li><strong>Claim the application</strong>Assign the review to yourself.</li><li><strong>Verify the documents</strong>Inspect the evidence and record your findings.</li><li><strong>Record a decision</strong>Include a clear reason for the applicant.</li></ol>') + '</div>';
  }
  const page = await api('/applications?size=6');
  const latest = page.content[0];
  const recent = latest ? '<section class="panel recent-application"><div class="recent-top"><span class="eyebrow">LATEST APPLICATION</span>' + badge(latest.status) + '</div><h2>' + e(latest.product.name) +
    '</h2><div class="recent-figures"><div><strong>' + e(money(latest.amount, latest.product)) + '</strong><small>Requested amount</small></div><div><strong>' + latest.termMonths + ' months</strong><small>Repayment term</small></div></div><p>' +
    e(statusMessage(latest.status)[1]) + '</p><a class="button secondary" href="#/application/' + latest.id + '">' + (latest.status === 'DRAFT' ? 'Continue application' : 'View application') + '</a></section>' : '';
  return heading('Hello, ' + name + '.', 'View your applications, documents, and decisions.', '<a class="button primary" href="#/products">New application</a>', 'PERSONAL LENDING') +
    '<div class="overview-grid"><div>' + recent + '<div class="section-heading"><h2>Your applications <span class="count">(' + page.totalElements + ')</span></h2><a class="row-link" href="#/applications">View all →</a></div>' + loanTable(page) + '</div>' +
    rail('Before you apply', '<ol><li><strong>Compare the terms</strong>Check loan amounts, rates, and repayment periods.</li><li><strong>Have your details ready</strong>You’ll need your monthly income and existing debt commitments.</li><li><strong>Prepare your documents</strong>Requirements are listed with each product.</li></ol>' + railLink('Browse loan products', 'products')) + '</div>';
}
async function products() {
  const page = await api('/products?page=' + state.page + '&size=8'); page.content.forEach(product => state.products.set(product.id, product));
  return heading(has('ADMIN') ? 'Product catalogue' : 'Loan products',
    has('ADMIN') ? 'Manage the terms and document requirements for new applications.' : 'Compare amounts, fixed interest rates, and repayment terms before you apply.',
    has('ADMIN') ? button('new-product', 'Create product') : '', 'LENDING') + productCards(page, has('ADMIN'), has('CUSTOMER'));
}
async function applications() {
  const page = await api('/applications?page=' + state.page + '&size=10');
  return heading('My applications', 'Open an application to view its documents, status, and decision history.', '<a class="button primary" href="#/products">New application</a>', 'PERSONAL LENDING') + loanTable(page);
}
async function reviews() {
  const page = await api('/reviews?status=' + state.reviewStatus + '&page=' + state.page + '&size=10');
  return heading('Review queue', 'Claim a submitted application to begin document verification.', '', 'LENDING OPERATIONS') +
    '<div class="filter-bar"><label class="muted small" for="queue-status">Application status</label><select id="queue-status">' +
    ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN'].map(status => '<option value="' + status + '"' +
      (status === state.reviewStatus ? ' selected' : '') + '>' + label(status) + '</option>').join('') + '</select><span class="result-count">' + page.totalElements + ' applications</span></div>' + loanTable(page, true);
}
async function team() {
  const users = await api('/admin/users?page=' + state.page + '&size=20');
  return heading('Team access', 'Create accounts for loan officers and administrators.', button('new-staff', 'Add team member'), 'ADMINISTRATION') +
    '<div class="panel"><div class="table-wrap"><table class="responsive-table staff-table"><caption class="visually-hidden">Staff accounts</caption><thead><tr><th scope="col">Name</th><th scope="col">Email address</th><th scope="col">Access level</th></tr></thead><tbody>' +
    users.content.map(user => '<tr><td><strong>' + e(user.name) + '</strong></td><td data-label="Email address">' + e(user.email) + '</td><td data-label="Access level">' + e(label(user.roles[0])) + '</td></tr>').join('') +
    '</tbody></table></div>' + pager(users) + '</div><div class="notice">Share initial credentials through a trusted channel. Staff accounts can’t review their own applications.</div>';
}
async function details(id) {
  const [loan, documents, events] = await Promise.all([api('/applications/' + id), api('/applications/' + id + '/documents'), api('/applications/' + id + '/events?size=100')]);
  state.loan = loan;
  const owner = has('CUSTOMER') && loan.applicantId === state.user.id;
  const reviewer = has('OFFICER') && loan.reviewerId === state.user.id && loan.status === 'UNDER_REVIEW';
  let controls = '';
  const missingDocuments = loan.product.requiredDocuments.filter(type => !documents.some(document => document.type === type));
  if (owner && loan.status === 'DRAFT') controls += '<button class="button primary" data-action="submit"' + (missingDocuments.length ? ' disabled title="Upload all required documents first"' : '') + '>Submit application</button>';
  if (owner && ['DRAFT', 'SUBMITTED'].includes(loan.status)) controls += '<button class="button secondary" data-action="withdraw">Withdraw</button>';
  if (has('OFFICER') && loan.status === 'SUBMITTED') controls += button('start-review', 'Start review');
  if (reviewer) controls += button('decision', 'Record decision');
  const facts = [['Loan amount', money(loan.amount, loan.product)], ['Repayment term', loan.termMonths + ' months'],
    ['Annual fixed interest', rate(loan.product.annualInterestRate) + '%'], ['Monthly income', money(loan.monthlyIncome, loan.product)],
    ['Existing monthly debt', money(loan.monthlyDebt, loan.product)], ['Created on', date(loan.createdAt)]];
  const [statusTitle, statusDescription] = statusMessage(loan.status, has('OFFICER'));
  const nextDescription = owner && loan.status === 'DRAFT' && missingDocuments.length ? 'Before you can submit, upload: ' + missingDocuments.map(label).join(', ') + '.' : statusDescription;
  const documentRows = state.capabilities.documentTypes.filter(type => loan.product.requiredDocuments.includes(type) || documents.some(document => document.type === type)).map(type => {
    const document = documents.find(item => item.type === type);
    return '<div class="document-row"><div><strong>' + e(label(type)) + '</strong><small>' + (document ? Math.ceil(document.sizeBytes / 1024) + ' KB · ' + date(document.uploadedAt) :
      'Required before submission') + '</small>' + (document?.verificationNote ? '<p class="small muted">' + e(document.verificationNote) + '</p>' : '') + '</div><div class="document-actions">' +
      (document ? badge(document.status) + '<a class="button secondary" href="/api/v1/applications/' + id + '/documents/' + document.id + '/content">Download</a>' +
        (owner && loan.status === 'DRAFT' ? '<button class="button secondary" data-action="remove-document" data-id="' + document.id + '">Remove</button>' : '') +
        (reviewer && document.status === 'PENDING' ? '<button class="button primary" data-action="verify" data-id="' + document.id + '">Review</button>' : '') :
        owner && loan.status === 'DRAFT' ? '<button class="button secondary" data-action="upload" data-type="' + type + '">Upload</button>' : '<span class="badge">Missing</span>') +
      '</div></div>';
  }).join('');
  return '<button class="back-link" data-action="back">← Back to applications</button>' + heading(loan.product.name, 'Application #' + loan.id.slice(0, 8).toUpperCase(), '<div class="toolbar">' + controls + '</div>', 'APPLICATION DETAILS') +
    progress(loan.status) + '<section class="next-step' + (loan.status === 'APPROVED' ? ' complete' : '') + '">' + icon(loan.status === 'APPROVED' ? 'check' : 'info') + '<div><strong>' + e(statusTitle) + '</strong><p>' + e(nextDescription) + '</p></div></section>' +
    '<div class="detail-layout"><div><section class="panel detail-section"><div class="section-heading"><h3>Application summary</h3>' + badge(loan.status) +
    '</div><div class="key-values">' + facts.map(([key, value]) => '<div><small>' + key + '</small><strong>' + e(value) + '</strong></div>').join('') +
    '</div><div class="notice"><strong>Loan purpose</strong><br>' + e(loan.purpose) + '</div></section><section class="panel detail-section"><div class="section-heading"><h3>' + (owner ? 'Your documents' : 'Applicant documents') + '</h3><span class="count">' +
    (loan.product.requiredDocuments.length - missingDocuments.length) + ' of ' + loan.product.requiredDocuments.length + ' required uploads</span></div>' + documentRows +
    '<p class="small muted">PDF, PNG or JPEG. Maximum file size: ' + (state.capabilities.maxDocumentBytes / 1048576).toLocaleString() + ' MB.</p></section></div><aside><section class="panel detail-section estimate-panel"><span class="eyebrow">ESTIMATED MONTHLY PAYMENT</span><p class="detail-amount">' +
    e(money(loan.assessment.monthlyPayment, loan.product)) + '</p><span class="small muted">per month · ' + loan.termMonths + ' months</span><div class="notice ' +
    (loan.assessment.withinPolicy ? '' : 'warning') + '">' + (loan.assessment.withinPolicy ? 'The declared income and debt meet this product’s affordability limit.' :
      'The declared income and debt are outside this product’s affordability limit.') + '</div><p class="small muted">Based on ' + rate(loan.product.annualInterestRate) + '% annual fixed interest. Excludes fees. This estimate is not a repayment schedule.</p></section>' +
    '<section class="panel detail-section"><h3>Application timeline</h3><ol class="timeline">' + events.content.map(event => '<li><strong>' + e(label(event.action)) +
      '</strong><small>' + timestamp(event.occurredAt) + '</small>' + (event.note ? '<p>' + e(event.note) + '</p>' : '') + '</li>').join('') +
    '</ol>' + (events.totalElements > events.content.length ? '<p class="small muted">Showing the first ' + events.content.length + ' updates.</p>' : '') + '</section></aside></div>';
}
function openModal(title, content, onSubmit) {
  $('#modal-body').innerHTML = modal(title, content); $('#modal').showModal();
  const form = $('#modal form');
  if (form && onSubmit) form.onsubmit = async event => {
    event.preventDefault(); const error = form.querySelector('[data-form-error]'); if (error) error.hidden = true;
    const submit = form.querySelector('[type=submit]'); const originalText = submit.textContent; submit.disabled = true; submit.textContent = 'Saving…'; form.setAttribute('aria-busy', 'true');
    try { await onSubmit(new FormData(form), form); }
    catch (failure) { if (error) { error.textContent = failure.message; error.hidden = false; error.scrollIntoView({ block: 'nearest' }); } else toast(failure.message, true); }
    finally { submit.disabled = false; submit.textContent = originalText; form.setAttribute('aria-busy', 'false'); }
  };
}
function confirmAction(title, description, perform, text = 'Confirm') {
  openModal(title, '<form><p class="muted">' + e(description) + '</p>' + errorSlot + actions(text, ['Withdraw', 'Remove', 'Deactivate'].includes(text)) + '</form>',
    async () => { await perform(); $('#modal').close(); await navigate(); });
}
function newProduct() {
  openModal('Create a loan product', '<form><p class="small muted">Required fields define the terms shown to applicants. Create a new product whenever these terms change.</p><fieldset class="form-section"><legend>Product information</legend><div class="form-grid">' +
    field('name', 'Product name', 'text', 'maxlength="120"') + field('code', 'Unique product code', 'text', 'pattern="[A-Z0-9_-]{1,80}" placeholder="PERSONAL_V1"') +
    field('currency', 'Currency code', 'text', 'pattern="[A-Z]{3}" placeholder="USD" maxlength="3"') +
    field('currencyScale', 'Currency decimal places', 'number', 'min="0" max="4" step="1"') + '</div></fieldset><fieldset class="form-section"><legend>Amounts and repayment terms</legend><div class="form-grid">' +
    field('minAmount', 'Minimum loan amount', 'number', 'min="0.0001" step="0.0001"') +
    field('maxAmount', 'Maximum loan amount', 'number', 'min="0.0001" step="0.0001"') +
    field('minTermMonths', 'Minimum term (months)', 'number', 'min="1" max="1200" step="1"') +
    field('maxTermMonths', 'Maximum term (months)', 'number', 'min="1" max="1200" step="1"') +
    field('annualInterestRate', 'Annual fixed interest (%)', 'number', 'min="0" max="100" step="0.000001"') +
    field('maxDebtToIncomeRatio', 'Maximum debt-to-income (%)', 'number', 'min="0.0001" max="100" step="0.0001"') +
    '</div></fieldset><fieldset class="form-section"><legend>Required documents</legend><p class="small muted">Select at least one. Applicants must upload each selected type before submitting.</p><div class="checks">' + state.capabilities.documentTypes.map(type =>
      '<label><input type="checkbox" name="requiredDocuments" value="' + type + '">' + label(type) + '</label>').join('') +
    '</div></fieldset>' + errorSlot + actions('Create product') + '</form>', async data => {
      const body = Object.fromEntries(data); body.requiredDocuments = data.getAll('requiredDocuments');
      if (!body.requiredDocuments.length) throw new Error('Choose at least one required document.');
      for (const key of ['currencyScale', 'minTermMonths', 'maxTermMonths']) body[key] = Number(body[key]);
      body.maxDebtToIncomeRatio = (Number(body.maxDebtToIncomeRatio) / 100).toFixed(6);
      await api('/products', { method: 'POST', body }); $('#modal').close(); toast('Loan product created.'); await navigate();
    });
}
function newApplication(product) {
  let key = crypto.randomUUID(), lastPayload = null;
  openModal('Start your application', '<form><p class="small muted">' + e(product.name) + ' · ' + rate(product.annualInterestRate) + '% annual fixed interest</p><fieldset class="form-section"><legend>1. Loan request</legend><p class="help">Available amount: ' + e(money(product.minAmount, product)) + '–' + e(money(product.maxAmount, product)) + '. Repayment term: ' + product.minTermMonths + '–' + product.maxTermMonths + ' months.</p><div class="form-grid">' +
    field('amount', 'Loan amount (' + e(product.currency) + ')', 'number', 'min="' + product.minAmount + '" max="' + product.maxAmount + '" step="' + (10 ** -product.currencyScale) + '"') +
    field('termMonths', 'Repayment term (months)', 'number', 'min="' + product.minTermMonths + '" max="' + product.maxTermMonths + '" step="1"') + '</div></fieldset><fieldset class="form-section"><legend>2. Monthly finances</legend><p class="help">Enter your income and the total monthly payments you already owe on other debts.</p><div class="form-grid">' +
    field('monthlyIncome', 'Monthly income (' + e(product.currency) + ')', 'number', 'min="' + (10 ** -product.currencyScale) + '" step="' + (10 ** -product.currencyScale) + '"') +
    field('monthlyDebt', 'Existing monthly debt (' + e(product.currency) + ')', 'number', 'min="0" step="' + (10 ** -product.currencyScale) + '"') +
    '</div></fieldset><fieldset class="form-section"><legend>3. Purpose</legend><label>What will you use this loan for?<textarea name="purpose" required maxlength="1000"></textarea></label></fieldset>' +
    '<p class="small muted">Check your figures before creating the draft; they cannot be edited afterwards. You will add documents and submit for review in the next step.</p>' + errorSlot + actions('Create draft') + '</form>',
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
function showGuide() {
  const customerSteps = [
    ['Choose a loan product', 'Compare the available amounts, interest rates, repayment terms, and required documents.'],
    ['Create a draft', 'Enter your loan request, monthly income, existing monthly debt, and loan purpose. Check these details before saving.'],
    ['Upload and submit', 'Add every required document, then submit the application. Uploads are locked after submission. You can withdraw before an officer starts reviewing.'],
    ['Track the decision', 'Open My applications to see the status and timeline. The officer records verification results and the final decision here.'],
  ];
  const staffSteps = has('ADMIN') ? [
    ['Configure loan products', 'Set amount limits, repayment periods, interest rates, affordability limits, and required documents in Product catalogue.'],
    ['Create staff accounts', 'Use Team access to add officers or administrators. Share their initial credentials privately.'],
    ['Maintain lending terms', 'Product terms cannot be edited. Create a new product and deactivate the old one when terms change. Existing applications retain their original terms.'],
  ] : [
    ['Choose a submitted application', 'Open Review queue, select Submitted, and open an application. Start review to become the assigned officer.'],
    ['Inspect the evidence', 'Download and inspect each required document before recording its verification result. Only the assigned officer can save verification decisions.'],
    ['Record a reasoned decision', 'Approval requires verified documents and a successful affordability assessment. Your decision reason appears in the customer’s timeline.'],
  ];
  const guideSteps = has('ADMIN') || has('OFFICER') ? staffSteps : customerSteps;
  openModal('Application guide', '<ol class="guide-steps">' + guideSteps.map(([title, text]) => '<li><strong>' + e(title) + '</strong><p>' + e(text) + '</p></li>').join('') +
    '</ol><div class="notice">Loan approval records a decision. This portal does not transfer funds or collect repayments.</div><div class="form-actions"><button class="button primary" data-action="close-modal">Close guide</button></div>');
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
    else if (action === 'guide') showGuide();
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
        '<p class="small muted">Choose a clear, readable PDF, PNG or JPEG. Maximum size: ' + (state.capabilities.maxDocumentBytes / 1048576).toLocaleString() + ' MB.</p>' + errorSlot + actions('Upload document') + '</form>', async data => {
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

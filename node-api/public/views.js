export const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export const label = value => String(value ?? '').toLowerCase().replaceAll('_', ' ').replace(/^\w/, character => character.toUpperCase());
export const date = value => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
export const timestamp = value => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
export const rate = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value);
export const money = (value, product) => new Intl.NumberFormat(undefined, {
  style: 'currency', currency: product.currency, minimumFractionDigits: product.currencyScale, maximumFractionDigits: product.currencyScale,
}).format(String(value));
export const badge = status => '<span class="badge ' + escape(String(status).toLowerCase()) + '">' + escape(label(status)) + '</span>';
const icons = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  document: '<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6"/>',
  products: '<path d="M3 7h18v14H3zM7 7V3h10v4M3 12h18M10 12v3h4v-3"/>',
  team: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 5v3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
};
export const icon = name => '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (icons[name] ?? icons.document) + '</svg>';
export const empty = (title, description, action = '') => '<div class="empty"><div class="empty-symbol">' + icon('document') + '</div><h3>' + escape(title) + '</h3><p>' + escape(description) + '</p>' + action + '</div>';
export const heading = (title, description, action = '', eyebrow = 'YOUR WORKSPACE') =>
  '<div class="page-heading"><div><span class="eyebrow">' + escape(eyebrow) + '</span><h1>' + escape(title) + '</h1><p>' + escape(description) + '</p></div>' + action + '</div>';
export const pager = page => '<div class="pager"><span>' + (page.totalElements ? 'Page ' + (page.page + 1) + ' of ' + page.totalPages : 'No results') +
  ' · ' + page.totalElements + ' total</span><button data-page="' + (page.page - 1) + '" ' + (page.page === 0 ? 'disabled' : '') +
  ' aria-label="Previous page">←</button><button data-page="' + (page.page + 1) + '" ' + (page.page + 1 >= page.totalPages ? 'disabled' : '') + ' aria-label="Next page">→</button></div>';
export function loanTable(page, isReview = false) {
  if (!page.content.length) return '<div class="panel">' + empty(isReview ? 'No applications in this queue' : 'No applications yet',
    isReview ? 'Choose a different status or refresh to check for new applications.' : 'Review the available loan terms, then start an application. You can add documents before submitting.',
    isReview ? '' : '<a class="button primary" href="#/products">Browse loan products</a>') + '</div>';
  return '<div class="panel"><div class="table-wrap"><table class="responsive-table"><caption class="visually-hidden">' + (isReview ? 'Applications for bank review' : 'Your loan applications') + '</caption><thead><tr><th scope="col">Application</th><th scope="col">Requested amount</th><th scope="col">Status</th><th scope="col">Created</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead><tbody>' +
    page.content.map(loan => '<tr><td><strong>' + escape(loan.product.name) + '</strong><small>#' + escape(loan.id.slice(0, 8).toUpperCase()) +
      '</small></td><td data-label="Requested amount" class="nowrap">' + escape(money(loan.amount, loan.product)) + '<small>' + loan.termMonths + ' months</small></td><td data-label="Status">' +
      badge(loan.status) + '</td><td data-label="Created" class="nowrap">' + date(loan.createdAt) + '</td><td><a class="row-link" href="#/application/' + loan.id +
      '">View <span aria-hidden="true">→</span></a></td></tr>').join('') + '</tbody></table></div>' + pager(page) + '</div>';
}
export function productCards(page, admin = false, customer = false) {
  if (!page.content.length) return '<div class="panel">' + empty('No active loan products',
    admin ? 'Create your first loan product with the terms and documents your bank requires.' : 'There are no loan products available yet. Please check back later.',
    admin ? '<button class="button primary" data-action="new-product">Create a loan product</button>' : '') + '</div>';
  return '<div class="cards">' + page.content.map(product =>
    '<article class="product-card"><div class="product-top"><span class="code">' + escape(product.code) +
    '</span><span class="product-currency">' + escape(product.currency) + '</span></div><h3>' + escape(product.name) + '</h3><div class="product-values"><div><strong>' + rate(product.annualInterestRate) +
    '%</strong><small>Annual fixed interest</small></div><div><strong>' + product.minTermMonths + '–' + product.maxTermMonths +
    '</strong><small>Months to repay</small></div></div><p class="product-amount"><span>Available loan amount</span>' + escape(money(product.minAmount, product)) + ' – ' +
    escape(money(product.maxAmount, product)) + '</p><details class="product-documents"><summary>Required documents (' + product.requiredDocuments.length + ')</summary><ul>' +
    product.requiredDocuments.map(type => '<li>' + escape(label(type)) + '</li>').join('') + '</ul></details><footer><small>Subject to review</small>' +
    (admin ? '<button class="button secondary" data-action="deactivate-product" data-id="' + product.id + '">Deactivate</button>' :
      customer ? '<button class="button primary" data-action="apply" data-id="' + product.id + '">Start application</button>' : '') +
    '</footer></article>').join('') + '</div>' + pager(page);
}
export function modal(title, content) {
  return '<div class="modal-header"><h2 id="modal-title">' + escape(title) + '</h2><button type="button" class="close-modal" data-action="close-modal" aria-label="Close dialog">×</button></div><div class="modal-content">' + content + '</div>';
}
export const errorSlot = '<p class="form-error" data-form-error role="alert" hidden></p>';
export const actions = (text = 'Save', destructive = false) => '<div class="form-actions"><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button class="button ' + (destructive ? 'danger' : 'primary') + '" type="submit">' + escape(text) + '</button></div>';
export const field = (name, text, type = 'text', attributes = '') => '<label for="field-' + name + '">' + text + '<input id="field-' + name + '" name="' + name + '" type="' + type + '" required ' + attributes + '></label>';

export function progress(status) {
  if (status === 'WITHDRAWN') return '';
  const index = { DRAFT: 0, SUBMITTED: 1, UNDER_REVIEW: 2, APPROVED: 3, REJECTED: 3 }[status];
  return '<ol class="progress-track" aria-label="Application progress">' + ['Draft', 'Submitted', 'Under review', index === 3 ? label(status) : 'Decision'].map((step, i) =>
    '<li class="' + (i < index ? 'complete' : i === index ? 'current' : '') + '"' + (i === index ? ' aria-current="step"' : '') + '><span class="step-number" aria-hidden="true">' +
    (i < index ? '✓' : i + 1) + '</span><span>' + escape(step) + (i < index ? '<span class="visually-hidden"> completed</span>' : '') + '</span></li>').join('') + '</ol>';
}

export function statusMessage(status, officer = false) {
  const messages = {
    DRAFT: ['Complete your application', 'Upload all required documents, check the details, then submit your application for review.'],
    SUBMITTED: [officer ? 'Ready to be assigned' : 'Application received', officer ? 'Start the review to take responsibility for document verification and the decision.' : 'Your application is waiting for an officer to begin the review. You can check for updates here.'],
    UNDER_REVIEW: ['Review in progress', officer ? 'The assigned officer must verify each required document before recording a decision.' : 'An officer is reviewing your application and documents. No further uploads can be made at this stage.'],
    APPROVED: ['Application approved', 'The approval decision is recorded in your timeline. This portal does not disburse funds or collect repayments.'],
    REJECTED: ['Application declined', 'Read the officer’s decision reason in the application timeline. This application is closed.'],
    WITHDRAWN: ['Application withdrawn', 'This application is closed. You can start a new application from the loan products page.'],
  };
  return messages[status] ?? ['Application status', 'Review the application timeline for updates.'];
}

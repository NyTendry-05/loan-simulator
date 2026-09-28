export const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export const label = value => String(value ?? '').toLowerCase().replaceAll('_', ' ').replace(/^\w/, character => character.toUpperCase());
export const date = value => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
export const rate = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value);
export const money = (value, product) => new Intl.NumberFormat(undefined, {
  style: 'currency', currency: product.currency, minimumFractionDigits: product.currencyScale, maximumFractionDigits: product.currencyScale,
}).format(String(value));
export const badge = status => '<span class="badge ' + escape(String(status).toLowerCase()) + '">' + escape(label(status)) + '</span>';
export const empty = (title, description, action = '') => '<div class="empty"><div class="empty-symbol" aria-hidden="true">↗</div><h3>' + escape(title) + '</h3><p>' + escape(description) + '</p>' + action + '</div>';
export const heading = (title, description, action = '', eyebrow = 'YOUR WORKSPACE') =>
  '<div class="page-heading"><div><span class="eyebrow">' + escape(eyebrow) + '</span><h1>' + escape(title) + '</h1><p>' + escape(description) + '</p></div>' + action + '</div>';
export const pager = page => '<div class="pager"><span>' + (page.totalElements ? 'Page ' + (page.page + 1) + ' of ' + page.totalPages : 'No results') +
  ' · ' + page.totalElements + ' total</span><button data-page="' + (page.page - 1) + '" ' + (page.page === 0 ? 'disabled' : '') +
  ' aria-label="Previous page">←</button><button data-page="' + (page.page + 1) + '" ' + (page.page + 1 >= page.totalPages ? 'disabled' : '') + ' aria-label="Next page">→</button></div>';
export function loanTable(page, isReview = false) {
  if (!page.content.length) return '<div class="panel">' + empty(isReview ? 'Nothing in this queue.' : 'Your first step starts here.',
    isReview ? 'Applications will appear here when they reach this stage.' : 'Choose a loan product and start your application when you’re ready.',
    isReview ? '' : '<a class="button primary" href="#/products">Explore loan products <span>↗</span></a>') + '</div>';
  return '<div class="panel"><div class="table-wrap"><table><thead><tr><th>Application</th><th>Amount</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>' +
    page.content.map(loan => '<tr><td><strong>' + escape(loan.product.name) + '</strong><small>#' + escape(loan.id.slice(0, 8).toUpperCase()) +
      '</small></td><td>' + escape(money(loan.amount, loan.product)) + '<small>' + loan.termMonths + ' months</small></td><td>' +
      badge(loan.status) + '</td><td>' + date(loan.createdAt) + '</td><td><a class="row-link" href="#/application/' + loan.id +
      '">View <span aria-hidden="true">↗</span></a></td></tr>').join('') + '</tbody></table></div>' + pager(page) + '</div>';
}
export function productCards(page, admin = false, customer = false) {
  if (!page.content.length) return '<div class="panel">' + empty('A fresh start for your catalogue.',
    admin ? 'Create your first loan product with the terms and documents your bank requires.' : 'There are no loan products available yet. Please check back later.',
    admin ? '<button class="button primary" data-action="new-product">Create a loan product <span>＋</span></button>' : '') + '</div>';
  return '<div class="cards">' + page.content.map(product =>
    '<article class="product-card"><span class="product-icon" aria-hidden="true">↗</span><div class="code">' + escape(product.code) +
    '</div><h3>' + escape(product.name) + '</h3><div class="product-values"><div><strong>' + rate(product.annualInterestRate) +
    '%</strong><small>Annual fixed interest</small></div><div><strong>' + product.minTermMonths + '–' + product.maxTermMonths +
    '</strong><small>Months to repay</small></div></div><p class="small muted">' + escape(money(product.minAmount, product)) + ' – ' +
    escape(money(product.maxAmount, product)) + '</p><footer><small>' + product.requiredDocuments.length + ' required document types</small>' +
    (admin ? '<button class="button secondary" data-action="deactivate-product" data-id="' + product.id + '">Deactivate</button>' :
      customer ? '<button class="button primary" data-action="apply" data-id="' + product.id + '">Start application ↗</button>' : '') +
    '</footer></article>').join('') + '</div>' + pager(page);
}
export function modal(title, content) {
  return '<div class="modal-header"><h2>' + escape(title) + '</h2><button type="button" class="close-modal" data-action="close-modal" aria-label="Close dialog">×</button></div><div class="modal-content">' + content + '</div>';
}
export const errorSlot = '<p class="form-error" data-form-error role="alert" hidden></p>';
export const actions = (text = 'Save') => '<div class="form-actions"><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button class="button primary" type="submit">' + escape(text) + ' ↗</button></div>';
export const field = (name, text, type = 'text', attributes = '') => '<label>' + text + '<input name="' + name + '" type="' + type + '" required ' + attributes + '></label>';

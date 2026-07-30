import { FIELD_KEYS, FIELD_LABELS } from './generator.js';
import { escapeHtml, rowsToCsv, downloadFile } from './utils.js';

/** Clears every field's inline error list. */
export function clearFieldErrors() {
  for (const key of FIELD_KEYS) {
    const el = document.getElementById(`${key}-errors`);
    if (el) el.innerHTML = '';
    const input = document.getElementById(key);
    if (input) input.setAttribute('aria-invalid', 'false');
  }
}

/**
 * Renders a flat list of {field, message} errors into each field's own
 * error container, right below that field's textarea.
 */
export function renderFieldErrors(errors) {
  const byField = new Map();
  for (const err of errors) {
    if (!byField.has(err.field)) byField.set(err.field, []);
    byField.get(err.field).push(err.message);
  }
  for (const [field, messages] of byField) {
    const el = document.getElementById(`${field}-errors`);
    const input = document.getElementById(field);
    if (!el) continue;
    el.innerHTML = messages.map((m) => `<li>${escapeHtml(m)}</li>`).join('');
    if (input) input.setAttribute('aria-invalid', 'true');
  }
}

/** Aggregates per-row rule errors into field-level summaries, prefixed with the row number. */
export function renderRowErrorsIntoFields(results) {
  const errors = [];
  for (const result of results) {
    for (const err of result.errors) {
      errors.push({ field: err.field, message: `Row ${result.index + 1}: ${err.message}` });
    }
  }
  renderFieldErrors(errors);
}

function statusBadge(result) {
  if (result.errors.length > 0) return '<span class="badge badge-error">Error</span>';
  if (result.isDuplicate) return '<span class="badge badge-warn">Duplicate</span>';
  return '<span class="badge badge-valid">Valid</span>';
}

export function renderResultsTable(container, results) {
  if (results.length === 0) {
    container.innerHTML = '<p>No rows generated.</p>';
    return;
  }

  const rowsHtml = results
    .map((result) => {
      const { row } = result;
      const detail =
        result.errors.length > 0
          ? `<ul class="row-error-list">${result.errors.map((e) => `<li>${escapeHtml(FIELD_LABELS[e.field] || e.field)}: ${escapeHtml(e.message)}</li>`).join('')}</ul>`
          : result.isDuplicate
            ? `<p class="row-duplicate-note">${escapeHtml(result.duplicateReason)}</p>`
            : '';
      const utmCell = result.utm
        ? `<code class="utm-output">${escapeHtml(result.utm)}</code>${
            result.errors.length === 0
              ? `<button type="button" class="btn btn-secondary btn-small copy-single" data-utm="${escapeHtml(result.utm)}">Copy</button>`
              : ''
          }`
        : '<span class="muted">—</span>';

      return `<tr>
        <th scope="row">${result.index + 1}</th>
        <td>${statusBadge(result)}${detail}</td>
        <td>${escapeHtml(row.campaign)}</td>
        <td>${escapeHtml(row.gaMedium)}</td>
        <td>${escapeHtml(row.campaignTerm)}</td>
        <td>${escapeHtml(row.source)}</td>
        <td>${utmCell}</td>
      </tr>`;
    })
    .join('');

  container.innerHTML = `<table class="results-table">
    <caption class="visually-hidden">Generated UTM results, one row per input line</caption>
    <thead>
      <tr>
        <th scope="col">Row</th>
        <th scope="col">Status</th>
        <th scope="col">Campaign</th>
        <th scope="col">GA4 Medium</th>
        <th scope="col">Campaign Term</th>
        <th scope="col">Source</th>
        <th scope="col">Generated UTM</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>`;

  container.querySelectorAll('.copy-single').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(btn.dataset.utm);
      btn.textContent = 'Copied!';
      setTimeout(() => (btn.textContent = 'Copy'), 1500);
    });
  });
}

export function validUtmsFrom(results) {
  return results.filter((r) => r.errors.length === 0 && r.utm).map((r) => r.utm);
}

export async function copyAllValid(results) {
  const utms = validUtmsFrom(results);
  await navigator.clipboard.writeText(utms.join('\n'));
  return utms.length;
}

export function exportResultsCsv(results, batch) {
  const headers = ['Row', 'Status', 'Set Up By', 'Date', 'Paid/Organic', 'Page URL', 'Campaign', 'GA4 Medium', 'Campaign Term', 'Source', 'Campaign Content', 'Generated UTM', 'Errors'];
  const rows = results.map((r) => [
    r.index + 1,
    r.errors.length > 0 ? 'Error' : r.isDuplicate ? 'Duplicate' : 'Valid',
    batch.setUpBy,
    batch.date,
    batch.paidOrganic,
    r.row.pageUrl,
    r.row.campaign,
    r.row.gaMedium,
    r.row.campaignTerm,
    r.row.source,
    r.row.campaignContent,
    r.utm || '',
    r.errors.map((e) => e.message).join(' | '),
  ]);
  downloadFile(`utm-batch-${batch.date || 'export'}.csv`, rowsToCsv(headers, rows));
}

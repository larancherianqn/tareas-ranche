<%- include('partials/head') %>

<div class="page-head">
  <div>
    <p class="eyebrow"><a class="back-link" href="/buzon">← Volver al buzón</a></p>
    <h1><%= announcement.title %></h1>
  </div>
  <% if (isAdmin) { %>
    <form method="POST" action="/avisos/<%= announcement.id %>?_method=DELETE" class="inline"
          onsubmit="return confirm('¿Eliminar este aviso?');">
      <button type="submit" class="btn-danger btn-sm">Eliminar</button>
    </form>
  <% } %>
</div>

<div class="card">
  <p style="margin:0 0 12px;">
    <span class="kind-tag"><%= h.announcementKindLabel(announcement.kind) %></span>
    <% if (announcement.kind === 'dia_no_laborable' && announcement.ref_date) { %>
      <span class="muted"> · <%= h.formatDate(announcement.ref_date) %></span>
    <% } %>
  </p>
  <% if (announcement.body) { %>
    <p class="desc"><%= announcement.body %></p>
  <% } %>
  <p class="muted" style="font-size:13px; margin-top:16px;">
    Publicado por <%= announcement.creator_name || '—' %> el <%= h.formatDateTime(announcement.created_at) %>
  </p>
</div>

<% if (files.length > 0) { %>
  <div class="card">
    <h2>Adjuntos</h2>
    <ul class="files">
      <% files.forEach(function (f) { %>
        <li>
          <a href="/attachments/<%= f.id %>" target="_blank" rel="noopener">📎 <%= f.filename %></a>
          <span class="muted"><%= h.fileSize(f.size_bytes) %></span>
        </li>
      <% }) %>
    </ul>
  </div>
<% } %>

<%- include('partials/foot') %>

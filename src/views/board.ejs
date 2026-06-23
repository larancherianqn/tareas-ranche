<%- include('partials/head') %>

<div class="page-head">
  <div>
    <p class="eyebrow">Comunicación del equipo</p>
    <h1>Buzón</h1>
  </div>
</div>

<% if (isAdmin && !googleConnected) { %>
  <div class="flash flash-error" style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;">
    <span>Conectá tu Google para poder guardar los archivos adjuntos en tu Drive.</span>
    <a class="btn btn-sm" href="/admin/calendar/connect">Conectar Google</a>
  </div>
<% } %>

<div class="board">
  <section>
    <div class="board-head">
      <h2>Avisos</h2>
      <% if (isAdmin) { %><a class="btn btn-sm" href="/avisos/new">+ Nuevo aviso</a><% } %>
    </div>
    <% if (announcements.length === 0) { %>
      <div class="empty"><p>No hay avisos por ahora.</p></div>
    <% } else { %>
      <div class="board-list">
        <% announcements.forEach(function (a) { %>
          <a class="board-row" href="/avisos/<%= a.id %>">
            <div class="body">
              <span class="kind-tag"><%= h.announcementKindLabel(a.kind) %></span>
              <p class="b-title"><%= a.title %></p>
              <div class="b-meta">
                <span><%= h.formatDate(a.created_at) %></span>
                <% if (a.kind === 'dia_no_laborable' && a.ref_date) { %><span>· <%= h.formatDate(a.ref_date) %></span><% } %>
                <% if (a.files > 0) { %><span>· 📎 <%= a.files %></span><% } %>
              </div>
            </div>
          </a>
        <% }) %>
      </div>
    <% } %>
  </section>

  <section>
    <div class="board-head">
      <h2>Solicitudes</h2>
      <a class="btn btn-sm" href="/solicitudes/new">+ Nueva solicitud</a>
    </div>
    <% if (requests.length === 0) { %>
      <div class="empty"><p><%= isAdmin ? 'No hay solicitudes.' : 'Todavía no enviaste ninguna solicitud.' %></p></div>
    <% } else { %>
      <div class="board-list">
        <% requests.forEach(function (r) { %>
          <a class="board-row" href="/solicitudes/<%= r.id %>">
            <div class="body">
              <p class="b-title"><%= h.requestKindLabel(r.kind) %></p>
              <div class="b-meta">
                <% if (isAdmin) { %><span><%= r.requester_name || '—' %> · </span><% } %>
                <span><%= h.formatDate(r.created_at) %></span>
                <% if (r.files > 0) { %><span>· 📎 <%= r.files %></span><% } %>
              </div>
            </div>
            <span class="pill" data-r="<%= r.status %>"><%= h.requestStatusLabel(r.status) %></span>
          </a>
        <% }) %>
      </div>
    <% } %>
  </section>
</div>

<%- include('partials/foot') %>

<%- include('partials/head') %>

<div class="page-head">
  <div>
    <p class="eyebrow"><%= isAdmin ? 'Todas las tareas' : 'Mis tareas' %></p>
    <h1>Tareas</h1>
  </div>
  <% if (isAdmin) { %>
    <a class="btn" href="/tasks/new">+ Nueva tarea</a>
  <% } %>
</div>

<div class="counters">
  <a class="counter <%= activeFilter === 'pendiente' ? 'is-active' : '' %>" data-s="pendiente" href="/?estado=pendiente<%= activeCategory ? '&categoria=' + activeCategory : '' %><%= activeSector ? '&sector=' + activeSector : '' %>">
    <span class="num"><%= countByStatus.pendiente %></span>
    <span class="lbl">Pendiente</span>
  </a>
  <a class="counter <%= activeFilter === 'en_curso' ? 'is-active' : '' %>" data-s="en_curso" href="/?estado=en_curso<%= activeCategory ? '&categoria=' + activeCategory : '' %><%= activeSector ? '&sector=' + activeSector : '' %>">
    <span class="num"><%= countByStatus.en_curso %></span>
    <span class="lbl">En curso</span>
  </a>
  <a class="counter <%= activeFilter === 'hecha' ? 'is-active' : '' %>" data-s="hecha" href="/?estado=hecha<%= activeCategory ? '&categoria=' + activeCategory : '' %><%= activeSector ? '&sector=' + activeSector : '' %>">
    <span class="num"><%= countByStatus.hecha %></span>
    <span class="lbl">Hecha</span>
  </a>
</div>

<div class="cat-filters">
  <a class="cat-chip <%= !activeCategory ? 'is-active' : '' %>" href="/<%= (activeFilter || activeSector) ? '?' + [activeFilter ? ('estado=' + activeFilter) : null, activeSector ? ('sector=' + activeSector) : null].filter(Boolean).join('&') : '' %>">Todos los tipos</a>
  <% h.CATEGORIES.forEach(function (c) { %>
    <a class="cat-chip <%= activeCategory === c.value ? 'is-active' : '' %>"
       href="/?categoria=<%= c.value %><%= activeFilter ? '&estado=' + activeFilter : '' %><%= activeSector ? '&sector=' + activeSector : '' %>"><%= c.label %></a>
  <% }) %>
</div>

<% if (isAdmin && sectors.length > 0) { %>
  <form method="get" action="/" class="sector-filter">
    <% if (activeFilter) { %><input type="hidden" name="estado" value="<%= activeFilter %>" /><% } %>
    <% if (activeCategory) { %><input type="hidden" name="categoria" value="<%= activeCategory %>" /><% } %>
    <label for="sectorsel">Sector:</label>
    <select id="sectorsel" name="sector" onchange="this.form.submit()">
      <option value="">Todos</option>
      <% sectors.forEach(function (s) { %>
        <option value="<%= s.id %>" <%= activeSector === s.id ? 'selected' : '' %>><%= s.name %></option>
      <% }) %>
    </select>
  </form>
<% } %>

<% if (activeFilter || activeCategory || activeSector) { %>
  <p style="margin:-4px 0 16px;"><a class="back-link" href="/">← Ver todas</a></p>
<% } %>

<% if (tasks.length === 0) { %>
  <div class="empty">
    <h2><%= activeFilter ? 'No hay tareas con ese estado' : 'Todavía no hay tareas' %></h2>
    <p>
      <% if (isAdmin) { %>
        Creá la primera con el botón “Nueva tarea”.
      <% } else { %>
        Cuando el administrador te asigne algo, va a aparecer acá.
      <% } %>
    </p>
  </div>
<% } else { %>
  <div class="task-list">
    <% tasks.forEach(function (t) { %>
      <% var d = h.daysUntil(t.due_date); %>
      <a class="task-row" data-s="<%= t.status %>" href="/tasks/<%= t.id %>">
        <div class="body">
          <p class="t-title"><%= t.title %></p>
          <div class="task-meta">
            <% if (t.category) { %>
              <span class="cat-tag"><%= h.categoryLabel(t.category) %></span>
            <% } %>
            <% if (isAdmin && t.assignee_name) { %>
              <span><%= t.assignee_name %></span>
            <% } %>
            <% if (t.sector_name) { %>
              <span class="sec-tag"><%= t.sector_name %></span>
            <% } %>
            <% if (t.photos > 0) { %>
              <span title="Tiene foto de referencia">📷</span>
            <% } %>
            <% if (isAdmin && !t.assignee_name && !t.sector_name) { %>
              <span class="muted">Sin asignar</span>
            <% } %>
            <% if (t.due_date) { %>
              <span class="due <%= (d < 0 && t.status !== 'hecha') ? 'is-late' : (d !== null && d <= 2 && t.status !== 'hecha') ? 'is-soon' : '' %>">
                Vence <%= h.formatDate(t.due_date) %><%
                  if (t.status !== 'hecha' && d < 0) { %> · vencida<% }
                  else if (t.status !== 'hecha' && d === 0) { %> · hoy<% }
                %>
              </span>
            <% } else { %>
              <span class="muted">Sin fecha</span>
            <% } %>
          </div>
        </div>
        <div class="side">
          <span class="pill" data-s="<%= t.status %>"><%= h.statusLabel(t.status) %></span>
        </div>
      </a>
    <% }) %>
  </div>
<% } %>

<%- include('partials/foot') %>

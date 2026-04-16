// ============================
// CONFIGURAÇÃO DA API
// ============================

const API_URL = window.location.origin + '/api';
let authToken = localStorage.getItem('auth_token') || null;

function getHeaders(withAuth = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (withAuth && authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    return headers;
}

// ============================
// NAVEGAÇÃO
// ============================

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.add('active');

        // Re-trigger animations
        page.querySelectorAll('.animate-in').forEach(el => {
            el.style.animation = 'none';
            el.offsetHeight; // Force reflow
            el.style.animation = '';
        });
    }

    if (pageId === 'page-painel') {
        loadMessages();
    }
}

// ============================
// FORMULÁRIO DE CONTATO
// ============================

function formatPhone(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);

    if (value.length > 6) {
        value = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
    } else if (value.length > 2) {
        value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
    } else if (value.length > 0) {
        value = `(${value}`;
    }

    input.value = value;
}

async function handleSubmit(e) {
    e.preventDefault();

    const nome = document.getElementById('nome').value.trim();
    const telefone = document.getElementById('telefone').value.trim();
    const recado = document.getElementById('recado').value.trim();

    if (!nome || !telefone || !recado) return;

    const btn = document.getElementById('btn-enviar');
    const btnText = btn.querySelector('.btn-text');
    const originalText = btnText.textContent;

    // Loading state
    btn.disabled = true;
    btnText.textContent = 'Enviando...';
    btn.style.opacity = '0.7';

    try {
        const response = await fetch(`${API_URL}/messages`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ nome, telefone, recado })
        });

        const data = await response.json();

        if (response.ok) {
            // Mostrar mensagem de sucesso
            document.getElementById('contact-form').classList.add('hidden');
            document.getElementById('success-message').classList.remove('hidden');

            // Re-trigger animation
            const successEl = document.getElementById('success-message');
            successEl.style.animation = 'none';
            successEl.offsetHeight;
            successEl.style.animation = 'animate-in 0.6s cubic-bezier(0.4, 0, 0.2, 1) both';
        } else {
            alert(data.error || 'Erro ao enviar o recado.');
        }
    } catch (err) {
        console.error('Erro:', err);
        alert('Erro de conexão. Tente novamente.');
    } finally {
        btn.disabled = false;
        btnText.textContent = originalText;
        btn.style.opacity = '1';
    }
}

function resetForm() {
    document.getElementById('contact-form').reset();
    document.getElementById('contact-form').classList.remove('hidden');
    document.getElementById('success-message').classList.add('hidden');
}

// ============================
// LOGIN
// ============================

async function handleLogin(e) {
    e.preventDefault();

    const user = document.getElementById('login-user').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    const btn = document.getElementById('btn-login');
    const btnText = btn.querySelector('.btn-text');
    btn.disabled = true;
    btnText.textContent = 'Entrando...';
    btn.style.opacity = '0.7';

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ user, password })
        });

        const data = await response.json();

        if (response.ok) {
            authToken = data.token;
            localStorage.setItem('auth_token', authToken);
            errorEl.classList.add('hidden');
            document.getElementById('login-form').reset();
            showPage('page-painel');
        } else {
            errorEl.classList.remove('hidden');
            errorEl.style.animation = 'none';
            errorEl.offsetHeight;
            errorEl.style.animation = 'shake 0.5s ease-in-out';
        }
    } catch (err) {
        console.error('Erro:', err);
        alert('Erro de conexão. Tente novamente.');
    } finally {
        btn.disabled = false;
        btnText.textContent = 'Entrar';
        btn.style.opacity = '1';
    }
}

function handleLogout() {
    authToken = null;
    localStorage.removeItem('auth_token');
    showPage('page-contato');
}

// ============================
// PAINEL ADMIN
// ============================

async function loadMessages() {
    const listEl = document.getElementById('messages-list');
    const emptyEl = document.getElementById('empty-state');
    const statTotal = document.getElementById('stat-total');
    const statToday = document.getElementById('stat-today');

    // Loading state
    listEl.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
            Carregando recados...
        </div>
    `;
    emptyEl.classList.add('hidden');

    try {
        const response = await fetch(`${API_URL}/messages`, {
            headers: getHeaders(true)
        });

        if (response.status === 401) {
            // Token inválido, redirecionar para login
            authToken = null;
            localStorage.removeItem('auth_token');
            showPage('page-login');
            return;
        }

        const data = await response.json();

        statTotal.textContent = data.stats.total;
        statToday.textContent = data.stats.today;

        if (data.messages.length === 0) {
            listEl.innerHTML = '';
            emptyEl.classList.remove('hidden');
            return;
        }

        emptyEl.classList.add('hidden');
        renderMessagesList(data.messages);
    } catch (err) {
        console.error('Erro:', err);
        listEl.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--danger);">
                Erro ao carregar recados. Tente novamente.
            </div>
        `;
    }
}

function renderMessagesList(messages) {
    const listEl = document.getElementById('messages-list');

    listEl.innerHTML = messages.map((msg, i) => {
        const initials = msg.nome.split(' ').map(n => n[0]).join('').slice(0, 2);
        const date = new Date(msg.data);
        const formattedDate = date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const unreadClass = msg.lido ? '' : 'unread';

        return `
            <div class="message-item ${unreadClass}" style="animation-delay: ${i * 0.05}s" data-id="${msg.id}" onclick="markAsRead(${msg.id}, this)">
                <div class="message-avatar">${escapeHtml(initials)}</div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-name">
                            ${!msg.lido ? '<span class="unread-dot"></span>' : ''}
                            ${escapeHtml(msg.nome)}
                        </span>
                        <div class="message-actions">
                            <span class="message-date">${formattedDate}</span>
                            <button class="btn-delete-single" onclick="event.stopPropagation(); deleteMessage(${msg.id})" title="Apagar recado">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="message-phone">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                        ${escapeHtml(msg.telefone)}
                    </div>
                    <div class="message-text">${escapeHtml(msg.recado)}</div>
                </div>
            </div>
        `;
    }).join('');
}

async function markAsRead(id, element) {
    if (element && element.classList.contains('unread')) {
        try {
            await fetch(`${API_URL}/messages/${id}/read`, {
                method: 'PATCH',
                headers: getHeaders(true)
            });
            element.classList.remove('unread');
            const dot = element.querySelector('.unread-dot');
            if (dot) dot.remove();
        } catch (err) {
            console.error('Erro ao marcar como lido:', err);
        }
    }
}

async function deleteMessage(id) {
    if (!confirm('Apagar este recado?')) return;

    try {
        const response = await fetch(`${API_URL}/messages/${id}`, {
            method: 'DELETE',
            headers: getHeaders(true)
        });

        if (response.ok) {
            loadMessages();
        } else {
            alert('Erro ao apagar recado.');
        }
    } catch (err) {
        console.error('Erro:', err);
        alert('Erro de conexão.');
    }
}

async function clearMessages() {
    if (!confirm('Tem certeza que deseja apagar TODOS os recados?')) return;

    try {
        const response = await fetch(`${API_URL}/messages`, {
            method: 'DELETE',
            headers: getHeaders(true)
        });

        if (response.ok) {
            loadMessages();
        } else {
            alert('Erro ao apagar recados.');
        }
    } catch (err) {
        console.error('Erro:', err);
        alert('Erro de conexão.');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================
// INICIALIZAÇÃO
// ============================

document.addEventListener('DOMContentLoaded', () => {
    // Máscara de telefone
    const phoneInput = document.getElementById('telefone');
    if (phoneInput) {
        phoneInput.addEventListener('input', () => formatPhone(phoneInput));
    }

    // Rota secreta: acessar /admin leva direto ao login
    const path = window.location.pathname;
    if (path === '/admin' || path === '/admin/') {
        // Se já tem token salvo, ir direto ao painel
        if (authToken) {
            showPage('page-painel');
        } else {
            showPage('page-login');
        }
    } else {
        showPage('page-contato');
    }
});

const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');

// ============================
// CONFIGURAÇÃO
// ============================

const app = express();
const PORT = 3000;

// Credenciais de acesso ao painel (altere aqui)
const ADMIN_USER = 'admin';
const ADMIN_PASSWORD = 'admin123';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================
// BANCO DE DADOS (SQLite)
// ============================

const db = new Database(path.join(__dirname, 'contato.db'));

// Ativar WAL para melhor performance
db.pragma('journal_mode = WAL');

// Criar tabela se não existir
db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        telefone TEXT NOT NULL,
        recado TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        lido INTEGER NOT NULL DEFAULT 0
    )
`);

console.log('✅ Banco de dados SQLite conectado e tabela criada.');

// ============================
// ROTAS DA API
// ============================

// POST /api/messages - Enviar novo recado (público)
app.post('/api/messages', (req, res) => {
    const { nome, telefone, recado } = req.body;

    if (!nome || !telefone || !recado) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    if (nome.length > 200 || telefone.length > 30 || recado.length > 2000) {
        return res.status(400).json({ error: 'Campos excedem o tamanho máximo.' });
    }

    try {
        const stmt = db.prepare('INSERT INTO messages (nome, telefone, recado) VALUES (?, ?, ?)');
        const result = stmt.run(nome.trim(), telefone.trim(), recado.trim());

        res.status(201).json({
            success: true,
            message: 'Recado enviado com sucesso!',
            id: result.lastInsertRowid
        });
    } catch (err) {
        console.error('Erro ao salvar mensagem:', err);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// POST /api/login - Autenticação simples
app.post('/api/login', (req, res) => {
    const { user, password } = req.body;

    if (user === ADMIN_USER && password === ADMIN_PASSWORD) {
        // Em produção, usar JWT ou sessões. Aqui usamos token simples.
        const token = Buffer.from(`${ADMIN_USER}:${Date.now()}`).toString('base64');
        res.json({ success: true, token });
    } else {
        res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }
});

// Middleware de autenticação simples
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const [user] = decoded.split(':');

        if (user !== ADMIN_USER) {
            return res.status(401).json({ error: 'Token inválido.' });
        }

        next();
    } catch {
        return res.status(401).json({ error: 'Token inválido.' });
    }
}

// GET /api/messages - Listar recados (protegido)
app.get('/api/messages', authMiddleware, (req, res) => {
    try {
        const messages = db.prepare('SELECT * FROM messages ORDER BY id DESC').all();

        // Contar recados de hoje
        const today = new Date().toISOString().split('T')[0];
        const todayCount = db.prepare(
            "SELECT COUNT(*) as count FROM messages WHERE date(data) = ?"
        ).get(today);

        res.json({
            messages,
            stats: {
                total: messages.length,
                today: todayCount.count
            }
        });
    } catch (err) {
        console.error('Erro ao buscar mensagens:', err);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// PATCH /api/messages/:id/read - Marcar como lido (protegido)
app.patch('/api/messages/:id/read', authMiddleware, (req, res) => {
    try {
        const stmt = db.prepare('UPDATE messages SET lido = 1 WHERE id = ?');
        stmt.run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao atualizar mensagem:', err);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// DELETE /api/messages - Apagar todos os recados (protegido)
app.delete('/api/messages', authMiddleware, (req, res) => {
    try {
        db.prepare('DELETE FROM messages').run();
        res.json({ success: true, message: 'Todos os recados foram apagados.' });
    } catch (err) {
        console.error('Erro ao apagar mensagens:', err);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// DELETE /api/messages/:id - Apagar um recado específico (protegido)
app.delete('/api/messages/:id', authMiddleware, (req, res) => {
    try {
        const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
        const result = stmt.run(req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Recado não encontrado.' });
        }

        res.json({ success: true, message: 'Recado apagado.' });
    } catch (err) {
        console.error('Erro ao apagar mensagem:', err);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// Fallback - servir o index.html para qualquer rota não-API
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        next();
    }
});

// ============================
// INICIAR SERVIDOR
// ============================

app.listen(PORT, () => {
    console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📋 Painel admin: http://localhost:${PORT} → clique em "Painel"`);
    console.log(`🔑 Credenciais: ${ADMIN_USER} / ${ADMIN_PASSWORD}\n`);
});

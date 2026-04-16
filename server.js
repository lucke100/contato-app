require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

// ============================
// CONFIGURAÇÃO
// ============================

const app = express();
const PORT = process.env.PORT || 3000;

// Credenciais de acesso ao painel (podem vir de variáveis de ambiente)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================
// BANCO DE DADOS (PostgreSQL)
// ============================

// A Vercel/Neon/Supabase vai injetar a variável automaticamente
// A Vercel Postgres usa especificamente POSTGRES_URL
const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl && dbUrl.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Criar tabela se não existir (PostgreSQL)
async function initDb() {
    try {
        if (!dbUrl) {
            console.log('⚠️ DATABASE_URL ou POSTGRES_URL não definida. O banco de dados não foi inicializado.');
            return;
        }
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                telefone TEXT NOT NULL,
                recado TEXT NOT NULL,
                data TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                lido INTEGER NOT NULL DEFAULT 0
            )
        `);
        console.log('✅ Banco de dados PostgreSQL conectado e tabela criada.');
    } catch (err) {
        console.error('❌ Erro ao inicializar o PostgreSQL:', err);
    }
}
initDb();

// ============================
// ROTAS DA API
// ============================

// POST /api/messages - Enviar novo recado (público)
app.post('/api/messages', async (req, res) => {
    const { nome, telefone, recado } = req.body;

    if (!nome || !telefone || !recado) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    if (nome.length > 200 || telefone.length > 30 || recado.length > 2000) {
        return res.status(400).json({ error: 'Campos excedem o tamanho máximo.' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO messages (nome, telefone, recado) VALUES ($1, $2, $3) RETURNING id',
            [nome.trim(), telefone.trim(), recado.trim()]
        );

        res.status(201).json({
            success: true,
            message: 'Recado enviado com sucesso!',
            id: result.rows[0].id
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
app.get('/api/messages', authMiddleware, async (req, res) => {
    try {
        const messagesResult = await pool.query('SELECT * FROM messages ORDER BY id DESC');
        
        // Contar recados de hoje (PostgreSQL)
        const todayCountResult = await pool.query(
            "SELECT COUNT(*) as count FROM messages WHERE DATE(data) = CURRENT_DATE"
        );

        res.json({
            messages: messagesResult.rows,
            stats: {
                total: messagesResult.rows.length,
                today: parseInt(todayCountResult.rows[0].count)
            }
        });
    } catch (err) {
        console.error('Erro ao buscar mensagens:', err);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// PATCH /api/messages/:id/read - Marcar como lido (protegido)
app.patch('/api/messages/:id/read', authMiddleware, async (req, res) => {
    try {
        await pool.query('UPDATE messages SET lido = 1 WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao atualizar mensagem:', err);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// DELETE /api/messages - Apagar todos os recados (protegido)
app.delete('/api/messages', authMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM messages');
        res.json({ success: true, message: 'Todos os recados foram apagados.' });
    } catch (err) {
        console.error('Erro ao apagar mensagens:', err);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// DELETE /api/messages/:id - Apagar um recado específico (protegido)
app.delete('/api/messages/:id', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM messages WHERE id = $1', [req.params.id]);

        if (result.rowCount === 0) {
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
// INICIAR SERVIDOR / VERCEL EXPORT
// ============================

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
        console.log(`📋 Painel admin: http://localhost:${PORT}/admin`);
    });
}

// Exportar para Vercel Serverless
module.exports = app;

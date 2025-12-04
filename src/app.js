require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const passport = require('./config/passport');
const path = require('path');
const { getDatabase } = require('./config/database');

const app = express();

// --- 1. Configuraciones de Express ---
app.set('view engine', 'ejs');
// Las vistas están en la raíz, un nivel arriba de src
app.set('views', path.join(__dirname, '../views')); 
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- 2. Configuración de Sesión ---
app.use(session({
    store: new SQLiteStore({
        db: 'sessions.sqlite',
        dir: path.resolve(__dirname, '../../')
    }),
    secret: process.env.SESSION_SECRET || 'secret_dev_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 1 semana
}));

// --- 3. Inicializar Passport ---
app.use(passport.initialize());
app.use(passport.session());

// --- 4. Middleware Global ---
app.use((req, res, next) => {
    res.locals.user = req.user || null;
    next();
});

// Middleware de Protección
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) { return next(); }
    res.redirect('/');
};

// --- 5. Rutas Generales ---

app.get('/', (req, res) => {
    if (req.isAuthenticated()) { return res.redirect('/dashboard'); }
    res.render('pages/index', { title: 'Bienvenido - Poder Judicial' });
});

app.get('/dashboard', isAuthenticated, async (req, res) => {
    res.render('pages/dashboard', { title: 'Panel de Funcionarios', path: 'dashboard' });
});

app.get('/profile', isAuthenticated, (req, res) => {
    res.render('pages/profile', { title: 'Mi Perfil' });
});

app.get('/cv', isAuthenticated, (req, res) => {
    res.render('pages/cv', { title: 'Hoja de Vida Funcionaria' });
});

// --- 6. Rutas de Búsqueda ---

app.get('/search/person', isAuthenticated, async (req, res) => {
    const query = req.query.q;
    if (!query) return res.redirect('/dashboard');
    try {
        const db = await getDatabase();
        const persons = await db.all(`SELECT * FROM citizens WHERE rut LIKE ? OR nombre_completo LIKE ? LIMIT 20`, [`%${query}%`, `%${query}%`]);
        res.render('pages/results', { title: 'Resultados: Personas', type: 'person', results: persons, query });
    } catch (error) { console.error(error); res.status(500).send("Error interno"); }
});

app.get('/search/vehicle', isAuthenticated, async (req, res) => {
    const query = req.query.q;
    if (!query) return res.redirect('/dashboard');
    try {
        const db = await getDatabase();
        const vehicles = await db.all(`SELECT * FROM vehicles WHERE patente LIKE ? LIMIT 20`, [`%${query}%`]);
        res.render('pages/results', { title: 'Resultados: Vehículos', type: 'vehicle', results: vehicles, query });
    } catch (error) { console.error(error); res.status(500).send("Error interno"); }
});

app.get('/search/cause', isAuthenticated, async (req, res) => {
    const query = req.query.q;
    if (!query) return res.redirect('/dashboard');
    try {
        const db = await getDatabase();
        // Mostrar solo causas NO eliminadas (is_deleted = 0)
        const causes = await db.all(`SELECT * FROM causes WHERE (ruc LIKE ? OR rit LIKE ?) AND is_deleted = 0 LIMIT 20`, [`%${query}%`, `%${query}%`]);
        res.render('pages/results', { title: 'Resultados: Causas', type: 'cause', results: causes, query });
    } catch (error) { console.error(error); res.status(500).send("Error interno"); }
});

// --- 7. Rutas de Creación ---

app.get('/causes/create', isAuthenticated, (req, res) => {
    res.render('pages/create_cause', { title: 'Ingresar Nueva Causa' });
});

app.post('/causes/create', isAuthenticated, async (req, res) => {
    const { imputado_rut, rit, descripcion } = req.body;
    const fiscal_id = req.user.discord_id;
    const year = new Date().getFullYear();
    const random = Math.floor(10000 + Math.random() * 90000);
    const ruc = `${year}-${random}`;

    try {
        const db = await getDatabase();
        const citizen = await db.get('SELECT rut FROM citizens WHERE rut = ?', [imputado_rut]);
        if (!citizen) {
             await db.run(`INSERT INTO citizens (rut, nombre_completo, antecedentes) VALUES (?, 'Ciudadano Desconocido', 'Sin antecedentes previos')`, [imputado_rut]);
        }
        await db.run(`
            INSERT INTO causes (ruc, rit, descripcion, imputado_rut, fiscal_asignado_id, estado)
            VALUES (?, ?, ?, ?, ?, 'ABIERTA')
        `, [ruc, rit, descripcion, imputado_rut, fiscal_id]);
        res.redirect('/dashboard?msg=created');
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send("Error al crear causa.");
    }
});

// --- 8. Rutas de GESTIÓN y PAPELERA (NUEVO) ---

// Ver Papelera
app.get('/admin/trash', isAuthenticated, async (req, res) => {
    try {
        const db = await getDatabase();
        // Buscar solo las que tienen is_deleted = 1
        const deletedCauses = await db.all(`
            SELECT * FROM causes WHERE is_deleted = 1 ORDER BY updated_at DESC
        `);
        res.render('pages/trash', { 
            title: 'Papelera de Reciclaje', 
            deletedCauses 
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error al cargar la papelera");
    }
});

// Archivar (Soft Delete)
app.post('/causes/delete', isAuthenticated, async (req, res) => {
    const { cause_id } = req.body;
    try {
        const db = await getDatabase();
        await db.run('UPDATE causes SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [cause_id]);
        // Volver a la página anterior o al dashboard
        res.redirect('back'); 
    } catch (error) {
        console.error(error);
        res.status(500).send("Error al archivar");
    }
});

// Restaurar
app.post('/causes/restore', isAuthenticated, async (req, res) => {
    const { cause_id } = req.body;
    try {
        const db = await getDatabase();
        await db.run('UPDATE causes SET is_deleted = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [cause_id]);
        res.redirect('/admin/trash');
    } catch (error) {
        console.error(error);
        res.status(500).send("Error al restaurar");
    }
});

// Destruir (Hard Delete)
app.post('/causes/destroy', isAuthenticated, async (req, res) => {
    const { cause_id } = req.body;
    try {
        const db = await getDatabase();
        await db.run('DELETE FROM causes WHERE id = ?', [cause_id]);
        res.redirect('/admin/trash');
    } catch (error) {
        console.error(error);
        res.status(500).send("Error al eliminar permanentemente");
    }
});


// --- 9. Auth Discord ---
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));
app.get('/logout', (req, res, next) => { req.logout(e => { if(e) return next(e); res.redirect('/'); }); });

// --- Start ---
const PORT = process.env.PORT || 3000;
getDatabase().then(() => {
    app.listen(PORT, () => console.log(`\n⚖️  Portal Judicial listo en: http://localhost:${PORT}`));
}).catch(err => console.error(err));
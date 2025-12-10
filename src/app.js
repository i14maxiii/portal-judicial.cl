require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('./config/passport');
const path = require('path');
const connectDB = require('./config/database');

// Importar Modelos
const User = require('./models/user');
const Citizen = require('./models/citizen');
const Vehicle = require('./models/vehicle');
const Cause = require('./models/cause');

const app = express();

// --- 1. Conexión a Base de Datos ---
connectDB();

// --- 2. Configuraciones de Express ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views')); 
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- 3. Configuración de Sesión (MongoDB) ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret_dev_key_mongo',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions',
        ttl: 14 * 24 * 60 * 60 // 14 días
    }),
    cookie: { maxAge: 14 * 24 * 60 * 60 * 1000 }
}));

// --- 4. Inicializar Passport ---
app.use(passport.initialize());
app.use(passport.session());

// --- 5. Middleware Global ---
app.use((req, res, next) => {
    res.locals.user = req.user || null;
    next();
});

// Middleware de Autenticación
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) { return next(); }
    res.redirect('/');
};

// Middleware de Roles (Permisivo para pruebas)
const hasRole = (rolesAllowed) => {
    return (req, res, next) => {
        if (!req.isAuthenticated()) return res.redirect('/');
        // Modo permisivo activado
        return next();
    }
};

// --- 6. Rutas Generales ---

app.get('/', (req, res) => {
    res.render('pages/index', { title: 'Bienvenido - Poder Judicial' });
});

app.get('/profile', isAuthenticated, (req, res) => {
    res.render('pages/profile', { title: 'Mi Perfil' });
});

app.get('/historial', isAuthenticated, (req, res) => {
    res.render('pages/historial', { title: 'Hoja de Vida' });
});

app.get('/certificate', isAuthenticated, (req, res) => {
    // Aquí podrías buscar antecedentes reales en mongo si existieran
    const antecedentes = []; 
    res.render('pages/certificate', { title: 'Certificado de Antecedentes', antecedentes });
});

// --- 7. Rutas de Paneles ---

app.get('/dashboard', hasRole(['funcionario', 'staff']), (req, res) => {
    res.render('pages/dashboard', { title: 'Panel de Funcionarios', path: 'dashboard' });
});

app.get('/administracion', hasRole(['staff']), (req, res) => {
    res.render('pages/admin_dashboard', { title: 'Panel de Staff' });
});

// --- 8. Rutas de Búsqueda (MongoDB) ---

app.get('/search/person', hasRole(['funcionario', 'staff']), async (req, res) => {
    const query = req.query.q;
    if (!query) return res.redirect('/dashboard');
    try {
        // Búsqueda por RUT o Nombre (Regex insensible a mayúsculas)
        const regex = new RegExp(query, 'i');
        const persons = await Citizen.find({
            $or: [{ rut: regex }, { nombre_completo: regex }]
        }).limit(20);
        
        res.render('pages/results', { title: 'Resultados: Personas', type: 'person', results: persons, query });
    } catch (error) { console.error(error); res.status(500).send("Error interno"); }
});

app.get('/search/vehicle', hasRole(['funcionario', 'staff']), async (req, res) => {
    const query = req.query.q;
    if (!query) return res.redirect('/dashboard');
    try {
        const regex = new RegExp(query, 'i');
        const vehicles = await Vehicle.find({ patente: regex }).limit(20);
        res.render('pages/results', { title: 'Resultados: Vehículos', type: 'vehicle', results: vehicles, query });
    } catch (error) { console.error(error); res.status(500).send("Error interno"); }
});

app.get('/search/cause', hasRole(['funcionario', 'staff']), async (req, res) => {
    const query = req.query.q;
    if (!query) return res.redirect('/dashboard');
    try {
        const regex = new RegExp(query, 'i');
        // Buscar causas que NO estén eliminadas
        const causes = await Cause.find({
            $and: [
                { is_deleted: false },
                { $or: [{ ruc: regex }, { rit: regex }] }
            ]
        }).limit(20);
        
        res.render('pages/results', { title: 'Resultados: Causas', type: 'cause', results: causes, query });
    } catch (error) { console.error(error); res.status(500).send("Error interno"); }
});

// --- 9. Rutas de Creación y Gestión ---

app.get('/causes/create', hasRole(['funcionario', 'staff']), (req, res) => {
    res.render('pages/create_cause', { title: 'Ingresar Nueva Causa' });
});

app.post('/causes/create', hasRole(['funcionario', 'staff']), async (req, res) => {
    const { imputado_rut, rit, descripcion } = req.body;
    const fiscal_id = req.user.discord_id;
    const year = new Date().getFullYear();
    const random = Math.floor(10000 + Math.random() * 90000);
    const ruc = `${year}-${random}`;

    try {
        // Verificar si el ciudadano existe, si no, crearlo al vuelo
        let citizen = await Citizen.findOne({ rut: imputado_rut });
        if (!citizen) {
             citizen = await Citizen.create({
                rut: imputado_rut,
                nombre_completo: 'Ciudadano Desconocido',
                antecedentes: 'Sin antecedentes previos'
             });
        }

        await Cause.create({
            ruc,
            rit,
            descripcion,
            imputado_rut,
            fiscal_asignado_id: fiscal_id,
            estado: 'ABIERTA'
        });
        
        res.redirect('/dashboard?msg=created');
    } catch (error) {
        console.error('Error al crear causa:', error);
        res.status(500).send("Error al crear causa.");
    }
});

// --- 10. Papelera (Mongoose) ---

app.get('/admin/trash', hasRole(['funcionario', 'staff']), async (req, res) => {
    try {
        const deletedCauses = await Cause.find({ is_deleted: true }).sort({ updated_at: -1 });
        res.render('pages/trash', { title: 'Papelera de Reciclaje', deletedCauses });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error al cargar la papelera");
    }
});

app.post('/causes/delete', hasRole(['funcionario', 'staff']), async (req, res) => {
    try {
        await Cause.findByIdAndUpdate(req.body.cause_id, { is_deleted: true, updated_at: Date.now() });
        res.redirect('back');
    } catch (error) { console.error(error); res.status(500).send("Error al archivar"); }
});

app.post('/causes/restore', hasRole(['funcionario', 'staff']), async (req, res) => {
    try {
        await Cause.findByIdAndUpdate(req.body.cause_id, { is_deleted: false, updated_at: Date.now() });
        res.redirect('/admin/trash');
    } catch (error) { console.error(error); res.status(500).send("Error al restaurar"); }
});

app.post('/causes/destroy', hasRole(['admin', 'staff']), async (req, res) => {
    try {
        await Cause.findByIdAndDelete(req.body.cause_id);
        res.redirect('/admin/trash');
    } catch (error) { console.error(error); res.status(500).send("Error al eliminar permanentemente"); }
});

// --- Auth Discord ---
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/'));
app.get('/logout', (req, res, next) => { req.logout(e => { if(e) return next(e); res.redirect('/'); }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n⚖️  Portal Judicial (MongoDB) listo en: http://localhost:${PORT}`));
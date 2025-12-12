require('dotenv').config();
const mongoose = require('mongoose');
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

// --- 3. Configuración de Sesión ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret_key_prod',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions',
        ttl: 14 * 24 * 60 * 60 
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

const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) { return next(); }
    res.redirect('/');
};

const hasRole = (rolesAllowed) => {
    return (req, res, next) => {
        if (!req.isAuthenticated()) return res.redirect('/');
        // Verificación extra: si el usuario tiene rol, verificar si está permitido
        if (rolesAllowed.includes(req.user.role) || req.user.role === 'admin') {
            return next();
        }
        return res.status(403).send("No tienes permiso para ver esta página.");
    }
};

// --- 6. Rutas Generales ---

app.get('/', (req, res) => {
    res.render('pages/index', { title: 'Bienvenido - Poder Judicial' });
});

app.get('/profile', isAuthenticated, (req, res) => {
    res.render('pages/profile', { title: 'Mi Perfil' });
});

// --- RUTA HISTORIAL ---
app.get('/historial', isAuthenticated, async (req, res) => {
    try {
        if (!req.user.rut) {
            return res.render('pages/historial', { 
                title: 'Hoja de Vida', 
                records: [],
                stats: { cases: 0, fines: 0, background: false },
                error: 'Sin RUT vinculado'
            });
        }

        const causes = await Cause.find({ imputado_rut: req.user.rut }).sort({ created_at: -1 });

        const records = causes.map(c => ({
            id: c._id.toString(),
            type: 'case',
            title: `Causa RUC: ${c.ruc}`,
            description: c.descripcion,
            date: c.created_at.toLocaleDateString('es-CL'),
            status: c.estado === 'ABIERTA' ? 'open' : 'closed',
            badge: c.estado
        }));

        const stats = {
            cases: records.filter(r => r.status === 'open').length,
            fines: 0,
            background: false 
        };

        res.render('pages/historial', { title: 'Hoja de Vida', records, stats, error: null });

    } catch (error) {
        console.error('Error en historial:', error);
        res.status(500).send("Error interno.");
    }
});

// --- RUTA CERTIFICADO ---
app.get('/certificate', isAuthenticated, async (req, res) => {
    try {
        if (!req.user.rut) {
            return res.render('pages/certificate', { 
                title: 'Certificado', 
                antecedentes: [],
                user: req.user, 
                error: 'Usuario sin RUT vinculado.'
            });
        }

        const citizen = await Citizen.findOne({ rut: req.user.rut });
        const antecedentes = citizen && citizen.antecedentes ? citizen.antecedentes : [];

        res.render('pages/certificate', { 
            title: 'Certificado de Antecedentes', 
            antecedentes,
            user: req.user 
        });

    } catch (error) {
        console.error(error);
        res.status(500).send("Error generando certificado.");
    }
});

// --- 7. Rutas Admin/Staff ---

app.get('/dashboard', hasRole(['funcionario', 'staff']), (req, res) => {
    res.render('pages/dashboard', { title: 'Panel de Funcionarios', path: 'dashboard' });
});

app.get('/administracion', hasRole(['staff']), (req, res) => {
    res.render('pages/admin_dashboard', { title: 'Panel de Staff' });
});

// --- 8. Rutas de Búsqueda ---

app.get('/search/person', hasRole(['funcionario', 'staff']), async (req, res) => {
    const query = req.query.q;
    if (!query) return res.redirect('/dashboard');
    try {
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
        const vehicles = await Vehicle.find({ patente: new RegExp(query, 'i') }).limit(20);
        res.render('pages/results', { title: 'Resultados: Vehículos', type: 'vehicle', results: vehicles, query });
    } catch (error) { console.error(error); res.status(500).send("Error interno"); }
});

app.get('/search/cause', hasRole(['funcionario', 'staff']), async (req, res) => {
    const query = req.query.q;
    if (!query) return res.redirect('/dashboard');
    try {
        const regex = new RegExp(query, 'i');
        const causes = await Cause.find({
            $and: [
                { is_deleted: false },
                { $or: [{ ruc: regex }, { rit: regex }] }
            ]
        }).limit(20);
        res.render('pages/results', { title: 'Resultados: Causas', type: 'cause', results: causes, query });
    } catch (error) { console.error(error); res.status(500).send("Error interno"); }
});

// --- 9. Rutas Creación Causas ---

app.get('/causes/create', hasRole(['funcionario', 'staff']), (req, res) => {
    res.render('pages/create_cause', { title: 'Ingresar Nueva Causa' });
});

app.post('/causes/create', hasRole(['funcionario', 'staff']), async (req, res) => {
    const { imputado_rut, rit, descripcion } = req.body;
    const fiscal_id = req.user.discordId; 
    const year = new Date().getFullYear();
    const random = Math.floor(10000 + Math.random() * 90000);
    const ruc = `${year}-${random}`;

    try {
        let citizen = await Citizen.findOne({ rut: imputado_rut });
        if (!citizen) {
             citizen = await Citizen.create({
                rut: imputado_rut,
                nombre_completo: 'Ciudadano Desconocido',
                antecedentes: []
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

// --- 10. Papelera ---

app.get('/admin/trash', hasRole(['funcionario', 'staff']), async (req, res) => {
    try {
        const deletedCauses = await Cause.find({ is_deleted: true }).sort({ updated_at: -1 });
        res.render('pages/trash', { title: 'Papelera', deletedCauses });
    } catch (error) { console.error(error); res.status(500).send("Error"); }
});

app.post('/causes/delete', hasRole(['funcionario', 'staff']), async (req, res) => {
    try {
        await Cause.findByIdAndUpdate(req.body.cause_id, { is_deleted: true, updated_at: Date.now() });
        res.redirect('back');
    } catch (error) { console.error(error); res.status(500).send("Error"); }
});

app.post('/causes/restore', hasRole(['funcionario', 'staff']), async (req, res) => {
    try {
        await Cause.findByIdAndUpdate(req.body.cause_id, { is_deleted: false, updated_at: Date.now() });
        res.redirect('/admin/trash');
    } catch (error) { console.error(error); res.status(500).send("Error"); }
});

app.post('/causes/destroy', hasRole(['admin', 'staff']), async (req, res) => {
    try {
        await Cause.findByIdAndDelete(req.body.cause_id);
        res.redirect('/admin/trash');
    } catch (error) { console.error(error); res.status(500).send("Error"); }
});

// --- Auth Discord ---
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback', 
    passport.authenticate('discord', { failureRedirect: '/?error=auth_failed' }), 
    (req, res) => { res.redirect('/'); }
);

app.get('/logout', (req, res, next) => { req.logout(e => { if(e) return next(e); res.redirect('/'); }); });

// Ruta de Diagnóstico Avanzado (Conexión + Datos)
app.get('/debug/db-check', async (req, res) => {
    try {
        // 1. Obtener estado de la conexión
        const estados = {
            0: 'Desconectado',
            1: 'Conectado ✅',
            2: 'Conectando...',
            3: 'Desconectando...'
        };

        // 2. Obtener la URI y censurar la contraseña para seguridad visual
        const rawUri = process.env.MONGODB_URI || 'NO DEFINIDA EN .ENV';
        // Esto busca lo que está entre dos puntos y la arroba (la password) y lo oculta
        const maskedUri = rawUri.replace(/:([^:@]+)@/, ':****@');

        // 3. Obtener datos reales de la conexión activa de Mongoose
        const connectionDetails = {
            estado: estados[mongoose.connection.readyState],
            baseDeDatosNombre: mongoose.connection.name,
            hostServidor: mongoose.connection.host,
            puerto: mongoose.connection.port,
            uriConfigurada: maskedUri // Aquí verás si estás usando la URI correcta
        };

        // 4. Intentar traer los usuarios (tu prueba anterior)
        const users = await User.find({});

        res.json({
            diagnostico_conexion: connectionDetails,
            total_usuarios: users.length,
            muestra_datos: users
        });

    } catch (error) {
        res.status(500).json({
            error: 'Error crítico al intentar diagnosticar la DB',
            mensaje: error.message,
            stack: error.stack
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n⚖️  Portal Judicial listo (Mode: Production Data) en port ${PORT}`));
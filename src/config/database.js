const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

// Nombre del archivo de base de datos
const DB_PATH = path.resolve(__dirname, '../../judicial_rp.sqlite');

let dbInstance = null;

async function getDatabase() {
    if (dbInstance) {
        return dbInstance;
    }

    try {
        dbInstance = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        // Habilitar Foreign Keys para integridad referencial
        await dbInstance.run('PRAGMA foreign_keys = ON');
        
        console.log('✅ Conexión a SQLite establecida correctamente.');
        return dbInstance;
    } catch (error) {
        console.error('❌ Error al conectar con la base de datos:', error);
        process.exit(1);
    }
}

async function initializeTables() {
    const db = await getDatabase();

    // 1. Tabla de Usuarios (Discord Login)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            discord_id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            avatar TEXT,
            role TEXT DEFAULT 'funcionario', -- 'funcionario', 'admin', 'juez'
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 2. Tabla de Ciudadanos (Base de datos civil)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS citizens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rut TEXT UNIQUE NOT NULL, -- Formato: 12.345.678-9
            nombre_completo TEXT NOT NULL,
            fecha_nacimiento TEXT,
            antecedentes TEXT DEFAULT 'Sin antecedentes', -- Texto libre o JSON string
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    // Índice para búsquedas rápidas por RUT
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_citizens_rut ON citizens(rut);`);

    // 3. Tabla de Vehículos
    await db.exec(`
        CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patente TEXT UNIQUE NOT NULL, -- Formato: ABCD12
            modelo TEXT NOT NULL,
            color TEXT,
            owner_rut TEXT,
            FOREIGN KEY (owner_rut) REFERENCES citizens(rut) ON DELETE SET NULL
        );
    `);
    // Índice para búsquedas rápidas por Patente
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_vehicles_patente ON vehicles(patente);`);

    // 4. Tabla de Causas (Sistema Judicial)
    // is_deleted maneja el "Soft Delete" (Papelera)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS causes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ruc TEXT UNIQUE NOT NULL, -- Rol Único de Causa
            rit TEXT,                 -- Rol Interno del Tribunal (Opcional)
            descripcion TEXT NOT NULL,
            estado TEXT DEFAULT 'ABIERTA', -- 'ABIERTA', 'CERRADA', 'ARCHIVADA'
            imputado_rut TEXT,
            fiscal_asignado_id TEXT, -- Discord ID del usuario que creó/lleva la causa
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_deleted BOOLEAN DEFAULT 0, 
            FOREIGN KEY (imputado_rut) REFERENCES citizens(rut),
            FOREIGN KEY (fiscal_asignado_id) REFERENCES users(discord_id)
        );
    `);
    
    console.log('✅ Tablas verificadas/creadas correctamente.');
    await seedDatabase(db);
}

// Función para poblar datos de prueba si está vacío
async function seedDatabase(db) {
    const citizenCount = await db.get('SELECT count(*) as count FROM citizens');
    
    if (citizenCount.count === 0) {
        console.log('🌱 Base de datos vacía. Insertando datos de prueba...');
        
        // Ciudadano de prueba
        await db.run(`
            INSERT INTO citizens (rut, nombre_completo, antecedentes) 
            VALUES ('12.345.678-9', 'Juan Pérez Delictual', 'Hurto Simple (2022), Riña (2023)')
        `);

        // Vehículo de prueba
        await db.run(`
            INSERT INTO vehicles (patente, modelo, color, owner_rut)
            VALUES ('ABCD12', 'Karin Sultan RS', 'Negro Mate', '12.345.678-9')
        `);

        // Causa de prueba
        await db.run(`
            INSERT INTO causes (ruc, rit, descripcion, estado, imputado_rut)
            VALUES ('23000567-8', '550-2023', 'Robo en lugar habitado e intimidación.', 'ABIERTA', '12.345.678-9')
        `);
        
        console.log('🌱 Datos semilla insertados.');
    }
}

// Ejecutar inicialización
initializeTables().catch(err => {
    console.error('Error en inicialización de DB:', err);
});

module.exports = {
    getDatabase
};
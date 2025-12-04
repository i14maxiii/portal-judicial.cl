const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { getDatabase } = require('./database');

passport.serializeUser((user, done) => {
    // Guardamos solo el ID en la sesión para ser ligeros
    done(null, user.discord_id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const db = await getDatabase();
        const user = await db.get('SELECT * FROM users WHERE discord_id = ?', [id]);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify', 'guilds'] // 'guilds' nos servirá si quieres validar roles del servidor luego
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const db = await getDatabase();
        
        // Verificar si el usuario ya existe
        const existingUser = await db.get('SELECT * FROM users WHERE discord_id = ?', [profile.id]);

        if (existingUser) {
            // Actualizar avatar y nombre por si cambiaron en Discord
            await db.run(
                'UPDATE users SET username = ?, avatar = ? WHERE discord_id = ?',
                [profile.username, profile.avatar, profile.id]
            );
            return done(null, existingUser);
        } else {
            // Crear nuevo usuario con rol por defecto 'funcionario'
            await db.run(
                'INSERT INTO users (discord_id, username, avatar, role) VALUES (?, ?, ?, ?)',
                [profile.id, profile.username, profile.avatar, 'funcionario']
            );
            
            const newUser = await db.get('SELECT * FROM users WHERE discord_id = ?', [profile.id]);
            return done(null, newUser);
        }
    } catch (err) {
        console.error('Error en Discord Strategy:', err);
        return done(err, null);
    }
}));

module.exports = passport;
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const User = require('../models/user');

passport.serializeUser((user, done) => {
    done(null, user.id); 
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify', 'guilds']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // 1. Buscamos usando 'discordId' (formato de tu BD existente)
        let user = await User.findOne({ discordId: profile.id });

        if (user) {
            // Usuario existe: actualizamos info básica
            user.username = profile.username;
            user.avatar = profile.avatar;
            
            // INTENTO DE VINCULACIÓN AUTOMÁTICA
            // Si la "otra página" ya guardó un RUT en este usuario, Mongoose lo traerá.
            // Si no tiene RUT y es tu usuario admin, lo forzamos para que puedas probar.
            if ((profile.username === 'i14maxiii' || profile.username === 'Maximiliano') && !user.rut) { 
                 user.rut = '9.273.537-0'; 
            }
            
            await user.save();
            return done(null, user);
        } else {
            // 2. Usuario nuevo en ESTE sistema (pero quizas no en la BD)
            // Si llegamos aquí es porque findOne falló, así que creamos uno nuevo.
            
            let assignedRut = null;
            if (profile.username.includes('Maxi') || profile.username === 'i14maxiii') {
                assignedRut = '9.273.537-0';
            }

            user = await User.create({
                discordId: profile.id, // Usamos camelCase
                username: profile.username,
                avatar: profile.avatar,
                role: 'admin',
                rut: assignedRut
            });
            
            return done(null, user);
        }
    } catch (err) {
        console.error('❌ Error en Discord Strategy:', err);
        return done(err, null);
    }
}));

module.exports = passport;
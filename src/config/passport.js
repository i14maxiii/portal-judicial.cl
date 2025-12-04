const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const User = require('../models/user');

passport.serializeUser((user, done) => {
    done(null, user.id); // Usamos el _id interno de Mongo
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
        // Buscar si existe por discord_id
        let user = await User.findOne({ discord_id: profile.id });

        if (user) {
            // Actualizar datos
            user.username = profile.username;
            user.avatar = profile.avatar;
            await user.save();
            return done(null, user);
        } else {
            // Crear nuevo
            user = await User.create({
                discord_id: profile.id,
                username: profile.username,
                avatar: profile.avatar,
                role: 'funcionario'
            });
            return done(null, user);
        }
    } catch (err) {
        console.error('Error en Discord Strategy:', err);
        return done(err, null);
    }
}));

module.exports = passport;
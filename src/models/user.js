const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // Estandarizamos: SIEMPRE usaremos discordId (camelCase)
    discordId: { 
        type: String, 
        required: true, 
        unique: true 
    },
    username: { type: String, required: true },
    avatar: String,
    role: { 
        type: String, 
        // Aceptamos 'civil' explícitamente para evitar el error anterior
        enum: ['admin', 'juez', 'funcionario', 'civil'], 
        default: 'civil' 
    },
    // Agregamos timestamps para saber cuándo se registraron
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
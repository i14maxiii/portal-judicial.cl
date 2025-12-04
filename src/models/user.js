const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    discord_id: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    avatar: { type: String },
    role: { type: String, default: 'funcionario', enum: ['funcionario', 'admin', 'staff', 'juez'] },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
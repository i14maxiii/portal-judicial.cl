const mongoose = require('mongoose');

const CitizenSchema = new mongoose.Schema({
    rut: { type: String, required: true, unique: true, index: true },
    nombre_completo: { type: String, required: true },
    fecha_nacimiento: { type: String },
    antecedentes: { type: String, default: 'Sin antecedentes' },
    createdAt: { type: Date, default: Date.now }
});

// Índice de texto para búsquedas rápidas por nombre
CitizenSchema.index({ nombre_completo: 'text' });

module.exports = mongoose.model('Citizen', CitizenSchema);
const mongoose = require('mongoose');

const CitizenSchema = new mongoose.Schema({
    rut: { type: String, required: true, unique: true, index: true },
    nombre_completo: { type: String, required: true },
    fecha_nacimiento: { type: String },
    // CAMBIO: Ahora es un Array de Strings para soportar múltiples antecedentes
    antecedentes: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now }
});

// Índice de texto para búsquedas rápidas por nombre
CitizenSchema.index({ nombre_completo: 'text' });

module.exports = mongoose.model('Citizen', CitizenSchema);
const mongoose = require('mongoose');

const CauseSchema = new mongoose.Schema({
    ruc: { type: String, required: true, unique: true },
    rit: { type: String },
    descripcion: { type: String, required: true },
    estado: { type: String, default: 'ABIERTA', enum: ['ABIERTA', 'CERRADA', 'ARCHIVADA'] },
    imputado_rut: { type: String, required: true },
    fiscal_asignado_id: { type: String }, // Discord ID del fiscal
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    is_deleted: { type: Boolean, default: false }
});

// Middleware para actualizar 'updated_at' antes de guardar
CauseSchema.pre('save', function(next) {
    this.updated_at = Date.now();
    next();
});

module.exports = mongoose.model('Cause', CauseSchema);
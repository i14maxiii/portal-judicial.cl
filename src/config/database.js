const mongoose = require('mongoose');

// Usamos la variable de entorno o un fallback (aunque debes configurar el .env)
const MONGO_URI = process.env.MONGODB_URI;

const connectDB = async () => {
    try {
        if (!MONGO_URI) {
            throw new Error("⚠️ La variable de entorno MONGODB_URI no está definida.");
        }

        await mongoose.connect(MONGO_URI); // En Mongoose 6+ ya no se necesitan las opciones deprecadas

        console.log('✅ Conexión a MongoDB Atlas establecida correctamente.');
    } catch (error) {
        console.error('❌ Error al conectar con MongoDB:', error);
        process.exit(1);
    }
};

module.exports = connectDB;
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

export const setupDatabase = async () => {
    console.log('Verificando y configurando la base de datos...');
    try {
        const connection = await pool.getConnection();

        await connection.query(`
            CREATE TABLE IF NOT EXISTS reservations (
                id VARCHAR(255) PRIMARY KEY,
                guestName VARCHAR(255) NOT NULL,
                checkIn DATE NOT NULL,
                checkOut DATE NOT NULL,
                source VARCHAR(50) NOT NULL,
                totalPaid DECIMAL(10, 2) DEFAULT 0.00,
                commission DECIMAL(10, 2) DEFAULT 0.00,
                taxes DECIMAL(10, 2) DEFAULT 0.00,
                paymentMethod VARCHAR(50),
                guestCount INT DEFAULT 1,
                guestPhone VARCHAR(20)
            );
        `);
        
        await connection.query(`
            CREATE TABLE IF NOT EXISTS expenses (
                id VARCHAR(255) PRIMARY KEY,
                description TEXT NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                category VARCHAR(100) NOT NULL,
                date DATE NOT NULL
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS photos (
                id VARCHAR(255) PRIMARY KEY,
                url VARCHAR(255) NOT NULL,
                uploadDate DATETIME NOT NULL,
                description TEXT
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS services (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                cost DECIMAL(10, 2) NOT NULL,
                imageUrl VARCHAR(255) NOT NULL
            );
        `);

        connection.release();
        console.log('✅ Base de datos configurada correctamente.');
    } catch (error) {
        console.error('❌ Error al configurar la base de datos:', error);
        throw error;
    }
};

export default pool;

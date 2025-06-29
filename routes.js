import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { GoogleGenAI } from '@google/genai';
import pool from './database.js';
import { processICalData } from './ical-parser.js';

const router = Router();

// --- Configuración de Multer para subida de archivos ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });


// --- Rutas de Reservas ---
router.get('/reservations', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM reservations ORDER BY checkIn DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener las reservas', error });
    }
});

router.post('/reservations', async (req, res) => {
    const { guestName, checkIn, checkOut, source, totalPaid, commission, taxes, paymentMethod, guestCount, guestPhone } = req.body;
    const newReservation = { id: randomUUID(), guestName, checkIn, checkOut, source, totalPaid, commission, taxes, paymentMethod, guestCount, guestPhone };
    try {
        await pool.query('INSERT INTO reservations SET ?', newReservation);
        res.status(201).json(newReservation);
    } catch (error) {
        res.status(500).json({ message: 'Error al crear la reserva', error });
    }
});

router.put('/reservations/:id', async (req, res) => {
    const { id } = req.params;
    const { guestName, totalPaid, commission, taxes, paymentMethod, guestCount, guestPhone } = req.body;
    try {
        await pool.query('UPDATE reservations SET guestName = ?, totalPaid = ?, commission = ?, taxes = ?, paymentMethod = ?, guestCount = ?, guestPhone = ? WHERE id = ?', [guestName, totalPaid, commission, taxes, paymentMethod, guestCount, guestPhone, id]);
        const [[updatedReservation]] = await pool.query('SELECT * FROM reservations WHERE id = ?', [id]);
        res.json(updatedReservation);
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar la reserva', error });
    }
});

router.delete('/reservations/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM reservations WHERE id = ?', [id]);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Error al eliminar la reserva', error });
    }
});

router.post('/reservations/sync', async (req, res) => {
    const ICAL_URLS = {
        Airbnb: 'https://www.airbnb.com.co/calendar/ical/1393681463200159712.ics?s=d8920001f5b39f149df57eb5fde6677c',
        'Booking.com': 'https://ical.booking.com/v1/export?t=1aed69b5-63bf-47fb-8385-d0c07502e1c5',
    };

    try {
        const fetchPromises = Object.entries(ICAL_URLS).map(async ([source, url]) => {
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) throw new Error(`Error al cargar calendario de ${source}`);
            const text = await response.text();
            return processICalData(text, source);
        });

        const allNewSynced = (await Promise.all(fetchPromises)).flat();

        if (allNewSynced.length > 0) {
            const connection = await pool.getConnection();
            await connection.beginTransaction();

            for (const res of allNewSynced) {
                 await connection.query(`
                    INSERT INTO reservations (id, guestName, checkIn, checkOut, source, totalPaid, commission, taxes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                    checkIn = VALUES(checkIn),
                    checkOut = VALUES(checkOut)
                `, [res.id, res.guestName, res.checkIn, res.checkOut, res.source, res.totalPaid, res.commission, res.taxes]);
            }
            
            await connection.commit();
            connection.release();
        }

        // Después de sincronizar, siempre devolver todas las reservas actualizadas
        const [allReservations] = await pool.query('SELECT * FROM reservations ORDER BY checkIn DESC');
        res.json(allReservations);

    } catch (error) {
        console.error('Error en la sincronización de iCal:', error);
        res.status(500).json({ message: error instanceof Error ? error.message : 'Error desconocido al sincronizar' });
    }
});

// --- Rutas de Gastos ---
router.get('/expenses', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM expenses ORDER BY date DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener los gastos', error });
    }
});

router.post('/expenses', async (req, res) => {
    const { description, amount, category, date } = req.body;
    const newExpense = { id: randomUUID(), description, amount, category, date };
    try {
        await pool.query('INSERT INTO expenses SET ?', newExpense);
        res.status(201).json(newExpense);
    } catch (error) {
        res.status(500).json({ message: 'Error al crear el gasto', error });
    }
});

router.delete('/expenses/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM expenses WHERE id = ?', [id]);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Error al eliminar el gasto', error });
    }
});

// --- Rutas de Servicios ---
router.get('/services', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM services ORDER BY name ASC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener los servicios', error });
    }
});

router.post('/services', upload.single('image'), async (req, res) => {
    const { name, description, cost } = req.body;
    const imageUrl = `/uploads/${req.file.filename}`;
    const newService = { id: randomUUID(), name, description, cost, imageUrl };
    try {
        await pool.query('INSERT INTO services SET ?', newService);
        res.status(201).json(newService);
    } catch (error) {
        res.status(500).json({ message: 'Error al crear el servicio', error });
    }
});

router.delete('/services/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [[service]] = await pool.query('SELECT imageUrl FROM services WHERE id = ?', [id]);
        if (service) {
            await fs.unlink(path.join('uploads', path.basename(service.imageUrl)));
        }
        await pool.query('DELETE FROM services WHERE id = ?', [id]);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Error al eliminar el servicio', error });
    }
});

// --- Rutas de Fotos ---
router.get('/photos', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM photos ORDER BY uploadDate DESC');
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener fotos:', error);
        res.status(500).json({ message: 'Error al obtener las fotos', error });
    }
});

router.post('/photos', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No se subió ningún archivo' });
        }

        const { description } = req.body;
        const url = `/uploads/${req.file.filename}`;
        const newPhoto = {
            id: randomUUID(),
            url,
            uploadDate: new Date(),
            description: description || ''
        };

        await pool.query('INSERT INTO photos SET ?', newPhoto);
        res.status(201).json(newPhoto);
    } catch (error) {
        console.error('Error al subir foto:', error);
        res.status(500).json({ message: 'Error al subir la foto', error });
    }
});

router.delete('/photos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Obtener la información de la foto antes de eliminarla
        const [[photo]] = await pool.query('SELECT url FROM photos WHERE id = ?', [id]);
        
        if (photo) {
            // Eliminar el archivo físico
            try {
                await fs.unlink(path.join('uploads', path.basename(photo.url)));
            } catch (fileError) {
                console.warn('No se pudo eliminar el archivo físico:', fileError);
            }
        }
        
        // Eliminar de la base de datos
        await pool.query('DELETE FROM photos WHERE id = ?', [id]);
        res.status(204).send();
    } catch (error) {
        console.error('Error al eliminar foto:', error);
        res.status(500).json({ message: 'Error al eliminar la foto', error });
    }
});

// --- Ruta de Reportes (IA) ---
router.post('/reports/summary', async (req, res) => {
    const { monthlyData } = req.body;
    
    if (!process.env.API_KEY) {
        return res.status(500).json({ message: 'La clave de API de Gemini no está configurada en el servidor.' });
    }

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const prompt = `
            Eres un asesor financiero para el dueño de una pequeña cabaña de alquiler.
            Analiza los siguientes datos financieros mensuales (en pesos colombianos, COP) y proporciona un resumen conciso y amigable en español en formato de viñetas (usando asteriscos *).
            El resumen debe incluir:
            - Una visión general del rendimiento.
            - El mes con mayor ganancia y el mes con mayor gasto.
            - Cualquier tendencia notable (ej. aumento de gastos, crecimiento de ingresos).
            - Una recomendación o punto de atención basado en los datos.
            
            Aquí están los datos:
            ${JSON.stringify(monthlyData, null, 2)}
        `;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-04-17',
            contents: prompt
        });

        res.json({ summary: response.text });

    } catch (e) {
        console.error("Error generating AI summary:", e);
        res.status(500).json({ message: "Hubo un error al contactar al servicio de IA." });
    }
});


export default router;

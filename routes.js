import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { GoogleGenerativeAI } from '@google/generative-ai';
import exifr from 'exifr';
import pool from './database.js';
import { processICalData } from './ical-parser.js';

const router = Router();

// --- Función utilitaria para detectar conflictos de fechas ---
const checkDateOverlap = (newCheckIn, newCheckOut, existingCheckIn, existingCheckOut) => {
    const newStart = new Date(newCheckIn);
    const newEnd = new Date(newCheckOut);
    const existingStart = new Date(existingCheckIn);
    const existingEnd = new Date(existingCheckOut);
    
    // Verificar si hay superposición de fechas
    return (newStart < existingEnd && newEnd > existingStart);
};

const formatDateRange = (checkIn, checkOut) => {
    const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
    return `${new Date(checkIn).toLocaleDateString('es-CO', options)} - ${new Date(checkOut).toLocaleDateString('es-CO', options)}`;
};

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
    const { guestName, checkIn, checkOut, totalPaid, commission, taxes, paymentMethod, guestCount, guestPhone } = req.body;
    try {
        await pool.query('UPDATE reservations SET guestName = ?, checkIn = ?, checkOut = ?, totalPaid = ?, commission = ?, taxes = ?, paymentMethod = ?, guestCount = ?, guestPhone = ? WHERE id = ?', [guestName, checkIn, checkOut, totalPaid, commission, taxes, paymentMethod, guestCount, guestPhone, id]);
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
        'Booking.com': 'https://ical.booking.com/v1/export?t=9fd18761-b1a2-46c2-aea3-206c685929a5',
    };

    try {
        console.log('🔄 Iniciando sincronización de calendarios...');
        
        const fetchPromises = Object.entries(ICAL_URLS).map(async ([source, url]) => {
            console.log(`📥 Descargando calendario de ${source}...`);
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) throw new Error(`Error al cargar calendario de ${source}`);
            const text = await response.text();
            const events = processICalData(text, source);
            console.log(`✅ ${source}: ${events.length} eventos encontrados`);
            return events;
        });

        const allNewSynced = (await Promise.all(fetchPromises)).flat();
        console.log(`📊 Total de eventos procesados: ${allNewSynced.length}`);

        if (allNewSynced.length > 0) {
            const connection = await pool.getConnection();
            await connection.beginTransaction();

            let insertedCount = 0;
            let skippedCount = 0;

            for (const res of allNewSynced) {
                // Verificar si ya existe una reserva que se superponga con las fechas de la nueva reserva
                const [existingReservations] = await connection.query(`
                    SELECT id, guestName, checkIn, checkOut, source 
                    FROM reservations 
                    WHERE (
                        (checkIn <= ? AND checkOut > ?) OR
                        (checkIn < ? AND checkOut >= ?) OR
                        (checkIn >= ? AND checkOut <= ?)
                    )
                `, [res.checkIn, res.checkIn, res.checkOut, res.checkOut, res.checkIn, res.checkOut]);

                // Validación adicional usando la función utilitaria
                const hasConflict = existingReservations.some(existing => 
                    checkDateOverlap(res.checkIn, res.checkOut, existing.checkIn, existing.checkOut)
                );

                if (!hasConflict) {
                    // No hay conflictos de fechas, insertar la nueva reserva
                    await connection.query(`
                        INSERT INTO reservations (id, guestName, checkIn, checkOut, source, totalPaid, commission, taxes)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `, [res.id, res.guestName, res.checkIn, res.checkOut, res.source, res.totalPaid, res.commission, res.taxes]);
                    insertedCount++;
                    console.log(`✅ Nueva reserva insertada: ${res.guestName} [${res.source}] ${formatDateRange(res.checkIn, res.checkOut)}`);
                } else {
                    // Ya existe una reserva en este rango de fechas, omitir para evitar sobrescribir
                    const conflictingReservation = existingReservations[0];
                    skippedCount++;
                    console.log(`⚠️  Reserva omitida por conflicto de fechas:`);
                    console.log(`   Nueva: ${res.guestName} [${res.source}] ${formatDateRange(res.checkIn, res.checkOut)}`);
                    console.log(`   Existente: ${conflictingReservation.guestName} [${conflictingReservation.source}] ${formatDateRange(conflictingReservation.checkIn, conflictingReservation.checkOut)}`);
                }
            }
            
            await connection.commit();
            connection.release();

            console.log(`\n📊 Sincronización completada:`);
            console.log(`   ✅ ${insertedCount} reservas nuevas insertadas`);
            console.log(`   ⚠️  ${skippedCount} omitidas por conflictos de fechas`);
            console.log(`   📋 Total procesadas: ${allNewSynced.length}\n`);
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
        
        // Extraer metadatos EXIF para obtener la fecha de captura
        let captureDate = null;
        let enhancedDescription = description || '';
        
        try {
            const exifData = await exifr.parse(req.file.path);
            if (exifData && exifData.DateTimeOriginal) {
                captureDate = exifData.DateTimeOriginal;
                const formattedDate = captureDate.toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                // Agregar la fecha de captura a la descripción
                if (enhancedDescription) {
                    enhancedDescription += ` (Capturada: ${formattedDate})`;
                } else {
                    enhancedDescription = `Capturada: ${formattedDate}`;
                }
            }
        } catch (exifError) {
            console.log('No se pudieron extraer metadatos EXIF:', exifError.message);
            // Continúa sin los metadatos EXIF
        }

        const newPhoto = {
            id: randomUUID(),
            url,
            uploadDate: new Date(),
            description: enhancedDescription
        };

        await pool.query('INSERT INTO photos SET ?', newPhoto);
        res.status(201).json(newPhoto);
    } catch (error) {
        console.error('Error al subir foto:', error);
        res.status(500).json({ message: 'Error al subir la foto', error });
    }
});

router.put('/photos/:id', async (req, res) => {
    const { id } = req.params;
    const { description } = req.body;
    
    try {
        await pool.query('UPDATE photos SET description = ? WHERE id = ?', [description, id]);
        const [[updatedPhoto]] = await pool.query('SELECT * FROM photos WHERE id = ?', [id]);
        res.json(updatedPhoto);
    } catch (error) {
        console.error('Error al actualizar foto:', error);
        res.status(500).json({ message: 'Error al actualizar la descripción de la foto', error });
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
    
    // Verificar si la API key está configurada
    if (!process.env.API_KEY || process.env.API_KEY === 'tu_clave_aqui') {
        return res.status(500).json({ 
            message: 'La clave de API de Gemini no está configurada en el servidor. Por favor, configura la variable API_KEY en el archivo .env del backend. Consulta GEMINI_API_SETUP.md para más detalles.' 
        });
    }

    // Verificar que hay datos para analizar
    if (!monthlyData || monthlyData.length === 0) {
        return res.status(400).json({ 
            message: 'No hay datos financieros suficientes para generar un resumen. Agrega algunas reservas y gastos primero.' 
        });
    }

    try {
        console.log('🤖 Generando resumen con IA para', monthlyData.length, 'meses de datos...');
        
        const genAI = new GoogleGenerativeAI(process.env.API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        
        const prompt = `
            Eres un asesor financiero para el dueño de la cabaña "Santa Teresa" ubicada en Suesca, Cundinamarca.
            Analiza los siguientes datos financieros mensuales (en pesos colombianos, COP) y proporciona un resumen conciso y amigable en español.
            
            FORMATO REQUERIDO:
            • Usa viñetas con asteriscos (*)
            • Máximo 6-8 puntos
            • Lenguaje claro y directo
            • Incluye números específicos cuando sea relevante
            
            CONTENIDO REQUERIDO:
            • Una visión general del rendimiento
            • El mes con mayor ganancia y el mes con mayor gasto
            • Tendencias notables (crecimiento de ingresos, aumento de gastos, etc.)
            • Una recomendación práctica basada en los datos
            
            DATOS FINANCIEROS:
            ${JSON.stringify(monthlyData, null, 2)}
        `;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const summary = response.text();
        
        console.log('✅ Resumen generado exitosamente');
        res.json({ summary });

    } catch (e) {
        console.error("❌ Error generating AI summary:", e);
        
        if (e.message && e.message.includes('API_KEY')) {
            return res.status(500).json({ 
                message: 'Error de autenticación con la API de Gemini. Verifica que tu API key sea válida.' 
            });
        }
        
        if (e.message && e.message.includes('quota')) {
            return res.status(500).json({ 
                message: 'Has excedido la cuota de la API de Gemini. Intenta de nuevo más tarde o verifica tu configuración.' 
            });
        }
        
        res.status(500).json({ 
            message: "Hubo un error al contactar al servicio de IA. Revisa la consola del servidor para más detalles." 
        });
    }
});


export default router;

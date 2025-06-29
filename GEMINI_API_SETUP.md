# 🔑 Configuración de la API de Gemini para Reportes con IA

## ❌ Problema Actual
La funcionalidad de "Generar Resumen Financiero" muestra el error:
> "La clave de API de Gemini no está configurada en el servidor."

## ✅ Solución: Configurar API Key de Gemini

### Paso 1: Obtener la Clave de API

1. **Visita Google AI Studio:**
   - Ve a: https://aistudio.google.com/
   - Inicia sesión con tu cuenta de Google

2. **Genera una API Key:**
   - Haz clic en "Get API Key" o "Obtener clave API"
   - Selecciona "Create API Key in new project" 
   - Copia la clave generada (formato: `AIzaSy...`)

3. **Configuraciones importantes:**
   - La API de Gemini es gratuita hasta cierto límite de uso
   - Puedes configurar límites de uso para evitar cargos inesperados
   - Mantén la clave privada y segura

### Paso 2: Agregar la Clave al Backend

Una vez que tengas tu clave de API, agrégala al archivo `.env`:

```bash
# Navega al directorio backend
cd /Users/wmerchan/Desktop/App_Suesca/backend

# Edita el archivo .env
nano .env  # o usa tu editor preferido
```

Agrega esta línea al final del archivo `.env`:
```
API_KEY=tu_clave_de_api_aqui
```

### Paso 3: Reiniciar el Servidor

Después de agregar la clave, reinicia el servidor backend:
```bash
# Si el servidor está corriendo, deténlo con Ctrl+C
# Luego reinicia:
npm start
```

## 📝 Ejemplo de archivo .env completo

```properties
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=123456
DB_DATABASE=gestor_cabana
DB_PORT=3306
API_KEY=AIzaSyC3JoEXAMPLEkeyHERE123456789abcdef
```

## 🔒 Seguridad

- **Nunca compartir la API Key** en repositorios públicos
- El archivo `.env` debe estar en `.gitignore` (ya está configurado)
- Usar variables de entorno en producción

## 🧪 Probar la Funcionalidad

Una vez configurada la API Key:

1. **Reinicia el servidor backend**
2. **Ve a la sección "Reportes Financieros"**
3. **Haz clic en "Generar Resumen Financiero"**
4. **Deberías ver un análisis generado por IA**

## 💡 Características del Resumen IA

El resumen incluirá:
- ✅ Visión general del rendimiento financiero
- ✅ Mes con mayor ganancia y mayor gasto
- ✅ Tendencias notables (crecimiento, gastos)
- ✅ Recomendaciones personalizadas
- ✅ Formato amigable en español

## 🆘 Si tienes problemas

1. **Verificar que la clave sea correcta**
2. **Comprobar que el servidor se reinició**
3. **Revisar la consola del servidor para errores**
4. **Asegurarse de que tienes datos financieros (reservas/gastos)**

Una vez configurada, la funcionalidad de IA estará completamente operativa.

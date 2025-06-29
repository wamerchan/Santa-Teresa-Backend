#!/bin/bash

# Script para verificar la configuración de Gemini API
# Uso: bash check-gemini-config.sh

echo "🔍 Verificando configuración de Gemini API..."
echo ""

# Verificar si existe el archivo .env
if [ ! -f ".env" ]; then
    echo "❌ Error: No se encontró el archivo .env"
    echo "   Crea el archivo .env en el directorio backend"
    exit 1
fi

# Verificar si la API_KEY está configurada
if grep -q "API_KEY=" .env; then
    API_KEY=$(grep "API_KEY=" .env | cut -d'=' -f2)
    
    if [ "$API_KEY" = "tu_clave_aqui" ] || [ -z "$API_KEY" ]; then
        echo "⚠️  La API_KEY no está configurada correctamente"
        echo "   Valor actual: $API_KEY"
        echo ""
        echo "🔧 Para configurarla:"
        echo "   1. Ve a: https://aistudio.google.com/"
        echo "   2. Obtén tu API Key"
        echo "   3. Edita el archivo .env y reemplaza 'tu_clave_aqui' con tu clave real"
        echo "   4. Reinicia el servidor backend"
        exit 1
    else
        echo "✅ API_KEY configurada"
        echo "   Clave: ${API_KEY:0:10}..."
    fi
else
    echo "❌ Error: Variable API_KEY no encontrada en .env"
    echo "   Agrega la línea: API_KEY=tu_clave_de_api_aqui"
    exit 1
fi

# Verificar dependencias
echo ""
echo "📦 Verificando dependencias..."

if grep -q "@google/generative-ai" package.json; then
    echo "✅ Dependencia @google/generative-ai encontrada"
else
    echo "⚠️  Dependencia @google/generative-ai no encontrada"
    echo "   Instálala con: npm install @google/generative-ai"
fi

echo ""
echo "🎉 Configuración verificada. Si todo está bien, reinicia el servidor backend."
echo "   Comando: npm start"

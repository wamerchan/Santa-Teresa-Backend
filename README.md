# Backend para Gestor de Cabaña

Este directorio contiene el servidor backend para la aplicación "Gestor de Cabaña". Está construido con Node.js, Express, y se conecta a una base de datos MariaDB.

## Prerrequisitos

Antes de comenzar, asegúrate de tener instalado lo siguiente:
- [Node.js](https://nodejs.org/) (versión 16 o superior)
- [MariaDB](https://mariadb.org/download/) (o MySQL)

## Pasos de Configuración

### 1. Configurar la Base de Datos

Primero, necesitas crear una base de datos y un usuario para que la aplicación pueda conectarse.

1.  Abre una terminal de MariaDB/MySQL:
    ```sql
    mysql -u root -p
    ```

2.  Ejecuta los siguientes comandos SQL para crear la base de datos y el usuario. Puedes cambiar `'password_seguro'` por una contraseña de tu elección.

    ```sql
    CREATE DATABASE gestor_cabana;
    CREATE USER 'gestor_user'@'localhost' IDENTIFIED BY 'password_seguro';
    GRANT ALL PRIVILEGES ON gestor_cabana.* TO 'gestor_user'@'localhost';
    FLUSH PRIVILEGES;
    EXIT;
    ```

### 2. Instalar Dependencias

Navega a este directorio (`backend`) en tu terminal y ejecuta `npm install` para instalar todas las dependencias necesarias.

```bash
cd backend
npm install
```

### 3. Configurar Variables de Entorno

1.  Crea una copia del archivo `.env.example` y renómbrala a `.env`.

    ```bash
    cp .env.example .env
    ```

2.  Abre el nuevo archivo `.env` y edita las variables con los datos de tu base de datos que configuraste en el paso 1. También, añade tu clave de API de Google Gemini.

    ```dotenv
    DB_HOST=localhost
    DB_USER=gestor_user
    DB_PASSWORD=password_seguro
    DB_DATABASE=gestor_cabana
    API_KEY=TU_API_KEY_DE_GEMINI_AQUI
    ```

### 4. Iniciar el Servidor

Una vez que todo esté configurado, puedes iniciar el servidor con el siguiente comando:

```bash
npm start
```

El servidor se iniciará (por defecto en el puerto 4000) y automáticamente creará las tablas necesarias en la base de datos si no existen.

Ahora, tu aplicación frontend debería poder comunicarse con el backend. ¡Asegúrate de que el frontend también esté corriendo!
## Backend Version 2.0

---
name: clima
description: Consulta el clima actual y el pronóstico de Ilo, Moquegua, Perú por defecto (o de una ciudad indicada) usando wttr.in, sin API key. Usar cuando el usuario pregunte por el clima, el tiempo, la temperatura, si va a llover, o invoque /clima.
argument-hint: "[ciudad opcional]"
allowed-tools: Bash(curl:*), Bash(curl.exe:*), PowerShell(curl.exe:*)
---

# Clima local

Obtiene el clima desde https://wttr.in (servicio gratuito, sin registro ni API key).

## Ubicación

- Si `$ARGUMENTS` trae una ciudad, úsala (espacios → `+`, ej. `Ciudad+de+Mexico`).
- Si viene vacío, usa siempre la ubicación por defecto: `Ilo,Moquegua,Peru` (Ilo, Moquegua, Perú). No uses detección por IP.

## Pasos

1. Clima actual en una línea:

   ```bash
   curl -s "https://wttr.in/<CIUDAD>?format=%l:+%c+%t+(sensación+%f),+humedad+%h,+viento+%w,+lluvia+%p&lang=es&m"
   ```

2. Pronóstico de hoy y los próximos 2 días (sin colores ANSI):

   ```bash
   curl -s "https://wttr.in/<CIUDAD>?0&T&Q&lang=es&m"   # solo actual
   curl -s "https://wttr.in/<CIUDAD>?2&T&Q&lang=es&m"   # actual + 2 días
   ```

   Si se necesitan datos estructurados, usa `?format=j1` (JSON) y extrae `current_condition` y `weather[]`.

3. En PowerShell 5.1 usa `curl.exe` (no `curl`, que es alias de `Invoke-WebRequest`).

## Respuesta

- Responde en español, breve: ubicación detectada, condición, temperatura y sensación térmica, humedad, viento, precipitación (mm). Para probabilidad de lluvia usa `format=j1` (`hourly[].chanceofrain`).
- Añade el pronóstico resumido solo si el usuario lo pide o pregunta por días futuros.
- Unidades métricas (°C, km/h).
- Si la petición falla o no hay red, dilo claramente; no inventes datos.

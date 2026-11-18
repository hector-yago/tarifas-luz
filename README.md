# tarifas-luz

PWA para comparar tu factura de la luz con las ofertas de las comercializadoras, usando **tus propios datos**. Sin backend, sin dependencias y sin subir nada a ninguna tienda de aplicaciones. Los datos que introduces se guardan solo en el dispositivo (`localStorage`).

## Qué hace

- **Mis facturas**: hasta 12 facturas (fechas, potencia contratada, kWh P1/P2/P3 o total, importe). Proyecta el consumo a un año.
- **Condiciones**: potencia fija (la de tus facturas o la que indiques), solo renovable, sin permanencia, sin cuota fija, precio fijo ≥ 12 meses, sin IPC, solo datos confirmados. Siempre se comparan tarifas de **precio único 24 h**. Opcional: tu tarifa actual y la renovación que te han comunicado, para ver cuánto ahorras o pierdes.
- **Resultados**: ranking con coste anual y mensual (con impuestos y costes regulados), desglose, condiciones, cláusulas a vigilar y opiniones.
- **Actualizar ofertas**: carga un `offers.json` (el incluido en la app, una URL `https://…` o un archivo). Valida el formato y rechaza datos absurdos.
- **Ajustes**: IVA, impuesto eléctrico, bono social y contador; exportar/importar tus datos; borrar todo.

## Usarla en el PC

Requiere Node.js 18 o superior.

```
node serve.mjs          # http://localhost:8080  (o iniciar.cmd en Windows)
```

Abre `http://localhost:8080` en Edge o Chrome y, si quieres, «Instalar aplicación» desde la barra de direcciones: queda como una app con su icono y funciona sin conexión.

## Usarla en el móvil (Android / iPhone)

Un service worker (modo sin conexión e instalación completa) **solo funciona en HTTPS**. Opciones:

1. **Misma wifi (sin instalar nada más)**: `node serve.mjs 8080 --lan` en el PC y abre `http://IP-DEL-PC:8080` en el móvil. Después, «Añadir a pantalla de inicio» (iPhone: Compartir → Añadir a pantalla de inicio; Android: menú → Añadir a pantalla de inicio). Funciona mientras el PC esté encendido. Úsalo solo en una red de confianza (va sin cifrar).
2. **Instalación real y sin conexión**: publicar estos ficheros en un alojamiento HTTPS estático (p. ej. GitHub Pages del repo). La app no envía datos a ningún sitio, así que publicarla no expone tus facturas. Es una decisión pendiente: no se ha publicado nada.

## Cómo actualizar los precios

Las webs de las comercializadoras no se pueden leer desde el navegador (CORS) y la CNMC no publica una API de ofertas. Por eso la app no «rastrea» Internet: lee un fichero `offers.json` con este formato (ver `data/offers.json`: ofertas más 2 referencias):

```json
{ "version": "2026-11-18", "params": { "iva": 0.21, "impuestoElectrico": 0.0511269632, "bonoSocialDia": 0.024688, "alquilerEquipoDia": 0.0267 },
  "offers": [ { "company": "…", "tariff": "…", "energyPrice": 0.125, "powerP1": 0.088, "powerP2": 0.088,
                "monthlyFee": 0, "lockInMonths": 0, "renewable": "Sí", "consultedOn": "2026-11-18", "verification": "Web oficial", "url": "https://…" } ] }
```

Precios en €, **sin impuestos**; potencia en €/kW/día; energía en €/kWh. Para refrescar las ofertas se actualiza ese fichero (fuente de trabajo: `luz/datos/ofertas.json`, copiado a `data/offers.json`) y se pulsa «Actualizar ofertas».

## Importar tus facturas de ejemplo

`Ajustes → Importar datos…` acepta el fichero que exporta la propia app. Hay un botón «Cargar datos de ejemplo» (datos ficticios) en Mis facturas.

## Pruebas

```
npm test       # motor de cálculo, validación de ofertas y almacenamiento
```

Las pruebas con facturas reales usan `tests/fixtures/facturas.json`, que es privado y está en `.gitignore`; sin él se omiten.

## Estructura

```
index.html · css/ · js/ (engine, offers, store, app) · data/offers.json · icons/ · sw.js · manifest.webmanifest
serve.mjs (servidor local) · tools/make-icons.mjs · tests/
```

## Aviso

Las ofertas son datos publicados por las comercializadoras en la fecha indicada. No es una oferta ni asesoramiento: confirma precio, duración y permanencia en la web oficial antes de contratar.

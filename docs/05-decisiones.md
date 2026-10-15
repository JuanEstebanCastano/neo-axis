# Decisiones

Por qué se eligió cada herramienta. No hace falta leerlo para contribuir, pero
sirve cuando alguien pregunta "¿y por qué no usaron X?".

Cada decisión responde a algo que **la base de datos ya decidió**. El esquema
se diseñó primero; las herramientas se eligieron para servirlo.

---

## PostgreSQL 18, no una versión anterior

El esquema usa `uuidv7()` para generar identificadores. Es una función que
existe de forma nativa recién desde la versión 18.

Un `uuidv7` es un identificador único que además está **ordenado por tiempo**:
dos registros creados seguidos tienen identificadores cercanos. Eso hace que la
base de datos los guarde juntos en el disco y las consultas sean más rápidas.
Los identificadores aleatorios clásicos (`uuidv4`) se dispersan y obligan a
saltar por todo el disco.

El programa verifica la versión al arrancar y se niega a funcionar con una
anterior, con un mensaje claro. Es mejor fallar al encender que dar errores
raros tres semanas después.

---

## Kysely, no Prisma

Prisma es la herramienta más popular para hablar con bases de datos desde
TypeScript. No se usó acá, y es la decisión más discutible del proyecto.

**El motivo.** Prisma quiere ser el dueño del diseño de la base de datos: uno
describe las tablas en su propio lenguaje y él las crea. Nuestro esquema usa
varias cosas que Prisma no sabe representar:

- llaves foráneas compuestas (dos columnas apuntando juntas a otra tabla)
- índices únicos parciales ("este correo es único **sólo entre** los usuarios
  no borrados")
- triggers y funciones propias

Para usar Prisma habría que **empobrecer el diseño** hasta que le quepa.

Kysely hace menos: sólo ayuda a escribir consultas, con el tipado generado
desde la base real. La base manda.

**El costo.** Kysely tiene menos tutoriales y menos gente que lo conoce. Es un
intercambio consciente: se prioriza que el diseño de datos no se degrade.

---

## Sesiones en la base de datos, no JWT

Un JWT es un "pase" firmado que el servidor entrega y después sólo verifica,
sin consultar nada. Es rápido y muy popular.

**El problema.** No se puede anular. Si a alguien le roban la cuenta, o si se
expulsa a un usuario, su pase sigue siendo válido hasta que venza. La solución
habitual es llevar una lista de pases anulados... que termina siendo una tabla
en la base de datos, o sea exactamente lo que el JWT prometía evitar, pero con
dos fuentes de verdad en vez de una.

Acá cada sesión es una fila en `auth_sessions` con una columna `revoked_at`.
Cerrar sesión, expulsar a alguien o anular todos los dispositivos de una cuenta
es una sola actualización, y surte efecto en el siguiente pedido.

---

## Sin Redis ni sistema de colas externo

Lo habitual para procesar tareas en segundo plano es agregar Redis y una
biblioteca como BullMQ.

No hizo falta: la tabla `email_notification_queue` **ya es una cola**. Tiene
estado, cantidad de intentos, fecha programada y último error. Y Postgres sabe
repartir filas entre varios trabajadores sin que se pisen
(`FOR UPDATE SKIP LOCKED`).

Agregar Redis significaría un servicio más que instalar, respaldar y vigilar, y
—peor— un segundo lugar donde vive el estado, con la posibilidad de que los dos
queden desincronizados.

Si algún día la cola maneja millones de mensajes por hora, esta decisión se
revisa. Para una comunidad, Postgres sobra.

---

## Permisos, no roles, en el código

El código nunca pregunta `¿es administrador?`. Pregunta
`¿tiene el permiso 'posts.create'?`.

**La diferencia en la práctica.** Si mañana hay que permitir que los
moderadores lean el registro de auditoría:

- Con roles en el código: hay que buscar cada lugar donde dice `role ===
  'admin'`, modificarlo, probar y desplegar.
- Con permisos: se inserta una fila en la tabla `role_permissions`. Sin tocar
  código, sin despliegue, y queda registrado quién lo cambió.

---

## Docker para todo

Sin Docker, cada persona tendría que instalar PostgreSQL 18, MinIO, un servidor
de correo y Node, configurarlos y mantenerlos sincronizados. Alguien quedaría
con la versión equivocada y pasaría una tarde averiguando por qué a él no le
funciona.

Con Docker: `make dev`. Idéntico en Windows, macOS, Linux y el servidor.

---

## Indexación de búsqueda dentro de la transacción

El índice de búsqueda se actualiza en la **misma** transacción que guarda la
publicación. Si falla el índice, falla la publicación entera.

Parece estricto. La alternativa sería más permisiva: guardar la publicación y
actualizar el índice después, por separado.

**Por qué no.** Si eso falla, queda una publicación guardada que **nunca
aparece en las búsquedas**, y nadie se entera. No hay error, no hay alerta, el
usuario ve su publicación publicada. El problema aparece meses después como
"oye, no encuentro mi post" y para entonces hay cientos igual.

Los errores silenciosos son los más caros. Mejor que falle fuerte y temprano.

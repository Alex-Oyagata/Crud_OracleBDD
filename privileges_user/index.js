const express = require('express');
const path = require('path');
const oracledb = require('oracledb');
const app = express();
const port = 3000;
const fs = require('fs');
const os = require('os');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbConfig = {
  user: 'sys',
  password: 'admin',
  connectString: 'localhost:1521/xe',
  privilege: oracledb.SYSDBA
};
app.get('/api/usuarios/existe', async (req, res) => {
  const { usuario } = req.query;
  if (!usuario) return res.status(400).json({ error: 'Falta usuario' });

  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT COUNT(*) AS TOTAL FROM ALL_USERS WHERE USERNAME = :usuario`,
      [usuario.toUpperCase()]
    );

    const existe = result.rows[0][0] > 0;
    res.json({ existe });

  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) await connection.close();
  }
});


// ✅ Ruta para privilegios
app.get('/privileges/:username', async (req, res) => {
  const username = req.params.username.toUpperCase();
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    const sysPrivsResult = await connection.execute(
      `SELECT PRIVILEGE FROM DBA_SYS_PRIVS WHERE GRANTEE = :username`,
      [username]
    );

    const objPrivsResult = await connection.execute(
      `SELECT OWNER, TABLE_NAME, PRIVILEGE FROM DBA_TAB_PRIVS WHERE GRANTEE = :username`,
      [username]
    );

    const rolesResult = await connection.execute(
      `SELECT GRANTED_ROLE FROM DBA_ROLE_PRIVS WHERE GRANTEE = :username`,
      [username]
    );

    const sysPrivs = sysPrivsResult.rows.map(row => row[0]);
    const objPrivs = objPrivsResult.rows.map(row => ({
      owner: row[0],
      object: row[1],
      privilege: row[2]
    }));
    const roles = rolesResult.rows.map(row => row[0]);

    const selects = objPrivsResult.rows.filter(row => row[2] === 'SELECT');
    const dataSamples = {};

    for (const [owner, table] of selects.map(row => [row[0], row[1]])) {
      try {
        const result = await connection.execute(
          `SELECT * FROM ${owner}.${table} WHERE ROWNUM <= 10`
        );

        const cols = result.metaData.map(col => col.name);
        dataSamples[`${owner}.${table}`] = result.rows.map(row => {
          const obj = {};
          row.forEach((val, idx) => { obj[cols[idx]] = val; });
          return obj;
        });
      } catch (e) {
        dataSamples[`${owner}.${table}`] = [];
      }
    }

    res.json({
      username,
      sysPrivs: sysPrivs.length ? sysPrivs : ['Sin privilegios de sistema'],
      objPrivs: objPrivs.length ? objPrivs : ['Sin privilegios sobre objetos'],
      roles: roles.length ? roles : ['Sin roles asignados'],
      dataSamples
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error consultando Oracle', details: err.message });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { }
    }
  }
});

app.get('/listar-nombres', async (req, res) => {
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    await connection.execute(`BEGIN DBMS_OUTPUT.ENABLE(NULL); END;`);


    const bloquePLSQL = `
      DECLARE
         CURSOR MICURSOR_NOMBRE IS SELECT FIRST_NAME FROM HR.EMPLOYEES;
         V_NOMBRE HR.EMPLOYEES.FIRST_NAME%TYPE;
      BEGIN
       OPEN MICURSOR_NOMBRE;
       LOOP
         FETCH MICURSOR_NOMBRE INTO V_NOMBRE;
         EXIT WHEN MICURSOR_NOMBRE%NOTFOUND;
         DBMS_OUTPUT.PUT_LINE('Nombre: ' || V_NOMBRE);
        END LOOP;
     CLOSE MICURSOR_NOMBRE;
    END;`;

    await connection.execute(bloquePLSQL);


    let more = true;
    let resultados = [];

    while (more) {
      const result = await connection.execute(
        `BEGIN DBMS_OUTPUT.GET_LINE(:line, :status); END;`,
        {
          line: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 },
          status: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );

      if (result.outBinds.status === 1) {
        more = false;
      } else {
        resultados.push(result.outBinds.line);
      }
    }


    await connection.execute(`BEGIN DBMS_OUTPUT.DISABLE(); END;`);

    res.json({
      empleados: resultados,
      consulta: bloquePLSQL
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
  }
});

app.get('/listar-apellidos', async (req, res) => {
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);


    await connection.execute(`BEGIN DBMS_OUTPUT.ENABLE(NULL); END;`);

    const bloquePLSQL = `
    DECLARE
         CURSOR MICURSOR_APELLIDO IS SELECT LAST_NAME FROM HR.EMPLOYEES;
          V_APELLIDO HR.EMPLOYEES.LAST_NAME%TYPE;
    BEGIN
       OPEN MICURSOR_APELLIDO;
        LOOP
        FETCH MICURSOR_APELLIDO INTO V_APELLIDO;
        EXIT WHEN MICURSOR_APELLIDO%NOTFOUND;
        DBMS_OUTPUT.PUT_LINE('Apellido: ' || V_APELLIDO);
        END LOOP;
    CLOSE MICURSOR_APELLIDO;
    END;`;

    await connection.execute(bloquePLSQL);

    let more = true;
    let resultados = [];

    while (more) {
      const result = await connection.execute(
        `BEGIN DBMS_OUTPUT.GET_LINE(:line, :status); END;`,
        {
          line: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 },
          status: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );

      if (result.outBinds.status === 1) {
        more = false;
      } else {
        resultados.push(result.outBinds.line);
      }
    }

    await connection.execute(`BEGIN DBMS_OUTPUT.DISABLE(); END;`);
    res.json({
      empleados: resultados,
      consulta: bloquePLSQL
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
  }
});


app.get('/listar-empleados-detalle', async (req, res) => {
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    // Habilitar salida DBMS_OUTPUT
    await connection.execute(`BEGIN DBMS_OUTPUT.ENABLE(NULL); END;`);

    // Bloque PL/SQL anónimo con SELECT y FOR loop para imprimir nombres y salarios
    const bloquePLSQL = `
      DECLARE
        CURSOR MICURSOR_DETALLE IS
         SELECT FIRST_NAME, LAST_NAME, SALARY FROM HR.EMPLOYEES;

           V_NOMBRE   HR.EMPLOYEES.FIRST_NAME%TYPE;
           V_APELLIDO HR.EMPLOYEES.LAST_NAME%TYPE;
           V_SALARIO  HR.EMPLOYEES.SALARY%TYPE;
      BEGIN
           OPEN MICURSOR_DETALLE;
           LOOP
           FETCH MICURSOR_DETALLE INTO V_NOMBRE, V_APELLIDO, V_SALARIO;
           EXIT WHEN MICURSOR_DETALLE%NOTFOUND;
           DBMS_OUTPUT.PUT_LINE('Nombre: ' || V_NOMBRE || ', Apellido: ' || V_APELLIDO || ', Salario: ' || V_SALARIO);
        END LOOP;
     CLOSE MICURSOR_DETALLE;
    END;`;

    // Ejecutar bloque PL/SQL
    await connection.execute(bloquePLSQL);

    // Leer línea por línea la salida de DBMS_OUTPUT
    let more = true;
    let resultados = [];

    while (more) {
      const result = await connection.execute(
        `BEGIN DBMS_OUTPUT.GET_LINE(:line, :status); END;`,
        {
          line: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 },
          status: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );

      if (result.outBinds.status === 1) {
        more = false; // ya no hay más líneas
      } else {
        resultados.push(result.outBinds.line);
      }
    }

    // Deshabilitar DBMS_OUTPUT
    await connection.execute(`BEGIN DBMS_OUTPUT.DISABLE(); END;`);

    // Devolver resultados y consulta en JSON
    res.json({
      empleados: resultados,
      consulta: bloquePLSQL
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
  }
});



app.get('/listar-empleados', async (req, res) => {
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);


    await connection.execute(`BEGIN DBMS_OUTPUT.ENABLE(NULL); END;`);
    const bloquePLSQL = `
      DECLARE
        CURSOR MICURSOR_LKBC IS SELECT FIRST_NAME, LAST_NAME FROM HR.EMPLOYEES;
        V_NOMBRE_LKBC   HR.EMPLOYEES.FIRST_NAME%TYPE;
        V_APELLIDO_LKBC HR.EMPLOYEES.LAST_NAME%TYPE;
      BEGIN
        OPEN MICURSOR_LKBC;
        LOOP
          FETCH MICURSOR_LKBC INTO V_NOMBRE_LKBC, V_APELLIDO_LKBC;
          EXIT WHEN MICURSOR_LKBC%NOTFOUND;
          DBMS_OUTPUT.PUT_LINE('NOMBRE: ' || V_NOMBRE_LKBC || ', APELLIDO: ' || V_APELLIDO_LKBC);
        END LOOP;
        CLOSE MICURSOR_LKBC;
      END;`;

    await connection.execute(bloquePLSQL);
    let more = true;
    let resultados = [];

    while (more) {
      const result = await connection.execute(
        `BEGIN DBMS_OUTPUT.GET_LINE(:line, :status); END;`,
        {
          line: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 },
          status: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );

      if (result.outBinds.status === 1) {
        more = false;
      } else {
        resultados.push(result.outBinds.line);
      }
    }

    await connection.execute(`BEGIN DBMS_OUTPUT.DISABLE(); END;`);

    res.json({
      empleados: resultados,
      consulta: bloquePLSQL
    });


  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error ejecutando bloque PL/SQL', details: err.message });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { }
    }
  }
});

app.get('/listar-nombre-email', async (req, res) => {
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    await connection.execute(`BEGIN DBMS_OUTPUT.ENABLE(NULL); END;`);

    const bloquePLSQL = `
      DECLARE
          CURSOR MICURSOR_EMAIL IS
          SELECT FIRST_NAME, EMAIL FROM HR.EMPLOYEES;

         V_NOMBRE HR.EMPLOYEES.FIRST_NAME%TYPE;
         V_EMAIL  HR.EMPLOYEES.EMAIL%TYPE;
      BEGIN
           OPEN MICURSOR_EMAIL;
           LOOP
           FETCH MICURSOR_EMAIL INTO V_NOMBRE, V_EMAIL;
           EXIT WHEN MICURSOR_EMAIL%NOTFOUND;
           DBMS_OUTPUT.PUT_LINE('Nombre: ' || V_NOMBRE || ', Email: ' || V_EMAIL);
         END LOOP;
       CLOSE MICURSOR_EMAIL;
     END;`;

    await connection.execute(bloquePLSQL);

    let more = true;
    let resultados = [];

    while (more) {
      const result = await connection.execute(
        `BEGIN DBMS_OUTPUT.GET_LINE(:line, :status); END;`,
        {
          line: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 },
          status: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );

      if (result.outBinds.status === 1) {
        more = false;
      } else {
        resultados.push(result.outBinds.line);
      }
    }

    await connection.execute(`BEGIN DBMS_OUTPUT.DISABLE(); END;`);
    res.json({
      empleados: resultados,
      consulta: bloquePLSQL
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
  }
});

app.get('/listar-nombre-phone', async (req, res) => {
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    await connection.execute(`BEGIN DBMS_OUTPUT.ENABLE(NULL); END;`);

    const bloquePLSQL = `
      DECLARE
          CURSOR MICURSOR_EMAIL IS
          SELECT FIRST_NAME, EMAIL FROM HR.EMPLOYEES;

          V_NOMBRE HR.EMPLOYEES.FIRST_NAME%TYPE;
          V_EMAIL  HR.EMPLOYEES.EMAIL%TYPE;
      BEGIN
           OPEN MICURSOR_EMAIL;
           LOOP
           FETCH MICURSOR_EMAIL INTO V_NOMBRE, V_EMAIL;
           EXIT WHEN MICURSOR_EMAIL%NOTFOUND;
           DBMS_OUTPUT.PUT_LINE('Nombre: ' || V_NOMBRE || ', Email: ' || V_EMAIL);
      END LOOP;
      CLOSE MICURSOR_EMAIL;
    END;`;

    await connection.execute(bloquePLSQL);

    let more = true;
    let resultados = [];

    while (more) {
      const result = await connection.execute(
        `BEGIN DBMS_OUTPUT.GET_LINE(:line, :status); END;`,
        {
          line: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 },
          status: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );

      if (result.outBinds.status === 1) {
        more = false;
      } else {
        resultados.push(result.outBinds.line);
      }
    }


    await connection.execute(`BEGIN DBMS_OUTPUT.DISABLE(); END;`);
    res.json({
      empleados: resultados,
      consulta: bloquePLSQL
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
  }
});



//Ejercicos en clase
app.get('/proc/mensaje-estatico', async (req, res) => {
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    await connection.execute(`BEGIN DBMS_OUTPUT.ENABLE(NULL); END;`);

    const bloquePLSQL = `
      DECLARE
        V_MIVARIABLE VARCHAR(20) := 'HOLA MUNDO';
      BEGIN
        DBMS_OUTPUT.PUT_LINE(V_MIVARIABLE);
        DBMS_OUTPUT.PUT_LINE('FIN DEL PROGRAMA');
      END;`;

    await connection.execute(bloquePLSQL);

    const resultados = [];
    let done = false;

    while (!done) {
      const result = await connection.execute(
        `BEGIN DBMS_OUTPUT.GET_LINE(:line, :status); END;`,
        {
          line: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 },
          status: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );

      if (result.outBinds.status === 1) {
        done = true;
      } else {
        resultados.push(result.outBinds.line);
      }
    }

    await connection.execute(`BEGIN DBMS_OUTPUT.DISABLE(); END;`);

    res.json({
      salida: resultados.join('\n'),
      codigo: bloquePLSQL.trim()
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
  }
});



app.get('/proc/sumar-numeros', async (req, res) => {
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    await connection.execute(`BEGIN DBMS_OUTPUT.ENABLE(NULL); END;`);

    const bloquePLSQL = `
     DECLARE
        V_NUM1 NUMBER(4,2) := 10.2;
        V_NUM2 NUMBER(4,2) := 20.1;
      BEGIN
        DBMS_OUTPUT.PUT_LINE('LA SUMA ES: ' || TO_CHAR(V_NUM1 + V_NUM2));
      END;`;

    await connection.execute(bloquePLSQL);

    const resultados = [];
    let more = true;

    while (more) {
      const result = await connection.execute(
        `BEGIN DBMS_OUTPUT.GET_LINE(:line, :status); END;`,
        {
          line: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 },
          status: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );

      if (result.outBinds.status === 1) {
        more = false;
      } else {
        resultados.push(result.outBinds.line);
      }
    }

    await connection.execute(`BEGIN DBMS_OUTPUT.DISABLE(); END;`);

    res.json({
      salida: resultados.join('\n'),
      codigo: bloquePLSQL.trim()
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
  }
});





app.get('/proc/fecha-creacion-db', async (req, res) => {
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    await connection.execute(`BEGIN DBMS_OUTPUT.ENABLE(NULL); END;`);

    const bloquePLSQL = `
      DECLARE
        V_FECHA V$DATABASE.CREATED%TYPE;
      BEGIN
        SELECT CREATED INTO V_FECHA FROM V$DATABASE;
        DBMS_OUTPUT.PUT_LINE('LA FECHA DE CREACION DE LA BASE DE DATOS FUE: ' || TO_CHAR(V_FECHA, 'DDMMYYYY'));
      END;`;

    await connection.execute(bloquePLSQL);

    const resultados = [];
    let more = true;

    while (more) {
      const result = await connection.execute(
        `BEGIN DBMS_OUTPUT.GET_LINE(:line, :status); END;`,
        {
          line: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 },
          status: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );

      if (result.outBinds.status === 1) {
        more = false;
      } else {
        resultados.push(result.outBinds.line);
      }
    }

    await connection.execute(`BEGIN DBMS_OUTPUT.DISABLE(); END;`);

    res.json({
      salida: resultados.join('\n'),
      codigo: bloquePLSQL.trim()
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
  }
});


app.get('/proc/nombre-fecha-db', async (req, res) => {
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    await connection.execute(`BEGIN DBMS_OUTPUT.ENABLE(NULL); END;`);

    const bloquePLSQL = `
      DECLARE
        v_name VARCHAR2(50);
        v_date DATE;
      BEGIN
        SELECT NAME, CREATED INTO v_name, v_date FROM SYS.V_$DATABASE;
        DBMS_OUTPUT.PUT_LINE('El nombre de la base de datos es: ' || v_name);
        DBMS_OUTPUT.PUT_LINE('Fue creada en la siguiente fecha: ' || TO_CHAR(v_date, 'YYYY-MM-DD HH24:MI:SS'));
      END;`;

    await connection.execute(bloquePLSQL);

    const resultados = [];
    let more = true;

    while (more) {
      const result = await connection.execute(
        `BEGIN DBMS_OUTPUT.GET_LINE(:line, :status); END;`,
        {
          line: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 },
          status: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );

      if (result.outBinds.status === 1) {
        more = false;
      } else {
        resultados.push(result.outBinds.line);
      }
    }

    await connection.execute(`BEGIN DBMS_OUTPUT.DISABLE(); END;`);

    res.json({
      salida: resultados.join('\n'),
      codigo: bloquePLSQL.trim()
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
  }
});


app.get('/proc/contar-empleados', async (req, res) => {
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    await connection.execute(`BEGIN DBMS_OUTPUT.ENABLE(NULL); END;`);

    const bloquePLSQL = `
      DECLARE
        VAR_TOTAL INTEGER;
      BEGIN
        SELECT COUNT(*) INTO VAR_TOTAL FROM HR.EMPLOYEES;
        DBMS_OUTPUT.PUT_LINE('El total de empleados es: ' || VAR_TOTAL);
      END;`;

    await connection.execute(bloquePLSQL);

    let more = true;
    const resultados = [];

    while (more) {
      const result = await connection.execute(
        `BEGIN DBMS_OUTPUT.GET_LINE(:line, :status); END;`,
        {
          line: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 },
          status: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );

      if (result.outBinds.status === 1) {
        more = false;
      } else {
        resultados.push(result.outBinds.line);
      }
    }

    await connection.execute(`BEGIN DBMS_OUTPUT.DISABLE(); END;`);

    res.json({
      salida: resultados.join('\n'),
      codigo: bloquePLSQL.trim()
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
  }
});
//Ejercicios en clase 12/06/2025

app.get('/proc/verificar-fecha-creacion', async (req, res) => {
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    // Habilita DBMS_OUTPUT
    await connection.execute(`BEGIN DBMS_OUTPUT.ENABLE(NULL); END;`);

    const bloquePLSQL = `
      DECLARE
          V_FECHA V$DATABASE.CREATED%TYPE;
      BEGIN
          SELECT CREATED INTO V_FECHA FROM V$DATABASE;

          IF (SYSDATE - V_FECHA > 30) THEN
              DBMS_OUTPUT.PUT_LINE('LA BASE DE DATOS FUE CREADA HACE MÁS DE 30 DÍAS.');
          ELSE
              DBMS_OUTPUT.PUT_LINE('LA BASE DE DATOS FUE CREADA HACE MENOS DE 30 DÍAS.');
          END IF;
      END;`;

    await connection.execute(bloquePLSQL);

    let more = true;
    const resultados = [];

    while (more) {
      const result = await connection.execute(
        `BEGIN DBMS_OUTPUT.GET_LINE(:line, :status); END;`,
        {
          line: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 },
          status: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );

      if (result.outBinds.status === 1) {
        more = false;
      } else {
        resultados.push(result.outBinds.line);
      }
    }

    await connection.execute(`BEGIN DBMS_OUTPUT.DISABLE(); END;`);

    res.json({
      salida: resultados.join('\n'),
      codigo: bloquePLSQL.trim()
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
  }
});
app.get('/procedimientosnumeros', async (req, res) => {
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    await connection.execute(`BEGIN DBMS_OUTPUT.ENABLE(NULL); END;`);

    const bloquePLSQL = `

DECLARE
    v_num NUMBER;
    v_max NUMBER;
BEGIN
    -- Obtenemos el valor máximo actual de la tabla
    SELECT NVL(MAX(numero), 0) INTO v_max FROM hr.tbl_num;

    -- Inicializamos el contador en el siguiente número
    v_num := v_max + 1;

    -- Insertamos los siguientes 10 números
    FOR i IN 1..10 LOOP
        INSERT INTO hr.tbl_num (numero) VALUES (v_num);
        DBMS_OUTPUT.PUT_LINE('Insertado NUMERO: ' || v_num);
        v_num := v_num + 1;
    END LOOP;

    COMMIT;  -- Confirmamos los cambios
END;
    `;

    // Ejecutar el bloque PL/SQL que inserta
    await connection.execute(bloquePLSQL);

    // Obtener salida de DBMS_OUTPUT
    const resultados = [];
    let more = true;
    while (more) {
      const result = await connection.execute(
        `BEGIN DBMS_OUTPUT.GET_LINE(:line, :status); END;`,
        {
          line: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 },
          status: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );
      if (result.outBinds.status === 1) {
        more = false;
      } else {
        resultados.push(result.outBinds.line);
      }
    }
    await connection.execute(`BEGIN DBMS_OUTPUT.DISABLE(); END;`);

    // Consulta para traer todos los números de la tabla
    const queryResult = await connection.execute(
      `SELECT numero FROM hr.tbl_num ORDER BY numero`
    );

    // Construir arreglo simple con los números
    const numerosEnTabla = queryResult.rows.map(row => row[0]);

    // Enviar respuesta JSON con salida DBMS_OUTPUT y contenido tabla
    res.json({
      salida: resultados.join('\n'),
      codigo: bloquePLSQL.trim(),
      numeros: numerosEnTabla
    });

  } catch (err) {
    console.error('Error en /procedimientosnumeros:', err);
    res.status(500).json({
      error: err.message,
      stack: err.stack,
      code: err.errorNum || 'N/A'
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error cerrando conexión:', err);
      }
    }
  }
});


app.get('/procedimientosfor', async (req, res) => {
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    await connection.execute(`BEGIN DBMS_OUTPUT.ENABLE(NULL); END;`);

    const bloquePLSQL = `
      BEGIN
          -- Bucle FOR que recorre los números del 1 al 10
          FOR V_NUM IN 1..10 LOOP
              -- Imprime el valor actual de V_NUM
              DBMS_OUTPUT.PUT_LINE('NUMERO: ' || TO_CHAR(V_NUM));
          END LOOP;
      END;
    `;

    await connection.execute(bloquePLSQL);

    const resultados = [];
    let more = true;
    while (more) {
      const result = await connection.execute(
        `BEGIN DBMS_OUTPUT.GET_LINE(:line, :status); END;`,
        {
          line: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 },
          status: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );
      if (result.outBinds.status === 1) {
        more = false;
      } else {
        resultados.push(result.outBinds.line);
      }
    }

    await connection.execute(`BEGIN DBMS_OUTPUT.DISABLE(); END;`);

    res.json({
      salida: resultados.join('\n'),
      codigo: bloquePLSQL.trim()
    });

  } catch (err) {
    console.error('Error en /procedimientosfor:', err);
    res.status(500).json({
      error: err.message,
      stack: err.stack,
      code: err.errorNum || 'N/A'
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error cerrando conexión:', err);
      }
    }
  }
});


//Prueba 18/06/2025
app.get('/procedimientosActualizarEstudiantes', async (req, res) => {
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    // 1. Habilitar DBMS_OUTPUT
    await connection.execute(`BEGIN DBMS_OUTPUT.ENABLE(NULL); END;`);

    // 2. Bloque PL/SQL
    const bloquePLSQL = `
DECLARE
  CURSOR c_estudiantes IS
    SELECT id_estudiante, nombres, apellidos
    FROM HR.estudiantes
    WHERE correo_electronico IS NULL;

  estuduante_id                HR.estudiantes.id_estudiante%TYPE;
  estuduante_nombres           HR.estudiantes.nombres%TYPE;
  estuduante_apellidos         HR.estudiantes.apellidos%TYPE;

  estuduante_nombre1           VARCHAR2(50);
  estuduante_nombre2           VARCHAR2(50);
  apellido_palabras            DBMS_SQL.VARCHAR2_TABLE;
  apellido_compuesto           VARCHAR2(100);
  inicial_apellido_final       VARCHAR2(1);
  estuduante_usuario_correo    VARCHAR2(100);
  estuduante_correo_final      VARCHAR2(100);
  estuduante_password          VARCHAR2(100);
  v_contador                   NUMBER := 0;

  FUNCTION quitar_tildes(p_texto VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN TRANSLATE(p_texto, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN');
  END;
BEGIN
  FOR est IN c_estudiantes LOOP
    v_contador := v_contador + 1;

    estuduante_id := est.id_estudiante;
    estuduante_nombres := est.nombres;
    estuduante_apellidos := est.apellidos;

    estuduante_nombre1 := REGEXP_SUBSTR(estuduante_nombres, '^\S+');
    estuduante_nombre2 := REGEXP_SUBSTR(estuduante_nombres, '\S+', 1, 2);

    apellido_compuesto := '';
    FOR i IN 1 .. REGEXP_COUNT(estuduante_apellidos, '\S+') LOOP
      apellido_palabras(i) := REGEXP_SUBSTR(estuduante_apellidos, '\S+', 1, i);
    END LOOP;

    IF apellido_palabras.COUNT > 2 THEN
      FOR i IN 1 .. apellido_palabras.COUNT - 1 LOOP
        apellido_compuesto := apellido_compuesto || apellido_palabras(i);
      END LOOP;
    ELSE
      apellido_compuesto := apellido_palabras(1);
    END IF;

    inicial_apellido_final := SUBSTR(apellido_palabras(apellido_palabras.COUNT), 1, 1);

    estuduante_usuario_correo := LOWER(
      SUBSTR(estuduante_nombre1, 1, 1) ||
      SUBSTR(estuduante_nombre2, 1, 1) ||
      quitar_tildes(apellido_compuesto)
    );

    estuduante_correo_final := estuduante_usuario_correo || '@modsoft.edu.ec';

    estuduante_password := INITCAP(SUBSTR(estuduante_nombre1, 1, 1) ||
                            LOWER(quitar_tildes(apellido_compuesto))) ||
                            (LENGTH(estuduante_usuario_correo) - 1);

    UPDATE HR.estudiantes
    SET correo_electronico = estuduante_correo_final,
        fecha_creacion     = SYSDATE,
        hora_creacion      = SYSTIMESTAMP,
        password           = estuduante_password
    WHERE id_estudiante = estuduante_id;

    DBMS_OUTPUT.PUT_LINE('Actualizado ID ' || estuduante_id || ' → ' || estuduante_correo_final || ' / ' || estuduante_password);
  END LOOP;

  DBMS_OUTPUT.PUT_LINE('Total estudiantes actualizados: ' || v_contador);
END;
    `;

    // 3. Ejecutar bloque
    await connection.execute(bloquePLSQL);

    // 4. Leer DBMS_OUTPUT
    const resultados = [];
    let more = true;
    while (more) {
      const result = await connection.execute(
        `BEGIN DBMS_OUTPUT.GET_LINE(:line, :status); END;`,
        {
          line: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 },
          status: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );
      if (result.outBinds.status === 1) {
        more = false;
      } else {
        resultados.push(result.outBinds.line);
      }
    }

    await connection.execute(`BEGIN DBMS_OUTPUT.DISABLE(); END;`);

    // 5. Consultar estudiantes actualizados hoy
    const selectResult = await connection.execute(
      `SELECT id_estudiante, correo_electronico, password
         FROM HR.estudiantes
        WHERE TRUNC(fecha_creacion) = TRUNC(SYSDATE)`
    );
    const actualizados = selectResult.rows.map(row => ({
      id_estudiante: row[0],
      correo: row[1],
      password: row[2]
    }));

    // 6. Verificar cuántos aún no tienen correo
    const sinCorreoResult = await connection.execute(
      `SELECT COUNT(*) FROM HR.estudiantes WHERE correo_electronico IS NULL`
    );
    const sinCorreo = sinCorreoResult.rows[0][0];

    // 7. Respuesta final
    res.json({
      salida: resultados.join('\n'),
      codigo: bloquePLSQL.trim(),
      estudiantes_actualizados: actualizados,
      estudiantes_sin_correo: sinCorreo
    });

  } catch (err) {
    console.error('Error en /procedimientosActualizarEstudiantes:', err);
    res.status(500).json({
      error: err.message,
      stack: err.stack,
      code: err.errorNum || 'N/A'
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error cerrando conexión:', err);
      }
    }
  }
});


app.get('/procedimientoValidarCedula/:cedula', async (req, res) => {
  let connection;
  const nroCedula = req.params.cedula;

  try {
    connection = await oracledb.getConnection(dbConfig);

    // Activar DBMS_OUTPUT
    await connection.execute(`BEGIN DBMS_OUTPUT.ENABLE(NULL); END;`);

    const bloquePLSQL = `
DECLARE
    v_cedula VARCHAR2(10) := '${nroCedula}';

    CURSOR cedula_cursor IS
        SELECT v_cedula AS nro_cedula FROM dual;

    coeficientes SYS.OdciNumberList := SYS.OdciNumberList(2,1,2,1,2,1,2,1,2);
    suma NUMBER := 0;
    verificador NUMBER;
    digito_verificador NUMBER;
    i NUMBER;
BEGIN
    FOR ced IN cedula_cursor LOOP
        IF LENGTH(ced.nro_cedula) != 10 THEN
            DBMS_OUTPUT.PUT_LINE('❌ La cédula debe tener 10 dígitos.');
            RETURN;
        END IF;

        IF NOT REGEXP_LIKE(ced.nro_cedula, '^\\d{10}$') THEN
            DBMS_OUTPUT.PUT_LINE('❌ La cédula contiene caracteres no numéricos.');
            RETURN;
        END IF;

        IF TO_NUMBER(SUBSTR(ced.nro_cedula, 1, 2)) NOT BETWEEN 1 AND 24 THEN
            DBMS_OUTPUT.PUT_LINE('❌ Código de provincia inválido.');
            RETURN;
        END IF;

        IF TO_NUMBER(SUBSTR(ced.nro_cedula, 3, 1)) > 5 THEN
            DBMS_OUTPUT.PUT_LINE('❌ Tercer dígito inválido.');
            RETURN;
        END IF;

        suma := 0;
        FOR i IN 1..9 LOOP
            DECLARE
                digito NUMBER := TO_NUMBER(SUBSTR(ced.nro_cedula, i, 1));
                producto NUMBER := digito * coeficientes(i);
            BEGIN
                IF producto >= 10 THEN
                    producto := producto - 9; 
                END IF;
                suma := suma + producto;
            END;
        END LOOP;

        verificador := 10 - MOD(suma, 10);
        IF verificador = 10 THEN
            verificador := 0;
        END IF;

        digito_verificador := TO_NUMBER(SUBSTR(ced.nro_cedula, 10, 1));

        IF digito_verificador = verificador THEN
            BEGIN
                INSERT INTO hr.t_cedula (NRO_CEDULA) VALUES (ced.nro_cedula);
                COMMIT;
                DBMS_OUTPUT.PUT_LINE('✅ Cédula válida e insertada: ' || ced.nro_cedula);
            EXCEPTION
                WHEN DUP_VAL_ON_INDEX THEN
                    DBMS_OUTPUT.PUT_LINE('⚠️ Cédula ya registrada.');
                WHEN OTHERS THEN
                    DBMS_OUTPUT.PUT_LINE('❌ Error al insertar: ' || SQLERRM);
            END;
        ELSE
            DBMS_OUTPUT.PUT_LINE('❌ Dígito verificador inválido. Se esperaba: ' || verificador);
        END IF;
    END LOOP;
END;
`;

    // Ejecutar bloque PL/SQL
    await connection.execute(bloquePLSQL);

    // Leer salida de DBMS_OUTPUT
    const resultados = [];
    let more = true;
    while (more) {
      const result = await connection.execute(
        `BEGIN DBMS_OUTPUT.GET_LINE(:line, :status); END;`,
        {
          line: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32767 },
          status: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );
      if (result.outBinds.status === 1) {
        more = false;
      } else {
        resultados.push(result.outBinds.line);
      }
    }

    await connection.execute(`BEGIN DBMS_OUTPUT.DISABLE(); END;`);

    // Ahora hacer un SELECT para traer todas las cédulas guardadas
    const selectResult = await connection.execute(
      `SELECT ID, NRO_CEDULA FROM hr.t_cedula ORDER BY ID`
    );

    res.json({
      mensaje: resultados.join('\n'),
      cedulas_guardadas: selectResult.rows.map(row => ({
        id: row[0],
        nro_cedula: row[1]
      })),
      codigo: bloquePLSQL.trim(),
      cedula_validada: nroCedula
    });

  } catch (err) {
    console.error('Error en /procedimientoValidarCedula:', err);
    res.status(500).json({
      error: err.message,
      stack: err.stack,
      code: err.errorNum || 'N/A'
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error cerrando conexión:', err);
      }
    }
  }
});


//Ejercico clase 25/06/2025
//consultar todas las tablas de la base de datos

app.get('/api/tablas', async (req, res) => {
  try {
    const connection = await oracledb.getConnection(dbConfig);

    // Si quieres tablas del esquema HR explícitamente:
    const result = await connection.execute(`
      SELECT table_name FROM all_tables WHERE owner = 'HR' ORDER BY table_name
    `);
    await connection.close();

    const tablas = result.rows.map(row => row[0]);
    res.json({ tablas });
  } catch (err) {
    console.error('❌ Error al obtener tablas:', err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint obtener columnas de una tabla
app.get('/api/columnas/:tabla', async (req, res) => {
  const tabla = req.params.tabla.toUpperCase();

  try {
    const connection = await oracledb.getConnection(dbConfig);

    const result = await connection.execute(
      `SELECT column_name FROM user_tab_columns WHERE table_name = :tabla ORDER BY column_id`,
      [tabla]
    );
    await connection.close();

    const columnas = result.rows.map(row => row[0]);
    res.json({ columnas });
  } catch (err) {
    console.error('❌ Error al obtener columnas:', err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint ver o descargar datos
app.post('/api/ver-datos/:tabla', async (req, res) => {
  const tabla = req.params.tabla.replace(/"/g, '');
  const columnas = req.body.columnas;
  const separadorInput = req.body.separador || ',';
  const accion = req.body.accion;

  if (!columnas) {
    return res.status(400).json({ error: 'Debes seleccionar al menos una columna.' });
  }

  const columnasSeleccionadas = Array.isArray(columnas) ? columnas : [columnas];

  const separadorMap = {
    ',': ',',
    ';': ';',
    ' ': ' ',
    '\\': '\\',
    'tab': '\t',
    'linea': os.EOL
  };
  const separador = separadorMap[separadorInput] || ',';

  try {
    const connection = await oracledb.getConnection(dbConfig);

    const colsSQL = columnasSeleccionadas.map(col => `"${col.replace(/"/g, '')}"`).join(', ');
    const query = `SELECT ${colsSQL} FROM "${tabla.toUpperCase()}" FETCH FIRST 50 ROWS ONLY`;
    const result = await connection.execute(query);
    await connection.close();

    const content = result.rows.map(row => row.join(separador)).join(os.EOL);

    if (accion === 'ver') {
      res.json({ contenido: content });
    } else if (accion === 'descargar') {
      const tempDir = path.join(__dirname, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
      }
      const filename = `datos_${tabla}.txt`;
      const filepath = path.join(tempDir, filename);

      fs.writeFileSync(filepath, content);

      res.download(filepath, filename, (err) => {
        if (err) {
          console.error('Error al enviar archivo:', err);
          res.status(500).end();
        }
        fs.unlink(filepath, (unlinkErr) => {
          if (unlinkErr) console.error('Error eliminando archivo:', unlinkErr);
        });
      });
    } else {
      res.status(400).json({ error: 'Acción inválida' });
    }
  } catch (err) {
    console.error('❌ Error en ver-datos:', err);
    res.status(500).json({ error: err.message });
  }
});


// Página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ventana.html'));
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`Servidor iniciado en http://localhost:${port}`);
});

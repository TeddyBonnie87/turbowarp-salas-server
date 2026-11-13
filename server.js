const WebSocket = require('ws');
const http = require('http');

// Crear servidor HTTP básico para mantener activo el servicio en la nube
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Servidor de TurboWarp Salas Activo\n');
});

const wss = new WebSocket.Server({ server });

// Estructura para guardar salas y variables
const rooms = {}; 

wss.on('connection', (ws) => {
    ws.room = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.action === 'join_room') {
                // Salir de la sala anterior si estaba en una
                leaveCurrentRoom(ws);

                ws.room = data.room;
                ws.roomName = data.roomName || 'Sala sin nombre';

                if (!rooms[ws.room]) {
                    rooms[ws.room] = {
                        name: ws.roomName,
                        clients: new Set(),
                        vars: {}
                    };
                }

                rooms[ws.room].clients.add(ws);
                broadcastPublicRooms();
                
                // Enviar variables actuales de la sala al nuevo jugador
                ws.send(JSON.stringify({
                    type: 'update_vars',
                    vars: rooms[ws.room].vars
                }));

            } else if (data.action === 'update_var') {
                const roomCode = data.room;
                if (rooms[roomCode]) {
                    // Actualizar el valor en la sala
                    rooms[roomCode].vars[data.varName] = data.varValue;

                    // Reenviar la actualización a TODOS los clientes de la misma sala
                    const updatePayload = JSON.stringify({
                        type: 'update_vars',
                        vars: rooms[roomCode].vars
                    });

                    rooms[roomCode].clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(updatePayload);
                        }
                    });
                }
            }
        } catch (e) {
            console.error('Error procesando mensaje:', e);
        }
    });

    ws.on('close', () => {
        leaveCurrentRoom(ws);
    });
});

function leaveCurrentRoom(ws) {
    if (ws.room && rooms[ws.room]) {
        rooms[ws.room].clients.delete(ws);
        // Si la sala se queda vacía, la borramos para limpiar memoria
        if (rooms[ws.room].clients.size === 0) {
            delete rooms[ws.room];
        }
        broadcastPublicRooms();
    }
}

function broadcastPublicRooms() {
    const publicList = [];
    for (const code in rooms) {
        publicList.push({
            code: code,
            name: rooms[code].name,
            players: rooms[code].clients.size
        });
    }

    const payload = JSON.stringify({
        type: 'public_rooms_list',
        rooms: publicList
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// Escuchar en el puerto que asigne la plataforma en la nube (o el puerto 3000 por defecto)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
  

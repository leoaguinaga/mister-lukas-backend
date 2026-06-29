const net = require('net');

const ip = '192.168.18.87';
const ports = [9100, 9101, 9102, 80, 8000, 9000];

console.log(`Probando puertos de conexión en la IP de cocina ${ip}...`);

ports.forEach((port) => {
  const socket = new net.Socket();
  socket.setTimeout(2500);
  
  socket.connect(port, ip, () => {
    console.log(`\x1b[32m[OK] ¡Puerto ${port} está ABIERTO y responde!\x1b[0m`);
    socket.destroy();
  });
  
  socket.on('error', () => {
    socket.destroy();
  });
  
  socket.on('timeout', () => {
    socket.destroy();
  });
});

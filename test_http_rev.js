const http = require('http');

http.get('http://localhost:5000/api/v1/payments/admin/revenue?filter=Month', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    console.log('HTTP Response:', data);
  });
}).on('error', err => console.error('HTTP Error:', err.message));

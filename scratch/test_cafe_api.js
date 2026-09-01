const http = require('http');

http.get('http://localhost:3000/api/v1/cafes/79e55e5d-deb2-489a-9552-07fdad758af1', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status code:', res.statusCode);
    console.log('Response body:', data);
  });
}).on('error', (err) => {
  console.error('Fetch error:', err.message);
});

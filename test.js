const bcrypt = require('bcrypt');

const plainPassword = 'sithu123@A';
const storedHash = '$2b$12$HcGNJxsoI5QCjSWERdlmsejD2AenesKXsCqcZ1ZdkOGzzAJqobzW.';

bcrypt.compare(plainPassword, storedHash)
  .then(result => {
    console.log('✅ Match:', result);
  })
  .catch(err => {
    console.error('❌ Error:', err);
  });

document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('button.btn-primary').addEventListener('click', () => {
      validateAndSubmit();
    });
  });
  
  async function validateAndSubmit() {
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const privacy = document.getElementById('privacy').checked;
  
    const payload = {
      name,
      email,
      password,
      confirmPassword,
      privacy
    };
  
    try {
      const res = await fetch('/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
  
      const data = await res.json();
  
      if (!data.success) {
        showErrors(data.errors);
      } else {
        alert('Signup successful! Redirecting...');
        window.location.href = '/login';
      }
    } catch (err) {
      console.error('Error:', err);
    }
  }
  
  function showErrors(errors) {
    const alertBox = document.querySelector('.alert-error');
    if (alertBox) alertBox.remove();
  
    const form = document.getElementById('signupForm');
    const div = document.createElement('div');
    div.className = 'alert alert-error';
  
    errors.forEach(err => {
      const p = document.createElement('p');
      p.textContent = err.msg;
      div.appendChild(p);
    });
  
    form.parentNode.insertBefore(div, form);
  }
  
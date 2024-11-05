document.addEventListener('DOMContentLoaded', function() {
    // Password visibility toggle
    const passwordToggleBtns = document.querySelectorAll('.password-toggle-btn');
    
    passwordToggleBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const passwordField = this.parentElement.querySelector('input');
            const icon = this.querySelector('i');
            
            if (passwordField.type === 'password') {
                passwordField.type = 'text';
                icon.classList.remove('bi-eye');
                icon.classList.add('bi-eye-slash');
            } else {
                passwordField.type = 'password';
                icon.classList.remove('bi-eye-slash');
                icon.classList.add('bi-eye');
            }
        });
    });

    // Form validation
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
        form.addEventListener('submit', function(event) {
            const passwordField = form.querySelector('input[type="password"]');
            if (passwordField) {
                const password = passwordField.value;
                
                // Password validation
                if (password.length < 8) {
                    event.preventDefault();
                    alert('Password must be at least 8 characters long');
                    return;
                }
                
                if (!/[A-Z]/.test(password) || 
                    !/[a-z]/.test(password) || 
                    !/[0-9]/.test(password) || 
                    !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
                    event.preventDefault();
                    alert('Password must contain uppercase, lowercase, numbers, and special characters');
                    return;
                }
            }
            
            // Sanitize all input fields
            const inputs = form.querySelectorAll('input[type="text"], textarea');
            inputs.forEach(input => {
                input.value = input.value.replace(/[<>]/g, '');
            });
        });
    });
});

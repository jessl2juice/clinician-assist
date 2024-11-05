document.addEventListener('DOMContentLoaded', function() {
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
        form.addEventListener('submit', function(event) {
            const passwordField = form.querySelector('input[type="password"]');
            if (passwordField) {
                const password = passwordField.value;
                
                // Password validation
                if (password.length < 12) {
                    event.preventDefault();
                    alert('Password must be at least 12 characters long');
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

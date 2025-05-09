// Toggle password visibility
function togglePassword(inputId) {
    const passwordInput = document.getElementById(inputId);
    const toggleIcon = passwordInput.nextElementSibling;
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.classList.remove('fa-eye-slash');
        toggleIcon.classList.add('fa-eye');
    } else {
        passwordInput.type = 'password';
        toggleIcon.classList.remove('fa-eye');
        toggleIcon.classList.add('fa-eye-slash');
    }
}

// Password validation
function validatePassword(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    const errors = [];
    if (password.length < minLength) {
        errors.push("Password must be at least 8 characters long");
    }
    if (!hasUpperCase) {
        errors.push("Include at least one uppercase letter");
    }
    if (!hasLowerCase) {
        errors.push("Include at least one lowercase letter");
    }
    if (!hasNumbers) {
        errors.push("Include at least one number");
    }
    if (!hasSpecialChar) {
        errors.push("Include at least one special character");
    }

    return errors;
}

// Email validation
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Username validation
function validateUsername(username) {
    const usernameRegex = /^[a-zA-Z0-9_]{4,20}$/;
    return usernameRegex.test(username);
}

async function register(event) {
    event.preventDefault();
    
    // Get form values
    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const role = document.getElementById('role').value;
    const agreeTerms = document.getElementById('agreeTerms').checked;
    
    // Validation
    if (!fullName || !email || !username || !password || !confirmPassword || !role) {
        showError("Please fill in all fields");
        return false;
    }

    if (!validateEmail(email)) {
        showError("Please enter a valid email address");
        return false;
    }

    if (!validateUsername(username)) {
        showError("Username must be 4-20 characters long and can only contain letters, numbers, and underscores");
        return false;
    }

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
        showError(passwordErrors.join("<br>"));
        return false;
    }

    if (password !== confirmPassword) {
        showError("Passwords do not match");
        return false;
    }

    if (!agreeTerms) {
        showError("Please agree to the Terms and Privacy Policy");
        return false;
    }

    // Prepare user data
    const userData = {
        fullName,
        email,
        username,
        password,
        role
    };

    // Get the submit button
    const submitButton = document.querySelector('button[type="submit"]');
    const originalButtonContent = submitButton.innerHTML;

    // Show loading state
    submitButton.innerHTML = `
      
      <span>Creating Account...</span>
    `;
    submitButton.disabled = true;

    try {
        const response = await fetch('http://localhost:3000/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        if (data.success) {
            showSuccess("Account created successfully! Redirecting to login...");
            setTimeout(() => {
                window.location.href = "index.html";
            }, 2000);
        } else {
            showError(data.message || "Registration failed");
            submitButton.innerHTML = originalButtonContent;
            submitButton.disabled = false;
        }
    } catch (error) {
        showError("Error creating account. Please try again.");
        submitButton.innerHTML = originalButtonContent;
        submitButton.disabled = false;
        console.error('Error saving user:', error);
    }

    return false;
}

function showError(message) {
    // Remove any existing messages
    removeMessages();
    
    // Create and show new error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        <span>${message}</span>
    `;
    
    const form = document.getElementById('registerForm');
    form.insertBefore(errorDiv, form.firstChild);
    
    // Auto-remove error message after 5 seconds
    setTimeout(() => {
        errorDiv.style.opacity = '0';
        setTimeout(() => errorDiv.remove(), 300);
    }, 5000);
}

function showSuccess(message) {
    // Remove any existing messages
    removeMessages();
    
    // Create and show new success message
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.innerHTML = `
        <i class="fas fa-check-circle"></i>
        <span>${message}</span>
    `;
    
    const form = document.getElementById('registerForm');
    form.insertBefore(successDiv, form.firstChild);
}

function removeMessages() {
    const messages = document.querySelectorAll('.error-message, .success-message');
    messages.forEach(message => message.remove());
} 
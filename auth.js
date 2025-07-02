import { auth, db } from './firebase-init.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const showSignup = document.getElementById('show-signup');
const showLogin = document.getElementById('show-login');
const errorMessage = document.getElementById('error-message');

// Check auth state on page load
onAuthStateChanged(auth, (user) => {
    if (user) {
        // If user is logged in, redirect to dashboard
        window.location.href = '/dashboard.html';
    }
});


// Toggle forms
showSignup.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
});

showLogin.addEventListener('click', (e) => {
    e.preventDefault();
    signupForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
});

// Sanitize mobile to create a fake email for auth
const createEmailFromMobile = (mobile) => `${mobile.replace(/\D/g, '')}@ramazone.com`;

// Login handler
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mobile = document.getElementById('login-mobile').value;
    const password = document.getElementById('login-password').value;
    const email = createEmailFromMobile(mobile);
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle redirect
    } catch (error) {
        errorMessage.textContent = error.message;
    }
});

// Signup handler
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value;
    const mobile = document.getElementById('signup-mobile').value;
    const password = document.getElementById('signup-password').value;
    const email = createEmailFromMobile(mobile);

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Store additional user info in Realtime Database
        await set(ref(db, 'users/' + user.uid), {
            name: name,
            phone: mobile,
            wallet: 0,
            totalPurchase: 0,
            totalCashback: 0
        });
        // onAuthStateChanged will handle redirect
    } catch (error) {
        errorMessage.textContent = error.message;
    }
});
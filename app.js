import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { ref, set, push, onValue, query, orderByChild, equalTo, get, update } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- DOM Elements ---
const loader = document.getElementById('loader');
const userNameEl = document.getElementById('user-name');
const userAvatarEl = document.getElementById('user-avatar');
const walletBalanceEl = document.getElementById('wallet-balance');
const totalPurchaseEl = document.getElementById('total-purchase');
const totalCashbackEl = document.getElementById('total-cashback');
const logoutBtn = document.getElementById('logout-btn');
const cashbackForm = document.getElementById('cashback-request-form');
const convertCouponBtn = document.getElementById('convert-coupon-btn');
const historyTableBody = document.querySelector('#cashback-history-table tbody');
const declinedTableBody = document.querySelector('#declined-list-table tbody');
const searchCustomerForm = document.getElementById('search-customer-form');
const passwordModal = document.getElementById('password-modal');
const searchResultModal = document.getElementById('search-result-modal');
const passwordVerifyForm = document.getElementById('password-verify-form');
const modalError = document.getElementById('modal-error');
const searchResultContent = document.getElementById('search-result-content');

let currentUser = null;
let currentUserData = {};

// --- Utility Functions ---
const showLoader = () => loader.classList.remove('hidden');
const hideLoader = () => loader.classList.add('hidden');
const formatCurrency = (amount) => `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (isoString) => new Date(isoString).toLocaleDateString('en-IN');

// --- Modal Controls ---
function openModal(modal) {
    modal.style.display = "flex";
}
function closeModal(modal) {
    modal.style.display = "none";
}
document.querySelectorAll('.modal .close-btn').forEach(btn => {
    btn.onclick = () => {
        closeModal(passwordModal);
        closeModal(searchResultModal);
    }
});
window.onclick = (event) => {
    if (event.target.classList.contains('modal')) {
        closeModal(event.target);
    }
};

// --- Authentication ---
onAuthStateChanged(auth, (user) => {
    showLoader();
    if (user) {
        currentUser = user;
        listenToUserData(user.uid);
        listenToApprovedCashback(user.uid);
        listenToDeclinedCashback(user.uid);
    } else {
        window.location.href = '/index.html';
    }
});

logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
});

// --- Data Listeners ---
function listenToUserData(uid) {
    const userRef = ref(db, 'users/' + uid);
    onValue(userRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            currentUserData = data;
            updateDashboardUI(data);
        }
        hideLoader();
    });
}

function listenToApprovedCashback(uid) {
    const approvedRef = query(ref(db, 'cashback_approved'), orderByChild('userId'), equalTo(uid));
    onValue(approvedRef, (snapshot) => {
        historyTableBody.innerHTML = '<tr><td colspan="3">No approved cashback yet.</td></tr>';
        if (snapshot.exists()) {
            historyTableBody.innerHTML = '';
            snapshot.forEach(childSnapshot => {
                const item = childSnapshot.val();
                const row = `<tr>
                    <td>${formatDate(item.date)}</td>
                    <td>${item.productName}</td>
                    <td>${formatCurrency(item.cashbackAmount)}</td>
                </tr>`;
                historyTableBody.innerHTML += row;
            });
        }
    });
}

function listenToDeclinedCashback(uid) {
    const declinedRef = query(ref(db, 'temp_declined'), orderByChild('userId'), equalTo(uid));
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    onValue(declinedRef, (snapshot) => {
        declinedTableBody.innerHTML = '<tr><td colspan="3">No recently declined requests.</td></tr>';
        if (snapshot.exists()) {
            declinedTableBody.innerHTML = '';
            snapshot.forEach(childSnapshot => {
                const item = childSnapshot.val();
                // Filter items from the last 24 hours
                if (item.declinedAt > oneDayAgo) {
                    const row = `<tr>
                        <td>${formatDate(item.date)}</td>
                        <td>${item.productName}</td>
                        <td>${formatCurrency(item.price)}</td>
                    </tr>`;
                    declinedTableBody.innerHTML += row;
                }
            });
        }
    });
}

// --- UI Updates ---
function updateDashboardUI(data) {
    userNameEl.textContent = data.name;
    userAvatarEl.textContent = data.name.charAt(0).toUpperCase();
    walletBalanceEl.textContent = formatCurrency(data.wallet);
    totalPurchaseEl.textContent = formatCurrency(data.totalPurchase);
    totalCashbackEl.textContent = formatCurrency(data.totalCashback);

    if (data.wallet >= 10) {
        convertCouponBtn.disabled = false;
    } else {
        convertCouponBtn.disabled = true;
    }
}

// --- Feature Logic ---
cashbackForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    const productName = document.getElementById('product-name').value;
    const price = parseFloat(document.getElementById('product-price').value);

    try {
        await push(ref(db, 'cashback_requests'), {
            userId: currentUser.uid,
            name: currentUserData.name,
            date: new Date().toISOString(),
            productName,
            price,
            status: "pending"
        });
        cashbackForm.reset();
        alert('Cashback request submitted successfully!');
    } catch (error) {
        alert('Error submitting request: ' + error.message);
    }
    hideLoader();
});

convertCouponBtn.addEventListener('click', () => {
    modalError.textContent = '';
    passwordVerifyForm.reset();
    openModal(passwordModal);
});

passwordVerifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    const password = document.getElementById('verify-password').value;
    const credential = EmailAuthProvider.credential(currentUser.email, password);

    try {
        await reauthenticateWithCredential(currentUser, credential);
        // Re-auth successful, proceed with coupon logic
        await generateCoupon();
        closeModal(passwordModal);
    } catch (error) {
        modalError.textContent = 'Incorrect password. Please try again.';
        console.error("Re-authentication failed:", error);
    }
    hideLoader();
});

async function generateCoupon() {
    const { name, totalPurchase, totalCashback, wallet } = currentUserData;
    const message = `Ramazone Coupon Request:\n\nName: ${name}\nTotal Purchase: ${formatCurrency(totalPurchase)}\nCashback Earned: ${formatCurrency(totalCashback)}\nWallet Balance for Coupon: ${formatCurrency(wallet)}`;
    const encodedMessage = encodeURIComponent(message);
    const whatsappLink = `https://wa.me/919703698180?text=${encodedMessage}`;

    // Log the coupon request and reset wallet
    try {
        await push(ref(db, 'coupon_logs'), {
            userId: currentUser.uid,
            userName: name,
            amount: wallet,
            createdAt: new Date().toISOString(),
            status: 'pending'
        });
        
        await update(ref(db, `users/${currentUser.uid}`), {
            wallet: 0
        });

        window.open(whatsappLink, '_blank');
        alert('Coupon request sent! Your wallet has been reset.');
    } catch (error) {
        alert('Error generating coupon: ' + error.message);
    }
}

searchCustomerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    const mobile = document.getElementById('search-mobile').value;
    const usersRef = query(ref(db, 'users'), orderByChild('phone'), equalTo(mobile));

    try {
        const snapshot = await get(usersRef);
        if (snapshot.exists()) {
            snapshot.forEach(childSnapshot => {
                const userData = childSnapshot.val();
                searchResultContent.innerHTML = `
                    <p><strong>Name:</strong> ${userData.name}</p>
                    <p><strong>Wallet Balance:</strong> ${formatCurrency(userData.wallet)}</p>
                    <p><strong>Total Purchase:</strong> ${formatCurrency(userData.totalPurchase)}</p>
                    <p><strong>Total Cashback:</strong> ${formatCurrency(userData.totalCashback)}</p>
                `;
            });
            openModal(searchResultModal);
        } else {
            alert('No customer found with that mobile number.');
        }
    } catch (error) {
        alert('Error searching for customer: ' + error.message);
    }
    hideLoader();
});
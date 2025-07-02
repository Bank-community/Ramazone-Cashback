import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { ref, onValue, get, remove, update, push, query, orderByChild, equalTo, runTransaction } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- DOM Elements ---
const loader = document.getElementById('loader');
const loginView = document.getElementById('admin-login-view');
const dashboardView = document.getElementById('admin-dashboard-view');
const loginForm = document.getElementById('admin-login-form');
const errorMessage = document.getElementById('admin-error-message');
const logoutBtn = document.getElementById('admin-logout-btn');

const cashbackTableBody = document.querySelector('#cashback-requests-table tbody');
const couponTableBody = document.querySelector('#coupon-requests-table tbody');
const searchUserForm = document.getElementById('admin-search-user-form');
const userProfileResult = document.getElementById('admin-user-profile-result');

// --- Utility Functions ---
const showLoader = () => loader.classList.remove('hidden');
const hideLoader = () => loader.classList.add('hidden');
const formatCurrency = (amount) => `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (isoString) => new Date(isoString).toLocaleString('en-IN');

// --- Auth Handling ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const isAdmin = await checkAdminStatus(user.uid);
        if (isAdmin) {
            showDashboard();
        } else {
            // Log out non-admins trying to access the page
            await signOut(auth);
            showLoginView();
        }
    } else {
        showLoginView();
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    errorMessage.textContent = '';
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle the rest
    } catch (error) {
        errorMessage.textContent = 'Login failed. Check credentials or admin status.';
        hideLoader();
    }
});

logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
});

async function checkAdminStatus(uid) {
    const adminRef = ref(db, `admins/${uid}`);
    const snapshot = await get(adminRef);
    return snapshot.exists();
}

function showLoginView() {
    loginView.classList.remove('hidden');
    dashboardView.classList.add('hidden');
    hideLoader();
}

function showDashboard() {
    loginView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    loadPendingCashbackRequests();
    loadPendingCouponRequests();
    cleanupOldDeclinedRequests(); // Run cleanup on login
    hideLoader();
}

// --- Data Loading and Actions ---
function loadPendingCashbackRequests() {
    const requestsRef = query(ref(db, 'cashback_requests'), orderByChild('status'), equalTo('pending'));
    onValue(requestsRef, (snapshot) => {
        cashbackTableBody.innerHTML = '<tr><td colspan="5">No pending requests.</td></tr>';
        if (snapshot.exists()) {
            cashbackTableBody.innerHTML = '';
            snapshot.forEach(childSnapshot => {
                const reqId = childSnapshot.key;
                const req = childSnapshot.val();
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${formatDate(req.date)}</td>
                    <td>${req.name}</td>
                    <td>${req.productName}</td>
                    <td>${formatCurrency(req.price)}</td>
                    <td>
                        <button class="btn btn-success btn-sm approve-cashback" data-id="${reqId}">Approve</button>
                        <button class="btn btn-danger btn-sm decline-cashback" data-id="${reqId}">Decline</button>
                    </td>
                `;
                cashbackTableBody.appendChild(row);
            });
        }
    });
}

function loadPendingCouponRequests() {
    const couponRef = query(ref(db, 'coupon_logs'), orderByChild('status'), equalTo('pending'));
    onValue(couponRef, (snapshot) => {
        couponTableBody.innerHTML = '<tr><td colspan="4">No pending coupon requests.</td></tr>';
        if (snapshot.exists()) {
            couponTableBody.innerHTML = '';
            snapshot.forEach(childSnapshot => {
                const logId = childSnapshot.key;
                const log = childSnapshot.val();
                 const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${formatDate(log.createdAt)}</td>
                    <td>${log.userName}</td>
                    <td>${formatCurrency(log.amount)}</td>
                    <td>
                        <button class="btn btn-success btn-sm approve-coupon" data-id="${logId}">Mark Approved</button>
                    </td>
                `;
                couponTableBody.appendChild(row);
            });
        }
    });
}

// --- Event Delegation for table buttons ---
document.addEventListener('click', async (e) => {
    if (e.target.matches('.approve-cashback')) {
        const reqId = e.target.dataset.id;
        await handleCashbackApproval(reqId);
    }
    if (e.target.matches('.decline-cashback')) {
        const reqId = e.target.dataset.id;
        await handleCashbackDecline(reqId);
    }
    if (e.target.matches('.approve-coupon')) {
        const logId = e.target.dataset.id;
        await handleCouponApproval(logId);
    }
});

// --- Action Handlers ---
async function handleCashbackApproval(reqId) {
    showLoader();
    const reqRef = ref(db, `cashback_requests/${reqId}`);
    try {
        const snapshot = await get(reqRef);
        if (!snapshot.exists()) throw new Error("Request not found.");
        const request = snapshot.val();
        
        const cashbackAmount = request.price * 0.02;
        const userRef = ref(db, `users/${request.userId}`);

        // Use a transaction for atomic updates
        await runTransaction(userRef, (currentUserData) => {
            if (currentUserData) {
                currentUserData.wallet = (currentUserData.wallet || 0) + cashbackAmount;
                currentUserData.totalPurchase = (currentUserData.totalPurchase || 0) + request.price;
                currentUserData.totalCashback = (currentUserData.totalCashback || 0) + cashbackAmount;
            }
            return currentUserData;
        });

        // Log approved cashback
        await push(ref(db, 'cashback_approved'), {
            userId: request.userId,
            name: request.name,
            date: new Date().toISOString(),
            productName: request.productName,
            cashbackAmount
        });

        // Delete the original request
        await remove(reqRef);
        alert('Cashback approved!');

    } catch (error) {
        alert('Approval failed: ' + error.message);
    }
    hideLoader();
}

async function handleCashbackDecline(reqId) {
    showLoader();
    const reqRef = ref(db, `cashback_requests/${reqId}`);
    try {
        const snapshot = await get(reqRef);
        if (!snapshot.exists()) throw new Error("Request not found.");
        const request = snapshot.val();
        
        // Add decline timestamp and move to temp_declined
        request.declinedAt = new Date().getTime();
        await push(ref(db, 'temp_declined'), request);
        
        // Delete original request
        await remove(reqRef);
        alert('Request declined.');

    } catch (error) {
        alert('Decline failed: ' + error.message);
    }
    hideLoader();
}

async function handleCouponApproval(logId) {
    showLoader();
    const logRef = ref(db, `coupon_logs/${logId}`);
    try {
        await update(logRef, { status: 'approved' });
        alert('Coupon marked as approved.');
    } catch (error) {
        alert('Failed to update coupon status: ' + error.message);
    }
    hideLoader();
}

// --- User Search ---
searchUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    userProfileResult.innerHTML = '';
    const mobile = document.getElementById('admin-search-mobile').value;
    const usersQuery = query(ref(db, 'users'), orderByChild('phone'), equalTo(mobile));

    try {
        const snapshot = await get(usersQuery);
        if (snapshot.exists()) {
            snapshot.forEach(childSnapshot => {
                const user = childSnapshot.val();
                userProfileResult.innerHTML = `
                    <h4>Profile for ${user.name}</h4>
                    <p><strong>Phone:</strong> ${user.phone}</p>
                    <p><strong>Wallet:</strong> ${formatCurrency(user.wallet)}</p>
                    <p><strong>Total Purchase:</strong> ${formatCurrency(user.totalPurchase)}</p>
                    <p><strong>Total Cashback:</strong> ${formatCurrency(user.totalCashback)}</p>
                `;
            });
        } else {
            userProfileResult.innerHTML = `<p>No user found with this mobile number.</p>`;
        }
    } catch (error) {
        userProfileResult.innerHTML = `<p class="error">Error searching for user: ${error.message}</p>`;
    }
    hideLoader();
});

// --- Cleanup function for old declined requests ---
async function cleanupOldDeclinedRequests() {
    const declinedRef = ref(db, 'temp_declined');
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

    try {
        const snapshot = await get(declinedRef);
        if (snapshot.exists()) {
            const updates = {};
            snapshot.forEach(childSnapshot => {
                if (childSnapshot.val().declinedAt < oneDayAgo) {
                    updates[childSnapshot.key] = null; // Mark for deletion
                }
            });
            if (Object.keys(updates).length > 0) {
                await update(declinedRef, updates);
                console.log(`Cleaned up ${Object.keys(updates).length} old declined requests.`);
            }
        }
    } catch(error) {
        console.error("Error during cleanup of declined requests:", error);
    }
}
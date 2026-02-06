import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, onSnapshot, serverTimestamp, query, orderBy, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
// --- NUEVO: IMPORTAR STORAGE PARA IMÁGENES ---
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ==========================================
// 1. CONFIGURACIÓN FIREBASE
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDPHkAv0XsOo5BHkKqsD5-_NKB-DHxkNUw",
  authDomain: "base-de-datos-9d5e8.firebaseapp.com",
  projectId: "base-de-datos-9d5e8",
  storageBucket: "base-de-datos-9d5e8.firebasestorage.app",
  messagingSenderId: "1030378558030",
  appId: "1:1030378558030:web:d2d09f6c04f037d501291f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app); // Inicializar Storage

// ==========================================
// 1.5. CONSTANTES Y RUTAS
// ==========================================
const MAIN_COLLECTION = "Don Burger";
const MAIN_DOC = "App";

const getAppCollection = (colName) => collection(db, MAIN_COLLECTION, MAIN_DOC, colName);
const getAppDoc = (colName, docId) => doc(db, MAIN_COLLECTION, MAIN_DOC, colName, docId);

// ==========================================
// 2. VARIABLES GLOBALES
// ==========================================
let allProducts = [];
let cart = [];
let isPickup = false;
let currentCategory = 'all';
let currentUserData = null; 
let confirmCallback = null; 
const ADMIN_EMAIL = "admin@donburger.com"; 
const DELIVERY_COST = 20;
const CLABE_NUMBER = "012345678901234567";
let orderToDeleteId = null; 
let allBanners = [];
let ordersCache = {}; 

// --- VARIABLES INGREDIENTES Y PERSONALIZACIÓN ---
let tempProductToAdd = null; 
let currentExclusions = [];
const STANDARD_INGREDIENTS = ["Cebolla", "Tomate", "Lechuga", "Pepinillos", "Mostaza", "Catsup", "Mayonesa", "Queso", "Picante"];

// --- VARIABLES TRACKING ---
let mapInstance = null;
let markerRepartidor = null;
let watchId = null; 
let trackingListener = null; 

window.initMap = () => { console.log("Google Maps API cargada."); };

// ==========================================
// 3. UI HELPERS
// ==========================================
const getEl = (id) => document.getElementById(id);

window.toggleMenu = () => { 
    const drawer = getEl('side-drawer');
    const overlay = getEl('menu-overlay');
    if (drawer && overlay) {
        drawer.classList.toggle('open'); 
        overlay.classList.toggle('active');
    }
};

window.toggleCart = () => { 
    const drawer = getEl('cart-drawer');
    if (drawer) drawer.classList.toggle('open'); 
};

// Forzar modo oscuro
if (localStorage.getItem('dark-mode') === null) {
    localStorage.setItem('dark-mode', 'true');
    document.body.classList.add('dark-mode');
} else if (localStorage.getItem('dark-mode') === 'true') {
    document.body.classList.add('dark-mode');
}

const themeToggleBtn = getEl('theme-toggle');
if(themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('dark-mode', document.body.classList.contains('dark-mode'));
    });
}

// ==========================================
// 4. AUTH SYSTEM
// ==========================================
let isRegistering = false;
window.openAuth = () => { getEl('auth-modal').style.display = 'flex'; window.toggleMenu(); };
window.closeAuth = () => getEl('auth-modal').style.display = 'none';

window.toggleAuthMode = () => {
    isRegistering = !isRegistering;
    getEl('auth-title').innerText = isRegistering ? "Crear Cuenta" : "Acceso";
    getEl('auth-form').querySelector('button').innerText = isRegistering ? "Registrarse" : "Entrar";
    isRegistering ? getEl('reg-fields').classList.remove('hidden') : getEl('reg-fields').classList.add('hidden');
};

const authForm = getEl('auth-form');
if (authForm) {
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = getEl('auth-email').value;
        const pass = getEl('auth-pass').value;
        try {
            if (isRegistering) {
                const name = getEl('reg-name').value;
                const phone = getEl('reg-phone').value;
                if(!name || !phone) return window.showAlert("Datos", "Nombre y celular requeridos.");

                const userCred = await createUserWithEmailAndPassword(auth, email, pass);
                await setDoc(getAppDoc("usuarios", userCred.user.uid), {
                    nombre: name, telefono: phone, email: email, creado: serverTimestamp()
                });
                window.showAlert("¡Bienvenido!", "Cuenta creada.");
            } else {
                await signInWithEmailAndPassword(auth, email, pass);
            }
            closeAuth();
        } catch (err) { window.showAlert("Error", "Revisa tus datos."); }
    });
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userDoc = await getDoc(getAppDoc("usuarios", user.uid));
            if(userDoc.exists()) {
                currentUserData = userDoc.data();
                const nameDisplay = getEl('user-name-display');
                if(nameDisplay) nameDisplay.innerText = currentUserData.nombre;
            } else {
                currentUserData = { email: user.email, nombre: "Usuario" };
                getEl('user-name-display').innerText = user.email.split('@')[0];
            }
        } catch (e) {
            currentUserData = { email: user.email, nombre: "Usuario" };
        }
        getEl('auth-buttons').classList.add('hidden');
        getEl('user-info').classList.remove('hidden');
        getEl('client-menu').classList.remove('hidden');
        if (user.email === ADMIN_EMAIL) getEl('admin-btn-container').classList.remove('hidden');
    } else {
        currentUserData = null;
        getEl('auth-buttons').classList.remove('hidden');
        getEl('user-info').classList.add('hidden');
        getEl('client-menu').classList.add('hidden');
        getEl('admin-btn-container').classList.add('hidden');
    }
    renderProducts();
});

window.askLogout = () => window.showConfirm("Salir", "¿Cerrar sesión?", () => signOut(auth));

// ==========================================
// 5. PRODUCTOS & VISIBILIDAD
// ==========================================
onSnapshot(getAppCollection("productos"), (snapshot) => {
    allProducts = [];
    snapshot.forEach(doc => allProducts.push({ id: doc.id, ...doc.data() }));
    renderCategories(); renderProducts(); renderAdminBannerList();
});

function renderCategories() {
    const categories = new Set(allProducts.map(p => p.categoria || 'Varios'));
    const list = getEl('category-list');
    if(!list) return;

    let html = `<li onclick="filterProducts('all')" class="${currentCategory === 'all' ? 'active-cat' : ''}">Todo</li>`;
    categories.forEach(cat => {
        const cleanCat = cat.replace(/[^a-zA-Z0-9 ]/g, "").trim(); 
        const isActive = currentCategory === cat ? 'active-cat' : '';
        html += `<li onclick="filterProducts('${cat}')" class="${isActive}">${cleanCat}</li>`;
    });
    list.innerHTML = html;
    
    const suggestionList = getEl('cat-suggestions');
    if(suggestionList) suggestionList.innerHTML = Array.from(categories).map(c => `<option value="${c}">`).join('');
}

window.filterProducts = (cat) => {
    currentCategory = cat; renderCategories(); renderProducts();
    if(window.innerWidth < 768) window.toggleMenu();
};

// ==========================================
// 6. GESTIÓN DE INGREDIENTES Y PERSONALIZACIÓN
// ==========================================
window.openCustomization = (productId) => {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    // Si NO es hamburguesa o comida preparada (ej: bebida, postre simple), agrégalo directo
    const cat = (product.categoria || '').toLowerCase();
    // Ajusta esta lógica según tus categorías reales. Aquí asumo que solo Burgers llevan ingredientes.
    if (!cat.includes('burger') && !cat.includes('hamburguesa') && !cat.includes('dog') && !cat.includes('especial')) {
        addToCartWithExtras(product, [], '');
        return;
    }

    tempProductToAdd = product;
    currentExclusions = [];
    
    // UI del Modal
    getEl('custom-title').innerText = `Personalizar ${product.nombre}`;
    getEl('custom-note').value = '';
    
    // Renderizar toggles de ingredientes
    const container = getEl('ingredients-container');
    container.innerHTML = STANDARD_INGREDIENTS.map(ing => `
        <div class="ing-toggle" onclick="toggleIngredient(this, '${ing}')">
            <span>${ing}</span>
            <span class="status-icon">✅</span>
        </div>
    `).join('');

    getEl('custom-modal').style.display = 'flex';
};

window.toggleIngredient = (el, ing) => {
    if (currentExclusions.includes(ing)) {
        // Estaba excluido, lo volvemos a poner (QUITAR de la lista de exclusiones)
        currentExclusions = currentExclusions.filter(i => i !== ing);
        el.classList.remove('excluded');
        el.querySelector('.status-icon').innerText = '✅';
    } else {
        // Lo excluimos (AGREGAR a lista de exclusiones)
        currentExclusions.push(ing);
        el.classList.add('excluded');
        el.querySelector('.status-icon').innerText = '❌';
    }
};

window.closeCustomModal = () => {
    getEl('custom-modal').style.display = 'none';
    tempProductToAdd = null;
    currentExclusions = [];
};

window.confirmAddToCart = () => {
    if (!tempProductToAdd) return;
    const note = getEl('custom-note').value.trim();
    addToCartWithExtras(tempProductToAdd, currentExclusions, note);
    closeCustomModal();
    window.showAlert("Agregado", "Producto añadido al carrito");
};

// ==========================================
// 7. LÓGICA DEL CARRITO (CORE ACTUALIZADO)
// ==========================================

function addToCartWithExtras(product, exclusions, note) {
    // Generamos un ID único para el carrito basado en sus cambios
    // Así puedes tener una Burger con cebolla y otra sin cebolla como items distintos
    const cartId = `${product.id}|${exclusions.join(',')}|${note.replace(/\s/g,'_')}`;
    
    const existingItem = cart.find(i => i.cartId === cartId);

    if (existingItem) {
        // Validar stock si es necesario
        if (product.stock !== undefined && product.stock > 0 && (existingItem.qty + 1 > product.stock)) {
             return window.showAlert("Stock", "No hay suficiente stock.");
        }
        existingItem.qty += 1;
    } else {
        if (product.stock !== undefined && product.stock <= 0) {
             return window.showAlert("Stock", "Producto agotado.");
        }
        cart.push({
            ...product,
            cartId: cartId, // ID único interno del carrito
            qty: 1,
            exclusions: [...exclusions], // Copia del array
            note: note
        });
    }
    updateCartUI(); renderProducts();
}

window.removeFromCart = (cartId) => {
    cart = cart.filter(i => i.cartId !== cartId);
    updateCartUI(); renderProducts();
};

window.changeCartQty = (cartId, change) => {
    let item = cart.find(i => i.cartId === cartId);
    if (!item) return;

    if (change > 0) {
        // Validar stock global del producto padre
        const parentProduct = allProducts.find(p => p.id === item.id);
        if (parentProduct && parentProduct.stock !== undefined) {
             // Contar cuantos de este producto (en todas sus variantes) tengo ya en el carrito
             const totalInCart = cart.filter(c => c.id === item.id).reduce((sum, c) => sum + c.qty, 0);
             if (totalInCart + 1 > parentProduct.stock) {
                 return window.showAlert("Stock", "No hay más stock disponible.");
             }
        }
    }

    item.qty += change;
    if (item.qty <= 0) {
        removeFromCart(cartId);
    } else {
        updateCartUI();
    }
};

window.setDeliveryMode = (mode) => {
    isPickup = (mode === 'pickup');
    
    if (isPickup) {
        getEl('btn-mode-delivery').classList.remove('active');
        getEl('btn-mode-pickup').classList.add('active');
        getEl('address-section').classList.add('hidden'); 
        getEl('pickup-msg').classList.remove('hidden');    
    } else {
        getEl('btn-mode-pickup').classList.remove('active');
        getEl('btn-mode-delivery').classList.add('active');
        getEl('address-section').classList.remove('hidden');
        getEl('pickup-msg').classList.add('hidden');
    }
    updateCartUI();
};

function updateCartUI() {
    const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    const badge = getEl('cart-badge');
    if (badge) {
        badge.innerText = totalQty;
        totalQty > 0 ? badge.classList.remove('hidden') : badge.classList.add('hidden');
    }

    const subtotal = cart.reduce((sum, item) => sum + (item.precio * item.qty), 0);
    const subEl = getEl('cart-subtotal');
    if(subEl) subEl.innerText = "$" + subtotal;
    
    const checkSubEl = getEl('checkout-subtotal');
    if(checkSubEl) checkSubEl.innerText = "$" + subtotal;
    
    const currentShipping = isPickup ? 0 : DELIVERY_COST;
    const total = subtotal + currentShipping;

    const totalEl = getEl('checkout-total');
    if(totalEl) totalEl.innerText = "$" + total;

    const rows = document.querySelectorAll('.summary-row');
    rows.forEach(row => {
        if (row.innerText.includes("Envío") || row.innerText.includes("Envio")) {
            if (isPickup) {
                row.innerHTML = 'Envío: <span style="color:#2E7D32; font-weight:800;">GRATIS</span>';
            } else {
                row.innerHTML = `Envío: <span>$${DELIVERY_COST}</span>`;
            }
        }
    });
    
    const fallbackImg = "https://placehold.co/100?text=Burger";
    
    const cartItemsContainer = getEl('cart-items');
    if(cartItemsContainer) {
        cartItemsContainer.innerHTML = cart.map(item => {
            const imgSrc = item.img ? (item.img.startsWith('http') ? item.img : `productos/${item.img}`) : fallbackImg;
            
            // Visualizar ingredientes/notas
            let extrasHtml = '';
            if (item.exclusions && item.exclusions.length > 0) {
                extrasHtml += `<div style="color:#E53935; font-size:0.8rem; margin-top:2px;">🚫 Sin: ${item.exclusions.join(', ')}</div>`;
            }
            if (item.note) {
                extrasHtml += `<div style="color:#FFC107; font-size:0.8rem; margin-top:2px;">📝 Nota: ${item.note}</div>`;
            }

            return `
            <div class="cart-item-row">
                <img src="${imgSrc}" class="cart-img" onerror="this.src='${fallbackImg}'">
                <div class="cart-info">
                    <h5>${item.nombre}</h5>
                    ${extrasHtml}
                    <small>$${item.precio} c/u</small>
                    <div><b>Total: $${item.precio * item.qty}</b></div>
                </div>
                <div class="cart-qty-selector">
                    <button class="cart-mini-btn" onclick="changeCartQty('${item.cartId}', -1)">−</button>
                    <span class="cart-qty-num">${item.qty}</span>
                    <button class="cart-mini-btn" onclick="changeCartQty('${item.cartId}', 1)">+</button>
                    <button class="cart-mini-btn" style="margin-left:5px; background:rgba(255,0,0,0.2); color:#ff5555;" onclick="removeFromCart('${item.cartId}')">🗑️</button>
                </div>
            </div>`;
        }).join('');
    }
    
    if (!getEl('checkout-view').classList.contains('hidden')) {
        if(document.getElementById('cash-amount') && document.getElementById('cash-amount').value) {
            calcChange();
        } else {
            handlePaymentChange();
        }
    }
}

window.goToCheckout = () => {
    if (cart.length === 0) return window.showAlert("Vacío", "Agrega productos.");
    if (!currentUserData) { window.toggleCart(); window.showAlert("Acceso", "Inicia sesión para pedir."); setTimeout(() => window.openAuth(), 1000); return; }
    
    getEl('cart-view').classList.add('hidden'); 
    getEl('checkout-view').classList.remove('hidden');
    handlePaymentChange(); 
};

window.backToCart = () => { getEl('checkout-view').classList.add('hidden'); getEl('cart-view').classList.remove('hidden'); };

window.handlePaymentChange = () => {
    const methodEl = document.querySelector('input[name="payment"]:checked');
    if(!methodEl) return;
    const method = methodEl.value;
    
    const container = getEl('payment-details');
    container.innerHTML = '';
    container.classList.remove('hidden');

    if (method === 'Efectivo') {
        container.innerHTML = `
            <label style="font-weight:bold; margin-bottom:5px; display:block;">¿Con cuánto pagas?</label>
            <input type="number" id="cash-amount" class="input-checkout" placeholder="Ej. 200" onkeyup="calcChange()" onchange="calcChange()">
            <p>Tu Cambio: <span id="cash-change" class="change-display">$0</span></p>
        `;
        calcChange();
    } else if (method === 'Terminal') {
        container.innerHTML = `<p style="color:var(--text-sec); text-align:center;">💳 Nuestro repartidor llevará la terminal a tu domicilio.</p>`;
    } else if (method === 'Transferencia') {
        container.innerHTML = `
            <div class="bank-info">
                <p>🏦 Banco: <b>BBVA</b></p>
                <p>👤 Nombre: <b>Don Burger</b></p>
                <p onclick="copyClabe()" class="clabe-text">
                    ${CLABE_NUMBER} <span style="font-size:0.8rem">📋</span>
                    <span id="copy-msg" class="copy-feedback">¡Copiado!</span>
                </p>
                <small>Haz clic en los números para copiar</small>
            </div>
        `;
    }
};

window.calcChange = () => {
    const input = getEl('cash-amount');
    if (!input) return;
    
    const subtotal = cart.reduce((sum, item) => sum + (item.precio * item.qty), 0);
    const currentShipping = isPickup ? 0 : DELIVERY_COST;
    const total = subtotal + currentShipping;

    const payAmount = parseFloat(input.value);
    const display = getEl('cash-change');

    if (!payAmount) {
        display.innerHTML = "$0";
        display.className = "change-display";
    } else if (payAmount < total) {
        display.innerHTML = "Falta dinero";
        display.className = "change-display error-msg";
    } else {
        display.innerHTML = "$" + (payAmount - total).toFixed(2);
        display.className = "change-display";
    }
};

window.copyClabe = () => {
    navigator.clipboard.writeText(CLABE_NUMBER).then(() => {
        const msg = getEl('copy-msg');
        msg.classList.add('show');
        setTimeout(() => msg.classList.remove('show'), 2000);
    });
};

async function generateOrderFolio() {
    try {
        const counterRef = getAppDoc("contadores", "pedidos");
        const counterSnap = await getDoc(counterRef);
        
        let newCount = 1;
        if (counterSnap.exists()) {
            newCount = counterSnap.data().count + 1;
            await updateDoc(counterRef, { count: newCount });
        } else {
            await setDoc(counterRef, { count: 1 });
        }
        return "PEDIDO-" + String(newCount).padStart(3, '0');
    } catch (e) {
        console.error("Error folio", e);
        return "PEDIDO-" + Date.now().toString().slice(-4);
    }
}

window.processOrder = async () => {
    let direccionData = {};
    
    if (!isPickup) {
        const street = getEl('address-street').value;
        const num = getEl('address-num').value;
        const ref = getEl('address-ref').value;
        if (!street || !num || !ref) return window.showAlert("Datos", "Completa la dirección.");
        direccionData = { calle: street, numero: num, referencia: ref };
    } else {
        direccionData = { calle: "RECOGER EN NEGOCIO", numero: "S/N", referencia: "Cliente pasará personalmente" };
    }

    const paymentMethod = document.querySelector('input[name="payment"]:checked').value;
    const subtotal = cart.reduce((sum, item) => sum + (item.precio * item.qty), 0);
    const currentShipping = isPickup ? 0 : DELIVERY_COST;
    const total = subtotal + currentShipping;

    let extraData = {};
    if (paymentMethod === 'Efectivo') {
        const amountInput = getEl('cash-amount').value;
        if (!amountInput || parseFloat(amountInput) < total) {
            return window.showAlert("Pago", "Indica con cuánto pagas (mínimo el total).");
        }
        extraData = {
            monto_pago: parseFloat(amountInput),
            cambio: parseFloat(amountInput) - total
        };
    }

    const btn = getEl('btn-confirm-order'); btn.innerText = "Enviando..."; btn.disabled = true;

    try {
        const folio = await generateOrderFolio();
        
        const orderData = {
            folio: folio,
            usuario_email: currentUserData.email,
            usuario_nombre: currentUserData.nombre || "Cliente",
            usuario_telefono: currentUserData.telefono || "Sin cel",
            items: cart, 
            subtotal: subtotal, 
            costo_envio: currentShipping, 
            total: total,
            direccion: direccionData,
            tipo_entrega: isPickup ? 'pickup' : 'delivery', 
            metodo_pago: paymentMethod,
            fecha: serverTimestamp(), 
            estado: "recibido",
            ...extraData 
        };

        await addDoc(getAppCollection("pedidos"), orderData);
        
        cart = []; updateCartUI(); renderProducts(); 
        
        try { getEl('checkout-form-address').reset(); } catch(e){}
        try { getEl('checkout-form-payment').reset(); } catch(e){}
        
        backToCart(); window.toggleCart(); 
        window.showAlert("¡Pedido Recibido!", `Tu folio es ${folio}. ${isPickup ? 'Te avisaremos para recoger.' : 'Checa el rastreo.'}`);
        
    } catch (error) { 
        window.showAlert("Error", error.message); 
    } finally { 
        btn.innerText = "Confirmar Pedido"; btn.disabled = false; 
    }
};

// ==========================================
// 8. GESTIÓN DE PEDIDOS (CON VISUALIZACIÓN INGREDIENTES)
// ==========================================
window.openOrdersPanel = () => { getEl('orders-view').classList.remove('hidden'); window.toggleMenu(); loadOrders(true); };
window.closeOrdersPanel = () => getEl('orders-view').classList.add('hidden');
window.openClientOrders = () => { getEl('client-orders-view').classList.remove('hidden'); window.toggleMenu(); loadOrders(false); };

function loadOrders(isAdmin) {
    const list = isAdmin ? getEl('orders-list') : getEl('client-orders-list');
    list.innerHTML = '<div class="loader">Cargando...</div>';
    
    const pedidosRef = getAppCollection("pedidos");
    let q;
    
    if (isAdmin) { 
        q = query(pedidosRef, orderBy("fecha", "desc")); 
    } else { 
        q = query(pedidosRef, where("usuario_email", "==", currentUserData.email), orderBy("fecha", "desc")); 
    }
    
    onSnapshot(q, (snapshot) => {
        list.innerHTML = "";
        ordersCache = {}; 

        if (snapshot.empty) { list.innerHTML = "<p style='text-align:center; padding:20px; color:#666;'>Sin pedidos registrados.</p>"; return; }
        
        snapshot.forEach(doc => {
            const o = doc.data();
            const id = doc.id;
            ordersCache[id] = o;
            
            const fecha = o.fecha ? o.fecha.toDate().toLocaleString() : 'Reciente';
            const statusText = o.estado ? o.estado.toUpperCase() : "RECIBIDO";
            const folioDisplay = o.folio || "SIN FOLIO"; 
            
            let addressHtml = '';
            if (o.tipo_entrega === 'pickup') {
                addressHtml = `
                    <div class="order-address-box" style="background: #E0F2F1; border: 1px dashed #009688;">
                        <p style="color:#00796B; margin:0; font-weight:bold; text-align:center;">
                            🛍️ CLIENTE PASA A RECOGER
                        </p>
                    </div>`;
            } else if (o.direccion) {
                addressHtml = `
                    <div class="order-address-box">
                        <p>📍 <strong>Calle:</strong> ${o.direccion.calle || ''} #${o.direccion.numero || ''}</p>
                        <p>👀 <strong>Ref:</strong> ${o.direccion.referencia || ''}</p>
                    </div>`;
            } else {
                addressHtml = `<div class="order-address-box"><p>🏪 Venta en Negocio</p></div>`;
            }

            let paymentInfo = `💳 ${o.metodo_pago}`;
            if (o.metodo_pago === 'Efectivo' && o.monto_pago) {
                paymentInfo += ` (Pagó: $${o.monto_pago} | Cambio: <b>$${o.cambio ? o.cambio.toFixed(2) : '0.00'}</b>)`;
            }

            // Visualizar items pequeños (fotos)
            let visualItems = '';
            const fallbackItemImg = "https://placehold.co/50?text=x";
            if (o.items && o.items.length > 0) {
                o.items.forEach(i => {
                    const img = i.img ? (i.img.startsWith('http') ? i.img : `productos/${i.img}`) : fallbackItemImg;
                    visualItems += `<div class="order-product-mini"><img src="${img}"><span class="order-qty-badge">${i.qty}</span></div>`;
                });
            }

            // Lista detallada con ingredientes
            let textListItems = '';
            if (o.items && o.items.length > 0) {
                o.items.forEach(i => { 
                    let extras = '';
                    if(i.exclusions && i.exclusions.length > 0) extras += `<div style="color:#E53935; font-size:0.8rem;">🚫 Sin: ${i.exclusions.join(', ')}</div>`;
                    if(i.note) extras += `<div style="color:#FFA000; font-size:0.8rem;">📝 ${i.note}</div>`;

                    textListItems += `<li><strong>${i.qty}x</strong> ${i.nombre} ${extras}</li>`; 
                });
            }

            const ticketBtn = `<button class="btn-view-ticket" style="margin-top:10px;" onclick="openVisualTicket('${id}')">👁️ Ver Ticket</button>`;

            let actionBtns = '';
            if (isAdmin) {
                actionBtns = `<div class="admin-actions">
                        <button class="btn-status" onclick="updateStatus('${id}', 'recibido')">📥 Recibido</button>
                        <button class="btn-status" onclick="updateStatus('${id}', 'surtiendo')">🔥 En Parrilla</button>
                        <button class="btn-status" onclick="updateStatus('${id}', 'camino')">🏍️ En Camino</button>
                        <button class="btn-status" onclick="updateStatus('${id}', 'entregado')">✅ Entregado</button>
                        <button class="btn-delete-order" onclick="initDeleteOrder('${id}')">⚠️ Eliminar</button>
                    </div>`;
            }

            let trackBtn = '';
            if (!isAdmin && o.estado === 'camino' && o.tipo_entrega !== 'pickup') {
                trackBtn = `<button class="btn-track" onclick="openTracking('${id}')">
                                📍 SEGUIR REPARTIDOR EN VIVO
                            </button>`;
            }

            list.innerHTML += `<div class="order-card status-${o.estado}">
                    <div class="order-header">
                        <div><strong>${folioDisplay}</strong> - ${o.usuario_nombre}<br><small>${fecha}</small></div>
                        <span class="status-badge badge-${o.estado}">${statusText}</span>
                    </div>
                    ${addressHtml} 
                    <div style="font-size:0.9rem;"><p>${paymentInfo}</p></div>
                    <div class="order-product-grid">${visualItems}</div>
                    <ul class="order-item-list-text">${textListItems}</ul>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; border-top:1px solid #eee; padding-top:10px;">
                        <strong style="font-size:1.1rem;">Total: $${o.total}</strong>
                        ${ticketBtn}
                    </div>
                    ${trackBtn} ${actionBtns}
            </div>`;
        });
    });
}

window.updateStatus = async (id, status) => {
    try {
        let data = { estado: status };

        if (status === 'entregado') {
            data.fecha_entrega = serverTimestamp();
            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
                watchId = null;
                window.showAlert("Entrega Finalizada", "El GPS se ha desactivado.");
            }
        }

        if (status === 'camino') {
            if ("geolocation" in navigator) {
                watchId = navigator.geolocation.watchPosition(async (position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    updateDoc(getAppDoc("pedidos", id), {
                        ubicacion_repartidor: { lat: lat, lng: lng }
                    }).catch(console.error);
                }, (error) => {
                    console.error("Error GPS:", error);
                    window.showAlert("Error GPS", "No se pudo acceder a tu ubicación. Actívala.");
                }, {
                    enableHighAccuracy: true, 
                    maximumAge: 0
                });
                
                window.showAlert("🚀 Modo Repartidor", "GPS Activo. El cliente puede ver tu ubicación.");
            } else {
                window.showAlert("Error", "Tu dispositivo no tiene GPS.");
            }
        }

        await updateDoc(getAppDoc("pedidos", id), data);
    } catch (e) {
        window.showAlert("Error", "Fallo al actualizar: " + e.message);
    }
};

window.initDeleteOrder = (id) => {
    orderToDeleteId = id;
    getEl('delete-reason').value = '';
    getEl('delete-reason-modal').style.display = 'flex';
};

window.closeDeleteModal = () => {
    getEl('delete-reason-modal').style.display = 'none';
    orderToDeleteId = null;
};

window.confirmDeleteOrder = async () => {
    const reason = getEl('delete-reason').value.trim();
    if (!reason) return window.showAlert("Requerido", "Ingresa el motivo de eliminación.");
    if (!orderToDeleteId) return;

    try {
        const orderSnap = await getDoc(getAppDoc("pedidos", orderToDeleteId));
        if (!orderSnap.exists()) return window.showAlert("Error", "Pedido no encontrado.");
        const orderData = orderSnap.data();

        await addDoc(getAppCollection("auditoria_eliminados"), {
            ...orderData,
            deleted_at: serverTimestamp(),
            deleted_by: currentUserData.email,
            delete_reason: reason,
            original_order_id: orderToDeleteId
        });

        await deleteDoc(getAppDoc("pedidos", orderToDeleteId));
        closeDeleteModal();
        window.showAlert("Eliminado", "Pedido borrado.");
    } catch (e) {
        window.showAlert("Error", "No se pudo eliminar: " + e.message);
    }
};

// ==========================================
// 9. ADMIN PRODUCTOS & DESCRIPCIÓN & IMAGENES
// ==========================================
window.openAdmin = () => { 
    getEl('admin-form').reset(); 
    getEl('p-id').value = ''; 
    getEl('upload-progress').style.display = 'none';
    getEl('admin-modal').style.display = 'flex'; 
    window.toggleMenu(); 
};
window.closeAdmin = () => getEl('admin-modal').style.display = 'none';

window.editProduct = (id) => {
    const p = allProducts.find(prod => prod.id === id); if (!p) return;
    getEl('p-id').value = p.id; 
    getEl('p-name').value = p.nombre; 
    const descEl = getEl('p-desc');
    if(descEl) descEl.value = p.descripcion || '';
    getEl('p-price').value = p.precio;
    getEl('p-stock').value = p.stock || 0; 
    getEl('p-cat').value = p.categoria; 
    getEl('p-img').value = p.img || ''; // Muestra la URL si existe
    getEl('upload-progress').style.display = 'none';
    getEl('admin-modal').style.display = 'flex';
};

// --- CAMBIO 4: GUARDAR PRODUCTO CON IMAGEN EN STORAGE ---
const productForm = getEl('admin-form');
if (productForm) {
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSave = getEl('btn-save-prod');
        const originalText = btnSave.innerText;
        btnSave.innerText = "Guardando..."; 
        btnSave.disabled = true;

        const id = getEl('p-id').value;
        const fileInput = getEl('p-img-file');
        const file = fileInput.files[0];
        
        let imageUrl = getEl('p-img').value.trim(); // URL manual o anterior

        try {
            // 1. Si hay archivo nuevo, subirlo a Storage
            if (file) {
                getEl('upload-progress').style.display = 'block';
                // Crear referencia: productos/timestamp_nombre
                const storageRef = ref(storage, `productos/${Date.now()}_${file.name}`);
                await uploadBytes(storageRef, file);
                imageUrl = await getDownloadURL(storageRef); // Obtener URL pública
                getEl('upload-progress').style.display = 'none';
            }

            // 2. Guardar datos en Firestore
            const data = { 
                nombre: getEl('p-name').value, 
                descripcion: getEl('p-desc').value.trim(), 
                precio: parseFloat(getEl('p-price').value), 
                stock: parseInt(getEl('p-stock').value) || 0, 
                categoria: getEl('p-cat').value.trim().toLowerCase(), 
                img: imageUrl // Guardamos la URL de Firebase Storage (o la manual)
            };

            if (id) {
                await updateDoc(getAppDoc("productos", id), data);
            } else {
                await addDoc(getAppCollection("productos"), { ...data, creado: serverTimestamp() });
            }
            
            closeAdmin(); 
            window.showAlert("Listo", "Producto guardado.");
        } catch (e) { 
            console.error(e);
            window.showAlert("Error", e.message); 
        } finally {
            btnSave.innerText = originalText;
            btnSave.disabled = false;
        }
    });
}
window.deleteProduct = (id) => window.showConfirm("Borrar", "¿Eliminar?", async () => await deleteDoc(getAppDoc("productos", id)));

// ==========================================
// 10. DASHBOARD VENTAS
// ==========================================
window.openSalesDashboard = async () => {
    getEl('sales-dashboard-view').classList.remove('hidden');
    window.toggleMenu();
    
    const q = query(getAppCollection("pedidos"), where("estado", "==", "entregado"), orderBy("fecha", "desc"));
    const snapshot = await getDocs(q);
    
    let totalToday = 0; let ordersToday = 0; let historyHtml = '';
    const todayStr = new Date().toDateString();

    snapshot.forEach(doc => {
        const d = doc.data();
        ordersCache[doc.id] = d;

        if(!d.fecha) return;
        
        const start = d.fecha.toDate();
        const end = d.fecha_entrega ? d.fecha_entrega.toDate() : new Date();
        const diffMs = end - start;
        const diffMins = Math.floor(diffMs / 60000);
        
        const dateStr = start.toDateString();
        const amount = d.total || 0;

        if (dateStr === todayStr) { totalToday += amount; ordersToday++; }

        historyHtml += `
        <div class="report-card">
            <div class="report-header">
                <div><strong>${d.folio || 'S/N'}</strong> <small>${d.usuario_nombre}</small></div>
                <div style="font-weight:bold; color:var(--primary);">$${amount}</div>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
                <span class="time-pill">🕒 Pedido: ${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                <span class="time-pill">✅ Entrega: ${d.fecha_entrega ? end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Manual'}</span>
                <span class="time-pill" style="background:var(--primary-light); color:var(--primary);">⏱️ ${diffMins} min</span>
            </div>
            <button class="btn-view-ticket" onclick="openVisualTicket('${doc.id}')">👁️ Ver Ticket</button>
        </div>`;
    });

    getEl('kpi-sales-today').innerText = `$${totalToday.toFixed(2)}`;
    getEl('kpi-orders-today').innerText = ordersToday;
    getEl('kpi-ticket-avg').innerText = ordersToday > 0 ? `$${(totalToday/ordersToday).toFixed(2)}` : "$0";
    getEl('sales-history-list').innerHTML = historyHtml || '<p style="text-align:center; padding:20px;">Sin ventas entregadas hoy.</p>';
};

// ==========================================
// 11. TICKET MODAL
// ==========================================
window.openVisualTicket = (orderId) => {
    const order = ordersCache[orderId];

    if (!order) {
        return window.showAlert("Error", "No se pudo cargar la información del ticket.");
    }

    const folioEl = getEl('ticket-folio-display');
    if (folioEl) folioEl.innerText = order.folio || "SIN FOLIO";

    const dateEl = getEl('ticket-date-display');
    if (dateEl) dateEl.innerText = order.fecha ? new Date(order.fecha.seconds * 1000).toLocaleString() : '';

    const totalEl = getEl('ticket-total-display');
    if (totalEl) totalEl.innerText = "$" + order.total;

    const shipEl = getEl('ticket-ship-display');
    if (shipEl) {
        shipEl.innerText = "$" + (order.costo_envio !== undefined ? order.costo_envio : 0);
    }

    const itemsContainer = getEl('ticket-items-container');
    if (itemsContainer) {
        itemsContainer.innerHTML = (order.items || []).map(i => {
            let extras = '';
            if(i.exclusions && i.exclusions.length > 0) extras += `<div><small>🚫 Sin: ${i.exclusions.join(', ')}</small></div>`;
            if(i.note) extras += `<div><small>📝 ${i.note}</small></div>`;
            
            return `<div class="ticket-item">
                <span>${i.qty} x ${i.nombre} ${extras}</span>
                <span>$${i.precio * i.qty}</span>
            </div>`;
        }).join('');
    }

    let payInfo = `<b>Método:</b> ${order.metodo_pago}`;
    if (order.metodo_pago === 'Efectivo') {
        const pagado = order.monto_pago || 0;
        const cambio = order.cambio || 0;
        payInfo += `<br>Pagó con: $${pagado} (Cambio: $${cambio})`;
    }
    
    const payInfoEl = getEl('ticket-payment-info');
    if (payInfoEl) payInfoEl.innerHTML = payInfo;

    const modal = getEl('ticket-visual-modal');
    if (modal) modal.style.display = 'flex';
};

// ==========================================
// 12. INVENTARIO PRO
// ==========================================
window.openInventory = () => {
    getEl('inventory-view').classList.remove('hidden');
    window.toggleMenu();
    renderInventory();
};

window.toggleProductVisibility = async (id, currentStatus) => {
    try {
        await updateDoc(getAppDoc("productos", id), { visible: !currentStatus });
    } catch(e) { window.showAlert("Error", "No se pudo actualizar"); }
};

window.renderInventory = () => {
    const term = getEl('inv-search').value.toLowerCase();
    const container = getEl('inventory-list-container');
    const grouped = {};
    allProducts.forEach(p => {
        if (p.nombre.toLowerCase().includes(term)) {
            const cat = p.categoria || 'Sin Categoría';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(p);
        }
    });

    let html = '';
    const fallbackImg = "https://placehold.co/50?text=IMG";

    for (const [cat, prods] of Object.entries(grouped)) {
        html += `<div class="inv-category-header">${cat}</div>`;
        prods.forEach(p => {
            const imgSrc = p.img ? (p.img.startsWith('http') ? p.img : `productos/${p.img}`) : fallbackImg;
            
            const isVisible = p.visible !== false; 
            const checked = isVisible ? 'checked' : '';

            html += `
                <div class="inv-item-row">
                    <div class="product-cell">
                        <img src="${imgSrc}" class="inv-img" onerror="this.src='${fallbackImg}'">
                        <span style="font-weight:bold; font-size:0.9rem;">${p.nombre}</span>
                    </div>
                    <div style="text-align:center;">$${p.precio}</div>
                    <div style="text-align:center; font-weight:bold; color:var(--primary);">${p.stock || 0}</div>
                    <div style="text-align:center;">
                        <label class="switch">
                          <input type="checkbox" ${checked} onclick="toggleProductVisibility('${p.id}', ${isVisible})">
                          <span class="slider"></span>
                        </label>
                    </div>
                    <div style="text-align:center;">
                          <button class="mini-btn btn-edit" onclick="editProduct('${p.id}')">✏️</button>
                    </div>
                </div>
            `;
        });
    }
    container.innerHTML = html;
};

window.showAlert = (t, m) => { getEl('alert-title').innerText=t; getEl('alert-msg').innerText=m; getEl('alert-modal').style.display='flex'; };
window.closeCustomAlert = () => getEl('alert-modal').style.display='none';

window.showConfirm = (t, m, cb) => { 
    getEl('confirm-title').innerText=t; 
    getEl('confirm-msg').innerText=m; 
    getEl('confirm-modal').style.display='flex'; 
    confirmCallback = cb; 
};

window.closeCustomConfirm = (r) => { 
    getEl('confirm-modal').style.display='none'; 
    if(r && confirmCallback) confirmCallback(); 
    confirmCallback = null; 
};

// ==========================================
// 13. BANNERS
// ==========================================
onSnapshot(getAppCollection("banners"), (snapshot) => {
    allBanners = [];
    snapshot.forEach(doc => allBanners.push({ id: doc.id, ...doc.data() }));
    
    renderTopBanners();       
    renderAdminBannerList(); 
    renderProducts();        
});

function renderTopBanners() {
    const container = getEl('promo-carousel');
    if (!container) return;
    
    const topBanners = allBanners.filter(b => b.ubicacion === 'top' || !b.ubicacion);

    if(topBanners.length === 0) { container.style.display = 'none'; return; }
    container.style.display = 'flex';

    container.innerHTML = topBanners.map(b => `
        <div class="banner-card" onclick="filterProducts('${b.categoria}'); if(window.innerWidth < 768) window.toggleMenu();">
            <img src="banners/${b.img}" class="banner-img" alt="Banner" onerror="this.style.display='none'">
        </div>
    `).join('');
}

function renderProducts() {
    const list = getEl('product-list');
    const searchTerm = getEl('search').value.toLowerCase();
    const fallbackImg = "https://placehold.co/150?text=Burger";

    const filtered = allProducts.filter(p => {
        if (p.visible === false) return false;
        if ((p.stock !== undefined && p.stock <= 0) && p.visible !== true) return false; 
        
        const pCat = (p.categoria || '').toLowerCase().trim();
        const currCat = (currentCategory || '').toLowerCase().trim();
        const matchesCat = currCat === 'all' || pCat === currCat;
        
        const matchesSearch = p.nombre.toLowerCase().includes(searchTerm);
        return matchesCat && matchesSearch;
    });

    const midBanners = allBanners.filter(b => b.ubicacion === 'mid');
    let midCarouselHTML = '';

    if (midBanners.length > 0) {
        const cardsHTML = midBanners.map(b => `
            <div class="mid-banner-card" onclick="filterProducts('${b.categoria}');">
                <img src="banners/${b.img}" class="mid-banner-img" onerror="this.style.display='none'">
            </div>
        `).join('');
        
        midCarouselHTML = `
            <div class="mid-carousel-wrapper">
                <div class="mid-carousel-container">
                    ${cardsHTML}
                </div>
            </div>`;
    }

    let htmlContent = '';

    filtered.forEach((p, index) => {
        const imgSrc = p.img ? (p.img.startsWith('http') ? p.img : `productos/${p.img}`) : fallbackImg;
        
        // Calcular cantidad en carrito (sumando todas las variantes de este producto ID)
        const totalQty = cart.filter(c => c.id === p.id).reduce((sum, item) => sum + item.qty, 0);
        
        let badgeColor = '#212121'; 
        const catLower = (p.categoria || '').toLowerCase();
        
        if (catLower.includes('papas') || catLower.includes('sides')) badgeColor = '#F57C00';      
        else if (catLower.includes('burger')) badgeColor = '#795548'; 
        else if (catLower.includes('bebida')) badgeColor = '#0097A7'; 
        else if (catLower.includes('combo')) badgeColor = '#D32F2F'; 
        else if (catLower.includes('postre')) badgeColor = '#FFA000'; 
        else if (catLower.includes('malteada')) badgeColor = '#E91E63'; 

        let heladasBadge = '';
        if (catLower.includes('malteada') || catLower.includes('bebida')) { heladasBadge = `<div class="badge-heladas">Bien Helada 🥶</div>`; }

        const descHTML = p.descripcion 
            ? `<div class="product-desc">${p.descripcion}</div>` 
            : '';

        let adminBtns = '';
        if (currentUserData && currentUserData.email === ADMIN_EMAIL) {
            adminBtns = `<div class="admin-card-actions"><button class="mini-btn btn-edit" onclick="editProduct('${p.id}')">✏️</button><button class="mini-btn btn-del" onclick="deleteProduct('${p.id}')">🗑️</button></div>`;
        }

        let actionBtn;
        if (totalQty === 0) actionBtn = `<button class="btn-add-initial" onclick="openCustomization('${p.id}')">Agregar</button>`;
        else actionBtn = `<div class="qty-controls"><button class="qty-btn" style="width:100%; font-size:0.9rem;" onclick="openCustomization('${p.id}')">Agregar Otra +</button></div>`;

        htmlContent += `
            <div class="product-card">
                ${adminBtns}
                <span class="category-badge" style="background-color: ${badgeColor}; color: white;">${p.categoria || 'Gral'}</span>
                <img src="${imgSrc}" alt="${p.nombre}" onerror="this.src='${fallbackImg}'">
                <div class="product-info">
                    <h4>${p.nombre}</h4>
                    ${descHTML}
                </div>
                ${heladasBadge}
                <span class="price-tag">$${p.precio}</span>
                ${actionBtn}
                ${totalQty > 0 ? `<small style="display:block; margin-top:5px; color:var(--primary);">Tienes ${totalQty} en carrito</small>` : ''}
            </div>`;

        if (index === 3 && currentCategory === 'all' && midBanners.length > 0) {
            htmlContent += midCarouselHTML;
        }
    });

    list.innerHTML = htmlContent;
}

window.openBannerAdmin = () => { getEl('banner-modal').style.display = 'flex'; window.toggleMenu(); };
window.closeBannerAdmin = () => { getEl('banner-modal').style.display = 'none'; };

const bannerForm = getEl('banner-form');
if (bannerForm) {
    bannerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const locVal = getEl('ban-loc') ? getEl('ban-loc').value : 'top';
            await addDoc(getAppCollection("banners"), {
                img: getEl('ban-img').value.trim(),
                ubicacion: locVal,
                categoria: getEl('ban-cat').value.trim(),
                creado: serverTimestamp()
            });
            bannerForm.reset();
            window.showAlert("Éxito", "Banner creado");
        } catch(e) { window.showAlert("Error", e.message); }
    });
}

function renderAdminBannerList() {
    const list = getEl('admin-banner-list');
    if (!list) return;

    list.innerHTML = allBanners.map(b => `
        <div style="display:flex; align-items:center; justify-content:space-between; border:1px solid #eee; padding:5px; border-radius:5px; background: #fff;">
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="banners/${b.img}" style="width:40px; height:25px; object-fit:cover; border-radius:4px;" onerror="this.style.display='none'">
                <div style="font-size:0.8rem; line-height:1.2;">
                    <strong>${b.ubicacion === 'mid' ? '⬇️ Medio' : '⬆️ Arriba'}</strong><br>
                    <span style="color:#666;">${b.categoria}</span>
                </div>
            </div>
            <button onclick="deleteBanner('${b.id}')" style="color:red; border:none; background:none; cursor:pointer;">🗑️</button>
        </div>
    `).join('');
}

window.deleteBanner = async (id) => {
    if(confirm("¿Eliminar banner?")) await deleteDoc(getAppDoc("banners", id));
};

// ==========================================
// 14. RASTREO GPS
// ==========================================
window.openTracking = (orderId) => {
    const modal = getEl('tracking-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    if (!mapInstance && window.google) {
        const defaultCoords = { lat: 26.05, lng: -98.28 }; 
        mapInstance = new google.maps.Map(document.getElementById("map"), {
            center: defaultCoords,
            zoom: 15,
            disableDefaultUI: true, 
        });

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position) => {
                const clientPos = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                new google.maps.Marker({
                    position: clientPos,
                    map: mapInstance,
                    title: "Mi Ubicación",
                    icon: {
                        url: "https://maps.google.com/mapfiles/kml/shapes/homegardenbusiness.png", 
                        scaledSize: new google.maps.Size(40, 40)
                    }
                });
                mapInstance.panTo(clientPos);
            });
        }
    }

    if (trackingListener) {
        trackingListener(); 
    }

    trackingListener = onSnapshot(getAppDoc("pedidos", orderId), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            if (data.ubicacion_repartidor) {
                const pos = { 
                    lat: data.ubicacion_repartidor.lat, 
                    lng: data.ubicacion_repartidor.lng 
                };

                if (!markerRepartidor && mapInstance) {
                    markerRepartidor = new google.maps.Marker({
                        position: pos,
                        map: mapInstance,
                        title: "Repartidor",
                        icon: {
                            url:"banners/morenitamoto.png",
                            scaledSize: new google.maps.Size(50, 50) 
                        },
                        animation: google.maps.Animation.DROP
                    });
                } else if(markerRepartidor) {
                    markerRepartidor.setPosition(pos);
                }
            }
        }
    });
};

window.closeTracking = () => {
    getEl('tracking-modal').style.display = 'none';
    
    if (trackingListener) {
        trackingListener(); 
        trackingListener = null;
    }
    
    if (markerRepartidor) {
        markerRepartidor.setMap(null);
        markerRepartidor = null;
    }
};

// ==========================================
// 15. GESTIÓN DE REPARTIDORES
// ==========================================
window.openDriversManager = () => {
    getEl('drivers-view').classList.remove('hidden');
    window.toggleMenu();
    renderDriversList();
};

function renderDriversList() {
    const list = getEl('drivers-list');
    list.innerHTML = '<div class="loader">Cargando flotilla...</div>';

    const usersRef = getAppCollection("usuarios");
    const q = query(usersRef, where("rol", "==", "repartidor"));

    onSnapshot(q, (snapshot) => {
        list.innerHTML = "";
        if (snapshot.empty) {
            list.innerHTML = "<p style='text-align:center; color:#999;'>No tienes repartidores registrados.</p>";
            return;
        }

        snapshot.forEach(doc => {
            const u = doc.data();
            list.innerHTML += `
                <div class="driver-card">
                    <div class="driver-info">
                        <h4>🏍️ ${u.nombre}</h4>
                        <small>📧 ${u.email}</small>
                    </div>
                    <div class="driver-actions" style="display:flex; gap:5px;">
                        <button onclick="openDriverStats('${doc.id}', '${u.nombre}')" style="background:#E3F2FD; color:#1565C0;">
                            📊 Auditoría
                        </button>
                        <button onclick="deleteDriver('${doc.id}', '${u.nombre}')">
                            🗑️ Baja
                        </button>
                    </div>
                </div>
            `;
        });
    });
}

const driverForm = getEl('driver-register-form');
if (driverForm) {
    driverForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        const originalText = btn.innerText;
        btn.innerText = "Registrando..."; btn.disabled = true;

        const name = getEl('drv-name').value.trim();
        const phone = getEl('drv-phone').value.trim();
        const email = getEl('drv-email').value.trim();
        const pass = getEl('drv-pass').value.trim();

        try {
            const secondaryApp = initializeApp(firebaseConfig, "Secondary");
            const secondaryAuth = getAuth(secondaryApp);

            const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
            const newUid = userCred.user.uid;

            await setDoc(getAppDoc("usuarios", newUid), {
                nombre: name,
                telefono: phone,
                email: email,
                rol: "repartidor", 
                creado: serverTimestamp()
            });

            await signOut(secondaryAuth);
            
            window.showAlert("¡Éxito!", `Repartidor ${name} registrado correctamente.`);
            getEl('driver-register-form').reset();

        } catch (error) {
            console.error(error);
            window.showAlert("Error", "No se pudo registrar: " + error.message);
        } finally {
            btn.innerText = originalText; btn.disabled = false;
        }
    });
}

window.deleteDriver = (uid, name) => {
    window.showConfirm("Dar de Baja", `¿Eliminar acceso a ${name}?`, async () => {
        try {
            await deleteDoc(getAppDoc("usuarios", uid));
            window.showAlert("Baja Exitosa", "El repartidor ya no tiene acceso.");
        } catch (e) {
            window.showAlert("Error", e.message);
        }
    });
};

// ==========================================
// 16. AUDITORÍA REPARTIDOR
// ==========================================
let currentDriverOrders = []; 

window.openDriverStats = (uid, name) => {
    getEl('stats-name').innerText = name;
    getEl('driver-stats-modal').classList.remove('hidden');
    
    const q = query(getAppCollection("pedidos"), 
        where("repartidor_uid", "==", uid),
        where("estado", "==", "entregado")
    );

    getEl('stats-orders').innerText = "...";
    
    onSnapshot(q, (snapshot) => {
        let totalOrders = 0;
        let driverEarnings = 0;
        let cashCollected = 0;
        
        currentDriverOrders = []; 

        snapshot.forEach(doc => {
            const o = doc.data();
            
            if (o.liquidado === true) return;

            currentDriverOrders.push(doc.id);

            totalOrders++;
            const shipping = o.costo_envio || 0;
            driverEarnings += shipping;

            if (o.metodo_pago === 'Efectivo') {
                cashCollected += (o.total || 0);
            }
        });

        getEl('stats-orders').innerText = totalOrders; 
        getEl('stats-earnings').innerText = "$" + driverEarnings.toFixed(2);
        getEl('stats-cash-collected').innerText = "$" + cashCollected.toFixed(2);
        getEl('stats-deduction').innerText = "- $" + driverEarnings.toFixed(2);
        
        const finalBalance = cashCollected - driverEarnings;
        const finalEl = getEl('stats-final-pay');
        const btnLiquidar = getEl('btn-liquidar-corte');
        
        if (finalBalance > 0) {
            finalEl.innerText = "$" + finalBalance.toFixed(2);
            finalEl.style.color = "#EF6C00";
            
            btnLiquidar.disabled = false;
            btnLiquidar.innerText = `💸 Recibir $${finalBalance.toFixed(2)} y Liquidar`;
            btnLiquidar.style.display = "block"; 

        } else if (finalBalance < 0) {
            finalEl.innerText = "Pagar al Repartidor: $" + Math.abs(finalBalance).toFixed(2);
            finalEl.style.color = "#2E7D32";
            
            btnLiquidar.disabled = false;
            btnLiquidar.innerText = `✅ Pagar $${Math.abs(finalBalance).toFixed(2)} y Liquidar`;
            btnLiquidar.style.display = "block";

        } else {
            finalEl.innerText = "$0.00";
            finalEl.style.color = "#333";
            btnLiquidar.style.display = "none"; 
        }
    });
};

window.settleDebt = async () => {
    if (currentDriverOrders.length === 0) return;
    
    if(!confirm("⚠️ ¿Confirmas que el dinero ha cambiado de manos?\n\nEsta acción pondrá el saldo del repartidor en $0.00 y no se puede deshacer.")) return;

    const btn = getEl('btn-liquidar-corte');
    btn.innerText = "Procesando...";
    btn.disabled = true;

    try {
        const batchPromises = currentDriverOrders.map(orderId => 
            updateDoc(getAppDoc("pedidos", orderId), { 
                liquidado: true,
                fecha_liquidacion: serverTimestamp() 
            })
        );

        await Promise.all(batchPromises);
        
        window.showAlert("¡Corte Exitoso!", "El saldo se ha reiniciado correctamente.");
        
    } catch (e) {
        console.error(e);
        window.showAlert("Error", "Falló la liquidación: " + e.message);
        btn.disabled = false;
    }
};

window.closeDriverStats = () => {
    getEl('driver-stats-modal').classList.add('hidden');
};

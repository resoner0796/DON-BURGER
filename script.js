import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, onSnapshot, serverTimestamp, query, orderBy, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// =================================================================
// 1. CONFIGURACIÓN FIREBASE & RUTAS (Don Burger)
// =================================================================
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

// Rutas de Colección Maestra (Separación de Datos)
const MAIN_COLLECTION = "Don Burger";
const MAIN_DOC = "App";
// Helper function para colecciones
const getAppCollection = (colName) => collection(db, MAIN_COLLECTION, MAIN_DOC, colName);
// Helper function para documentos
const getAppDoc = (colName, docId) => doc(db, MAIN_COLLECTION, MAIN_DOC, colName, docId);

// =================================================================
// 2. ESTADO GLOBAL
// =================================================================
let allProducts = [];
let allIngredients = []; // Cache de ingredientes
let currentRecipe = [];  // Para el constructor de recetas en Admin
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
let mapInstance = null;
let markerRepartidor = null;
let watchId = null; 
let trackingListener = null; 

window.initMap = () => { console.log("Google Maps API cargada."); };

// =================================================================
// 3. UI HELPERS & THEME
// =================================================================
const getEl = (id) => document.getElementById(id);

window.toggleMenu = () => { 
    const d = getEl('side-drawer'); const o = getEl('menu-overlay');
    if(d && o) { d.classList.toggle('open'); o.classList.toggle('active'); }
};

window.toggleCart = () => { getEl('cart-drawer').classList.toggle('open'); };

window.showAlert = (t, m) => { 
    getEl('alert-title').innerText=t; 
    getEl('alert-msg').innerText=m; 
    getEl('alert-modal').style.display='flex'; 
};
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

// Logic de Tema (Persistente)
if (localStorage.getItem('dark-mode') === null) { 
    localStorage.setItem('dark-mode', 'true'); 
    document.body.classList.add('dark-mode'); 
} else if (localStorage.getItem('dark-mode') === 'true') { 
    document.body.classList.add('dark-mode'); 
}

if(getEl('theme-toggle')) {
    getEl('theme-toggle').addEventListener('click', () => { 
        document.body.classList.toggle('dark-mode'); 
        localStorage.setItem('dark-mode', document.body.classList.contains('dark-mode')); 
    });
}

// =================================================================
// 4. AUTENTICACIÓN
// =================================================================
let isRegistering = false;
window.openAuth = () => { getEl('auth-modal').style.display = 'flex'; window.toggleMenu(); };
window.closeAuth = () => getEl('auth-modal').style.display = 'none';

window.toggleAuthMode = () => {
    isRegistering = !isRegistering;
    getEl('auth-title').innerText = isRegistering ? "Crear Cuenta" : "Acceso";
    getEl('reg-fields').classList.toggle('hidden');
    getEl('auth-form').querySelector('button').innerText = isRegistering ? "Registrarse" : "Entrar";
};

if (getEl('auth-form')) {
    getEl('auth-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = getEl('auth-email').value; 
        const pass = getEl('auth-pass').value;
        try {
            if (isRegistering) {
                const name = getEl('reg-name').value; 
                const phone = getEl('reg-phone').value;
                if(!name || !phone) return window.showAlert("Datos", "Nombre y celular obligatorios.");
                
                const userCred = await createUserWithEmailAndPassword(auth, email, pass);
                await setDoc(getAppDoc("usuarios", userCred.user.uid), { 
                    nombre: name, 
                    telefono: phone, 
                    email: email, 
                    creado: serverTimestamp() 
                });
                window.showAlert("¡Bienvenido!", "Cuenta creada exitosamente.");
            } else { 
                await signInWithEmailAndPassword(auth, email, pass); 
            }
            closeAuth();
        } catch (err) { window.showAlert("Error", "Datos incorrectos o usuario existente."); }
    });
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userDoc = await getDoc(getAppDoc("usuarios", user.uid));
            currentUserData = userDoc.exists() ? userDoc.data() : { email: user.email, nombre: "Usuario" };
            getEl('user-name-display').innerText = currentUserData.nombre;
        } catch (e) { currentUserData = { email: user.email, nombre: "Usuario" }; }
        
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

// =================================================================
// 5. GESTIÓN DE INGREDIENTES (Lógica Completa)
// =================================================================
window.openIngredientsManager = () => {
    getEl('ingredients-view').classList.remove('hidden'); 
    window.toggleMenu();
    resetIngForm();
};

const ingForm = getEl('add-ingredient-form');
if (ingForm) {
    ingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = getEl('ing-id').value;
        const nameVal = getEl('ing-name').value.trim();
        const unitVal = getEl('ing-unit').value;
        const costVal = parseFloat(getEl('ing-cost').value);

        if(!nameVal || isNaN(costVal)) return window.showAlert("Error", "Revisa los datos");

        const data = {
            name: nameVal,
            unit: unitVal,
            costPerUnit: costVal
        };
        try {
            if (id) {
                await updateDoc(getAppDoc("ingredients", id), data);
                window.showAlert("Actualizado", "Insumo modificado correctamente.");
            } else {
                await addDoc(getAppCollection("ingredients"), data);
                window.showAlert("Guardado", "Insumo creado correctamente.");
            }
            resetIngForm();
        } catch(e) { window.showAlert("Error", e.message); }
    });
}

// Escuchar cambios en ingredientes en tiempo real
onSnapshot(getAppCollection("ingredients"), (snap) => {
    allIngredients = [];
    const container = getEl('ingredients-list-container');
    const selector = getEl('recipe-ing-select');
    
    if(container) container.innerHTML = '';
    if(selector) selector.innerHTML = '<option value="">-- Seleccionar Insumo --</option>';

    if(snap.empty && container) {
        container.innerHTML = "<p>No hay insumos registrados.</p>";
    }

    snap.forEach(doc => {
        const d = { id: doc.id, ...doc.data() };
        allIngredients.push(d);
        
        // Renderizar lista para gestión
        if(container) {
            container.innerHTML += `
            <div style="background:white; padding:12px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; border-radius:8px; margin-bottom:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <div style="color:#333;">
                    <strong style="font-size:1.05rem;">${d.name}</strong><br>
                    <small style="color:#666;">Costo: $${d.costPerUnit} / ${d.unit}</small>
                </div>
                <div style="display:flex; gap:10px;">
                    <button onclick="editIng('${d.id}')" style="color:#1976D2; border:1px solid #1976D2; background:none; cursor:pointer; padding:5px 10px; border-radius:4px;">Editar</button>
                    <button onclick="deleteIng('${d.id}')" style="color:#D32F2F; border:1px solid #D32F2F; background:none; cursor:pointer; padding:5px 10px; border-radius:4px;">Borrar</button>
                </div>
            </div>`;
        }
        
        // Poblar el selector del constructor de recetas
        if(selector) {
            selector.innerHTML += `<option value="${d.id}" data-unit="${d.unit}" data-cost="${d.costPerUnit}">${d.name} (${d.unit})</option>`;
        }
    });
});

window.editIng = (id) => {
    const ing = allIngredients.find(i => i.id === id);
    if(ing) {
        getEl('ing-id').value = ing.id;
        getEl('ing-name').value = ing.name;
        getEl('ing-unit').value = ing.unit;
        getEl('ing-cost').value = ing.costPerUnit;
        getEl('btn-save-ing').innerText = "Actualizar Insumo";
        getEl('add-ingredient-form').scrollIntoView({behavior: "smooth"});
    }
};

window.deleteIng = (id) => { 
    if(confirm("¿Estás seguro de eliminar este insumo? Se borrará del sistema.")) {
        deleteDoc(getAppDoc("ingredients", id)); 
    }
};

function resetIngForm() { 
    getEl('add-ingredient-form').reset(); 
    getEl('ing-id').value = ''; 
    getEl('btn-save-ing').innerText = "Guardar Insumo"; 
}

// =================================================================
// 6. GESTIÓN DE PRODUCTOS & RECETAS (Lógica Completa)
// =================================================================
window.openAdmin = () => { 
    getEl('admin-form').reset(); 
    getEl('p-id').value = ''; 
    currentRecipe = []; 
    getEl('sizes-container').innerHTML = '';
    getEl('recipe-list-display').innerHTML = '';
    renderRecipeList();
    toggleProductFields();
    getEl('admin-modal').style.display = 'flex'; 
    window.toggleMenu(); 
};

window.closeAdmin = () => getEl('admin-modal').style.display = 'none';

window.toggleProductFields = () => {
    const type = getEl('p-type').value;
    // Ocultar todos primero
    getEl('fields-recipe').classList.add('hidden');
    getEl('fields-sizes').classList.add('hidden');
    getEl('fields-options').classList.add('hidden');
    getEl('price-container').classList.remove('hidden');
    getEl('cost-container').classList.remove('hidden');

    // Mostrar según tipo
    if (type === 'burger') {
        getEl('fields-recipe').classList.remove('hidden');
    } else if (type === 'fries') { 
        getEl('fields-sizes').classList.remove('hidden'); 
        getEl('price-container').classList.add('hidden'); // Precio se define por tamaño en papas
    } else if (type === 'soda') {
        getEl('fields-options').classList.remove('hidden');
    }
};

// --- LOGICA DE RECETAS (Constructor) ---
window.addToRecipe = () => {
    const sel = getEl('recipe-ing-select');
    const qtyInput = getEl('recipe-qty');
    const qty = parseFloat(qtyInput.value);
    
    if (!sel.value || !qty || qty <= 0) return alert("Selecciona insumo y cantidad válida");
    
    const ing = allIngredients.find(i => i.id === sel.value);
    if(!ing) return;

    // Agregar a la receta temporal
    currentRecipe.push({ 
        id: ing.id, 
        name: ing.name, 
        qty: qty, 
        unit: ing.unit, 
        costPerUnit: ing.costPerUnit 
    });
    
    renderRecipeList();
    qtyInput.value = '';
    sel.value = '';
};

function renderRecipeList() {
    const list = getEl('recipe-list-display');
    list.innerHTML = '';
    let totalCost = 0;
    
    if(currentRecipe.length === 0) {
        list.innerHTML = "<small>No hay ingredientes en la receta.</small>";
    }

    currentRecipe.forEach((item, idx) => {
        // Cálculo de costo simple: (CostoUnitario * Cantidad)
        // NOTA: Aquí se podría agregar lógica de conversión de unidades (g -> kg) si fuera necesario.
        // Por simplicidad del sistema actual, asumimos que el usuario ingresa la cantidad acorde a la unidad de costo.
        const itemCost = item.costPerUnit * item.qty; 
        totalCost += itemCost;
        
        list.innerHTML += `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px dashed #ccc; padding:4px 0;">
            <span style="font-size:0.9rem;">${item.qty} ${item.unit} <b>${item.name}</b></span>
            <span onclick="removeFromRecipe(${idx})" style="color:red; cursor:pointer; font-weight:bold; padding:0 5px;">&times;</span>
        </div>`;
    });
    
    // Actualizar UI de Costo Calculado
    getEl('calc-cost').innerText = "$" + totalCost.toFixed(2);
    // Auto-llenar el campo de costo del formulario principal
    getEl('p-cost').value = totalCost.toFixed(2);
    calcProfit(); // Recalcular ganancia
}

window.removeFromRecipe = (idx) => { 
    currentRecipe.splice(idx, 1); 
    renderRecipeList(); 
};

// --- LOGICA DE TAMAÑOS (Para Papas) ---
window.addSizeInput = (name = '', price = '') => {
    const div = document.createElement('div');
    div.className = "size-row";
    div.style.display = "flex"; 
    div.style.gap="5px"; 
    div.style.marginBottom="5px";
    
    div.innerHTML = `
        <input type="text" placeholder="Nombre (Ej: Chica)" class="input-field size-name" value="${name}" style="margin:0; flex:2;">
        <input type="number" placeholder="Precio ($)" class="input-field size-price" value="${price}" style="margin:0; flex:1;">
        <button type="button" onclick="this.parentElement.remove()" style="color:white; background:#D32F2F; border:none; border-radius:4px; width:30px;">&times;</button>
    `;
    getEl('sizes-container').appendChild(div);
};

// --- Cálculo de Ganancia en Tiempo Real ---
getEl('p-price').addEventListener('input', calcProfit);
getEl('p-cost').addEventListener('input', calcProfit);

function calcProfit() {
    const price = parseFloat(getEl('p-price').value) || 0;
    const cost = parseFloat(getEl('p-cost').value) || 0;
    const profit = price - cost;
    const margin = price > 0 ? ((profit/price)*100).toFixed(0) : 0;
    
    const profitLabel = getEl('calc-profit');
    profitLabel.innerText = `$${profit.toFixed(2)} (${margin}%)`;
    
    if(profit < 0) profitLabel.style.color = "red";
    else if(profit > 0) profitLabel.style.color = "green";
    else profitLabel.style.color = "black";
}

// --- GUARDAR PRODUCTO (Lógica Final) ---
getEl('admin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = getEl('btn-save-prod');
    const originalText = btn.innerText;
    btn.disabled = true; btn.innerText = "Guardando...";

    const type = getEl('p-type').value;
    
    // Recopilar Tamaños si es Papas
    let sizes = [];
    if(type === 'fries') {
        document.querySelectorAll('.size-row').forEach(row => {
            const sName = row.querySelector('.size-name').value.trim();
            const sPrice = parseFloat(row.querySelector('.size-price').value);
            if(sName && !isNaN(sPrice)) {
                sizes.push({ name: sName, price: sPrice });
            }
        });
        if(sizes.length === 0) {
            btn.disabled = false; btn.innerText = originalText;
            return window.showAlert("Faltan Tamaños", "Agrega al menos un tamaño para las papas.");
        }
    }

    const data = {
        name: getEl('p-name').value.trim(),
        descripcion: getEl('p-desc').value.trim(),
        type: type,
        stock: parseInt(getEl('p-stock').value) || 0,
        categoria: getEl('p-cat').value.trim().toLowerCase(),
        img: getEl('p-img').value.trim(),
        cost: parseFloat(getEl('p-cost').value) || 0, 
        isVisible: true,
        // Si editamos, no sobreescribimos 'creado', pero Firestore hace merge.
        // Si es nuevo, añadimos fecha.
    };

    if(type === 'burger') {
        data.recipe = currentRecipe; // Guardar array de receta
        data.price = parseFloat(getEl('p-price').value);
    } else if (type === 'fries') {
        data.sizes = sizes;
        data.price = sizes[0].price; // Precio base para mostrar "Desde $X"
    } else if (type === 'soda') {
        data.options = getEl('p-options').value.split('\n').map(s=>s.trim()).filter(x=>x);
        data.price = parseFloat(getEl('p-price').value);
    } else {
        data.price = parseFloat(getEl('p-price').value);
    }

    try {
        const id = getEl('p-id').value;
        if(id) {
            await updateDoc(getAppDoc("productos", id), data);
            window.showAlert("Éxito", "Producto actualizado correctamente.");
        } else {
            data.creado = serverTimestamp();
            await addDoc(getAppCollection("productos"), data);
            window.showAlert("Éxito", "Producto nuevo creado.");
        }
        closeAdmin(); 
    } catch(e) { 
        console.error(e);
        window.showAlert("Error", "No se pudo guardar: " + e.message); 
    } finally {
        btn.disabled = false; btn.innerText = originalText;
    }
});

// --- EDITAR PRODUCTO (Poblar Formulario) ---
window.editProduct = (id) => {
    const p = allProducts.find(x => x.id === id);
    if(!p) return;
    
    openAdmin();
    // Llenar campos básicos
    getEl('p-id').value = p.id;
    getEl('p-name').value = p.name;
    getEl('p-type').value = p.type || 'extra';
    
    // Trigger visual para mostrar campos correctos
    toggleProductFields(); 
    
    getEl('p-desc').value = p.descripcion || '';
    getEl('p-cat').value = p.categoria;
    getEl('p-img').value = p.img || '';
    getEl('p-cost').value = p.cost || 0;
    getEl('p-stock').value = p.stock || 0;

    // Llenar campos específicos
    if(p.type === 'burger') {
        getEl('p-price').value = p.price;
        currentRecipe = p.recipe ? JSON.parse(JSON.stringify(p.recipe)) : []; // Deep copy para no alterar cache
        renderRecipeList();
    } else if(p.type === 'fries') {
        getEl('sizes-container').innerHTML = '';
        if(p.sizes && p.sizes.length > 0) {
            p.sizes.forEach(s => addSizeInput(s.name, s.price));
        } else {
            addSizeInput(); // Agregar uno vacío si no hay
        }
    } else if(p.type === 'soda') {
        getEl('p-price').value = p.price;
        getEl('p-options').value = (p.options || []).join('\n');
    } else {
        getEl('p-price').value = p.price;
    }
    
    calcProfit(); // Actualizar label de ganancia
};

window.deleteProduct = (id) => window.showConfirm("Borrar", "¿Eliminar este producto?", async () => {
    try {
        await deleteDoc(getAppDoc("productos", id));
        window.showAlert("Eliminado", "Producto borrado.");
    } catch(e) { window.showAlert("Error", e.message); }
});

// =================================================================
// 7. RENDERIZADO DE MENÚ (CLIENTE)
// =================================================================
onSnapshot(getAppCollection("productos"), (snap) => {
    allProducts = [];
    snap.forEach(d => allProducts.push({id: d.id, ...d.data()}));
    
    // Actualizar todas las vistas que dependen de productos
    renderCategories(); 
    renderProducts(); 
    renderInventory();
});

function renderCategories() {
    const cats = new Set(allProducts.map(p => p.categoria || 'Gral'));
    const list = getEl('category-list'); 
    if(!list) return;
    
    let h = `<li onclick="filterProducts('all')" class="${currentCategory==='all'?'active-cat':''}">Todo</li>`;
    cats.forEach(c => {
        // Formato visual lindo para categorías (Mayúscula inicial)
        const displayCat = c.charAt(0).toUpperCase() + c.slice(1);
        h += `<li onclick="filterProducts('${c}')" class="${currentCategory===c?'active-cat':''}">${displayCat}</li>`;
    });
    list.innerHTML = h;
    
    // Actualizar datalist del admin
    const sugg = getEl('cat-suggestions'); 
    if(sugg) sugg.innerHTML = Array.from(cats).map(c=>`<option value="${c}">`).join('');
}

window.filterProducts = (c) => { 
    currentCategory = c; 
    renderCategories(); // Para actualizar clase active
    renderProducts(); 
    if(window.innerWidth < 768) window.toggleMenu(); 
};

function renderProducts() {
    const list = getEl('product-list');
    const search = getEl('search').value.toLowerCase();
    
    const filtered = allProducts.filter(p => {
        const isVisible = p.visible !== false;
        const matchesCat = currentCategory==='all' || p.categoria===currentCategory;
        const matchesSearch = p.name.toLowerCase().includes(search);
        return isVisible && matchesCat && matchesSearch;
    });
    
    let html = '';
    filtered.forEach(p => {
        let priceDisplay = '';
        if(p.type === 'fries' && p.sizes && p.sizes.length > 0) {
            priceDisplay = `Desde $${p.sizes[0].price}`;
        } else {
            priceDisplay = `$${p.price || 0}`;
        }
        
        let btnAction = `<button class="btn-add-initial" onclick="preAddToCart('${p.id}')">Agregar</button>`;
        
        // Botones de Admin si el usuario es Admin
        let adminOverlay = '';
        if(currentUserData?.email === ADMIN_EMAIL) {
            adminOverlay = `
            <div class="admin-card-actions">
                <button class="mini-btn btn-edit" onclick="editProduct('${p.id}')">✏️</button>
                <button class="mini-btn btn-del" onclick="deleteProduct('${p.id}')">🗑️</button>
            </div>`;
        }

        const imgUrl = p.img || 'https://placehold.co/150?text=Burger';

        html += `
        <div class="product-card">
            ${adminOverlay}
            <span class="category-badge">${p.categoria}</span>
            <img src="${imgUrl}" onerror="this.src='https://placehold.co/150?text=Sin+Foto'">
            <div class="product-info">
                <h4>${p.name}</h4>
                <div class="product-desc">${p.descripcion || ''}</div>
            </div>
            <span class="price-tag">${priceDisplay}</span>
            ${btnAction}
        </div>`;
    });
    list.innerHTML = html || '<p style="text-align:center; color:#888; width:100%; grid-column:1/-1;">No hay productos aquí.</p>';
}

// =================================================================
// 8. LOGICA DE CARRITO Y OPCIONES
// =================================================================
window.preAddToCart = (id) => {
    const p = allProducts.find(x => x.id === id);
    if(!p) return;

    if(p.type === 'fries') {
        if(!p.sizes || p.sizes.length === 0) return alert("Error: No hay tamaños definidos.");
        
        // Crear texto para el prompt
        let optionsText = p.sizes.map((s,i) => `${i+1}. ${s.name} ($${s.price})`).join('\n');
        let choice = prompt(`Elige el tamaño (Escribe el número):\n${optionsText}`);
        
        if(choice) {
            let idx = parseInt(choice) - 1;
            if(p.sizes[idx]) {
                // Agregar variante específica
                addToCart({...p, price: p.sizes[idx].price, variant: p.sizes[idx].name});
            } else {
                alert("Opción no válida");
            }
        }
    } else if (p.type === 'soda') {
        if(!p.options || p.options.length === 0) return alert("Error: No hay sabores definidos.");
        
        let optionsText = p.options.map((o,i) => `${i+1}. ${o}`).join('\n');
        let choice = prompt(`Elige el sabor (Escribe el número):\n${optionsText}`);
        
        if(choice) {
            let idx = parseInt(choice) - 1;
            if(p.options[idx]) {
                addToCart({...p, variant: p.options[idx]});
            } else {
                alert("Opción no válida");
            }
        }
    } else {
        // Producto normal (Burger, Extra)
        addToCart(p);
    }
};

function addToCart(product) {
    // Buscar si ya existe producto + variante exactamente igual en el carrito
    const exist = cart.find(i => i.id === product.id && i.variant === product.variant);
    
    if(exist) { 
        exist.qty++; 
    } else { 
        // Crear nuevo item en carrito
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            variant: product.variant || '',
            qty: 1,
            cost: product.cost || 0, // Importante para ganancia
            type: product.type
        }); 
    }
    updateCartUI();
    window.toggleCart(); // Abrir carrito al agregar
}

window.modifyQtyByIndex = (idx, chg) => {
    cart[idx].qty += chg;
    if(cart[idx].qty <= 0) cart.splice(idx, 1);
    updateCartUI();
};

window.setDeliveryMode = (m) => {
    isPickup = (m === 'pickup');
    // Actualizar visualmente los botones
    getEl('btn-mode-delivery').className = `btn-mode ${!isPickup?'active':''}`;
    getEl('btn-mode-pickup').className = `btn-mode ${isPickup?'active':''}`;
    
    // Mostrar/Ocultar campos dirección
    getEl('address-section').classList.toggle('hidden', isPickup);
    getEl('pickup-msg').classList.toggle('hidden', !isPickup);
    
    updateCartUI(); // Recalcular total (envío)
};

function updateCartUI() {
    const badge = getEl('cart-badge');
    const count = cart.reduce((s,i)=>s+i.qty,0);
    
    if(badge) {
        badge.innerText = count; 
        badge.classList.toggle('hidden', count===0);
    }
    
    const sub = cart.reduce((s,i)=>s+(i.price*i.qty),0);
    const shipping = isPickup ? 0 : DELIVERY_COST;
    const total = sub + shipping;

    getEl('cart-subtotal').innerText = `$${sub}`;
    getEl('checkout-subtotal').innerText = `$${sub}`;
    getEl('checkout-shipping').innerText = isPickup ? "GRATIS" : `$${DELIVERY_COST}`;
    getEl('checkout-total').innerText = `$${total}`;
    
    getEl('cart-items').innerHTML = cart.map((item, idx) => `
        <div class="cart-item-row">
            <div class="cart-info">
                <h5 style="margin:0;">${item.name} ${item.variant ? `<small style="color:orange;">(${item.variant})</small>` : ''}</h5>
                <small>$${item.price} c/u</small>
            </div>
            <div class="cart-qty-selector">
                <button class="cart-mini-btn" onclick="modifyQtyByIndex(${idx}, -1)">-</button>
                <span class="cart-qty-num">${item.qty}</span>
                <button class="cart-mini-btn" onclick="modifyQtyByIndex(${idx}, 1)">+</button>
            </div>
        </div>
    `).join('');
    
    // Recalcular cambio si ya ingresó dinero
    if(getEl('cash-amount') && getEl('cash-amount').value) window.calcChange();
}

window.goToCheckout = () => {
    if(cart.length===0) return window.showAlert("Carrito Vacío", "Agrega productos antes de pedir.");
    if(!currentUserData) { window.toggleCart(); window.openAuth(); return; }
    
    getEl('cart-view').classList.add('hidden'); 
    getEl('checkout-view').classList.remove('hidden');
    window.handlePaymentChange();
};

window.backToCart = () => { 
    getEl('checkout-view').classList.add('hidden'); 
    getEl('cart-view').classList.remove('hidden'); 
};

window.handlePaymentChange = () => {
    const m = document.querySelector('input[name="payment"]:checked').value;
    const det = getEl('payment-details');
    det.classList.remove('hidden');
    
    if(m==='Efectivo') {
        det.innerHTML = `
            <label style="font-weight:bold;">¿Con cuánto pagas?</label>
            <input type="number" id="cash-amount" class="input-checkout" placeholder="Ej: 200" onkeyup="calcChange()"> 
            <div id="change-display" style="font-weight:bold; margin-top:5px; font-size:1.1rem;"></div>`;
    } else if(m==='Terminal') {
        det.innerHTML = `<p style="color:#aaa; text-align:center;">El repartidor llevará la terminal a tu domicilio.</p>`;
    } else {
        det.innerHTML = `
            <div style="background:rgba(255,255,255,0.1); padding:10px; border-radius:8px; text-align:center;">
                <p>Banco: <b>BBVA</b></p>
                <p>Cuenta: <b>Don Burger</b></p>
                <p style="font-size:1.2rem; letter-spacing:1px; cursor:pointer;" onclick="copyClabe()">${CLABE_NUMBER} 📋</p>
            </div>`;
    }
};

window.calcChange = () => {
    const input = getEl('cash-amount');
    if(!input) return;
    
    const pay = parseFloat(input.value);
    const sub = cart.reduce((s,i)=>s+(i.price*i.qty),0);
    const tot = sub + (isPickup?0:DELIVERY_COST);
    const disp = getEl('change-display');
    
    if(!pay) {
        disp.innerHTML = "$0.00";
    } else if(pay < tot) {
        disp.innerHTML = "<span style='color:#D32F2F'>Falta dinero</span>";
    } else {
        disp.innerHTML = `<span style='color:#43A047'>Cambio: $${(pay-tot).toFixed(2)}</span>`;
    }
};

window.copyClabe = () => {
    navigator.clipboard.writeText(CLABE_NUMBER);
    window.showAlert("Copiado", "CLABE copiada al portapapeles.");
};

window.processOrder = async () => {
    if(!isPickup) {
        const calle = getEl('address-street').value;
        const num = getEl('address-num').value;
        const ref = getEl('address-ref').value;
        if(!calle || !num || !ref) return window.showAlert("Faltan Datos", "Por favor completa la dirección de entrega.");
    }
    
    const subtotal = cart.reduce((s, i) => s + (i.price * i.qty), 0);
    const totalCost = cart.reduce((s, i) => s + ((i.cost || 0) * i.qty), 0);
    const total = subtotal + (isPickup ? 0 : DELIVERY_COST);
    
    const btn = getEl('btn-confirm-order'); 
    btn.disabled = true; 
    btn.innerText = "Enviando...";
    
    // Datos extras de pago
    let extraData = {};
    const method = document.querySelector('input[name="payment"]:checked').value;
    if(method === 'Efectivo') {
        const payAmount = parseFloat(getEl('cash-amount').value);
        if(!payAmount || payAmount < total) {
            btn.disabled = false; btn.innerText = "Confirmar Pedido";
            return window.showAlert("Pago", "Indica con cuánto pagas (debe cubrir el total).");
        }
        extraData.monto_pago = payAmount;
        extraData.cambio = payAmount - total;
    }

    const orderData = {
        folio: await generateOrderFolio(),
        usuario_email: currentUserData?.email || 'anonimo',
        usuario_nombre: currentUserData?.nombre || 'Cliente',
        usuario_telefono: currentUserData?.telefono || '',
        items: cart,
        subtotal: subtotal,
        totalCost: totalCost, // Esencial para el Dashboard de Ganancias
        costo_envio: isPickup ? 0 : DELIVERY_COST,
        total: total,
        direccion: isPickup ? {calle: 'Recoger en Tienda'} : { 
            calle: getEl('address-street').value, 
            numero: getEl('address-num').value, 
            referencia: getEl('address-ref').value 
        },
        tipo_entrega: isPickup ? 'pickup' : 'delivery',
        metodo_pago: method,
        fecha: serverTimestamp(),
        estado: 'recibido',
        ...extraData
    };
    
    try {
        await addDoc(getAppCollection("pedidos"), orderData);
        
        cart = []; 
        updateCartUI(); 
        backToCart(); 
        window.toggleCart();
        window.showAlert("¡Pedido Enviado!", `Tu folio es: ${orderData.folio}. Espera confirmación.`);
    } catch(e) {
        console.error(e);
        window.showAlert("Error", "No se pudo enviar el pedido. Revisa tu internet.");
    } finally {
        btn.disabled = false; 
        btn.innerText = "Confirmar Pedido";
    }
};

async function generateOrderFolio() {
    const ref = getAppDoc("contadores", "pedidos");
    // Transacción simple o lectura/escritura atómica
    try {
        const snap = await getDoc(ref);
        let c = 1;
        if(snap.exists()) {
            c = snap.data().count + 1;
            await updateDoc(ref, {count: c});
        } else {
            await setDoc(ref, {count: 1});
        }
        return "DB-" + String(c).padStart(4, '0');
    } catch(e) {
        // Fallback random por si falla contador
        return "DB-" + Math.floor(Math.random()*10000);
    }
}

// =================================================================
// 9. PANTALLA COCINA (KDS)
// =================================================================
window.openKitchenMode = () => {
    getEl('kitchen-view').classList.remove('hidden'); 
    window.toggleMenu();
    
    // Escuchar solo pedidos activos
    const q = query(getAppCollection("pedidos"), where("estado", "in", ["recibido", "surtiendo"]), orderBy("fecha", "asc"));
    
    onSnapshot(q, (snap) => {
        const cont = getEl('kitchen-orders-container');
        if(snap.empty) {
            cont.innerHTML = "<h2 style='color:#555; text-align:center; width:100%; grid-column:1/-1;'>No hay pedidos pendientes 👨‍🍳</h2>";
            return;
        }
        
        cont.innerHTML = snap.docs.map(doc => {
            const o = doc.data();
            const id = doc.id;
            const time = o.fecha ? o.fecha.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
            
            // Colores
            const isNew = o.estado === 'recibido';
            const borderCol = isNew ? '#D32F2F' : '#FF6F00'; // Rojo vs Naranja
            const btnTxt = isNew ? '🔥 A LA PARRILLA' : '✅ LISTO PARA ENTREGA';
            const nextSt = isNew ? 'surtiendo' : (o.tipo_entrega==='pickup'?'entregado':'camino');
            
            return `
            <div style="background:#222; color:white; border-radius:8px; border-top:6px solid ${borderCol}; padding:15px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 4px 10px rgba(0,0,0,0.5);">
                <div>
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #444; padding-bottom:10px; margin-bottom:10px;">
                        <span style="font-size:1.3rem; font-weight:bold;">${o.folio}</span>
                        <span style="background:#444; padding:2px 8px; border-radius:4px;">${time}</span>
                    </div>
                    <ul style="padding-left:20px; font-size:1.1rem; line-height:1.5;">
                        ${o.items.map(i => `<li><b>${i.qty}</b> ${i.name} <small style="color:#FFC107;">${i.variant || ''}</small></li>`).join('')}
                    </ul>
                    <div style="margin-top:15px; color:#aaa; font-style:italic;">
                        ${o.tipo_entrega==='pickup' ? '🛍️ Cliente recoge' : '🛵 Servicio a Domicilio'}
                    </div>
                </div>
                <button onclick="updateStatus('${id}', '${nextSt}')" style="width:100%; margin-top:15px; padding:15px; border:none; background:${borderCol}; color:white; font-weight:bold; cursor:pointer; border-radius:6px; font-size:1rem;">
                    ${btnTxt}
                </button>
            </div>`;
        }).join('');
    });
};

window.updateStatus = async (id, st) => {
    try {
        const updateData = { estado: st };
        if(st === 'entregado') updateData.fecha_entrega = serverTimestamp();
        
        await updateDoc(getAppDoc("pedidos", id), updateData);
    } catch(e) {
        window.showAlert("Error", "No se pudo actualizar estado");
    }
};

// =================================================================
// 10. ADMIN DASHBOARD & LISTAS
// =================================================================
window.openOrdersPanel = () => { getEl('orders-view').classList.remove('hidden'); window.toggleMenu(); loadOrders(true); };
window.closeOrdersPanel = () => getEl('orders-view').classList.add('hidden');
window.openClientOrders = () => { getEl('client-orders-view').classList.remove('hidden'); window.toggleMenu(); loadOrders(false); };

function loadOrders(isAdmin) {
    const list = isAdmin ? getEl('orders-list') : getEl('client-orders-list');
    
    // Consulta
    const q = isAdmin 
        ? query(getAppCollection("pedidos"), orderBy("fecha", "desc")) 
        : query(getAppCollection("pedidos"), where("usuario_email", "==", currentUserData.email), orderBy("fecha", "desc"));
        
    onSnapshot(q, (snap) => {
        if(snap.empty) { list.innerHTML = "<p style='text-align:center; padding:20px;'>Sin historial.</p>"; return; }
        
        list.innerHTML = snap.docs.map(doc => {
            const o = doc.data();
            const date = o.fecha ? o.fecha.toDate().toLocaleString() : '';
            // Botón track solo si es cliente y está en camino
            const trackBtn = (!isAdmin && o.estado === 'camino') 
                ? `<button onclick="openTracking('${doc.id}')" style="width:100%; padding:10px; background:#FF6F00; border:none; color:white; font-weight:bold; margin-top:10px; border-radius:4px;">📍 RASTREAR PEDIDO</button>` 
                : '';
                
            return `
            <div class="order-card status-${o.estado}" style="background:white; padding:15px; margin-bottom:10px; border-radius:8px; border-left:5px solid #ccc; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
                <div style="display:flex; justify-content:space-between;">
                    <strong>${o.folio}</strong>
                    <span style="text-transform:uppercase; font-size:0.8rem; font-weight:bold;">${o.estado}</span>
                </div>
                <small style="color:#666;">${date}</small>
                <div style="margin-top:5px; font-weight:bold;">$${o.total}</div>
                ${trackBtn}
                ${isAdmin ? `<button onclick="initDeleteOrder('${doc.id}')" style="float:right; color:red; border:none; background:none;">Eliminar</button>` : ''}
            </div>`;
        }).join('');
    });
}

// Tracking GPS
window.openTracking = (id) => {
    getEl('tracking-modal').style.display='flex';
    if(!mapInstance) mapInstance = new google.maps.Map(getEl('map'), { center: {lat:26.05, lng:-98.28}, zoom:14 });
    
    onSnapshot(getAppDoc("pedidos", id), (doc) => {
        if(!doc.exists()) return;
        const d = doc.data();
        if(d.ubicacion_repartidor) {
            const pos = d.ubicacion_repartidor;
            if(!markerRepartidor) markerRepartidor = new google.maps.Marker({position:pos, map:mapInstance, icon:'https://maps.google.com/mapfiles/kml/shapes/motorcycling.png'});
            else markerRepartidor.setPosition(pos);
            mapInstance.panTo(pos);
        }
    });
};
window.closeTracking = () => getEl('tracking-modal').style.display='none';

// Drivers Logic
window.openDriversManager = () => { getEl('drivers-view').classList.remove('hidden'); window.toggleMenu(); renderDrivers(); };
function renderDrivers() {
    onSnapshot(query(getAppCollection("usuarios"), where("rol","==","repartidor")), (snap) => {
        getEl('drivers-list').innerHTML = snap.empty ? "Sin repartidores." : snap.docs.map(d => 
            `<div style="padding:15px; background:white; border-bottom:1px solid #eee; display:flex; justify-content:space-between;">
                <b>${d.data().nombre}</b> 
                <div>
                    <button onclick="openDriverStats('${d.id}', '${d.data().nombre}')" style="margin-right:10px;">📊</button>
                    <button onclick="deleteDriver('${d.id}')" style="color:red;">🗑️</button>
                </div>
            </div>`
        ).join('');
    });
}
window.deleteDriver = (id) => deleteDoc(getAppDoc("usuarios", id));

// Sales Dashboard (Full Analytics)
window.openSalesDashboard = async () => {
    getEl('sales-dashboard-view').classList.remove('hidden'); 
    window.toggleMenu();
    
    const snap = await getDocs(query(getAppCollection("pedidos"), where("estado","==","entregado"), orderBy("fecha","desc")));
    let sales=0, profit=0, count=0;
    const itemCounts = {};
    const today = new Date().toDateString();
    
    snap.forEach(d => {
        const o = d.data();
        if(o.fecha.toDate().toDateString() === today) {
            sales += o.total;
            // Costo total guardado en el pedido, o estimado 0
            profit += (o.total - (o.totalCost || 0));
            count++;
            
            // Contar productos para estrella
            o.items.forEach(i => {
                const key = i.name + (i.variant ? ` (${i.variant})` : '');
                itemCounts[key] = (itemCounts[key] || 0) + i.qty;
            });
        }
    });
    
    // Calc best seller
    let best = "--", max = 0;
    let worst = "--", min = Infinity;
    Object.entries(itemCounts).forEach(([name, c]) => {
        if(c > max) { max = c; best = name; }
        if(c < min) { min = c; worst = name; }
    });
    if(Object.keys(itemCounts).length === 0) worst = "--";
    else if(Object.keys(itemCounts).length === 1) worst = best;

    getEl('kpi-sales-today').innerText = `$${sales.toFixed(2)}`;
    getEl('kpi-profit-today').innerText = `$${profit.toFixed(2)}`;
    getEl('kpi-orders-today').innerText = count;
    getEl('kpi-best-seller').innerText = best;
    getEl('kpi-worst-seller').innerText = worst;
};

// Banners
window.openBannerAdmin = () => { getEl('banner-modal').style.display='flex'; window.toggleMenu(); };
window.closeBannerAdmin = () => getEl('banner-modal').style.display='none';
getEl('banner-form').addEventListener('submit', async(e)=>{
    e.preventDefault();
    await addDoc(getAppCollection("banners"), {
        img: getEl('ban-img').value, 
        ubicacion: getEl('ban-loc').value, 
        categoria: getEl('ban-cat').value
    });
    window.showAlert("OK", "Banner creado");
});
onSnapshot(getAppCollection("banners"), (snap) => {
    allBanners = []; snap.forEach(d=>allBanners.push(d.data()));
    getEl('admin-banner-list').innerHTML = allBanners.map(b=>`<div style="padding:5px; border-bottom:1px solid #eee;">${b.categoria} (${b.ubicacion})</div>`).join('');
    renderTopBanners(); renderProducts(); 
});
function renderTopBanners() {
    const c = getEl('promo-carousel'); if(!c) return;
    const banners = allBanners.filter(b=>b.ubicacion==='top');
    c.style.display = banners.length ? 'flex' : 'none';
    c.innerHTML = banners.map(b=>`<img src="${b.img}" class="banner-card" onclick="filterProducts('${b.categoria}')">`).join('');
}

// Inventory Render
window.openInventory = () => { getEl('inventory-view').classList.remove('hidden'); window.toggleMenu(); window.renderInventory(); };
window.renderInventory = () => {
    const s = getEl('inv-search').value.toLowerCase();
    getEl('inventory-list-container').innerHTML = allProducts.filter(p=>p.name.toLowerCase().includes(s)).map(p=>
        `<div class="inv-item-row" style="background:white; padding:10px; margin-bottom:5px; border-radius:5px; display:flex; justify-content:space-between;">
            <span>${p.name}</span>
            <span>$${p.price}</span>
            <b>Stock: ${p.stock}</b>
            <button onclick="editProduct('${p.id}')">✏️</button>
        </div>`
    ).join('');
};

// Delete Logic
window.initDeleteOrder = (id) => { orderToDeleteId = id; getEl('delete-reason-modal').style.display='flex'; };
window.closeDeleteModal = () => getEl('delete-reason-modal').style.display='none';
window.confirmDeleteOrder = async () => {
    const r = getEl('delete-reason').value;
    if(!r) return alert("Razón obligatoria");
    // Auditoria
    const o = await getDoc(getAppDoc("pedidos", orderToDeleteId));
    await addDoc(getAppCollection("auditoria_eliminados"), {...o.data(), razon: r, user: currentUserData.email, fecha: serverTimestamp()});
    await deleteDoc(getAppDoc("pedidos", orderToDeleteId));
    window.closeDeleteModal();
    window.showAlert("Eliminado", "Pedido borrado y auditado.");
};

// Driver Audit
window.openDriverStats = (uid, name) => {
    getEl('stats-name').innerText = name;
    getEl('driver-stats-modal').classList.remove('hidden');
    onSnapshot(query(getAppCollection("pedidos"), where("repartidor_uid","==",uid), where("liquidado","!=",true)), (snap) => {
        let owes = 0; let count = 0;
        snap.forEach(d => {
            const o = d.data();
            if(o.metodo_pago === 'Efectivo') owes += (o.total - (o.costo_envio||0)); // Debe entregar total menos su comisión
            count++;
        });
        getEl('stats-orders').innerText = `${count} pedidos pendientes de corte`;
        getEl('stats-final-pay').innerText = `Debe entregar: $${owes.toFixed(2)}`;
        getEl('btn-liquidar-corte').onclick = async () => {
            if(!confirm("¿Liquidar?")) return;
            const batchPromises = snap.docs.map(d => updateDoc(d.ref, {liquidado: true, fecha_liquidacion: serverTimestamp()}));
            await Promise.all(batchPromises);
            window.showAlert("Corte Realizado", "Saldo en $0");
        };
    });
};
window.closeDriverStats = () => getEl('driver-stats-modal').classList.add('hidden');

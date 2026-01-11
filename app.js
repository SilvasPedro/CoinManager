// 1. IMPORTAÇÕES (Adicionei updateDoc)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, 
    query, where, deleteDoc, doc, updateDoc 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { 
    getAuth, signInWithPopup, GoogleAuthProvider, 
    signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// 2. CONFIGURAÇÃO (SUAS CHAVES)
const firebaseConfig = {
    apiKey: "AIzaSyC_4uHxa8NsmExmbZ602r8IsUZg6yvbO7o", 
    authDomain: "coinmanager-7e0bd.firebaseapp.com",
    projectId: "coinmanager-7e0bd",
    storageBucket: "coinmanager-7e0bd.firebasestorage.app",
    messagingSenderId: "812321893222",
    appId: "1:812321893222:web:b75756885a781ca09e36a7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// 3. ELEMENTOS DOM
// Login
const loginScreen = document.getElementById('login-overlay');
const appContainer = document.getElementById('app-container');
const btnLogin = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout');
const userPhoto = document.getElementById('userPhoto');
const userName = document.getElementById('userName');

// App Principal
const filtroMes = document.getElementById('filtroMes');
const btnAdicionar = document.getElementById('btnAdicionar');
const tabelaEl = document.getElementById('listaTransacoes');
const saldoEl = document.getElementById('displaySaldo');
const reservaEl = document.getElementById('displayReserva');
const statusEl = document.getElementById('statusFinanceiro');

// Modal de Edição
const modalEditar = document.getElementById('modal-editar');
const btnCancelarEdit = document.getElementById('btnCancelarEdit');
const btnSalvarEdit = document.getElementById('btnSalvarEdit');
// Inputs do Modal
const editDesc = document.getElementById('edit-desc');
const editValor = document.getElementById('edit-valor');
const editCategoria = document.getElementById('edit-categoria');
const editTipo = document.getElementById('edit-tipo');

// Variáveis Globais
let chartRosca = null;
let chartBarras = null;
let unsubscribe = null;
let usuarioAtual = null;
let idEmEdicao = null; // Guarda qual ID estamos editando no momento

filtroMes.value = new Date().toISOString().slice(0, 7);

// ======================================================
// LOGIN / LOGOUT
// ======================================================
btnLogin.addEventListener('click', () => signInWithPopup(auth, provider));
btnLogout.addEventListener('click', () => signOut(auth).then(() => window.location.reload()));

onAuthStateChanged(auth, (user) => {
    if (user) {
        usuarioAtual = user;
        userName.innerText = user.displayName.split(" ")[0];
        userPhoto.src = user.photoURL || "https://via.placeholder.com/40";
        loginScreen.style.display = 'none';
        appContainer.style.display = 'block';
        carregarDados();
    } else {
        loginScreen.style.display = 'flex';
        appContainer.style.display = 'none';
        usuarioAtual = null;
    }
});

// ======================================================
// FUNÇÕES PRINCIPAIS
// ======================================================

async function adicionar() {
    if (!usuarioAtual) return;
    const desc = document.getElementById('desc').value;
    const valor = parseFloat(document.getElementById('valor').value);
    const categoria = document.getElementById('categoria').value;
    const tipo = document.getElementById('tipo').value;
    const mesReferencia = filtroMes.value;

    if (!desc || isNaN(valor)) return alert("Preencha tudo!");

    btnAdicionar.innerText = "Salvando...";
    try {
        await addDoc(collection(db, "financas"), {
            uid: usuarioAtual.uid,
            descricao: desc, valor: valor, tipo: tipo, categoria: categoria,
            referencia: mesReferencia, criadoEm: Date.now()
        });
        document.getElementById('desc').value = "";
        document.getElementById('valor').value = "";
    } catch (e) { console.error(e); } 
    finally { btnAdicionar.innerText = "Salvar Lançamento"; }
}

function carregarDados() {
    if (unsubscribe) unsubscribe();
    if (!usuarioAtual) return;

    const q = query(collection(db, "financas"), where("uid", "==", usuarioAtual.uid), where("referencia", "==", filtroMes.value));

    unsubscribe = onSnapshot(q, (snapshot) => {
        tabelaEl.innerHTML = "";
        let totalEntrada = 0, totalSaida = 0;
        const gastosPorCategoria = {};
        let listaDocs = [];

        snapshot.forEach(doc => listaDocs.push({ id: doc.id, ...doc.data() }));
        listaDocs.sort((a, b) => b.criadoEm - a.criadoEm);

        if (listaDocs.length === 0) {
            tabelaEl.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#666;">Nada aqui.</td></tr>';
            atualizarDashboard(0, 0, {}); return;
        }

        listaDocs.forEach((dados) => {
            const valor = dados.valor || 0;
            if (dados.tipo === 'entrada') totalEntrada += valor;
            else {
                totalSaida += valor;
                if (dados.categoria !== 'Salário') gastosPorCategoria[dados.categoria] = (gastosPorCategoria[dados.categoria] || 0) + valor;
            }

            // Cria linha com botões de Ação
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="tag-categoria">${dados.categoria}</span></td>
                <td>${dados.descricao}</td>
                <td class="${dados.tipo === 'entrada' ? 'entrada' : 'saida'}">
                    ${dados.tipo === 'entrada' ? '+' : '-'} R$ ${valor.toFixed(2)}
                </td>
                <td style="white-space: nowrap;">
                    <button class="btn-acao btn-editar" onclick="abrirModalEdicao('${dados.id}', '${dados.descricao}', ${valor}, '${dados.categoria}', '${dados.tipo}')">
                        <span class="material-icons-round">edit</span>
                    </button>
                    <button class="btn-acao btn-deletar" onclick="deletarItem('${dados.id}')">
                        <span class="material-icons-round">delete</span>
                    </button>
                </td>
            `;
            tabelaEl.appendChild(tr);
        });

        atualizarDashboard(totalEntrada, totalSaida, gastosPorCategoria);
    });
}

// ======================================================
// LÓGICA DE EDIÇÃO (NOVO!)
// ======================================================

// 1. Abre o Modal preenchido
window.abrirModalEdicao = function(id, desc, valor, categoria, tipo) {
    idEmEdicao = id; // Salva o ID globalmente para saber qual atualizar depois
    
    // Preenche os campos do modal
    editDesc.value = desc;
    editValor.value = valor;
    editCategoria.value = categoria;
    editTipo.value = tipo;

    // Mostra o modal
    modalEditar.style.display = 'flex';
}

// 2. Fecha o Modal
btnCancelarEdit.addEventListener('click', () => {
    modalEditar.style.display = 'none';
    idEmEdicao = null;
});

// 3. Salva no Firebase
btnSalvarEdit.addEventListener('click', async () => {
    if(!idEmEdicao) return;
    
    const novaDesc = editDesc.value;
    const novoValor = parseFloat(editValor.value);
    const novaCat = editCategoria.value;
    const novoTipo = editTipo.value;

    if(!novaDesc || isNaN(novoValor)) return alert("Preencha corretamente.");

    btnSalvarEdit.innerText = "Salvando...";

    try {
        // ATUALIZA NO FIRESTORE
        const docRef = doc(db, "financas", idEmEdicao);
        await updateDoc(docRef, {
            descricao: novaDesc,
            valor: novoValor,
            categoria: novaCat,
            tipo: novoTipo
        });
        
        modalEditar.style.display = 'none'; // Fecha
    } catch (error) {
        console.error("Erro ao editar:", error);
        alert("Erro ao atualizar.");
    } finally {
        btnSalvarEdit.innerText = "Salvar Alterações";
        idEmEdicao = null;
    }
});


// ======================================================
// FUNÇÕES AUXILIARES
// ======================================================
window.deletarItem = async function(id) {
    if (confirm("Apagar item?")) await deleteDoc(doc(db, "financas", id));
}

function atualizarDashboard(entrada, saida, categorias) {
    const saldo = entrada - saida;
    saldoEl.innerText = `R$ ${saldo.toFixed(2)}`;
    reservaEl.innerText = `R$ ${(saldo > 0 ? saldo * 0.2 : 0).toFixed(2)}`;
    
    // Status
    if(entrada === 0) statusEl.innerHTML = '<span style="color:#888">Sem dados.</span>';
    else if(saldo < 0) statusEl.innerHTML = '<span style="color:var(--color-danger)">🚨 Crítico</span>';
    else if((saida/entrada) > 0.9) statusEl.innerHTML = '<span style="color:#facc15">⚠️ Atenção</span>';
    else statusEl.innerHTML = '<span style="color:var(--color-success)">✅ Excelente</span>';

    atualizarGraficos(entrada, saida, categorias);
}

// --- ATUALIZA GRÁFICOS (CHART.JS) ---
function atualizarGraficos(entrada, saida, categorias) {
    // 1. Gráfico Rosca (Entrada vs Saída) - Mantém igual
    const ctxRosca = document.getElementById('graficoRosca').getContext('2d');
    if (chartRosca) chartRosca.destroy();

    chartRosca = new Chart(ctxRosca, {
        type: 'doughnut',
        data: {
            labels: ['Renda', 'Despesas'],
            datasets: [{
                data: [entrada, saida],
                backgroundColor: ['#34d399', '#f87171'], 
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: '#94a3b8' } }
            },
            layout: { padding: 10 },
            cutout: '70%' 
        }
    });

    // 2. Gráfico Barras (CORREÇÃO DE CORES AQUI)
    const ctxBarras = document.getElementById('graficoBarras').getContext('2d');
    if (chartBarras) chartBarras.destroy();

    // Definimos uma paleta de cores variada que combina com o tema dark
    const cores = [
        '#0d9488', // Teal
        '#0ea5e9', // Sky Blue
        '#6366f1', // Indigo
        '#8b5cf6', // Violet
        '#d946ef', // Fuchsia
        '#f43f5e', // Rose
        '#f59e0b', // Amber
        '#84cc16', // Lime
        '#14b8a6'  // Teal claro
    ];

    chartBarras = new Chart(ctxBarras, {
        type: 'bar',
        data: {
            labels: Object.keys(categorias),
            datasets: [{
                label: 'Gastos',
                data: Object.values(categorias),
                backgroundColor: cores, // <--- Aqui passamos a lista de cores
                borderRadius: 4,
                borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y', 
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { 
                    ticks: { color: '#94a3b8', callback: (val) => 'R$ ' + val },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: { 
                    ticks: { color: '#f1f5f9' },
                    grid: { display: false }
                }
            }
        }
    });
}

// Eventos Iniciais
btnAdicionar.addEventListener('click', adicionar);
filtroMes.addEventListener('change', carregarDados);